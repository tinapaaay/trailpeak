// TrailPeak trips: filled from Supabase by api.js (TP.applyTo), shared by the search page,
// trip pages, organizer profiles, the dashboard and My trips. The built-in sample trips were
// removed with the offline demo (#95); every trip shown comes from a real organizer account.
// reviewList: [name, date, stars 1–5, text]. notice: [icon, text] shown above the trip facts.
const TRIPS = [];

// Joiners' reviews ({ tripId, name, date, stars, text }) go on top of each trip's list,
// and the average and count are worked out again with them included.
function mergeReviews(trips, list) {
  for (const t of trips) {
    const mine = list.filter(r => r.tripId === t.id);
    if (!mine.length) continue;
    const sum = mine.reduce((a, r) => a + r.stars, 0), before = t.reviews || 0;
    t.rating = ((t.rating || 0) * before + sum) / (before + mine.length);
    t.reviews = before + mine.length;
    t.reviewList = [...mine.map(r => [r.name, r.date, r.stars, r.text]), ...(t.reviewList || [])];
    t.isNew = false;
  }
}
if (typeof TP !== "undefined") TP.applyTo(TRIPS); // trips, dates, live slots and reviews (see api.js)

function tripById(id) { return TRIPS.find(t => t.id === id); }
// Shown in search, trip cards and organizer profiles: published trips only. Drafts and archived
// trips stay in TRIPS for their organizer's dashboard and joiners' My trips (TP-053).
const isListed = t => !t.status || t.status === "published";
// One short label for a trip, used on the dashboard, in Facebook text and in Activity (TP-055):
// "Mt. Batulao · Nov 14–Dec 5". The range covers the dates given (usually upcoming ones);
// the year shows only when it isn't this year.
function dateRange(dates) {
  const d = [...dates].filter(Boolean).sort();
  if (!d.length) return "";
  const a = d[0], b = d[d.length - 1], thisYear = String(new Date().getFullYear());
  const f = (iso, year) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  const yb = b.slice(0, 4) !== thisYear;
  if (a === b) return f(a, yb);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${f(a, false)}–${Number(b.slice(8))}${yb ? ", " + b.slice(0, 4) : ""}`;
  return `${f(a, a.slice(0, 4) !== b.slice(0, 4))}–${f(b, yb)}`;
}
function tripLabel(t, dates) { const r = dateRange(dates); return r ? `${t.title} · ${r}` : t.title; }
