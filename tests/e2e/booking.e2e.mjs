// End-to-end booking test (TP-062, #96): uses the site like a joiner would, against STAGING.
// trip page → pick a date → 2 joiners → Reserve → one name "later" → submit → My trips → cancel.
//
// No password or secret: each run signs in a brand-new anonymous joiner on the staging project
// (anonymous sign-ins are turned on in staging ONLY; never on live). The pages come from this
// checkout, served locally, so a PR tests its own code. Set E2E_BASE_URL to test a deployed site.
//
// Needs on staging: a published trip by an approved organizer with a date at least 4 days away
// and 2+ slots left. Set E2E_TRIP_ID to pick one. See docs/testing/staging.md.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log("ok  ", name); } else { fail++; console.error("FAIL", name, detail ?? ""); } };

// Staging connection, read from config.js exactly as the site reads it.
const mem = new Map();
const store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const cfgCtx = { URLSearchParams, location: { search: "?env=staging" }, localStorage: store, sessionStorage: store, window: {} };
vm.createContext(cfgCtx); vm.runInContext(fs.readFileSync(path.join(root, "config.js"), "utf8"), cfgCtx);
const { url, anonKey } = cfgCtx.window.TRAILPEAK_SUPABASE;
if (!url || /fjssjgefufwuadrltvjf/.test(url)) { console.error("Refusing to run: staging isn't configured, or it points at the live project."); process.exit(1); }
const projectRef = new URL(url).hostname.split(".")[0];

// Serve this checkout (unless a deployed site was given).
let server, base = process.env.E2E_BASE_URL;
if (!base) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const f = path.resolve(root, "." + (p === "/" ? "/index.html" : p));
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.setHeader("Content-Type", types[path.extname(f)] || "application/octet-stream");
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
}
base = base.replace(/\/$/, "");

const db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, ref = null;
try {
  // 1. A throwaway joiner with a name and number (the site asks for both before booking).
  const { data: anon, error: e1 } = await db.auth.signInAnonymously();
  if (e1) throw new Error(`Anonymous sign-in failed (is it turned on in staging? Authentication → Sign In / Providers): ${e1.message}`);
  const session = anon.session, me = anon.user.id;
  const { error: e2 } = await db.from("profiles").update({ name: "E2E Joiner", phone: "+63 917 000 0096" }).eq("id", me);
  check("Throwaway joiner signs in and saves a profile", !e2, e2?.message);

  // 2. A bookable staging trip: published, real organizer, a date 4+ days away with 2+ slots.
  const manila = new Date(Date.now() + 8 * 3600e3), minDate = new Date(manila.getTime() + 4 * 864e5).toISOString().slice(0, 10);
  const [{ data: trips }, { data: slots }] = await Promise.all([
    db.from("trips").select("id, organizer_id, status, published, details"),
    db.rpc("all_slots"),
  ]);
  const open = (slots || []).filter(s => s.date >= minDate && s.left_count >= 2 && (s.status || "open") === "open");
  const candidates = (trips || []).filter(t => t.organizer_id && t.status === "published" && t.published !== false && open.some(s => s.trip_id === t.id))
    .sort((a, b) => (/e2e/i.test(b.details?.title || "") ? 1 : 0) - (/e2e/i.test(a.details?.title || "") ? 1 : 0));
  const trip = process.env.E2E_TRIP_ID ? candidates.find(t => t.id === process.env.E2E_TRIP_ID) : candidates[0];
  if (!trip) throw new Error(`No bookable trip on staging: publish a trip with a date on or after ${minDate} and 2+ slots.`);
  const date = open.filter(s => s.trip_id === trip.id).map(s => s.date).sort()[0];
  console.log(`     using trip "${trip.details?.title}" (${trip.id}) on ${date}`);

  // 3. The browser, signed in as that joiner on staging.
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/index.html?env=staging`);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${projectRef}-auth-token`, JSON.stringify(session)]);
  await page.reload();
  await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("trailpeak.user"))?.name === "E2E Joiner"; } catch { return false; } }, null, { timeout: 30000 });
  check("Site shows the staging bar and loads the signed-in joiner", await page.locator(".env-bar").isVisible());

  // 4. Trip page: pick the date, 2 joiners, Reserve.
  await page.goto(`${base}/trip.html#${trip.id}`);
  const day = page.locator(`button.day[data-date="${date}"]`);
  for (let i = 0; i < 12 && !(await day.count()); i++) {       // the calendar opens on the first open month
    const next = page.getByRole("button", { name: /next month/i });
    if (!(await next.count()) || await next.isDisabled()) break;
    await next.click();
  }
  await day.click();
  await page.locator("#plus").click();
  await page.locator("#reserve").click();
  await page.waitForURL(/reserve\.html/, { timeout: 20000 });
  await page.locator("#rv-later2").waitFor({ timeout: 20000 });
  const summary = await page.locator("#sum-lines").innerText();
  check("Reserve page shows 2 joiners on the chosen date", /Joiners\s*2/.test(summary), summary);

  // 5. Joiner 2's details later, emergency contact, agree, submit.
  await page.locator("#rv-later2").check();
  if (await page.locator("#rv-en").isVisible()) {
    await page.locator("#rv-en").fill("E2E Contact");
    await page.locator("#rv-er").fill("Friend");
    await page.locator("#rv-em").fill("9170000097");
  }
  await page.locator("#agree").check();
  await page.locator("#pay-btn").click();
  await page.locator("#done").waitFor({ state: "visible", timeout: 30000 });
  ref = (await page.locator("#ref").innerText()).trim();
  check("Booking is made and shows a reference", /^TP-[A-Z0-9]{6}$/.test(ref), ref);

  // 6. The database agrees: 2 joiners, DP pending with a hold, no names yet for joiner 2.
  const { data: row } = await db.from("bookings").select("size, status, hold_until, companions, emergency").eq("ref", ref).single();
  check("Database has the booking: 2 joiners, a DP hold, joiner 2 left for later",
    row?.size === 2 && row?.status === "confirmed" && !!row?.hold_until && (row?.companions || []).length === 0 && row?.emergency?.name, row);

  // 7. My trips lists it with the missing-details reminder.
  await page.goto(`${base}/mytrips.html`);
  const card = page.locator(".booking", { hasText: ref });
  await card.waitFor({ timeout: 20000 });
  const text = await card.innerText();
  check("My trips shows the booking", text.includes(ref));
  check("My trips asks for the missing joiner's details", /details/i.test(text) && /1 joiner/i.test(text), text.slice(0, 400));
  check("No script errors on the way", errors.length === 0, errors);
} catch (e) {
  fail++; console.error("FAIL", e.message);
} finally {
  // 8. Clean up: cancel the test booking so its slots go back.
  if (ref) {
    const { error } = await db.rpc("cancel_booking", { p_ref: ref });
    check("Test booking cancelled (slots returned)", !error, error?.message);
  }
  await browser?.close();
  server?.close();
  await db.auth.signOut().catch(() => {});
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
