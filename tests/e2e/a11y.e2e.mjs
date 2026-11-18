// Accessibility and phone-layout scan of every page, using the fake database (tests/preview.mjs).
// axe-core checks WCAG 2.1 A and AA rules (labels, contrast, names, structure) at desktop and phone
// width; the phone pass also fails on sideways scrolling and tap targets under 24px.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const port = 8100 + Math.floor(Math.random() * 800), base = `http://127.0.0.1:${port}`;
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.log("ok  ", name); } else { fail++; console.error("FAIL", name); if (detail) console.error(detail); } };

const server = spawn(process.execPath, [path.join(here, "..", "preview.mjs")], { env: { ...process.env, PREVIEW_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error("Fake database didn't start")), 60000);
  server.stdout.on("data", d => { if (String(d).includes("Synthetic preview")) { clearTimeout(t); ok(); } });
});

const J = "?testRole=joiner";
const pages = [
  ["Search", `index.html${J}`, "joiner"], ["Trip", `trip.html${J}#receipt-test`, "joiner"], ["Organizer profile", `org.html${J}#local-trail-test`, "joiner"],
  ["Reserve", `reserve.html${J}`, "joiner"], ["My trips", `mytrips.html${J}`, "joiner"], ["Profile", `profile.html${J}`, "joiner"],
  ["FAQ", `faq.html${J}`, "joiner"], ["Privacy", `privacy.html${J}`, "joiner"], ["Terms", `terms.html${J}`, "joiner"],
  ["Dashboard", "dashboard.html", "organizer"], ["Post a trip", "organize.html", "organizer"], ["Edit a trip", "organize.html?edit=receipt-test", "organizer"],
  ["Sign in", "signin.html", "guest"],
];

let browser;
try {
  browser = await chromium.launch();
  for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 375, height: 812 }]]) {
    for (const role of ["joiner", "organizer", "guest"]) {
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      if (role === "guest") await page.route("**/config.js", async r => {
        const res = await r.fetch();
        await r.fulfill({ response: res, body: (await res.text()).replace("session:{user:{id:testId,email:'synthetic@example.test'}}", "session:null").replace(/if\(JSON\.parse\(localStorage\.getItem\('trailpeak\.user'\).*?\n/, "\n") });
      });
      await page.goto(`${base}/index.html${role === "joiner" ? J : ""}`);
      await page.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem("trailpeak.cache.v1"))?.trips || []).length > 0; } catch { return false; } }, null, { timeout: 30000 });
      await page.waitForTimeout(800);
      for (const [name, url, who] of pages.filter(p => p[2] === role)) {
        const title = `${name} (${label})`;
        try {
          if (name === "Reserve") await page.evaluate(() => sessionStorage.setItem("trailpeak.pending", JSON.stringify({ tripId: "receipt-test", date: "2099-01-01", size: 2, pickup: 0 })));
          await page.goto(`${base}/${url}`);
          await page.waitForTimeout(1200);
          await page.addScriptTag({ path: axePath });
          const res = await page.evaluate(async () => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"], resultTypes: ["violations"] }));
          const v = res.violations.map(x => `   ${x.id} (${x.impact}, ${x.nodes.length}): ${x.help}\n${x.nodes.slice(0, 3).map(n => `      ${n.target.join(" ")} :: ${(n.any[0]?.message || n.failureSummary || "").split("\n")[0].slice(0, 130)}`).join("\n")}`);
          check(`${title}: no accessibility violations`, !v.length, v.join("\n"));
          if (label === "phone") {
            const o = await page.evaluate(() => {
              const w = document.documentElement.clientWidth;
              const wide = [...document.querySelectorAll("body *")].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > w + 1 && !e.closest("[class*=scroll],.table-wrap,table") && getComputedStyle(e).position !== "fixed" && !e.closest(".sr,.skip"); }).slice(0, 4).map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : e.className && e.className.baseVal === undefined ? "." + String(e.className).split(" ")[0] : ""));
              const small = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary")].filter(e => { const own = e.getBoundingClientRect(), lab = e.labels?.[0]?.getBoundingClientRect(), s = getComputedStyle(e), w = Math.max(own.width, lab?.width || 0), h = Math.max(own.height, lab?.height || 0); return w && h && (h < 24 || w < 24) && s.display !== "inline" && !e.closest(".sr,.skip"); }).slice(0, 4).map(e => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
              return { scroll: document.documentElement.scrollWidth > w + 1, wide, small };
            });
            check(`${title}: no sideways scrolling`, !o.scroll, `   wider than the screen: ${o.wide.join(", ")}`);
            check(`${title}: tap targets at least 24px`, !o.small.length, `   ${o.small.join(", ")}`);
          }
        } catch (e) { check(`${title}: page could be scanned`, false, e.message.split("\n")[0]); }
      }
      await ctx.close();
    }
  }
} finally { await browser?.close(); server.kill(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
