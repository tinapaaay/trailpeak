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
  const role = user.role === "organizer"
    ? `Organizer · ${escapeHtml(user.org || "")}${user.idVerified ? " · ID verified" : ""}`
    : "Joiner";
  slot.outerHTML = `<details class="acct">
    <summary class="avatar label-caps" aria-label="Account: ${escapeHtml(user.name)}">${escapeHtml(initialsOf(user.name))}</summary>
    <div class="acct-menu">
      <p class="acct-name">${escapeHtml(user.name)}</p>
      <p class="meta">${role}</p>
      <a class="btn btn-${user.role === "organizer" ? "secondary" : "primary"} label-caps" href="mytrips.html">My trips</a>
      ${user.role === "organizer" ? '<a class="btn btn-primary label-caps" href="dashboard.html">Dashboard</a><a class="btn btn-secondary label-caps" href="organize.html">Post a trip</a>' : '<a class="btn btn-secondary label-caps" href="organizer-signup.html">Become an organizer</a>'}
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
const jdPhone = v => { const d = jdDigits(v).replace(/^63/, ""); return `+63 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`; };
const jdLocal = v => jdDigits(v).replace(/^63/, "").slice(0, 10);
function missingJoiners(b) { return b.status === "confirmed" ? Math.max(0, b.size - 1 - (b.companions || []).length) : 0; }

// p: id prefix (several forms can be on one page); size: joiners in the booking.
function joinerFieldsHtml(p, size, companions = [], emergency = null, { you = "", allowLater = true } = {}) {
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
    </div>`;
  }).join("");
  const who = size > 1 ? `<fieldset class="jd">
      <legend>Who's joining</legend>
      <p class="jd-hint">Organizers register every hiker at the jump-off, so use names as they appear on an ID. Under 18 needs a parent or guardian on the trip.</p>
      <p class="jd-you"><span class="jd-h">Joiner 1</span> You${you ? `, ${escapeHtml(you)}` : ""}</p>
      <div id="${p}-rows" class="jd-rows">${rows}</div>
      ${allowLater ? `<label class="check"><input type="checkbox" id="${p}-later"><span>Some names aren't ready yet. I'll add them in My trips, at least 3 days before the trip.</span></label>` : ""}
    </fieldset>` : "";
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
    if (!name) return bad($j("n" + n), `Enter joiner ${n}'s full name, or tick "Some names aren't ready yet".`);
    if (mob && !/^9\d{9}$/.test(jdLocal(mob))) return bad($j("m" + n), `Joiner ${n}'s mobile should be 10 digits starting with 9, or leave it blank.`);
    companions.push({ name, age: $j("a" + n).value, phone: mob ? jdPhone(mob) : null });
  }
  const en = $j("en").value.trim(), er = $j("er").value.trim(), em = $j("em").value.trim();
  if (!en) return bad($j("en"), "Add an emergency contact: someone who isn't on this hike.");
  if (!/^9\d{9}$/.test(jdLocal(em))) return bad($j("em"), "Enter the emergency contact's 10-digit mobile number that starts with 9.");
  return { companions, emergency: { name: en, relation: er, phone: jdPhone(em) } };
}
// Joiner names are due 3 days before the trip date.
function dueDate(iso) { const d = new Date(iso + "T00:00"); d.setDate(d.getDate() - 3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
