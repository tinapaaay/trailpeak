// Security test: text typed by organizers and joiners must never run as code in someone else's
// browser (XSS). The fake database (tests/preview.mjs, PREVIEW_HOSTILE=1) fills every typed field
// with an attack string; each page is opened as a real browser would, with its panels open.
// A page fails if the attack ran, or if it turned into a real element on the page.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = 8100 + Math.floor(Math.random() * 800), base = `http://127.0.0.1:${port}`;
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log("ok  ", name); } else { fail++; console.error("FAIL", name, detail ?? ""); } };

const server = spawn(process.execPath, [path.join(here, "..", "preview.mjs")], { env: { ...process.env, PREVIEW_PORT: String(port), PREVIEW_HOSTILE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stderr.on("data", d => { log += d; });
await new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error("Fake database didn't start:\n" + log)), 60000);
  server.stdout.on("data", d => { if (String(d).includes("Synthetic preview")) { clearTimeout(t); ok(); } });
  server.on("exit", c => { clearTimeout(t); no(new Error(`Fake database exited (${c}):\n${log}`)); });
});

const clickAll = (page, selector) => page.evaluate(sel => { document.querySelectorAll(sel).forEach(el => { try { el.click(); } catch { /* keep going */ } }); }, selector);
const inspect = page => page.evaluate(() => ({
  ran: !!window.__xss,
  planted: [...document.querySelectorAll("[data-xss]")].map(e => (e.parentElement?.id || e.parentElement?.className || e.parentElement?.tagName || "").toString().slice(0, 40)),
}));

let browser;
try {
  browser = await chromium.launch();
  const open = async role => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on("dialog", d => d.dismiss());
    const q = role === "joiner" ? "?testRole=joiner" : "";
    await page.goto(`${base}/index.html${q}`);
    await page.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem("trailpeak.cache.v1"))?.trips || []).length > 0; } catch { return false; } }, null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    return { page, q };
  };
  const visit = async (s, name, url, act, mustShow = true) => {
    try {
      await s.page.goto(`${base}/${url}`);
      await s.page.waitForTimeout(1500);
      if (act) { await act(s.page); await s.page.waitForTimeout(500); }
      const r = await inspect(s.page);
      check(`${name}: typed text stays text`, !r.ran && !r.planted.length, JSON.stringify(r));
      if (mustShow) check(`${name}: page really drew the attack text (as plain text)`, (await s.page.locator("body").innerText()).includes("<img src=x"));
    } catch (e) { check(`${name}: page could be checked`, false, e.message.split("\n")[0]); }
  };

  const joiner = await open("joiner");
  await visit(joiner, "Search page", "index.html?testRole=joiner");
  await visit(joiner, "Trip page", "trip.html?testRole=joiner#receipt-test", p => clickAll(p, "button.day.open"));
  await visit(joiner, "My trips", "mytrips.html?testRole=joiner", p => clickAll(p, "[data-details]"));
  await visit(joiner, "My trips (cancel and move panels)", "mytrips.html?testRole=joiner", async p => { await clickAll(p, "[data-move]"); await clickAll(p, "[data-cancel]"); });
  await joiner.page.evaluate(() => sessionStorage.setItem("trailpeak.pending", JSON.stringify({ tripId: "receipt-test", date: "2099-01-01", size: 2, pickup: 0 })));
  await visit(joiner, "Reserve page", "reserve.html?testRole=joiner");
  await visit(joiner, "Profile page", "profile.html?testRole=joiner", null, false);

  const org = await open("organizer");
  const slug = `x'"><img src=x data-xss=1 onerror=window.__xss=1>`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await visit(org, "Organizer profile", `org.html#${slug}`);
  await visit(org, "Dashboard", "dashboard.html");
  await visit(org, "Dashboard (DP panel)", "dashboard.html", p => p.locator("[data-receipt]").first().click());
  await visit(org, "Dashboard (edit outside booking)", "dashboard.html", p => p.locator("[data-out-edit]").first().click());
  await visit(org, "Dashboard (release slots)", "dashboard.html", p => p.locator("[data-release]").first().click());
  await visit(org, "Post a trip (editing)", "organize.html?edit=receipt-test", null, false);
} catch (e) {
  fail++; console.error("FAIL", e.message.split("\n")[0]);
} finally {
  await browser?.close();
  server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
