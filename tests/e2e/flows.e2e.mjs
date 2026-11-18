// The everyday actions on both sides, end to end, against the local fake database.
// Organizer: add a date, add/edit/cancel an outside booking, release overdue slots, rebook an expired hold.
// Joiner: send a DP reference, add joiner details, move a booking, review a past trip, cancel a booking.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = 8100 + Math.floor(Math.random() * 800), base = `http://127.0.0.1:${port}`;
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log("ok  ", name); } else { fail++; console.error("FAIL", name, detail ?? ""); } };
const server = spawn(process.execPath, [path.join(here, "..", "preview.mjs")], { env: { ...process.env, PREVIEW_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error("Fake database didn't start")), 60000);
  server.stdout.on("data", d => { if (String(d).includes("Synthetic preview")) { clearTimeout(t); ok(); } });
});

let browser;
const errors = [];
// One named step: a failure is reported and the next step still runs.
const step = async (name, fn) => { try { await fn(); check(name, true); } catch (e) { check(name, false, e.message.split("\n")[0]); } };
const see = async (page, re) => {
  try { await page.waitForFunction(src => new RegExp(src, "i").test(document.body.innerText), re.source, { timeout: 15000 }); }
  catch { throw new Error(`Expected ${re}; on screen: ${await page.evaluate(() => [...document.querySelectorAll(".error:not([hidden]),[role=alert]")].map(e => e.innerText).filter(Boolean).join(" | ").slice(0, 200))}`); }
};

try {
  browser = await chromium.launch();
  const open = async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
    page.on("pageerror", e => { if (!/waiting for the first data load/.test(e.message)) errors.push(e.message); });
    return page;
  };
  const org = await open(), joiner = await open();
  // Slow signal on the joiner's side too: the organizer's number arrives after they start typing.
  await joiner.route("**/test-api", async r => {
    if ((r.request().postData() || "").includes("my_booking_contacts")) await new Promise(ok => setTimeout(ok, 900));
    await r.continue().catch(() => {});
  });
  // Slow signal: an outside booking's history arrives after the organizer has started typing.
  await org.route("**/test-api", async r => {
    if ((r.request().postData() || "").includes("outside_booking_changes")) await new Promise(ok => setTimeout(ok, 900));
    await r.continue().catch(() => {});
  });
  const dash = async () => { await org.goto(`${base}/dashboard.html`); await org.locator("#trips", { hasText: "Local receipt test hike" }).waitFor({ timeout: 30000 }); };
  const trips = async ref => { await joiner.goto(`${base}/mytrips.html?testRole=joiner`); await joiner.locator(`[data-details="${ref}"], [data-review="${ref}"]`).first().waitFor({ timeout: 30000 }); };

  await dash();
  await step("Organizer adds a new date", async () => {
    await org.locator("#nd-receipt-test").fill("2099-03-01");
    await org.locator("#ns-receipt-test").fill("10");
    await org.locator("#nd-receipt-test").press("Enter");
    await see(org, /added with 10 open slots/);
  });

  await joiner.goto(`${base}/index.html?testRole=joiner`);
  await joiner.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem("trailpeak.cache.v1"))?.trips || []).length > 0; } catch { return false; } }, null, { timeout: 30000 });
  await joiner.waitForTimeout(800);
  await trips("TP-LOCAL");
  await step("Joiner sends a DP reference", async () => {
    await joiner.locator("#ref-TP-LOCAL").fill("1012345678");
    await joiner.waitForTimeout(1200);
    if (await joiner.locator("#ref-TP-LOCAL").inputValue() !== "1012345678") throw new Error("the redraw wiped what was typed");
    await joiner.locator('[data-ref-form="TP-LOCAL"] button[type="submit"]').click();
    await see(joiner, /DP reference saved/);
  });
  await step("Joiner adds the missing joiner and emergency contact", async () => {
    await trips("TP-LOCAL");
    await joiner.locator('[data-details="TP-LOCAL"]').click();
    await joiner.locator("#dTPLOCAL-n2").fill("Ana Cruz");
    await joiner.locator("#dTPLOCAL-en").fill("Rosa Cruz");
    await joiner.locator("#dTPLOCAL-er").fill("Mother");
    await joiner.locator("#dTPLOCAL-em").fill("9171234567");
    await joiner.locator('[data-details-form="TP-LOCAL"] button[type="submit"]').click();
    await see(joiner, /Joiner details saved/);
  });
  await step("Joiner moves the booking to the new date", async () => {
    await trips("TP-LOCAL");
    await joiner.locator('[data-move="TP-LOCAL"]').click();
    await joiner.locator("#mv-TP-LOCAL").selectOption("2099-03-01");
    await joiner.locator('[data-move-form="TP-LOCAL"] button[type="submit"]').click();
    await see(joiner, /Booking moved to/);
  });
  await step("Joiner reviews a past trip", async () => {
    await trips("TP-OLD");
    await joiner.locator('[data-review="TP-OLD"]').click();
    await joiner.locator('label[for="rate-TP-OLD-5"]').click();
    await joiner.locator("#rv-TP-OLD").fill("Great hike, well organized.");
    await joiner.locator('[data-review-form="TP-OLD"] button[type="submit"]').click();
    await see(joiner, /Review posted/);
  });
  await step("Joiner cancels a booking", async () => {
    await trips("TP-LOCAL");
    await joiner.locator('[data-cancel="TP-LOCAL"]').click();
    await joiner.locator('[data-cancel-yes="TP-LOCAL"]').click();
    await see(joiner, /Booking cancelled/);
  });

  await dash();
  await step("Organizer adds an outside booking", async () => {
    await org.locator("#add-out").click();
    await org.locator("#out-name").fill("Maria Santos");
    await org.locator("#out-size").fill("1");
    await org.locator("#out-save").click();
    await see(org, /Added Maria Santos, 1 joiner/);
  });
  await step("Organizer edits an outside booking", async () => {
    await org.locator("tbody tr", { hasText: "Tset Booker" }).locator("[data-out-edit]").click();
    await org.locator("#oe-name").fill("Test Booker");
    await org.locator("#oe-reason").fill("Fixed the spelling");
    await org.waitForTimeout(1200);   // the history has arrived and redrawn the form by now
    if (await org.locator("#oe-name").inputValue() !== "Test Booker") throw new Error("the redraw wiped what was typed");
    await org.locator("#out-edit-form button[type='submit']").click();
    await see(org, /Updated Test Booker's booking/);
  });
  await step("Organizer cancels an outside booking", async () => {
    await org.locator("tbody tr", { hasText: "Maria Santos" }).locator("[data-out-cancel]").click();
    await org.locator("#oc-reason").fill("Changed plans");
    await org.waitForTimeout(1200);
    if (await org.locator("#oc-reason").inputValue() !== "Changed plans") throw new Error("the redraw wiped what was typed");
    await org.locator("#out-panel button[type='submit']").click();
    await see(org, /Cancelled Maria Santos's booking/);
  });
  await step("Organizer releases an unnamed slot on an overdue booking", async () => {
    await org.locator("tbody tr", { hasText: "Ben Cruz" }).locator("[data-release]").click();
    await org.locator('input[name="rl-what"][value="partial"]').check();
    await org.locator("#rl-reason").fill("No reply since Monday");
    await org.locator("#release-form button[type='submit']").click();
    await see(org, /released/);
  });
  await step("Organizer rebooks an expired hold", async () => {
    await org.locator("[data-rebook]").first().click();
    await see(org, /rebook|back on the list|held again/);
  });
  await dash();
  await step("Those changes are still there after a reload", async () => {
    const t = await org.locator("main").innerText();
    if (!t.includes("Test Booker") || t.includes("Tset Booker")) throw new Error("outside booking edit was not saved");
    if (!/Cancelled outside bookings[\s\S]*Maria Santos/.test(t)) throw new Error("cancelled outside booking is not listed");
  });
  check("No script errors on either side", errors.length === 0, errors.slice(0, 3));
} finally { await browser?.close(); server.kill(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
