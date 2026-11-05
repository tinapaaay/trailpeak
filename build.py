"""Build the shareable copy of the TrailPeak prototype into site/.

Published pages can't load photos from other websites, so this downloads
each photo once into site/photos/ and points the pages at those files.
The main page (index.html) is also unwrapped, because the publishing
service adds its own <html>/<head>/<body> around it.

Run:  python3 build.py            (optional: TRAILPEAK_URL=<share link> python3 build.py)
"""
import os, re, shutil, urllib.request

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SRC, "site")
PAGES = ["index.html", "trip.html", "organize.html", "signin.html", "organizer-signup.html", "dashboard.html", "reserve.html", "mytrips.html", "styles.css", "cards.js", "auth.js", "trips.js"]
URL_RE = re.compile(r"https://images\.unsplash\.com/photo-([0-9]+-[0-9a-f]+)\?([^\"'`)\s]*)")

os.makedirs(os.path.join(OUT, "photos"), exist_ok=True)

def fetch(photo_id, query):
    """Download one photo size once; return its local path."""
    size = re.search(r"w=(\d+)", query).group(1)
    name = f"photos/{photo_id}-{size}.jpg"
    dest = os.path.join(OUT, name)
    if not os.path.exists(dest):
        req = urllib.request.Request(f"https://images.unsplash.com/photo-{photo_id}?{query.replace('&amp;', '&')}&fm=jpg",
                                     headers={"User-Agent": "trailpeak-build"})
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
            f.write(r.read())
    return name

# Card photos are built from an id in cards.js, so list every id the pages use.
card_ids = set()
for page in ["trips.js", "organize.html"]:
    card_ids |= set(re.findall(r'photo:\s*"([0-9]+-[0-9a-f]+)"', open(os.path.join(SRC, page)).read()))

for page in PAGES:
    text = open(os.path.join(SRC, page)).read()
    text = URL_RE.sub(lambda m: fetch(m.group(1), m.group(2)), text)
    if page == "cards.js":
        for pid in card_ids:
            fetch(pid, "w=900&h=600&fit=crop&q=70")
        text = text.replace("`https://images.unsplash.com/photo-${id}?w=900&h=600&fit=crop&q=70`", "`photos/${id}-900.jpg`")
    if page == "trips.js":
        # Gallery photos are written as U("id", width, height) calls.
        text = re.sub(r'U\("([0-9]+-[0-9a-f]+)", (\d+), (\d+)\)',
                      lambda m: '"' + fetch(m.group(1), f"w={m.group(2)}&h={m.group(3)}&fit=crop&q=70") + '"', text)
    if page in ("organize.html", "dashboard.html") and os.environ.get("TRAILPEAK_URL"):
        text = text.replace('<script src="auth.js"></script>',
                            f'<script>window.TRAILPEAK_URL = "{os.environ["TRAILPEAK_URL"]}";</script>\n<script src="auth.js"></script>', 1)
    if page == "index.html":
        # The publisher wraps the main page itself: keep only what goes inside.
        text = re.sub(r"<!doctype html>\s*<html[^>]*>\s*<head>\s*", "", text, flags=re.I)
        text = re.sub(r'<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*', "", text)
        text = text.replace("</head>\n<body>\n", "\n").replace("</body>\n</html>", "")
    open(os.path.join(OUT, page), "w").write(text)

photos = sorted(os.listdir(os.path.join(OUT, "photos")))
size = sum(os.path.getsize(os.path.join(OUT, "photos", p)) for p in photos)
print(f"Built site/ with {len(photos)} photos ({size // 1024} KB)")
