// Organizer dashboard, end to end, against a LOCAL fake database (tests/preview.mjs: PGlite +
// the real schema.sql, a signed-in test organizer, synthetic bookings). No network, no accounts,
// a fresh database every run. Covers the organizer side the staging booking test can't reach.
//
// Checks: the page loads with real data and no demo wording · recording a DP saves and survives a
// reload · the joiner sees that DP in My trips · slots can't go below the joiners booked · close and
// reopen a date · publish a draft · archiving a trip that still has bookings is refused, with a reason.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = 8100 + Math.floor(Math.random() * 800);
const base = `http://127.0.0.1:${port}`;
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log("ok  ", name); } else { fail++; console.error("FAIL", name, detail ?? ""); } };

const server = spawn(process.execPath, [path.join(here, "..", "preview.mjs")], { env: { ...process.env, PREVIEW_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", d => { serverLog += d; });
server.stderr.on("data", d => { serverLog += d; });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("Fake database didn't start:\n" + serverLog)), 60000);
  server.stdout.on("data", d => { if (String(d).includes("Synthetic preview")) { clearTimeout(t); resolve(); } });
  server.on("exit", c => { clearTimeout(t); reject(new Error(`Fake database exited (${c}):\n${serverLog}`)); });
});

let browser;
try {
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  // The first visit stops page scripts on purpose until data arrives (TP.waitForData); not a bug.
  page.on("pageerror", e => { if (!/waiting for the first data load/.test(e.message)) errors.push(e.message); });
  const openDashboard = async () => {
    await page.goto(`${base}/dashboard.html`);
    await page.locator("#trips", { hasText: "Local receipt test hike" }).waitFor({ timeout: 30000 });
  };
  const say = () => page.locator("#live, [aria-live]").allInnerTexts().then(t => t.join(" "));

  // 1. Loads with real data, no demo wording.
  await openDashboard();
  const body = await page.locator("main").innerText();
  check("Dashboard shows the organizer's trips and joiners", body.includes("Local receipt test hike") && /Joiners for Thu, Jan 1, 2099/.test(body));
  check("No demo or sample-account wording", !/Prototype|sample account|sample data|Demo DP/i.test(body), body.match(/.{40}(Prototype|sample account|sample data|Demo DP).{40}/i)?.[0]);

  // 1b. Opening a notification marks it read, and it stays read after a reload.
  const unread = async () => Number((await page.locator("#activity-h").innerText()).match(/(\d+) new/)?.[1] || 0);
  const before = await unread();
  await page.locator("#activity-list li.unread [data-view]").first().click();
  await page.waitForFunction(n => !new RegExp(`\\b${n} new`).test(document.querySelector("#activity-h").innerText), before, { timeout: 10000 });
  check("Opening a notification marks it read (count goes down by 1)", await unread() === before - 1, `${before} -> ${await unread()}`);
  check("The tab title count goes down too", (await page.title()).startsWith(before - 1 ? `(${before - 1})` : "Dashboard"), await page.title());
  await page.waitForTimeout(500);
  await openDashboard();
  check("It stays read after a reload", await unread() === before - 1, `${await unread()} after reload, expected ${before - 1}`);

  // 2. Record a DP for the 3-joiner booking (Ben Cruz's group), then reload.
  const row = page.locator("tbody tr", { hasText: "Ben Cruz" });
  await row.locator("[data-receipt]").click();
  await page.locator("#receipt-amount").fill("1500");
  await page.locator("#receipt-method").selectOption("GCash");
  await page.locator("#receipt-ref").fill("E2E-1500");
  await page.locator("#receipt-reason").fill("Full DP by GCash (test)");   // required: why the record changed
  await page.locator("#receipt-save").click();
  await page.locator("tbody tr", { hasText: "Ben Cruz" }).filter({ hasText: "₱1,500 / ₱1,500" }).waitFor({ timeout: 15000 });
  check("Recording a DP updates the joiner's row", true);
  await openDashboard();
  const tiles = await page.locator("main").innerText();
  check("The DP record survives a reload (DPs recorded ₱1,500)", /DPS RECORDED\s*₱1,500/i.test(tiles), tiles.match(/DPS RECORDED[\s\S]{0,40}/i)?.[0]);

  // 3. The joiner sees it in My trips.
  const joiner = await (await browser.newContext()).newPage();
  joiner.on("pageerror", e => { if (!/waiting for the first data load/.test(e.message)) errors.push("joiner: " + e.message); });
  await joiner.goto(`${base}/mytrips.html?testRole=joiner`);
  const jcard = joiner.locator(".booking", { hasText: "Greenfield" }).first();
  await jcard.waitFor({ timeout: 30000 }).catch(() => {});
  if (!(await jcard.count())) { await joiner.reload(); await jcard.waitFor({ timeout: 30000 }); }
  const jtext = await jcard.innerText();
  check("The joiner's My trips shows the recorded DP", /₱1,500 \/ ₱1,500/.test(jtext), jtext.slice(0, 300));

  // 4. Slots can't go below the joiners booked (7) or above the group size (10); 8 is fine.
  await page.locator('[data-slots="receipt-test|2099-01-01"]').click();
  const cap = page.locator("#cap-in-receipttest20990101");
  await cap.fill("5");
  await page.getByRole("button", { name: /save slots/i }).click();
  const slotsErr = await page.locator("main").innerText();
  check("Slots below the joiners booked are refused", /already taken/i.test(slotsErr));
  await cap.fill("12");
  await page.getByRole("button", { name: /save slots/i }).click();
  check("Slots above the group size are refused", /The most is 10/.test(await page.locator("main").innerText()));
  await cap.fill("8");
  await page.getByRole("button", { name: /save slots/i }).click();
  await page.waitForFunction(() => /Slots changed from 10 to 8/.test(document.querySelector("main").innerText), null, { timeout: 15000 });
  check("Slots can be changed to 8", true);

  // 5. Close the date, then reopen it.
  await page.locator('[data-close="receipt-test|2099-01-01"]').click();
  await page.waitForFunction(() => /Closed: joiners can't book this date/.test(document.querySelector("main").innerText), null, { timeout: 15000 });
  check("Closing a date stops new bookings", true);
  await page.locator('[data-close="receipt-test|2099-01-01"]').click();
  await page.waitForFunction(() => !/Closed: joiners can't book this date/.test(document.querySelector("main").innerText), null, { timeout: 15000 });
  check("The date can be reopened", true);

  // 6. Publish the draft trip.
  await page.locator('[data-publish="draft-test"]').click();
  await page.waitForFunction(() => /Published: joiners can find and book it now/.test(document.querySelector("main").innerText), null, { timeout: 15000 });
  await openDashboard();
  const draftTag = await page.locator("#trips h3", { hasText: "Draft test hike" }).innerText();
  check("Publishing a draft saves (no Draft tag after reload)", !/Draft$/.test(draftTag.trim()) && !draftTag.includes("Draft\n"), draftTag);

  // 7. Archiving a trip that still has upcoming bookings is refused with the reason.
  await page.locator('[data-archive="receipt-test"]').click();
  await page.waitForFunction(() => /upcoming bookings/i.test(document.querySelector("main").innerText), null, { timeout: 15000 }).catch(() => {});
  const archiveMsg = await page.locator("main").innerText();
  check("Archiving a trip with bookings is refused, saying why", /upcoming bookings/i.test(archiveMsg));

  check("No script errors on the way", errors.length === 0, errors);
} catch (e) {
  fail++; console.error("FAIL", e.message.split("\n")[0]);
} finally {
  await browser?.close();
  server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
