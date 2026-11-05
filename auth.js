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
  const base = (trip.baseDepartures || trip.departures)[date] ?? trip.group;
  const sampleBooked = Math.max(0, (trip.group || 0) - base);
  const list = [], offset = Math.floor(rnd() * first.length);
  let n = 0;
  while (n < sampleBooked) {
    const size = Math.min(sizes[Math.floor(rnd() * sizes.length)], sampleBooked - n);
    // Step through the name list (5 doesn't divide 14) so names don't repeat on one date.
    const k = list.length;
    list.push({ name: `${first[(offset + k * 5) % first.length]} ${last[(offset + k * 3) % last.length]}.`, size, listed: rnd() < 0.6, you: false });
    n += size;
  }
  const me = getUser();
  getBookings().filter(b => b.tripId === trip.id && b.date === date && b.status !== "cancelled")
    .forEach(b => list.push({ name: b.displayName || "You", size: b.size, listed: !!b.listed, you: true, mine: me && b.userName === me.name }));
  return list;
}
