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
    const t = { ...row.details, id: row.id, org: row.org_name, organizerId: row.organizer_id, departures: {}, sampleBooked: {}, dateStatus: {}, capacity: {} };
    for (const s of (c.slots || []).filter(s => s.trip_id === row.id)) {
      t.departures[s.date] = s.status === "open" ? s.left_count : 0;
      t.sampleBooked[s.date] = s.sample_booked || 0;
      t.dateStatus[s.date] = s.status;
      t.capacity[s.date] = s.capacity || t.group;
    }
    trips.push(t);
  }
};

// Server booking row -> the shape the pages already use.
function tpBooking(b) {
  return { ref: b.ref, tripId: b.trip_id, date: b.date, size: b.size, pickup: b.pickup, pickupTime: b.pickup_time,
    dp: b.dp, balance: b.balance, wallet: b.wallet, walletNumber: b.wallet_number, names: b.names || "",
    listed: b.listed, displayName: b.display_name, status: b.status, moved: b.moved, note: b.note, bookedAt: b.created_at };
}
function tpUser(p, email) {
  return { id: p.id, name: p.name, phone: p.phone || "", email: email || "", role: p.role, org: p.org || "",
    idVerified: p.id_verified, business: p.business, payout: p.payout, method: "email" };
}

// ---- Sync -----------------------------------------------------------------------------
// Fetch everything this person may see, save it, and reload once if it changed.
TP.sync = async function ({ reload = true } = {}) {
  if (!TP.online) return;
  const before = JSON.stringify([tpReadCache().trips, tpReadCache().slots, localStorage.getItem(TP_USER_KEY), localStorage.getItem(TP_BOOKINGS_KEY)]);
  const [{ data: trips, error: e1 }, { data: slots, error: e2 }, { data: deps }] = await Promise.all([
    TP.db.from("trips").select("id, organizer_id, org_name, details").order("created_at"),
    TP.db.rpc("all_slots"),
    TP.db.from("departures").select("trip_id, date, sample_booked, capacity"),
  ]);
  if (e1 || e2) { console.warn("TrailPeak: couldn't load trips", e1 || e2); return; }
  const dep = Object.fromEntries((deps || []).map(d => [d.trip_id + "|" + d.date, d]));
  tpWriteCache({ trips, slots: slots.map(s => ({ ...s, sample_booked: dep[s.trip_id + "|" + s.date]?.sample_booked || 0, capacity: dep[s.trip_id + "|" + s.date]?.capacity })), at: Date.now() });

  const { data: { session } } = await TP.db.auth.getSession();
  if (session) {
    const { data: profile } = await TP.db.from("profiles").select("*").eq("id", session.user.id).single();
    if (profile) setUser(tpUser(profile, session.user.email));
    if (profile && !profile.name && !/signin\.html$/.test(location.pathname)) {
      rememberNext((location.pathname.split("/").pop() || "index.html") + location.hash);
      location.replace("signin.html"); return;
    }
    const { data: mine } = await TP.db.from("bookings").select("*").eq("user_id", session.user.id).order("date");
    saveBookings((mine || []).map(tpBooking));
  } else {
    try { localStorage.removeItem(TP_USER_KEY); localStorage.removeItem(TP_BOOKINGS_KEY); } catch { /* ignore */ }
  }
  const after = JSON.stringify([tpReadCache().trips, tpReadCache().slots, localStorage.getItem(TP_USER_KEY), localStorage.getItem(TP_BOOKINGS_KEY)]);
  if (reload && before !== after && !TP.dirty) location.reload();
};
// Once someone starts typing or choosing, never reload the page under them.
["input", "change", "submit"].forEach(ev => document.addEventListener(ev, () => { TP.dirty = true; }, true));

// ---- Accounts -------------------------------------------------------------------------
TP.sendCode = async email => {
  const { error } = await TP.db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
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

// ---- Bookings -------------------------------------------------------------------------
const tpErr = e => new Error((e && e.message) || "Something went wrong. Try again.");
TP.book = async p => {
  const { data, error } = await TP.db.rpc("book_trip", {
    p_trip: p.tripId, p_date: p.date, p_size: p.size, p_pickup: p.pickup, p_pickup_time: p.pickupTime,
    p_wallet: p.wallet, p_wallet_number: p.walletNumber, p_names: p.names || "", p_listed: !!p.listed });
  if (error) throw tpErr(error);
  await TP.sync({ reload: false });
  return tpBooking(data);
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
TP.organizerBookings = async () => {
  const { data, error } = await TP.db.rpc("organizer_bookings");
  if (error) throw tpErr(error);
  return data || [];
};
TP.setDateStatus = async (tripId, date, status) => {
  const { error } = await TP.db.from("departures").update({ status }).eq("trip_id", tripId).eq("date", date);
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
    try { localStorage.removeItem(TP_USER_KEY); localStorage.removeItem(TP_BOOKINGS_KEY); } catch { /* ignore */ }
    location.href = "index.html";
  };
  // Refresh in the background after the page has drawn.
  window.addEventListener("load", () => { TP.sync().catch(e => console.warn("TrailPeak sync failed", e)); });
}
