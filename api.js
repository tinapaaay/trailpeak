// TrailPeak data layer. With config.js filled in, accounts, trips, slots and bookings
// come from Supabase; without it, the site runs in offline demo mode (auth.js + trips.js).
//
// Pages stay simple: they read the same globals as before (TRIPS, getUser(), getBookings(),
// slotsLeft()). This file keeps a copy of the latest server data in the browser so pages
// draw instantly, then refreshes it in the background and reloads the page once if
// anything changed (unless the person has started typing).
const TP = { online: false, db: null, dirty: false };
const TP_CACHE_KEY = "trailpeak.cache.v1";

(function connect() {
  const c = window.TRAILPEAK_SUPABASE;
  if (!c || !c.url || !c.anonKey || !window.supabase) return;
  TP.online = true;
  TP.db = window.supabase.createClient(c.url, c.anonKey);
})();

// ---- Cache --------------------------------------------------------------------------
function tpReadCache() { try { return JSON.parse(localStorage.getItem(TP_CACHE_KEY)) || {}; } catch { return {}; } }
function tpWriteCache(c) { try { localStorage.setItem(TP_CACHE_KEY, JSON.stringify(c)); } catch { /* storage blocked */ } }

// Called by trips.js: swap the built-in sample trips for the server's trips and live slots.
TP.applyTo = function (trips) {
  if (!TP.online) return;
  const c = tpReadCache();
  if (!c.trips) return;
  trips.length = 0;
  for (const row of c.trips) {
    // `saved` keeps the stored details as they are, so editing a trip never saves page-only fields back.
    const t = { ...row.details, id: row.id, org: row.org_name, organizerId: row.organizer_id, bookingMode: row.organizer_id ? "pilot" : "demo", saved: row.details, departures: {}, sampleBooked: {}, dateStatus: {}, capacity: {} };
    for (const s of (c.slots || []).filter(s => s.trip_id === row.id)) {
      t.departures[s.date] = s.status === "open" ? s.left_count : 0;
      t.sampleBooked[s.date] = s.sample_booked || 0;
      t.dateStatus[s.date] = s.status;
      t.capacity[s.date] = s.capacity || t.group;
    }
    trips.push(t);
  }
  mergeReviews(trips, c.reviews || []);
};

// Server booking row -> the shape the pages already use.
function tpBooking(b, receipts = null, mode = "pilot") {
  const receipt = receipts?.find(r => r.booking_ref === b.ref);
  return { bookingMode: mode, ref: b.ref, tripId: b.trip_id, date: b.date, size: b.size, pickup: b.pickup, pickupTime: b.pickup_time,
    holdUntil: b.hold_until || null, dpReference: b.dp_reference || null, dpSentAt: b.dp_sent_at || null, expiredAt: b.expired_at || null,
    dp: b.dp, expectedDp: b.dp, receivedDp: receipts === null ? null : (receipt?.amount || 0),
    receipt, paymentsReady: receipts !== null, totalFee: b.dp + b.balance,
    balance: receipts === null ? null : b.dp + b.balance - (receipt?.amount || 0), wallet: b.wallet, walletNumber: b.wallet_number, names: b.names || "",
    listed: b.listed, displayName: b.display_name, status: b.status, moved: b.moved, note: b.note, bookedAt: b.created_at,
    companions: b.companions || [], emergency: b.emergency || null };
}
function tpUser(p, email, unread = 0) {
  return { id: p.id, name: p.name, phone: p.phone || "", email: email || "", role: p.role, org: p.org || "",
    idVerified: p.id_verified, business: p.business, payout: p.payout, organizerStatus: p.organizer_status || "none", method: "email", unread };
}

// ---- Sync -----------------------------------------------------------------------------
// Fetch everything this person may see, save it, and reload once if it changed.
TP.sync = async function ({ reload = true } = {}) {
  if (!TP.online) return;
  const before = JSON.stringify([tpReadCache().trips, tpReadCache().slots, tpReadCache().reviews, localStorage.getItem(TP_USER_KEY), localStorage.getItem(TP_BOOKINGS_KEY)]);
  const [{ data: trips, error: e1 }, { data: slots, error: e2 }, { data: deps }, { data: reviews }] = await Promise.all([
    TP.db.from("trips").select("id, organizer_id, org_name, details").order("created_at"),
    TP.db.rpc("all_slots"),
    TP.db.from("departures").select("trip_id, date, sample_booked, capacity"),
    TP.db.rpc("all_reviews"),
  ]);
  if (e1 || e2) { console.warn("TrailPeak: couldn't load trips", e1 || e2); return; }
  const dep = Object.fromEntries((deps || []).map(d => [d.trip_id + "|" + d.date, d]));
  tpWriteCache({ trips, slots: slots.map(s => ({ ...s, sample_booked: dep[s.trip_id + "|" + s.date]?.sample_booked || 0, capacity: dep[s.trip_id + "|" + s.date]?.capacity })),
    reviews: (reviews || []).map(r => ({ tripId: r.trip_id, name: r.display_name, date: r.created_at.slice(0, 10), stars: r.stars, text: r.body })), at: Date.now() });

  const { data: { session } } = await TP.db.auth.getSession();
  if (session) {
    // Tidy overdue DP holds first (their slots are already free; this sets the "Expired" label).
    try { await TP.db.rpc("expire_holds"); } catch { /* older database: nothing to tidy */ }
    const { data: profile } = await TP.db.from("profiles").select("*").eq("id", session.user.id).single();
    // Organizers: how many activity items (new bookings, cancellations, moves) are unread,
    // for the count on the header's Dashboard button.
    let unread = 0;
    if (profile?.role === "organizer") {
      const { count } = await TP.db.from("organizer_activity").select("id", { count: "exact", head: true }).is("read_at", null);
      unread = count || 0;
    }
    if (profile) setUser(tpUser(profile, session.user.email, unread));
    if (profile && !profile.name && !/signin\.html$/.test(location.pathname)) {
      rememberNext((location.pathname.split("/").pop() || "index.html") + location.hash);
      location.replace("signin.html"); return;
    }
    const [{ data: mine }, { data: myReviews }] = await Promise.all([
      TP.db.from("bookings").select("*").eq("user_id", session.user.id).order("date"),
      TP.db.from("reviews").select("booking_ref, trip_id, stars, body, created_at").eq("user_id", session.user.id),
    ]);
    let receipts = null;
    try { receipts = await TP.receiptHistory(); } catch (e) { console.warn(e.message); }
    saveBookings((mine || []).map(b => tpBooking(b, receipts, trips.find(t => t.id === b.trip_id)?.organizer_id ? "pilot" : "demo")));
    saveMyReviews((myReviews || []).map(r => ({ ref: r.booking_ref, tripId: r.trip_id, stars: r.stars, text: r.body, date: r.created_at.slice(0, 10) })));
  } else {
    try { localStorage.removeItem(TP_USER_KEY); localStorage.removeItem(TP_BOOKINGS_KEY); localStorage.removeItem(TP_REVIEWS_KEY); } catch { /* ignore */ }
  }
  const after = JSON.stringify([tpReadCache().trips, tpReadCache().slots, tpReadCache().reviews, localStorage.getItem(TP_USER_KEY), localStorage.getItem(TP_BOOKINGS_KEY)]);
  if (reload && before !== after && !TP.dirty) location.reload();
};
// Once someone starts typing or choosing, never reload the page under them.
["input", "change", "submit"].forEach(ev => document.addEventListener(ev, () => { TP.dirty = true; }, true));

// ---- Accounts -------------------------------------------------------------------------
TP.sendCode = async email => {
  // The email's link comes back to this site's sign-in page (it must be in Supabase's Redirect URLs),
  // keeping "?as=organizer" so organizer sign-up continues even if the link opens in a new tab.
  const back = new URL("signin.html" + (/[?&]as=organizer\b/.test(location.search) ? "?as=organizer" : ""), location.href).href;
  const { error } = await TP.db.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: back } });
  if (error) throw new Error(error.message);
};
// Which sign-in methods are turned on in Supabase (Authentication → Sign In / Providers).
TP.providers = async () => {
  try {
    const c = window.TRAILPEAK_SUPABASE;
    const r = await fetch(`${c.url}/auth/v1/settings`, { headers: { apikey: c.anonKey } });
    return (await r.json()).external || {};
  } catch { return {}; }
};
// Google: leaves for Google's account picker and comes back to the sign-in page signed in.
TP.signInWithGoogle = async () => {
  const back = new URL("signin.html" + (/[?&]as=organizer\b/.test(location.search) ? "?as=organizer" : ""), location.href).href;
  const { error } = await TP.db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back } });
  if (error) throw new Error(error.message);
};
TP.verifyCode = async (email, token) => {
  // New accounts get the "Confirm signup" email, returning ones the "Magic Link" email; try both kinds.
  let { error } = await TP.db.auth.verifyOtp({ email, token, type: "email" });
  if (error) ({ error } = await TP.db.auth.verifyOtp({ email, token, type: "signup" }));
  if (error) throw new Error("That code doesn't match or has expired. Check the email and try again.");
  await TP.sync({ reload: false });
  return getUser();
};
TP.saveProfile = async fields => {
  const { data: { session } } = await TP.db.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const { error } = await TP.db.from("profiles").update(fields).eq("id", session.user.id);
  if (error) throw new Error(error.message);
  await TP.sync({ reload: false });
  return getUser();
};

// Organizer sign-up. The server saves the details and marks the application "pending";
// only the TrailPeak owner can make someone an organizer or ID verified.
TP.applyAsOrganizer = async ({ name, phone, org, payout, application }) => {
  const { error } = await TP.db.rpc("apply_as_organizer",
    { p_name: name, p_phone: phone, p_org: org, p_payout: payout, p_application: application || null });
  if (error) throw new Error(error.message);
  await TP.sync({ reload: false });
  return getUser();
};

// ---- Bookings -------------------------------------------------------------------------
// Server errors in plain words. An expired or missing sign-in ("permission denied", JWT errors)
// becomes a sign-in prompt, never the database's wording.
const tpErr = e => {
  const m = (e && e.message) || "";
  if ((e && e.code === "42501") || /permission denied|jwt|not authenticated|sign in to reserve/i.test(m))
    return new Error("Please sign in to book a trip. If you were signed in, your session expired: sign in again and you'll come back here.");
  return new Error(m || "Something went wrong. Try again.");
};
TP.book = async p => {
  const base = { p_trip: p.tripId, p_date: p.date, p_size: p.size, p_pickup: p.pickup, p_pickup_time: p.pickupTime,
    p_wallet: p.wallet, p_wallet_number: p.walletNumber, p_listed: !!p.listed };
  let { data, error } = await TP.db.rpc("book_trip", { ...base, p_names: "", p_companions: p.companions || [], p_emergency: p.emergency || null });
  // Database not updated yet (schema.sql not re-run): book the old way, with names as plain text.
  if (error && error.code === "PGRST202") {
    ({ data, error } = await TP.db.rpc("book_trip", { ...base, p_names: (p.companions || []).map(c => c.name).join(", ") }));
  }
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
  return getBookings().find(b => b.ref === data.ref) || tpBooking(data, []);
};
// Add or change joiner names and the emergency contact (any time before the trip date).
TP.updateDetails = async (ref, companions, emergency) => {
  const { error } = await TP.db.rpc("update_booking_details", { p_ref: ref, p_companions: companions, p_emergency: emergency });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};
TP.move = async (ref, date) => {
  const { error } = await TP.db.rpc("move_booking", { p_ref: ref, p_new_date: date });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};
TP.cancel = async ref => {
  const { error } = await TP.db.rpc("cancel_booking", { p_ref: ref });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};
TP.addReview = async (ref, stars, text) => {
  const { error } = await TP.db.rpc("add_review", { p_ref: ref, p_stars: stars, p_body: text });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};
TP.whosGoing = async (tripId, date) => {
  const { data, error } = await TP.db.rpc("whos_going", { p_trip: tripId, p_date: date });
  if (error) throw tpErr(error);
  return data || [];
};

// ---- Organizers -----------------------------------------------------------------------
TP.publishTrip = async trip => {
  const { data: { session } } = await TP.db.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const { departures, ...details } = trip;
  const { error: e1 } = await TP.db.from("trips").insert({ id: trip.id, organizer_id: session.user.id, org_name: trip.org, details });
  if (e1) throw tpErr(e1);
  const rows = Object.entries(departures).map(([date, cap]) => ({ trip_id: trip.id, date, capacity: cap }));
  const { error: e2 } = await TP.db.from("departures").insert(rows);
  if (e2) throw tpErr(e2);
  await TP.sync({ reload: false });
};
// Save changes to a trip's page (not its dates: those change one by one on the dashboard).
TP.updateTrip = async (id, details) => {
  const { error } = await TP.db.from("trips").update({ details, org_name: details.org }).eq("id", id);
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};
TP.organizerBookings = async () => {
  const { data, error } = await TP.db.rpc("organizer_bookings");
  if (error) throw tpErr(error);
  return data || [];
};
// Outside bookings (Messenger, in person, other): the organizer records them and the server
// runs the same slot check as online bookings. requestId stays the same when one submit is
// retried, so the booking is saved once (see add_outside_booking in supabase/schema.sql).
TP.addOutsideBooking = async b => {
  const { data, error } = await TP.db.rpc("add_outside_booking", {
    p_request: b.requestId, p_trip: b.tripId, p_date: b.date, p_name: b.name, p_size: b.size,
    p_pickup: b.pickup, p_pickup_time: b.pickupTime || null, p_source: b.source, p_phone: b.phone || null });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
  return data;
};
TP.outsideBookings = async () => {
  // Confirmed and cancelled: cancelled ones stay listed (with their reason) so changes are traceable.
  const { data, error } = await TP.db.from("outside_bookings").select("*").order("created_at");
  if (error) throw tpErr(error);
  return data || [];
};
// Newest first: one current cumulative amount per booking, with immutable history.
TP.receiptHistory = async () => {
  const { data, error } = await TP.db.from("dp_receipts").select("*").order("revision", { ascending: false });
  if (error) throw new Error("Receipt history is unavailable. Apply the latest database schema, then refresh.");
  return data || [];
};
// Organizer activity feed: newest first, and "mark as read" (all, or the ids given).
TP.activity = async () => {
  const { data, error } = await TP.db.from("organizer_activity").select("*").order("created_at", { ascending: false }).limit(30);
  if (error) throw tpErr(error);
  return data || [];
};
TP.markActivityRead = async (ids = null) => {
  const { error } = await TP.db.rpc("mark_activity_read", { p_ids: ids });
  if (error) throw tpErr(error);
};
// Joiner: "I've sent the DP" with the GCash/Maya reference. Stops the hold clock (TP-011).
TP.sendDpReference = async (ref, reference) => {
  const { error } = await TP.db.rpc("send_dp_reference", { p_ref: ref, p_reference: reference });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};
// Organizer: a joiner paid after the hold expired; rebook if the date still has room.
TP.rebookExpired = async ref => {
  const { data, error } = await TP.db.rpc("rebook_expired", { p_ref: ref });
  if (error) throw tpErr(error);
  return data;
};
// Hold settings, to show joiners how long slots are held before they book.
TP.holdSettings = async () => {
  const { data } = await TP.db.from("app_settings").select("key, value");
  return Object.fromEntries((data || []).map(r => [r.key, Number(r.value)]));
};
// Organizer mobile numbers for trips the signed-in joiner has booked (TP-018).
TP.bookingContacts = async () => {
  const { data, error } = await TP.db.rpc("my_booking_contacts");
  if (error) return {};
  return Object.fromEntries((data || []).map(r => [r.trip_id, r.phone]));
};
TP.recordReceipt = async r => {
  const { data, error } = await TP.db.rpc("record_dp_receipt", {
    p_request: r.requestId, p_booking: r.bookingRef || null, p_outside: r.outsideId || null,
    p_previous: r.previousId || null, p_amount: r.amount, p_method: r.amount ? r.method : null,
    p_received: r.amount ? r.receivedAt : null, p_reason: r.reason, p_reference: r.amount ? (r.reference || null) : null });
  if (error) throw tpErr(error);
  return data;
};
// Edit or cancel an outside booking (TP-009). `revision` is the version the form was opened on;
// the server refuses the edit if someone changed the booking since.
TP.editOutsideBooking = async o => {
  const { data, error } = await TP.db.rpc("edit_outside_booking", { p_id: o.id, p_revision: o.revision, p_name: o.name, p_size: o.size,
    p_pickup: o.pickup, p_pickup_time: o.pickupTime || null, p_source: o.source, p_phone: o.phone || null, p_reason: o.reason });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
  return Array.isArray(data) ? data[0] : data;   // one row, whichever shape the client returns
};
TP.cancelOutsideBooking = async (id, reason) => {
  const { data, error } = await TP.db.rpc("cancel_outside_booking", { p_id: id, p_reason: reason });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
  return Array.isArray(data) ? data[0] : data;
};
TP.outsideChanges = async id => {
  const { data, error } = await TP.db.from("outside_booking_changes").select("*").eq("outside_id", id).order("id");
  if (error) throw tpErr(error);
  return data || [];
};
TP.setDateStatus = async (tripId, date, status) => {
  const { error } = await TP.db.from("departures").update({ status }).eq("trip_id", tripId).eq("date", date);
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};
// The database refuses a capacity below the seats already taken, with a message that says
// the lowest number allowed (see guard_departure in supabase/schema.sql).
TP.setCapacity = async (tripId, date, capacity) => {
  const { error } = await TP.db.from("departures").update({ capacity }).eq("trip_id", tripId).eq("date", date);
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};
TP.addDate = async (tripId, date, capacity) => {
  const { error } = await TP.db.from("departures").insert({ trip_id: tripId, date, capacity });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
};

// ---- Online versions of the auth.js helpers ---------------------------------------------
if (TP.online) {
  // Server slots already count everyone's bookings, so don't subtract this browser's again.
  slotsLeft = (trip, date) => Math.max(0, trip.departures[date] ?? 0); // eslint-disable-line no-global-assign
  signOut = async () => { // eslint-disable-line no-global-assign
    await TP.db.auth.signOut();
    try { localStorage.removeItem(TP_USER_KEY); localStorage.removeItem(TP_BOOKINGS_KEY); localStorage.removeItem(TP_REVIEWS_KEY); } catch { /* ignore */ }
    location.href = "index.html";
  };
  // Refresh in the background after the page has drawn.
  window.addEventListener("load", () => { TP.sync().catch(e => console.warn("TrailPeak sync failed", e)); });
}
