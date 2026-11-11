// TrailPeak mock accounts. Prototype only: the "account" lives in this browser
// (localStorage) and is never sent anywhere. Real accounts need a backend.
const TP_USER_KEY = "trailpeak.user";
const TP_NEXT_KEY = "trailpeak.next";

function getUser() {
  try { return JSON.parse(localStorage.getItem(TP_USER_KEY)); } catch { return null; }
}
function setUser(user) {
  try { localStorage.setItem(TP_USER_KEY, JSON.stringify(user)); } catch { /* storage blocked: stays signed out */ }
}
function signOut() {
  try { localStorage.removeItem(TP_USER_KEY); } catch { /* ignore */ }
  location.href = "index.html";
}
// Where to go after signing in. Stored for this tab only, and only our own pages.
function rememberNext(page) {
  try { sessionStorage.setItem(TP_NEXT_KEY, page); } catch { /* ignore */ }
}
function takeNext(fallback = "index.html") {
  let next = null;
  try { next = sessionStorage.getItem(TP_NEXT_KEY); sessionStorage.removeItem(TP_NEXT_KEY); } catch { /* ignore */ }
  return next && /^[a-z-]+\.html(#[a-z0-9-]+)?$/.test(next) ? next : fallback;
}
function initialsOf(name) {
  return (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
}
// ---- Verification claims (TP-002) ------------------------------------------
// TrailPeak has no real ID-check service yet, so every "ID verified" or "Business verified"
// claim carries this tag right beside it, never only in a footer. ID and business stay
// separate claims. The label is always one of the fixed strings below, never user text.
const DEMO_CHECK = "Demo: not a real check";
function claimBadge(label) {
  return `<span class="claim"><svg width="16" height="16" aria-hidden="true"><use href="#i-check"/></svg>${label} <span class="tag-demo">${DEMO_CHECK}</span></span>`;
}
// What an ID check can't tell joiners. Shown wherever an organizer's checks are listed.
const ID_LIMITS = "An ID check only confirms who the organizer is. It doesn't check guide experience, permits, gear or emergency plans, so ask the organizer about these before you book.";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Header: "Sign in" when signed out, an initials menu when signed in.
function renderAccount() {
  const slot = document.querySelector(".header-actions .avatar");
  if (!slot) return;
  const user = getUser();
  if (!user) {
    // Already on a sign-in page: no point offering "Sign in" again.
    if (/^(signin|organizer-signup)\.html$/.test(location.pathname.split("/").pop())) { slot.remove(); return; }
    const page = (location.pathname.split("/").pop() || "index.html") + (/^#[a-z0-9-]+$/.test(location.hash) ? location.hash : "");
    slot.outerHTML = `<a class="btn btn-secondary label-caps signin-link" href="signin.html" data-next="${escapeHtml(page)}">Sign in</a>`;
    document.querySelector(".signin-link").addEventListener("click", e => {
      const from = e.currentTarget.dataset.next;
      if (!/^(signin|organizer-signup)\.html$/.test(from)) rememberNext(from);
    });
    return;
  }
  // Organizers get a Dashboard button in the header on every page, with the number of
  // unread activity items (new bookings, cancellations, date moves).
  if (user.role === "organizer") {
    const here = /dashboard\.html$/.test(location.pathname);
    const n = Number(user.unread) || 0;
    slot.parentElement.classList.add("is-organizer");
    slot.insertAdjacentHTML("beforebegin", `<a class="btn btn-secondary label-caps dash-link" href="dashboard.html"${here ? ' aria-current="page"' : ""}>Dashboard${n ? `<span class="count" aria-hidden="true">${n > 99 ? "99+" : n}</span><span class="sr">, ${n} new</span>` : ""}</a>`);
  }
  const role = user.role === "organizer"
    ? `Organizer · ${escapeHtml(user.org || "")}${user.idVerified ? ` · ID verified (${DEMO_CHECK})` : ""}`
    : user.organizerStatus === "pending" ? "Joiner · organizer application in review" : "Joiner";
  slot.outerHTML = `<details class="acct">
    <summary class="avatar label-caps" aria-label="Account: ${escapeHtml(user.name)}">${escapeHtml(initialsOf(user.name))}</summary>
    <div class="acct-menu">
      <p class="acct-name">${escapeHtml(user.name)}</p>
      <p class="meta">${role}</p>
      <a class="btn btn-${user.role === "organizer" ? "secondary" : "primary"} label-caps" href="mytrips.html">My trips</a>
      ${user.role === "organizer" ? '<a class="btn btn-primary label-caps" href="dashboard.html">Dashboard</a><a class="btn btn-secondary label-caps" href="organize.html">Post a trip</a>' : `<a class="btn btn-secondary label-caps" href="organizer-signup.html">${user.organizerStatus === "pending" ? "Application status" : "Become an organizer"}</a>`}
      <button type="button" class="btn btn-secondary label-caps" id="signout">Sign out</button>
    </div>
  </details>`;
  document.getElementById("signout").addEventListener("click", signOut);
  // Close the menu with Escape or a click outside.
  const acct = document.querySelector(".acct");
  document.addEventListener("click", e => { if (!acct.contains(e.target)) acct.open = false; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && acct.open) { acct.open = false; acct.querySelector("summary").focus(); } });
}
document.addEventListener("DOMContentLoaded", renderAccount);

// ---- Mock bookings (prototype): kept in this browser only ----------------
const TP_BOOKINGS_KEY = "trailpeak.bookings";
const TP_PENDING_KEY = "trailpeak.pending";
function getBookings() {
  try { return JSON.parse(localStorage.getItem(TP_BOOKINGS_KEY)) || []; } catch { return []; }
}
function saveBookings(list) {
  try { localStorage.setItem(TP_BOOKINGS_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}
// Joiners this browser has booked on a date (cancelled bookings don't count).
function bookedHere(tripId, date) {
  return getBookings().filter(b => b.tripId === tripId && b.date === date && b.status !== "cancelled").reduce((a, b) => a + b.size, 0);
}
// Slots left on a date after this browser's own bookings.
function slotsLeft(trip, date) {
  return Math.max(0, (trip.departures[date] ?? 0) - bookedHere(trip.id, date));
}
// Today as "2026-11-09" in the visitor's own time zone. A trip date before today has passed:
// it can't be booked, moved to or changed, and it shows as done.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const isPastDate = iso => iso < todayIso();

// DP status of a live booking (TP-011), the same words on My trips, the confirmation page and
// the dashboard: held (DP pending, slots held until a deadline), sent (joiner entered the
// reference, waiting for the organizer), partial, received, expired (no reference in time), or
// pending (older bookings with no deadline).
function dpState(b, received = b.receivedDp || 0, expected = b.expectedDp ?? b.dp) {
  if (b.status === "expired" || (b.status === "confirmed" && b.holdUntil && !b.dpSentAt && new Date(b.holdUntil) <= new Date())) return "expired";
  if (received && received >= expected) return "received";
  if (received) return "partial";
  if (b.dpSentAt) return "sent";
  return b.holdUntil ? "held" : "pending";
}
const DP_STATES = { held: "DP pending", sent: "DP sent, waiting for organizer", partial: "Partial DP", received: "DP received", expired: "Expired: DP not sent", pending: "DP pending" };
const holdTime = iso => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// One name for each date state, shared by the dashboard and the public pages (TP-012).
// Stored on the server: open, closed, cancelled. Derived here: full (open, no slots left)
// and completed (the date has passed). A cancelled date stays "cancelled" even after it passes.
const DATE_STATES = { open: "Open", full: "Full", closed: "Closed", cancelled: "Cancelled", completed: "Completed" };
function dateState(status, left, iso) {
  if (status === "cancelled") return "cancelled";
  if (isPastDate(iso)) return "completed";
  if (status === "closed") return "closed";
  return left > 0 ? "open" : "full";
}

// ---- Reviews written in this browser (offline demo only; online they're in Supabase) ----
const TP_REVIEWS_KEY = "trailpeak.reviews";
function getMyReviews() { try { return JSON.parse(localStorage.getItem(TP_REVIEWS_KEY)) || []; } catch { return []; } }
function saveMyReviews(list) { try { localStorage.setItem(TP_REVIEWS_KEY, JSON.stringify(list)); } catch { /* storage blocked */ } }

function setPending(p) { try { sessionStorage.setItem(TP_PENDING_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
function getPending() { try { return JSON.parse(sessionStorage.getItem(TP_PENDING_KEY)); } catch { return null; } }

// ---- Who's going (prototype) -------------------------------------------
// Sample joiners for a date, made the same way every time. About 6 in 10 chose to be listed.
// Only first name + last initial and group size are ever shown, never contact details.
function joinersFor(trip, date) {
  const first = ["Ana", "Miguel", "Carla", "Paolo", "Bea", "Jun", "Trisha", "Marco", "Kim", "Rafa", "Joy", "Enzo", "Liza", "Nico"];
  const last = "RSDMCLVTGB";
  const sizes = [1, 2, 1, 3, 1, 1, 2, 4, 1, 2];
  let seed = [...(trip.id + date)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  // Online, the server says how many seats are sample data; offline, it's capacity minus slots.
  const base = (trip.baseDepartures || trip.departures)[date] ?? trip.group;
  const sampleBooked = trip.sampleBooked ? (trip.sampleBooked[date] || 0) : Math.max(0, (trip.group || 0) - base);
  const list = [], offset = Math.floor(rnd() * first.length);
  let n = 0;
  while (n < sampleBooked) {
    const size = Math.min(sizes[Math.floor(rnd() * sizes.length)], sampleBooked - n);
    // Step through the name list (5 doesn't divide 14) so names don't repeat on one date.
    const k = list.length;
    list.push({ name: `${first[(offset + k * 5) % first.length]} ${last[(offset + k * 3) % last.length]}.`, size, listed: rnd() < 0.6, you: false });
    n += size;
  }
  if (typeof TP !== "undefined" && TP.online) return list; // real bookings come from TP.whosGoing()
  const me = getUser();
  getBookings().filter(b => b.tripId === trip.id && b.date === date && b.status !== "cancelled")
    .forEach(b => list.push({ name: b.displayName || "You", size: b.size, listed: !!b.listed, you: true, mine: me && b.userName === me.name }));
  return list;
}

// ---- Joiner details (names for registration + an emergency contact) -------------------
// Used by reserve.html and mytrips.html. The booker is joiner 1; companions are joiners 2+.
// companions: [{ name, age: "adult" | "minor", phone }]; emergency: { name, relation, phone }.
const jdDigits = v => String(v || "").replace(/\D/g, "");
const jdPhone = v => { const d = jdLocal(v); return `+63 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`; };
// The 10 local digits of a PH mobile number. Never cuts digits off: a number that's too long
// must fail the check, not be shortened into a valid-looking one.
const jdLocal = v => { const d = jdDigits(v); return d.length === 12 && d.startsWith("63") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d; };
// "+63 917 123 4567" for a valid PH mobile number, or null. Same rule as ph_mobile() in schema.sql.
const phMobile = v => { const d = jdLocal(v); return /^9\d{9}$/.test(d) ? jdPhone(d) : null; };
const PH_MOBILE_HINT = "must be a Philippine mobile number: 10 digits starting with 9, like 0917 123 4567.";
function missingJoiners(b) { return b.status === "confirmed" ? Math.max(0, b.size - 1 - (b.companions || []).length) : 0; }

// Under-18 hikers (TP-015, ADR-007): each needs a parent or guardian 18 or older in the same
// booking. The guardian is a joiner number (1 = the booker); the database checks the same rule.
const RELATIONS = { parent: "Parent", guardian: "Legal guardian", permitted_adult: "Adult with the parents' written permission" };
function guardianHtml(p, n, size, who, minor) {
  const opts = Array.from({ length: size }, (_, k) => k + 1).filter(k => k !== n)
    .map(k => `<option value="${k}"${String(who.guardian) === String(k) ? " selected" : ""}>Joiner ${k}${k === 1 ? " (you)" : ""}</option>`).join("");
  return `<div class="jd-row jd-guard" id="${p}-gbox${n}"${minor ? "" : " hidden"}>
      <div class="jd-field"><label class="field-label" for="${p}-g${n}">Parent or guardian (18+)</label><select class="input" id="${p}-g${n}"><option value="">Choose who</option>${opts}</select></div>
      <div class="jd-field"><label class="field-label" for="${p}-r${n}">They are the</label><select class="input" id="${p}-r${n}"><option value="">Choose</option>${Object.entries(RELATIONS).map(([k, l]) => `<option value="${k}"${who.relation === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>`;
}
// Show the guardian fields when someone is marked under 18.
document.addEventListener("change", e => {
  const m = /^(.+)-a(\d+)$/.exec(e.target.id || ""); if (!m) return;
  const box = document.getElementById(`${m[1]}-gbox${m[2]}`); if (box) box.hidden = e.target.value !== "minor";
});

// p: id prefix (several forms can be on one page); size: joiners in the booking.
function joinerFieldsHtml(p, size, companions = [], emergency = null, { you = "", allowLater = true, date = null, overdue = false, booker = { age: "adult" } } = {}) {
  const e = emergency || {};
  const rows = Array.from({ length: Math.max(0, size - 1) }, (_, k) => {
    const n = k + 2, c = companions[k] || {};
    return `<div class="jd-joiner">
      <p class="jd-h">Joiner ${n}</p>
      <div class="jd-row">
        <div class="jd-field"><label class="field-label" for="${p}-n${n}">Full name</label><input class="input" id="${p}-n${n}" value="${escapeHtml(c.name || "")}" placeholder="As on their ID" autocomplete="off"></div>
        <div class="jd-field"><label class="field-label" for="${p}-a${n}">Age</label><select class="input" id="${p}-a${n}"><option value="adult"${c.age !== "minor" ? " selected" : ""}>18 or older</option><option value="minor"${c.age === "minor" ? " selected" : ""}>Under 18</option></select></div>
        <div class="jd-field"><label class="field-label" for="${p}-m${n}">Mobile <span class="jd-opt">optional</span></label><div class="jd-prefix"><span aria-hidden="true">+63</span><input class="input data" id="${p}-m${n}" type="tel" inputmode="numeric" value="${jdLocal(c.phone)}" placeholder="917 123 4567"></div></div>
      </div>
      ${guardianHtml(p, n, size, c, c.age === "minor")}
    </div>`;
  }).join("");
  const b1 = booker || { age: "adult" };
  const youRow = `<div class="jd-joiner"><p class="jd-you"><span class="jd-h">Joiner 1</span> You${you ? `, ${escapeHtml(you)}` : ""}</p>
      <div class="jd-row"><div class="jd-field"><label class="field-label" for="${p}-a1">Your age</label><select class="input" id="${p}-a1"><option value="adult"${b1.age !== "minor" ? " selected" : ""}>18 or older</option><option value="minor"${b1.age === "minor" ? " selected" : ""}>Under 18</option></select></div></div>
      ${guardianHtml(p, 1, size, b1, b1.age === "minor")}</div>`;
  const who = `<fieldset class="jd">
      <legend>Who's joining</legend>
      <p class="jd-hint">Organizers register every hiker at the jump-off, so use names as they appear on an ID. Under 18 needs a parent or guardian on the trip.</p>
      ${youRow}
      <div id="${p}-rows" class="jd-rows">${rows}</div>
      ${allowLater ? `<label class="check"><input type="checkbox" id="${p}-later"><span>${overdue ? "Some names still aren't ready. I'll add them as soon as I can." : `Some names aren't ready yet. I'll add them in My trips before ${date ? niceShort(dueDate(date)) : "the due date"}.`}</span></label>`
        : (size > 1 ? `<p class="jd-hint"><strong>This trip is ${detailsDueDays()} days away or less, so add every joiner's full name now.</strong></p>` : "")}
    </fieldset>`;
  return who + `<fieldset class="jd">
      <legend>Emergency contact</legend>
      <p class="jd-hint">Someone who isn't on this hike. The organizer calls them only if something happens on the trail.</p>
      <div class="jd-row">
        <div class="jd-field"><label class="field-label" for="${p}-en">Name</label><input class="input" id="${p}-en" value="${escapeHtml(e.name || "")}" autocomplete="off"></div>
        <div class="jd-field"><label class="field-label" for="${p}-er">Relationship</label><input class="input" id="${p}-er" value="${escapeHtml(e.relation || "")}" placeholder="e.g. Mother, Partner"></div>
        <div class="jd-field"><label class="field-label" for="${p}-em">Mobile</label><div class="jd-prefix"><span aria-hidden="true">+63</span><input class="input data" id="${p}-em" type="tel" inputmode="numeric" value="${jdLocal(e.phone)}" placeholder="917 123 4567"></div></div>
      </div>
    </fieldset>`;
}
// Nothing to wire any more: "add later" only allows blank names, it doesn't hide the rows.
function wireJoinerFields() {}
// Returns { companions, emergency } or { error, field } for the first problem.
function readJoinerFields(p, size) {
  const $j = id => document.getElementById(`${p}-${id}`);
  document.querySelectorAll(`[id^="${p}-"]`).forEach(el => el.removeAttribute("aria-invalid"));
  const bad = (field, error) => { field.setAttribute("aria-invalid", "true"); return { error, field }; };
  const later = $j("later")?.checked;
  const companions = [];
  // Names typed are kept; blanks are allowed only when "add later" is ticked.
  for (let n = 2; n <= size; n++) {
    const name = $j("n" + n).value.trim(), mob = $j("m" + n).value.trim();
    if (!name && later) continue;
    if (!name) return bad($j("n" + n), $j("later") ? `Enter joiner ${n}'s full name, or tick "Some names aren't ready yet".` : `Enter joiner ${n}'s full name: this trip is too soon to add names later.`);
    if (mob && !/^9\d{9}$/.test(jdLocal(mob))) return bad($j("m" + n), `Joiner ${n}'s mobile should be 10 digits starting with 9, or leave it blank.`);
    const age = $j("a" + n).value;
    companions.push({ name, age, phone: mob ? jdPhone(mob) : null, ...(age === "minor" ? { guardian: Number($j("g" + n).value) || null, relation: $j("r" + n).value || null, n } : { n }) });
  }
  // Every under-18 hiker needs a parent or guardian 18+ in this booking (same rule as check_guardians()).
  const booker = { age: $j("a1")?.value || "adult" };
  if (booker.age === "minor") { booker.guardian = Number($j("g1").value) || null; booker.relation = $j("r1").value || null; }
  const adults = [...(booker.age === "adult" ? [1] : []), ...companions.filter(c => c.age === "adult").map(c => c.n)];
  const needs = [...(booker.age === "minor" ? [{ n: 1, ...booker, name: "you" }] : []), ...companions.filter(c => c.age === "minor")];
  for (const k of needs) {
    if (!adults.includes(k.guardian)) return bad($j("g" + k.n), k.n === 1
      ? (adults.length ? "You're under 18: choose your parent or guardian from this booking." : "You're under 18, so a parent or guardian 18 or older needs to be in this booking. Add them as a joiner and choose them here.")
      : `${k.name} is under 18: choose their parent or guardian (18 or older) from this booking.`);
    if (!k.relation) return bad($j("r" + k.n), k.n === 1 ? "Choose how your guardian is related to you." : `Choose how ${k.name} is related to their guardian.`);
  }
  companions.forEach(c => delete c.n);
  const en = $j("en").value.trim(), er = $j("er").value.trim(), em = $j("em").value.trim();
  if (!en) return bad($j("en"), "Add an emergency contact: someone who isn't on this hike.");
  if (!/^9\d{9}$/.test(jdLocal(em))) return bad($j("em"), "Enter the emergency contact's 10-digit mobile number that starts with 9.");
  return { companions, emergency: { name: en, relation: er, phone: jdPhone(em) }, booker };
}
// Joiner details cut-off (TP-014, ADR-006), the same rule as details_required() in the database:
// names are due `details_due_days` (3) days before the trip on the Manila calendar, and from that
// day on a new booking needs every name. Dates are worked out in Manila time, not the phone's.
const manilaToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const isoAddDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function detailsDueDays() { try { return Number(typeof tpReadCache === "function" && tpReadCache().settings?.details_due_days) || 3; } catch { return 3; } }
function dueDate(iso) { return isoAddDays(iso, -detailsDueDays()); }
function detailsRequired(iso) { return manilaToday() >= dueDate(iso); }
// What's still missing on a booking (same rule as booking_details_missing() in the database):
// joiners' names, the emergency contact, a guardian for someone under 18.
function missingDetails(b) {
  const out = [], n = (b.size || 1) - 1 - (b.companions || []).length;
  if (n > 0) out.push({ item: "names", count: n });
  if (!b.emergency || !b.emergency.name || !b.emergency.phone) out.push({ item: "emergency" });
  const adults = [...((b.booker?.age || "adult") === "adult" ? [1] : []), ...(b.companions || []).map((c, i) => c.age === "adult" ? i + 2 : 0).filter(Boolean)];
  const minors = [...(b.booker?.age === "minor" ? [b.booker] : []), ...(b.companions || []).filter(c => c.age === "minor")];
  if (minors.some(m => !adults.includes(Number(m.guardian)) || !m.relation)) out.push({ item: "guardian" });
  return out;
}
const missingText = list => list.map(m => m.item === "names" ? `${m.count} joiner${m.count === 1 ? "'s name" : "s' names"}` : m.item === "emergency" ? "the emergency contact" : "a guardian for someone under 18").join(", ");
const niceShort = iso => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
