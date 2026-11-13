// Issue #91 regression tests:
// 1. Live add/remove joiners on reserve.html preserves typed details, updates DP/fee/summary, moves focus, announces changes
// 2. Per-joiner "I'll add their details later" works individually outside the 3-day Manila cut-off and is blocked inside it
// 3. Guardian rule (TP-015) survives add/remove, deferral blocks/remapping, and passes schema.sql check_guardians
// 4. Capacity re-check blocks adding/submitting past slotsLeft without calling TP.book

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../", import.meta.url);
const authCode = fs.readFileSync(new URL("auth.js", root), "utf8");
const reserveHtml = fs.readFileSync(new URL("reserve.html", root), "utf8");
const schemaSql = fs.readFileSync(new URL("supabase/schema.sql", root), "utf8");

function makeFieldDom() {
  let nodes = new Map();
  let lastHtml = "";

  function parseHtml(html) {
    lastHtml = html;
    const prevVals = new Map();
    for (const [id, el] of nodes.entries()) {
      prevVals.set(id, { value: el.value, checked: el.checked });
    }
    const next = new Map();
    const ensure = (id, tag = "div") => {
      if (!next.has(id)) {
        next.set(id, {
          id,
          tag,
          value: "",
          checked: false,
          hidden: false,
          options: [],
          dataset: {},
          attrs: {},
          textContent: "",
          focused: false,
          focus() { this.focused = true; },
          setAttribute(k, v) { this.attrs[k] = String(v); if (k === "hidden") this.hidden = true; },
          removeAttribute(k) { delete this.attrs[k]; if (k === "hidden") this.hidden = false; },
          querySelectorAll() { return []; },
          closest() { return null; },
        });
      }
      return next.get(id);
    };

    for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
      const a = m[1];
      const id = /id="([^"]+)"/.exec(a)?.[1];
      if (!id) continue;
      const el = ensure(id, "input");
      el.type = /type="([^"]+)"/.exec(a)?.[1] || "text";
      el.value = /value="([^"]*)"/.exec(a)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") || "";
      el.checked = /\bchecked\b/.test(a);
      if (/data-overdue="1"/.test(a)) el.dataset.overdue = "1";
    }
    for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const a = m[1], body = m[2];
      const id = /id="([^"]+)"/.exec(a)?.[1];
      if (!id) continue;
      const el = ensure(id, "select");
      let selected = "";
      for (const om of body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)) {
        const oa = om[1], val = /value="([^"]*)"/.exec(oa)?.[1] ?? "";
        const opt = { value: val, textContent: om[2] };
        el.options.push(opt);
        if (/\bselected\b/.test(oa)) selected = val;
      }
      el.value = selected || (el.options[0]?.value ?? "");
    }
    for (const m of html.matchAll(/<(div|p|button)\b([^>]*)>/g)) {
      const tag = m[1], a = m[2];
      const id = /id="([^"]+)"/.exec(a)?.[1];
      if (!id) continue;
      const el = ensure(id, tag);
      if (/\bhidden\b/.test(a)) el.hidden = true;
    }
    nodes = next;
    return prevVals;
  }

  return {
    parseHtml,
    get: id => nodes.get(id) || null,
    all: () => nodes,
    html: () => lastHtml,
    queryAll: prefix => Array.from(nodes.values()).filter(el => el.id.startsWith(prefix)),
  };
}

function createAuthCtx() {
  const dom = makeFieldDom();
  const docListeners = new Map();
  const ctx = vm.createContext({
    URL,
    console,
    Date,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      addEventListener(type, fn) {
        if (!docListeners.has(type)) docListeners.set(type, []);
        docListeners.get(type).push(fn);
      },
      dispatchEvent(type, target) {
        for (const fn of docListeners.get(type) || []) fn({ target });
      },
      getElementById: id => dom.get(id),
      querySelectorAll: sel => {
        const m = /^\[id\^="([^"]+)"\]$/.exec(sel);
        return m ? dom.queryAll(m[1]) : [];
      },
      createElement: () => ({ remove() {} }),
    },
  });
  vm.runInContext(authCode, ctx);
  ctx.__dom = dom;
  return ctx;
}

const dayOffsetIso = n => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const farDate = dayOffsetIso(10);
const nearDate = dayOffsetIso(2);

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", name, detail ?? ""); }
};

// 1. Per-joiner deferral & cut-off checks in auth.js
{
  const ctx = createAuthCtx();
  const htmlFar = ctx.joinerFieldsHtml("rv", 3, [], null, { you: "Ana Reyes", allowLater: true, date: farDate, editableCount: true, maxJoiners: 5 });
  ctx.__dom.parseHtml(htmlFar);
  check("Outside cut-off renders per-joiner deferral checkboxes (#rv-later2, #rv-later3) and no single #rv-later",
    !!ctx.__dom.get("rv-later2") && !!ctx.__dom.get("rv-later3") && !ctx.__dom.get("rv-later"), htmlFar);
  check("Editable count renders + Add joiner and per-card Remove buttons with accessible labels",
    htmlFar.includes('id="rv-add"') && htmlFar.includes('aria-label="Remove joiner 2"') && htmlFar.includes('aria-label="Remove joiner 3"'));

  // Defer joiner 2 via change event -> fields2 hidden; joiner 3 still required
  ctx.__dom.get("rv-later2").checked = true;
  ctx.document.dispatchEvent("change", ctx.__dom.get("rv-later2"));
  check("Checking #rv-later2 hides #rv-fields2", ctx.__dom.get("rv-fields2").hidden === true);

  ctx.__dom.get("rv-en").value = "Mom";
  ctx.__dom.get("rv-em").value = "9171234567";
  let res = ctx.readJoinerFields("rv", 3);
  check("Deferring joiner 2 still validates joiner 3's missing name", res.field === ctx.__dom.get("rv-n3") && /joiner 3's full name/.test(res.error), res);

  // Fill joiner 3 -> valid, returns only joiner 3 in companions
  ctx.__dom.get("rv-n3").value = "Sam Cruz";
  res = ctx.readJoinerFields("rv", 3);
  check("Submitting with joiner 2 deferred and joiner 3 filled succeeds cleanly", !res.error && res.companions.length === 1 && res.companions[0].name === "Sam Cruz", res);

  // Inside cut-off (allowLater: false)
  const htmlNear = ctx.joinerFieldsHtml("rv", 2, [], null, { you: "Ana Reyes", allowLater: false, date: nearDate, editableCount: true });
  ctx.__dom.parseHtml(htmlNear);
  check("Inside 3-day cut-off omits deferral checkboxes and shows cut-off notice",
    !ctx.__dom.get("rv-later2") && htmlNear.includes("3 days away or less"));
  ctx.__dom.get("rv-en").value = "Mom";
  ctx.__dom.get("rv-em").value = "9171234567";
  res = ctx.readJoinerFields("rv", 2);
  check("Inside cut-off rejects blank joiner 2 name", /too soon to add names later/.test(res.error), res);

  // My trips overdue editing still allows per-joiner deferral
  const htmlOverdue = ctx.joinerFieldsHtml("d1", 3, [{ name: "Sam", age: "adult" }], null, { you: "Ana", date: nearDate, overdue: true });
  ctx.__dom.parseHtml(htmlOverdue);
  check("My trips overdue mode still renders per-joiner deferral checkboxes and hides add/remove buttons",
    !!ctx.__dom.get("d1-later2") && !ctx.__dom.get("d1-add") && htmlOverdue.includes("as soon as I can"));
}

// 1b. Guardian dropdowns relabel live as names, ages and "later" boxes change
{
  const ctx = createAuthCtx();
  ctx.__dom.parseHtml(ctx.joinerFieldsHtml("rv", 3, [], null, { you: "Ana", allowLater: true, date: farDate, editableCount: true }));
  const label = k => ctx.__dom.get("rv-g2").options.find(o => o.value === String(k)).textContent;
  ctx.__dom.get("rv-n3").value = "Tita Rosa";
  ctx.document.dispatchEvent("input", ctx.__dom.get("rv-n3"));
  check("Typing joiner 3's name relabels joiner 2's guardian option", label(3) === "Joiner 3 (Tita Rosa)", label(3));
  ctx.__dom.get("rv-later3").checked = true;
  ctx.document.dispatchEvent("change", ctx.__dom.get("rv-later3"));
  check("Ticking later on joiner 3 relabels it as adding later", label(3) === "Joiner 3 (adding later)", label(3));
}

// 2. Snapshot, removal, guardian rule, and packed index remapping + PGlite check_guardians verification
{
  const ctx = createAuthCtx();
  // Size 4: Booker (adult), J2 deferred, J3 minor choosing J4, J4 adult
  const html = ctx.joinerFieldsHtml("rv", 4, [], null, { you: "Ana Reyes", allowLater: true, date: farDate, editableCount: true });
  ctx.__dom.parseHtml(html);
  ctx.__dom.get("rv-later2").checked = true;
  ctx.__dom.get("rv-n3").value = "Kid Leo";
  ctx.__dom.get("rv-a3").value = "minor";
  ctx.__dom.get("rv-g3").value = "4";
  ctx.__dom.get("rv-r3").value = "parent";
  ctx.__dom.get("rv-n4").value = "Tita Rosa";
  ctx.__dom.get("rv-a4").value = "adult";
  ctx.__dom.get("rv-m4").value = "917 888"; // partial phone kept across snapshot!
  ctx.__dom.get("rv-en").value = "Uncle Ben";
  ctx.__dom.get("rv-em").value = "9171234567";

  const snap = ctx.snapshotJoinerFields("rv", 4);
  check("Snapshot captures raw partial mobile, deferral flags, guardian, and emergency contact",
    snap.companions[0].later === true && snap.companions[2].rawPhone === "917 888" && snap.emergency.name === "Uncle Ben", snap);

  // Re-render from snapshot after adding joiner 5 -> preserves everything
  const html5 = ctx.joinerFieldsHtml("rv", 5, snap.companions, snap.emergency, { you: "Ana Reyes", allowLater: true, date: farDate, booker: snap.booker, editableCount: true });
  ctx.__dom.parseHtml(html5);
  check("Re-render keeps deferred joiner 2 checked, fields2 hidden, rawPhone on joiner 4, and guardian selection",
    ctx.__dom.get("rv-later2").checked === true && ctx.__dom.get("rv-fields2").hidden === true && ctx.__dom.get("rv-m4").value === "917 888" && ctx.__dom.get("rv-g3").value === "4");

  // Removing joiner 2 shifts Kid Leo's guardian from 4 -> 3 cleanly
  const afterRm2 = ctx.removeJoinerFromSnapshot(snap, 2);
  check("Removing non-guardian joiner 2 shifts joiner 3's guardian index from 4 down to 3",
    afterRm2.companions.length === 2 && afterRm2.companions[0].guardian === 3, afterRm2);

  // Removing joiner 4 (Kid Leo's guardian) resets Kid Leo's guardian to null
  const afterRm4 = ctx.removeJoinerFromSnapshot(snap, 4);
  check("Removing chosen guardian joiner 4 clears Kid Leo's guardian so validation catches it",
    afterRm4.companions[1].guardian === null, afterRm4);

  // Back to snap with J2 deferred & J3 (minor) -> J4 (adult): check deferred guardian rejection
  ctx.__dom.parseHtml(html);
  ctx.__dom.get("rv-later2").checked = true;
  ctx.__dom.get("rv-n3").value = "Kid Leo";
  ctx.__dom.get("rv-a3").value = "minor";
  ctx.__dom.get("rv-g3").value = "2"; // deferred!
  ctx.__dom.get("rv-r3").value = "parent";
  ctx.__dom.get("rv-n4").value = "Tita Rosa";
  ctx.__dom.get("rv-en").value = "Uncle Ben";
  ctx.__dom.get("rv-em").value = "9171234567";
  let errRes = ctx.readJoinerFields("rv", 4);
  check("Choosing a deferred joiner as guardian is rejected clearly",
    errRes.field === ctx.__dom.get("rv-g3") && /add later.*guardian/i.test(errRes.error), errRes);

  // Valid mixed deferral + guardian: J2 deferred, J3 minor -> J4 adult
  ctx.__dom.get("rv-g3").value = "4";
  const packed = ctx.readJoinerFields("rv", 4);
  check("Mixed deferral remaps minor guardian UI index 4 -> packed index 3 for schema.sql & dashboard.html",
    !packed.error && packed.companions.length === 2 && packed.companions[0].guardian === 3, packed);

  // Verify packed payload passes schema.sql book_trip() in PGlite
  const db = new PGlite();
  const D = "d0000000-0000-0000-0000-00000000000d", J = "a0000000-0000-0000-0000-00000000000a";
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(schemaSql);
  for (const u of [D, J]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
  await db.query(`select approve_organizer('${D}', p_approver => 'Test', p_checklist => '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}')`);
  await db.query(`update profiles set name='Ana Reyes' where id='${J}'`);
  await db.exec(`select set_config('request.jwt.claim.sub','${D}',false); set role authenticated;
    insert into public.trips (id, organizer_id, org_name, details) values ('t-91','${D}','Org','{"title":"T91","fee":1500,"dp":500}');
    insert into public.departures (trip_id, date, capacity) values ('t-91','${farDate}',10);
    reset role;`);
  await db.exec(`select set_config('request.jwt.claim.sub','${J}',false); set role authenticated;`);
  const sqlRes = await db.query(
    `select ref, companions from public.book_trip('t-91','${farDate}',4,'Cubao','2 AM','GCash','','',false,$1::jsonb,$2::jsonb,$3::jsonb)`,
    [JSON.stringify(packed.companions), JSON.stringify(packed.emergency), JSON.stringify(packed.booker)]
  );
  await db.exec("reset role");
  check("PGlite book_trip accepts remapped companions from mixed deferral + minor guardian",
    sqlRes.rows[0].companions[0].guardian === 3, sqlRes.rows[0]);
}

// 3. reserve.html live add/remove, totals, focus, live announcements, and capacity checks
{
  const reserveScript = Array.from(reserveHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)).at(-1)[1];
  const dynDom = makeFieldDom();
  const makeStaticEl = (id) => ({
    id, hidden: false, disabled: false, textContent: "", value: "", checked: false,
    _html: "", focused: false, attrs: {}, listeners: {},
    set innerHTML(v) { this._html = v; if (id === "jd-box") dynDom.parseHtml(v); },
    get innerHTML() { return this._html; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    focus() { this.focused = true; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    closest() { return { setAttribute() {} }; },
    querySelector(sel) {
      if (sel === "span") return (this._span ||= { textContent: "" });
      return null;
    },
  });
  const staticEls = new Map([
    ["reserve", makeStaticEl("reserve")],
    ["missing", makeStaticEl("missing")],
    ["sum-img", makeStaticEl("sum-img")],
    ["sum-h", makeStaticEl("sum-h")],
    ["sum-place", makeStaticEl("sum-place")],
    ["sum-lines", makeStaticEl("sum-lines")],
    ["pay-lead", makeStaticEl("pay-lead")],
    ["pay-btn", makeStaticEl("pay-btn")],
    ["agree-text", makeStaticEl("agree-text")],
    ["agree", makeStaticEl("agree")],
    ["wnum", makeStaticEl("wnum")],
    ["wallet-l", makeStaticEl("wallet-l")],
    ["pay-note", makeStaticEl("pay-note")],
    ["listname", makeStaticEl("listname")],
    ["listme", makeStaticEl("listme")],
    ["jd-box", makeStaticEl("jd-box")],
    ["pay", makeStaticEl("pay")],
    ["err", makeStaticEl("err")],
    ["paying", makeStaticEl("paying")],
    ["live", makeStaticEl("live")],
    ["done", makeStaticEl("done")],
    ["done-trip", makeStaticEl("done-trip")],
    ["done-h", makeStaticEl("done-h")],
    ["ref", makeStaticEl("ref")],
    ["next", makeStaticEl("next")],
  ]);
  staticEls.get("missing").hidden = true;
  staticEls.get("err").hidden = true;
  staticEls.get("paying").hidden = true;
  staticEls.get("done").hidden = true;

  let currentPending = { tripId: "t1", date: farDate, size: 2, pickup: 0, requestId: "req-initial" };
  let currentLeft = 3;
  const bookCalls = [];
  const docListeners = new Map();

  const ctx = vm.createContext({
    URL, console, Date, Math, Number, String, Boolean, Array, Object, Set, JSON,
    crypto: { randomUUID: () => "req-uuid-1" },
    location: { replace() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      title: "",
      addEventListener(type, fn) { (docListeners.get(type) || docListeners.set(type, []).get(type)).push(fn); },
      getElementById: id => staticEls.get(id) || dynDom.get(id),
      querySelector: sel => sel === 'input[name="wallet"]:checked' ? { value: "GCash" } : null,
      querySelectorAll: sel => sel.startsWith('[id^="') ? dynDom.queryAll(sel.slice(6, -2)) : [],
    },
    img: p => p,
    peso: n => `₱${Number(n).toLocaleString("en-US")}`,
    getUser: () => ({ id: "u1", name: "Ana Reyes", phone: "+63 917 000 1111" }),
    getPending: () => currentPending,
    setPending: v => { currentPending = v; },
    tripById: () => ({ id: "t1", title: "Mt. Ulap", place: "Benguet", org: "North Trails", photo: "p.jpg", fee: 1500, dp: 500, pickups: [{ place: "Cubao", time: "10 PM" }], departures: { [farDate]: 10 }, dateStatus: {} }),
    isPastDate: () => false,
    todayIso: () => dayOffsetIso(0),
    slotsLeft: () => currentLeft,
    rememberNext() {},
    getBookings: () => [],
    saveBookings() {},
    holdTime: s => s,
    TP: {
      online: true,
      holdSettings: () => Promise.resolve({ dp_hold_hours: 6, dp_hold_soon_days: 3, dp_hold_hours_soon: 2 }),
      book: args => { bookCalls.push(args); return Promise.resolve({ ref: "TP-NEW", dp: args.size * 500, balance: args.size * 1000, companions: args.companions, size: args.size, date: args.date, pickup: args.pickup, pickupTime: args.pickupTime }); },
      track() {},
    },
  });
  vm.runInContext(authCode, ctx);
  ctx.getUser = () => ({ id: "u1", name: "Ana Reyes", phone: "+63 917 000 1111" });
  ctx.getPending = () => currentPending;
  ctx.setPending = v => { currentPending = v; };
  ctx.slotsLeft = () => currentLeft;
  vm.runInContext(reserveScript, ctx);
  await Promise.resolve(); // flush holdSettings()

  check("Initial reserve summary shows 2 joiners and ₱1,000 DP",
    staticEls.get("sum-lines").innerHTML.includes("<dt>Joiners</dt><dd>2</dd>") &&
    staticEls.get("sum-lines").innerHTML.includes("₱1,000") &&
    staticEls.get("pay-lead").textContent.includes("2 joiners") &&
    staticEls.get("pay-lead").textContent.includes("6 hours"));

  // Fill Joiner 2 & emergency contact before adding Joiner 3
  dynDom.get("rv-n2").value = "Ben Santos";
  dynDom.get("rv-m2").value = "9175554444";
  dynDom.get("rv-en").value = "Mom";
  dynDom.get("rv-er").value = "Mother";
  dynDom.get("rv-em").value = "9171234567";

  // Click + Add joiner -> size 3 (equals currentLeft = 3)
  staticEls.get("jd-box").listeners.click[0]({ target: { closest: sel => sel === "#rv-add" ? {} : null } });
  check("Adding joiner increments size to 3, clears stale requestId, recalculates ₱1,500 DP, preserves details, focuses #rv-n3, updates #live",
    currentPending.size === 3 &&
    currentPending.requestId === undefined &&
    staticEls.get("sum-lines").innerHTML.includes("<dt>Joiners</dt><dd>3</dd>") &&
    staticEls.get("sum-lines").innerHTML.includes("₱1,500") &&
    dynDom.get("rv-n2").value === "Ben Santos" &&
    dynDom.get("rv-m2").value === "9175554444" &&
    dynDom.get("rv-en").value === "Mom" &&
    dynDom.get("rv-n3").focused === true &&
    staticEls.get("live").textContent.includes("Joiner 3 added") &&
    bookCalls.length === 0);

  // Clicking + Add joiner again when size === slotsLeft (3) shows inline count error
  staticEls.get("jd-box").listeners.click[0]({ target: { closest: sel => sel === "#rv-add" ? {} : null } });
  check("Cannot add joiner past slotsLeft; shows #rv-count-err",
    currentPending.size === 3 && dynDom.get("rv-count-err").hidden === false && /Only 3 slots/.test(dynDom.get("rv-count-err").textContent));

  // Defer Joiner 3, then test live capacity drop before submit
  dynDom.get("rv-later3").checked = true;
  staticEls.get("agree").checked = true;
  currentLeft = 2; // someone else took a slot!
  staticEls.get("pay").listeners.submit[0]({ preventDefault() {} });
  check("Submit re-checks slotsLeft and blocks with inline error when group no longer fits",
    bookCalls.length === 0 && staticEls.get("err").hidden === false && /Only 2 slots/.test(staticEls.get("err").querySelector("span").textContent) && staticEls.get("err").focused === true);

  // Remove Joiner 3 -> fits in 2 slots again, recalculates back to ₱1,000, updates #live
  staticEls.get("jd-box").listeners.click[0]({ target: { closest: sel => sel === "[data-remove-joiner]" ? { dataset: { removeJoiner: "3" } } : null } });
  check("Removing joiner updates size back to 2, recalculates ₱1,000 DP, clears #err, updates #live",
    currentPending.size === 2 && staticEls.get("sum-lines").innerHTML.includes("₱1,000") && staticEls.get("err").hidden === true && staticEls.get("live").textContent.includes("Joiner 3 removed"));

  // Submit valid 2-joiner booking
  staticEls.get("pay").listeners.submit[0]({ preventDefault() {} });
  await Promise.resolve();
  check("Valid submit after edits calls TP.book once with live size and private optional companion mobile",
    bookCalls.length === 1 && bookCalls[0].size === 2 && bookCalls[0].companions[0].name === "Ben Santos" && bookCalls[0].companions[0].phone === "+63 917 555 4444");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
