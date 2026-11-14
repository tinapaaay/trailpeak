// Issue #97 (TP-061): config.js picks live or staging, remembers the choice, and clears
// TrailPeak's saved browser data when switching so the two never mix.
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) pass++; else { fail++; console.error("FAIL:", name, detail ?? ""); } };

function store(init = {}) {
  const m = new Map(Object.entries(init));
  const s = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
  return new Proxy(s, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (t, k) => (m.has(k) ? { enumerable: true, configurable: true, value: m.get(k) } : undefined) });
}
function load(search, local, session) {
  const added = [];
  const body = { prepend: el => added.push(el) };
  const ctx = vm.createContext({ URLSearchParams, location: { search }, localStorage: local, sessionStorage: session,
    window: {}, document: { body, querySelector: () => null, createElement: () => ({ setAttribute() {}, set innerHTML(v) { this.html = v; } }), addEventListener() {} } });
  vm.runInContext(code, ctx);
  return { win: ctx.window, added };
}

// Default: live.
let local = store({ "trailpeak.user": "{\"id\":\"live-user\"}" }), session = store();
let r = load("", local, session);
check("No choice means the live site", r.win.TRAILPEAK_ENV === "live" && /fjssjgefufwuadrltvjf/.test(r.win.TRAILPEAK_SUPABASE.url));
check("Live pages show no staging bar", r.added.length === 0);
check("Sign-in buttons setting is kept", r.win.TRAILPEAK_SUPABASE.signInWith?.join() === "google,email");

// Switch to staging: remembered, and live data in this browser is cleared.
local = store({ "trailpeak.user": "{\"id\":\"live-user\"}", "trailpeak.bookings": "[]", "trailpeak.cache.v1": "{}", "sb-fjssjgefufwuadrltvjf-auth-token": "keep", "other.app": "keep" });
session = store({ "trailpeak.pending": "{}" });
r = load("?env=staging", local, session);
check("?env=staging switches to staging", r.win.TRAILPEAK_ENV === "staging" && local.getItem("trailpeak.env") === "staging");
check("Switching clears TrailPeak's saved data (account copy, bookings, cache, pending booking)",
  !local.getItem("trailpeak.user") && !local.getItem("trailpeak.bookings") && !local.getItem("trailpeak.cache.v1") && !session.getItem("trailpeak.pending"));
check("Switching leaves other sites' data and Supabase's own sign-in alone",
  local.getItem("other.app") === "keep" && local.getItem("sb-fjssjgefufwuadrltvjf-auth-token") === "keep");
check("Staging never uses the live project", !/fjssjgefufwuadrltvjf/.test(r.win.TRAILPEAK_SUPABASE.url || ""));
check("Staging uses the trailpeak-staging project, email sign-in only",
  /abndhooswfitnrixwdsz\.supabase\.co/.test(r.win.TRAILPEAK_SUPABASE.url) && /^sb_publishable_/.test(r.win.TRAILPEAK_SUPABASE.anonKey) && r.win.TRAILPEAK_SUPABASE.signInWith.join() === "email");
check("Staging bar says test data only", /test data only/.test(r.added[0]?.html || ""));
check("Staging pages show the staging bar", r.added.length === 1 && /Staging/.test(r.added[0].html) && /env=live/.test(r.added[0].html));

// Later pages without ?env stay on staging, and don't clear data again.
local.setItem("trailpeak.user", "{\"id\":\"staging-user\"}");
r = load("", local, session);
check("The choice is remembered on later pages", r.win.TRAILPEAK_ENV === "staging" && local.getItem("trailpeak.user") === "{\"id\":\"staging-user\"}");
r = load("?env=staging", local, session);
check("Asking for the same environment again keeps its data", local.getItem("trailpeak.user") === "{\"id\":\"staging-user\"}");

// Back to live.
r = load("?env=live", local, session);
check("?env=live switches back and clears staging data", r.win.TRAILPEAK_ENV === "live" && !local.getItem("trailpeak.env") && !local.getItem("trailpeak.user"));
r = load("?env=nonsense", local, session);
check("Unknown values are ignored", r.win.TRAILPEAK_ENV === "live");

// Blocked storage (private mode): stay on live, no crash.
const blocked = new Proxy({}, { get() { throw new Error("blocked"); } });
r = load("?env=staging", blocked, blocked);
check("If browser storage is blocked, the site stays on live", r.win.TRAILPEAK_ENV === "live");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
