// TrailPeak shared card rendering, used by the search page and the organizer preview.
// Shape icons: Easy circle, Moderate square, Hard diamond, Expert double diamond.
const levels = {
  easy:     { label: "Easy",     shape: "blaze-circle",  marks: 1 },
  moderate: { label: "Moderate", shape: "",              marks: 1 },
  hard:     { label: "Hard",     shape: "blaze-diamond", marks: 1 },
  expert:   { label: "Expert",   shape: "blaze-diamond", marks: 2 },
};
const img = id => `https://images.unsplash.com/photo-${id}?w=900&h=600&fit=crop&q=70`;
// Card photos: the browser picks the smallest size that stays sharp (cards show about 300–420px wide).
const imgSrcset = id => [480, 800].map(w => `https://images.unsplash.com/photo-${id}?w=${w}&h=${Math.round(w * 2 / 3)}&fit=crop&q=70 ${w}w`).join(", ");
const CARD_SIZES = "(max-width: 767px) calc(100vw - 32px), (max-width: 1024px) 50vw, 420px";

const icon = (id, s = 18) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const peso = n => "₱" + n.toLocaleString();
const initials = name => name.split(" ").filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join("");
function niceDate(iso) {
  const d = new Date(iso + "T00:00");
  const opts = { weekday: "short", month: "short", day: "numeric" };
  if (d.getFullYear() !== 2026) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}
function badge(level) {
  const l = levels[level];
  return `<span class="badge badge-${level} label-caps"><span class="blaze ${l.shape}">${"<i></i>".repeat(l.marks)}</span>${l.label}</span>`;
}
function card(t, dep) {
  const [date, left] = dep;
  return `<article class="card">
    <div class="card-media">
      <img src="${t.photoUrl || img(t.photo)}"${t.photoUrl ? "" : ` srcset="${imgSrcset(t.photo)}" sizes="${CARD_SIZES}"`} alt="${t.alt}" loading="lazy" decoding="async" width="900" height="600">
      ${badge(t.level)}
      <span class="tag-elevation data">${t.masl.toLocaleString()} MASL</span>
    </div>
    <div class="card-body">
      <span class="chip-spots label-caps">${left} of ${t.group} slots left</span>
      <div><h3 class="card-title">${t.title}</h3>
      <p class="meta">${icon("pin", 16)}${t.place}</p></div>
      <div class="specs data">
        <span>${icon("mountain")}<span class="sr">Difficulty </span>${t.score}/9</span>
        <span>${icon("clock")}${t.length}</span>
        ${t.isNew ? "<span>New trip</span>" : `<span>${icon("star")}<span class="sr">Rated </span>${t.rating.toFixed(1)} <span aria-hidden="true">(${t.reviews})</span><span class="sr">from ${t.reviews} reviews</span></span>`}
      </div>
      <dl class="facts">
        <div><dt>${icon("calendar", 16)}</dt><dd>Meetup <span class="data">${niceDate(date)} · ${t.meet}</span></dd></div>
        <div><dt>${icon("van", 16)}</dt><dd>Pick-up ${t.pickups.join(" · ")}</dd></div>
      </dl>
      <p class="organizer"><span class="org-avatar label-caps" aria-hidden="true">${initials(t.org)}</span>by ${t.org}</p>
      ${t.verified ? `<p class="org-claim">${claimBadge("ID verified")}</p>` : ""}
    </div>
    <div class="card-foot">
      <p class="price">${peso(t.fee)} <small>per joiner · ${peso(t.dp)} DP to reserve</small></p>
      <a class="btn btn-primary label-caps" href="${t.page || "#"}" aria-label="View and join ${t.title}">View &amp; join</a>
    </div>
  </article>`;
}

