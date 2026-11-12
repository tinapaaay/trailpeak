// TrailPeak trips: one record per trip, shared by the search page and the trip page.
// Height (MASL), difficulty (1–9) and trail class come from published trail guides.
// Organizers, dates, slots, fees, reviews, guides and itineraries are sample data.
// reviewList: [name, date, stars 1–5, text]. notice: [icon, text] shown above the trip facts.
const U = (id, w, h) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=70`;

const TRIPS = [
  {
    id: "mt-batulao", title: "Mt. Batulao", place: "Nasugbu, Batangas", province: "Batangas",
    level: "moderate", score: 4, masl: 811, trailClass: "3", trailNote: "Steep, some rope",
    kind: "day", typeLabel: "Day hike", hours: "5–6 hrs", hoursNote: "Day hike, traverse",
    rating: 4.8, reviews: 212, group: 14, groupNote: "One van, 2 guides", fee: 1499, dp: 500, meet: "2:00 AM",
    org: "Batangas Trail Co.", verified: true, orgTrips: 186, contact: "+63 917 000 0201",
    departures: { "2026-11-07": 3, "2026-11-14": 9, "2026-11-21": 0, "2026-11-28": 14 },
    photo: "1681287622401-9a77374ce790", alt: "Green forested hills under a hazy sky",
    gallery: [
      [U("1681287622401-9a77374ce790", 1400, 900), "Green forested hills with a jagged peak in the distance"],
      [U("1658296769881-f50967f4e740", 700, 500), "Grassy hill with trees and mountains behind"],
      [U("1658296765530-41fbaea40024", 700, 500), "A group of hikers walking up a foggy hill"],
    ],
    about: [
      "Mt. Batulao is a classic first “real” climb from Manila: rolling grassland ridges, a row of small peaks, and a steep final assault to the summit at 811 MASL. Most of the trail is open with little shade, so we start before sunrise.",
      "Good for hikers who have done a few easy day hikes. Expect steep, rocky sections near the summit with fixed ropes. Jump-off is at KC Hillcrest (formerly Evercrest), Nasugbu.",
    ],
    guide: ["Jun R.", "Local guide, 140+ Batulao climbs"],
    pickups: [
      { place: "Cubao", area: "Cubao, near the bus terminals", time: "2:00 AM", drop: "4:30 PM" },
      { place: "Greenfield", area: "Greenfield District, Mandaluyong", time: "2:45 AM", drop: "4:00 PM" },
      { place: "Alabang", area: "Alabang, Festival Mall area", time: "3:15 AM", drop: "3:30 PM" },
    ],
    itinerary: [
      ["2:00 AM", "Meetup at Cubao", "Van leaves 2:15 AM sharp", true],
      ["2:45 AM", "Pick-up at Greenfield"], ["3:15 AM", "Pick-up at Alabang"],
      ["5:00 AM", "Jump-off at KC Hillcrest", "Registration and safety briefing"],
      ["8:30 AM", "Summit, 811 MASL", "Photos and snack break", true],
      ["11:30 AM", "Back at the jump-off", "Wash up (shower fee not included)"],
      ["12:30 PM", "Lunch stop", "Own expense"],
      ["4:00 PM", "Back in Manila", "Drop-off at the same pick-up points"],
    ],
    incl: ["Round-trip van", "Guide fee (1 guide per 7 joiners)", "Registration and environmental fees", "Coordinator fee", "Bag tag"],
    excl: ["Meals and drinks", "Shower fee at the jump-off", "Tip for guides (optional)", "Personal gear"],
    bring: "At least 2 L of water, trail food, a cap or hat, sunscreen, a rain jacket, a headlamp for the dark start, a change of clothes, and a valid ID for registration.",
    reviewList: [
      ["Carla D.", "2026-10-25", 5, "Steep near the top but the ropes and guides made it feel safe. Van left exactly at 2:15 like they said."],
      ["Miguel S.", "2026-10-18", 5, "Great first major-feeling hike. Bring more water than you think, there's almost no shade."],
      ["Joy T.", "2026-10-11", 4, "Sunrise on the ridge was worth it. Lunch stop was a bit rushed."],
    ],
  },
  {
    id: "mt-mariglem", title: "Mt. Mariglem", place: "Cabangan, Zambales", province: "Zambales",
    level: "easy", score: 3, masl: 573, trailClass: "1–2", trailNote: "Loose scree, open",
    kind: "day", typeLabel: "Day hike", hours: "5–6 hrs", hoursNote: "Loop, 6–7 km",
    rating: 4.7, reviews: 96, group: 14, groupNote: "One van, 2 guides", fee: 1899, dp: 500, meet: "1:00 AM",
    org: "Zambales Hike Club", verified: false, orgTrips: 42, contact: "+63 917 000 0202",
    departures: { "2026-11-15": 6, "2026-11-29": 14 },
    photo: "1551677821-36cb8571bdfc", alt: "Open grassy ridge under a clear blue sky",
    gallery: [
      [U("1551677821-36cb8571bdfc", 1400, 900), "Open grassy ridge under a clear blue sky"],
      [U("1551678050-673ff81c3400", 700, 500), "A hiker standing on a grassy hilltop"],
      [U("1553787506-183f60e310a3", 700, 500), "Two hikers on top of a mountain"],
    ],
    about: [
      "A short, open grassland hike in Cabangan, Zambales, with wide views and a river stop on the way down. The summit is only 573 MASL, but there is almost no shade, so the heat is the real challenge.",
      "Good for first-timers who can handle the sun. Bring at least 2 L of water and sun protection. Best from December to February, when it's cooler.",
    ],
    guide: ["Rico M.", "Local guide from Sitio Maporac"],
    pickups: [
      { place: "Cubao", area: "Cubao, near the bus terminals", time: "1:00 AM", drop: "7:00 PM" },
      { place: "Balintawak", area: "Balintawak, NLEX entrance", time: "1:30 AM", drop: "6:30 PM" },
    ],
    itinerary: [
      ["1:00 AM", "Meetup at Cubao", "Van leaves 1:15 AM sharp", true],
      ["1:30 AM", "Pick-up at Balintawak"],
      ["5:00 AM", "Jump-off at Sitio Maporac", "Registration and safety briefing"],
      ["8:00 AM", "Summit, 573 MASL", "Photos and snack break", true],
      ["10:00 AM", "River stop", "Swim and rest"],
      ["12:00 PM", "Back at the jump-off", "Wash up and lunch (own expense)"],
      ["6:30 PM", "Back in Manila", "Drop-off at the same pick-up points"],
    ],
    incl: ["Round-trip van", "Guide fee", "Registration fee", "Coordinator fee"],
    excl: ["Meals and drinks", "Shower fee", "Tip for guides (optional)", "Personal gear"],
    bring: "At least 2 L of water, electrolytes, sunscreen, a wide-brim hat, sunglasses, trail food, swimwear or a change of clothes for the river, and a valid ID.",
    reviewList: [
      ["Paolo B.", "2026-10-26", 5, "Easy trail, huge views. The river stop after was the best part."],
      ["Liza M.", "2026-10-12", 4, "It gets really hot by 9 AM. Follow the advice and bring a hat."],
    ],
  },
  {
    id: "mt-ulap", title: "Mt. Ulap Eco-Trail", place: "Itogon, Benguet", province: "Benguet",
    level: "easy", score: 3, masl: 1846, trailClass: "1–3", trailNote: "Ridges and pine forest",
    kind: "day", typeLabel: "Traverse", hours: "6–7 hrs", hoursNote: "Traverse, about 9.4 km",
    rating: 4.9, reviews: 318, group: 12, groupNote: "One van, 2 guides", fee: 2999, dp: 1000, meet: "10:00 PM",
    org: "Northbound Joiners", verified: true, orgTrips: 254, contact: "+63 917 000 0203",
    departures: { "2026-11-13": 5, "2026-11-20": 12 },
    photo: "1658296750072-6f4d37c6e4e3", alt: "Pine-dotted ridges with low clouds",
    gallery: [
      [U("1658296750072-6f4d37c6e4e3", 1400, 900), "Pine-dotted ridges with low clouds"],
      [U("1685720320152-064dec597cb5", 700, 500), "Green mountain ridges in Benguet"],
      [U("1648025280536-00c9498e7ba9", 700, 500), "A hiker looking over a valley from a ridge"],
    ],
    about: [
      "A long, rolling traverse through pine forest and grassy ridges in Itogon, Benguet, from the Ampucao jump-off to the Sta. Fe exit. The summit is 1,846 MASL, but the climb is gradual.",
      "Good for beginners who can walk for 6–7 hours. It gets cold before sunrise, so bring a warm layer. We leave Manila the night before.",
    ],
    guide: ["Mark T.", "Local guide, Ampucao"],
    pickups: [
      { place: "Cubao", area: "Cubao, near the bus terminals", time: "10:00 PM", drop: "9:00 PM" },
      { place: "Centris", area: "Centris, Quezon Avenue", time: "10:30 PM", drop: "8:30 PM" },
    ],
    itinerary: [
      ["Fri 10:00 PM", "Meetup at Cubao", "Van leaves 10:15 PM sharp", true],
      ["Fri 10:30 PM", "Pick-up at Centris"],
      ["Sat 5:00 AM", "Jump-off at Ampucao", "Registration and safety briefing"],
      ["Sat 9:00 AM", "Summit, 1,846 MASL", "Photos and snack break", true],
      ["Sat 12:30 PM", "Exit at Sta. Fe", "Wash up and lunch (own expense)"],
      ["Sat 9:00 PM", "Back in Manila", "Drop-off at the same pick-up points"],
    ],
    incl: ["Round-trip van", "Guide fee", "Registration and environmental fees", "Coordinator fee", "Bag tag"],
    excl: ["Meals and drinks", "Shower fee", "Tip for guides (optional)", "Personal gear"],
    bring: "2 L of water, trail food, a warm jacket for the early morning, a rain jacket, a headlamp, a change of clothes, and a valid ID.",
    reviewList: [
      ["Bea C.", "2026-10-31", 5, "Pine forest, ridges, sea of clouds. Long but never too hard."],
      ["Enzo V.", "2026-10-24", 5, "Very organized. They checked everyone's ID at the jump-off so registration was quick."],
      ["Kim R.", "2026-10-17", 4, "Bring a jacket. It was cold before sunrise."],
    ],
  },
  {
    id: "mt-daraitan", title: "Mt. Daraitan + Tinipak River", place: "Tanay, Rizal", province: "Rizal",
    level: "moderate", score: 4, masl: 739, trailClass: "", trailNote: "",
    kind: "day", typeLabel: "Day hike", hours: "6–7 hrs", hoursNote: "Day hike + river",
    rating: 4.8, reviews: 184, group: 14, groupNote: "One van, 2 guides", fee: 1399, dp: 500, meet: "3:00 AM",
    org: "Rizal Peaks PH", verified: true, orgTrips: 131, contact: "+63 917 000 0204",
    departures: { "2026-11-08": 4, "2026-11-14": 8, "2026-11-15": 10 },
    photo: "1658296742588-df6218e30675", alt: "Green mountain range under grey clouds",
    gallery: [
      [U("1658296742588-df6218e30675", 1400, 900), "Green mountain range under grey clouds"],
      [U("1658296758904-45442f808dae", 700, 500), "Mountains and trees under a cloudy sky"],
      [U("1563269059-9bf5d8b3c06b", 700, 500), "Three hikers under a blue sky"],
    ],
    about: [
      "A steep forest climb to Mt. Daraitan's limestone summit at 739 MASL in Tanay, Rizal, then down to the white boulders and clear water of Tinipak River.",
      "Good for hikers ready for a steady uphill: the trail goes almost straight up. The river is a reward at the end, so bring swimwear.",
    ],
    guide: ["Lito A.", "Local guide, Brgy. Daraitan"],
    pickups: [
      { place: "Ortigas", area: "Ortigas, near the MRT station", time: "3:00 AM", drop: "6:30 PM" },
      { place: "Cubao", area: "Cubao, near the bus terminals", time: "3:30 AM", drop: "6:00 PM" },
      { place: "Marikina", area: "Marikina, Marcos Highway", time: "4:00 AM", drop: "5:30 PM" },
    ],
    itinerary: [
      ["3:00 AM", "Meetup at Ortigas", "Van leaves 3:15 AM sharp", true],
      ["3:30 AM", "Pick-up at Cubao"], ["4:00 AM", "Pick-up at Marikina"],
      ["6:00 AM", "Jump-off at Brgy. Daraitan", "Registration and safety briefing"],
      ["9:00 AM", "Summit, 739 MASL", "Photos and snack break", true],
      ["1:00 PM", "Tinipak River", "Swim and lunch (own expense)"],
      ["6:00 PM", "Back in Manila", "Drop-off at the same pick-up points"],
    ],
    incl: ["Round-trip van", "Guide fee", "Registration and environmental fees", "River crossing", "Coordinator fee"],
    excl: ["Meals and drinks", "Shower fee", "Tip for guides (optional)", "Personal gear"],
    bring: "2 L of water, trail food, gloves for the rocky summit, swimwear, a dry bag for your phone, a change of clothes, and a valid ID.",
    reviewList: [
      ["Rafa G.", "2026-10-25", 5, "The climb is basically straight up, but Tinipak River at the end makes up for it."],
      ["Trisha L.", "2026-10-19", 4, "Gloves helped a lot on the rocky summit."],
    ],
  },
  {
    id: "mt-pulag-akiki", title: "Mt. Pulag via Akiki", place: "Kabayan, Benguet", province: "Benguet",
    level: "hard", score: 7, masl: 2922, trailClass: "3", trailNote: "Long, steep assault",
    kind: "major", typeLabel: "Major climb", hours: "2 days", hoursNote: "Overnight camp",
    rating: 4.9, reviews: 73, group: 10, groupNote: "One van, 3 guides", fee: 6499, dp: 2000, meet: "8:00 PM",
    org: "Cordillera Expeditions", verified: true, orgTrips: 97, contact: "+63 917 000 0205",
    departures: { "2026-11-20": 2, "2026-12-04": 10 },
    photo: "1633670425294-cbf6ce988408", alt: "Sunrise over a sea of clouds from a grassy summit",
    gallery: [
      [U("1633670425294-cbf6ce988408", 1400, 900), "Sunrise over a sea of clouds from a grassy summit"],
      [U("1519869718241-60e98fc4f3e9", 700, 500), "Mountain range in morning sunlight"],
      [U("1675493421204-4d9abd607e07", 700, 500), "Sun setting over distant mountains"],
    ],
    about: [
      "Luzon's highest peak at 2,922 MASL, by the Akiki trail, often called the “killer trail”: a long, steep climb through forest and grassland to a summit famous for its sea of clouds at sunrise.",
      "For experienced hikers only: expect about 10 hours of climbing and a cold night at camp. Everyone attends the DENR orientation before the climb.",
    ],
    guide: ["Ben K.", "Local guide, 60+ Akiki climbs"],
    pickups: [
      { place: "Cubao", area: "Cubao, near the bus terminals", time: "8:00 PM", drop: "11:00 PM" },
      { place: "Greenfield", area: "Greenfield District, Mandaluyong", time: "8:45 PM", drop: "10:30 PM" },
    ],
    itinerary: [
      ["Fri 8:00 PM", "Meetup at Cubao", "Van leaves 8:15 PM sharp", true],
      ["Fri 8:45 PM", "Pick-up at Greenfield"],
      ["Sat 6:00 AM", "DENR orientation", "Required for all climbers"],
      ["Sat 8:00 AM", "Start of the Akiki trail"],
      ["Sat 4:00 PM", "Camp on the trail", "Dinner and rest"],
      ["Sun 5:30 AM", "Summit, 2,922 MASL", "Sunrise over the clouds", true],
      ["Sun 11:00 PM", "Back in Manila", "Drop-off at the same pick-up points"],
    ],
    incl: ["Round-trip van", "Guide fees", "DENR and registration fees", "Coordinator fee", "Group tents"],
    excl: ["Meals and drinks", "Porter (optional)", "Tip for guides (optional)", "Personal gear and sleeping bag"],
    bring: "3 L of water, food for 2 days, a warm jacket, gloves and a beanie (it can drop near freezing), a rain jacket, a headlamp, a sleeping bag, and a valid ID.",
    reviewList: [
      ["Nico A.", "2026-10-23", 5, "Hardest hike I've done. Guides were patient and the summit sunrise was unreal."],
    ],
  },
  {
    id: "mt-halcon", title: "Mt. Halcon", place: "Baco, Oriental Mindoro", province: "Oriental Mindoro",
    level: "expert", score: 9, masl: 2582, trailClass: "", trailNote: "",
    kind: "major", typeLabel: "Major climb", hours: "4 days", hoursNote: "Open Feb–May only",
    rating: 5.0, reviews: 28, group: 8, groupNote: "Small group, 3 guides", fee: 9999, dp: 3000, meet: "4:00 AM",
    org: "Mindoro Trek Guides", verified: false, orgTrips: 19, contact: "+63 917 000 0206",
    departures: { "2027-02-18": 1, "2027-03-11": 8 },
    photo: "1661200797529-c25677f64a14", alt: "Cloud-wrapped forested mountain range",
    gallery: [
      [U("1661200797529-c25677f64a14", 1400, 900), "Cloud-wrapped forested mountain range"],
      [U("1685720360392-59eea3c681aa", 700, 500), "A mountain range seen from a distance"],
      [U("1655103072318-c021619719f0", 700, 500), "Forested mountain range"],
    ],
    about: [
      "One of the hardest climbs in the Philippines: 2,582 MASL in Oriental Mindoro, through mossy forest, river crossings and steep ridges. The mountain is open only from February 1 to May 31.",
      "For very experienced hikers with several major climbs behind them. Plan for 4 days, heavy rain and leeches.",
    ],
    guide: ["Dante S.", "Local guide, Baco"],
    pickups: [
      { place: "MOA", area: "SM Mall of Asia, Pasay", time: "4:00 AM", drop: "Day 4, 9:00 PM" },
      { place: "Alabang", area: "Alabang, Festival Mall area", time: "4:30 AM", drop: "Day 4, 8:30 PM" },
      { place: "Batangas Port", area: "Batangas Port terminal", time: "7:00 AM", drop: "Day 4, 5:30 PM" },
    ],
    itinerary: [
      ["Day 1, 4:00 AM", "Meetup at MOA", "Van to Batangas Port", true],
      ["Day 1, 8:00 AM", "Ferry to Calapan"],
      ["Day 1, 1:00 PM", "Jump-off in Baco", "Registration and briefing, first camp"],
      ["Day 2", "Forest and river crossings", "Camp on the trail"],
      ["Day 3, dawn", "Summit, 2,582 MASL", "Then down to camp", true],
      ["Day 4, 9:00 PM", "Back in Manila", "Drop-off at the same pick-up points"],
    ],
    incl: ["Round-trip van and ferry", "Guide fees", "Climb permit and registration", "Coordinator fee", "Group tents"],
    excl: ["Meals and drinks", "Porter (optional)", "Tip for guides (optional)", "Personal gear and sleeping bag"],
    bring: "Food for 4 days, water filter or tablets, a rain jacket and pack cover, leech socks, a warm layer, a headlamp, a sleeping bag, and a valid ID.",
    notice: ["calendar", "Seasonal trail: Mt. Halcon is open only from February 1 to May 31. Trips outside these dates can't be booked."],
    reviewList: [
      ["Marco P.", "2026-05-14", 5, "Four days of rain, leeches and mossy forest. Only go if you're ready, but wow."],
    ],
  },
];

// Trips published from the organizer form in this browser (prototype: not shared with anyone else).
const TP_PUBLISHED_KEY = "trailpeak.published";
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
if (typeof TP !== "undefined" && TP.online) {
  TP.applyTo(TRIPS); // trips, dates, live slots and reviews from Supabase (see api.js)
  // First visit: don't flash sample trips that will be replaced a moment later.
  if (TP.firstSync && /(^|\/)(index\.html)?$|\/(trip|org)\.html$/.test(location.pathname)) TRIPS.length = 0;
} else {
  try {
    // Trips published from this browser; an edited one replaces its earlier copy.
    (JSON.parse(localStorage.getItem(TP_PUBLISHED_KEY)) || []).forEach(t => { if (!TRIPS.some(x => x.id === t.id)) TRIPS.push(t); });
  } catch { /* storage blocked: only the sample trips show */ }
  mergeReviews(TRIPS, getMyReviews());
}

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
