// Issue #93 (TP-058, part 1): joiner profile with age and emergency contact.
// 1. Database: schema re-runs and upgrades, owner-only access, validation, status fields still locked.
// 2. Reserve form: the profile fills in the booker's age and the emergency contact.
import fs from "node:fs";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../", import.meta.url);
const schemaSql = fs.readFileSync(new URL("supabase/schema.sql", root), "utf8");
const authCode = fs.readFileSync(new URL("auth.js", root), "utf8");

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) pass++; else { fail++; console.error("FAIL:", name, detail ?? ""); } };
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// ---- 1. Database -------------------------------------------------------------------------
const db = new PGlite();
const A = "a0000000-0000-0000-0000-00000000000a", B = "b0000000-0000-0000-0000-00000000000b";
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
await db.exec(schemaSql);
await db.exec(schemaSql);
check("schema.sql runs twice cleanly", true);

// Upgrade path: a database from before #93 has neither column; re-running adds them.
await db.exec(`drop trigger if exists tidy_profile_details on public.profiles;
  alter table public.profiles drop column age_group, drop column emergency;`);
await db.exec(schemaSql);
const cols = (await db.query(`select column_name from information_schema.columns
  where table_schema='public' and table_name='profiles' and column_name in ('age_group','emergency')`)).rows.map(r => r.column_name).sort();
check("Re-running schema.sql on an older database adds age_group and emergency", cols.join() === "age_group,emergency", cols);

for (const u of [A, B]) await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"name":"Test"}')`, [u]);
const as = async (who, sql, params) => {
  await db.exec(who ? `select set_config('request.jwt.claim.sub','${who}',false); set role authenticated;` : `select set_config('request.jwt.claim.sub','',false); set role anon;`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
};

await as(A, `update public.profiles set age_group='adult', emergency=$1::jsonb where id=$2`,
  [JSON.stringify({ name: "  Rosa Reyes ", relation: "Mother", phone: "0918-765-4321", extra: "dropped" }), A]);
const mine = (await as(A, `select age_group, emergency from public.profiles where id=$1`, [A])).rows[0];
check("Owner saves age and emergency contact", mine?.age_group === "adult" && mine?.emergency?.name === "Rosa Reyes", mine);
check("Emergency phone is tidied to +63 918 765 4321 and extra keys dropped",
  mine?.emergency?.phone === "+63 918 765 4321" && !("extra" in (mine?.emergency || {})), mine?.emergency);

const seen = await as(B, `select age_group, emergency from public.profiles where id=$1`, [A]);
check("Another signed-in user can't read someone's profile", seen.rows.length === 0, seen.rows);
const upd = await as(B, `update public.profiles set emergency=null, age_group='minor' where id=$1`, [A]);
const after = (await db.query(`select age_group, emergency from public.profiles where id=$1`, [A])).rows[0];
check("Another signed-in user can't change someone's profile", (upd.affectedRows ?? 0) === 0 && after.age_group === "adult" && after.emergency, after);
const anonErr = await rejects(() => as(null, `select emergency from public.profiles`));
check("Signed-out visitors can't read profiles", /permission denied/i.test(anonErr || ""), anonErr);

const badAge = await rejects(() => as(A, `update public.profiles set age_group='teen' where id=$1`, [A]));
check("The database rejects an unknown age group", !!badAge, badAge);
const noName = await rejects(() => as(A, `update public.profiles set emergency='{"phone":"09171234567"}' where id=$1`, [A]));
check("The database rejects an emergency contact without a name", /name/i.test(noName || ""), noName);
const badPhone = await rejects(() => as(A, `update public.profiles set emergency='{"name":"Rosa","phone":"12345"}' where id=$1`, [A]));
check("The database rejects an emergency contact with a bad mobile", /mobile/i.test(badPhone || ""), badPhone);
const notList = await rejects(() => as(A, `update public.profiles set emergency='["Rosa"]' where id=$1`, [A]));
check("The database rejects an emergency contact that isn't an object", !!notList, notList);
await as(A, `update public.profiles set emergency=null, age_group=null where id=$1`, [A]);
const cleared = (await db.query(`select age_group, emergency from public.profiles where id=$1`, [A])).rows[0];
check("Owner can clear both fields", cleared.age_group === null && cleared.emergency === null, cleared);
const roleErr = await rejects(() => as(A, `update public.profiles set role='organizer', age_group='adult' where id=$1`, [A]));
check("Profile saves still can't change organizer status", !!roleErr, roleErr);

// ---- 2. Reserve form --------------------------------------------------------------------
// A tiny DOM: elements by id, parsed from the HTML the form renders.
function domFrom(html) {
  const els = new Map();
  const attr = (a, k) => new RegExp(`\\b${k}="([^"]*)"`).exec(a)?.[1];
  const un = v => (v || "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const make = (id, a) => ({ id, value: "", checked: /\bchecked\b/.test(a), hidden: /\shidden\b/.test(a), dataset: {}, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus() {} });
  for (const m of html.matchAll(/<(input|div|p|label)\b([^>]*)>/g)) {
    const id = attr(m[2], "id"); if (!id) continue;
    const el = make(id, m[2]); el.value = un(attr(m[2], "value")); els.set(id, el);
  }
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const id = attr(m[1], "id"); if (!id) continue;
    const el = make(id, m[1]);
    el.value = /<option value="([^"]*)"[^>]*selected/.exec(m[2])?.[1] ?? /<option value="([^"]*)"/.exec(m[2])?.[1] ?? "";
    els.set(id, el);
  }
  return els;
}
const ctx = vm.createContext({ URL, console, Date, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] } });
vm.runInContext(authCode, ctx);
let els = new Map();
ctx.document.getElementById = id => els.get(id) || null;
ctx.document.querySelectorAll = sel => { const m = /^\[id\^="([^"]+)"\]$/.exec(sel); return m ? [...els.values()].filter(e => e.id.startsWith(m[1])) : []; };

const saved = { name: "Rosa Reyes", relation: "Mother", phone: "+63 918 765 4321" };
let html = ctx.joinerFieldsHtml("rv", 1, [], saved, { you: "Ana Reyes", allowLater: true, booker: { age: "adult" },
  ageFromProfile: true, emergencySaved: saved, offerSave: true, saveChecked: false });
els = domFrom(html);
check("With a profile age, the booker sees a You card and no age select",
  html.includes("Ana Reyes · 18 or older") && html.includes('href="profile.html"') && !/<select[^>]*id="rv-a1"/.test(html) && els.get("rv-a1")?.value === "adult", html.slice(0, 600));
check("The old 'Joiner 1 You, Name' strip is gone", !html.includes("</span> You, "));
check("A saved emergency contact shows as a summary with its fields hidden but prefilled",
  !!els.get("rv-esum") && els.get("rv-efields")?.hidden === true && els.get("rv-en")?.value === "Rosa Reyes" && els.get("rv-em")?.value === "9187654321");
check("Saving an edited contact to the profile starts unticked when one is saved", els.get("rv-esave")?.checked === false);
let r = ctx.readJoinerFields("rv", 1);
check("The booking gets the profile's age and emergency contact", !r.error && r.booker.age === "adult" && r.emergency.phone === "+63 918 765 4321" && r.emergency.relation === "Mother", r);

html = ctx.joinerFieldsHtml("rv", 2, [], null, { you: "Ana Reyes", allowLater: true, booker: { age: "adult" }, offerSave: true, saveChecked: true });
els = domFrom(html);
check("Without a profile, age is asked and the emergency fields show with 'Save to my profile' ticked",
  /<select[^>]*id="rv-a1"/.test(html) && !els.get("rv-esum") && els.get("rv-efields")?.hidden === false && els.get("rv-esave")?.checked === true);

html = ctx.joinerFieldsHtml("d1", 2, [], saved, { you: "Ana Reyes", booker: { age: "adult" } });
check("My trips keeps its age select and plain emergency fields (no profile options passed)",
  /<select[^>]*id="d1-a1"/.test(html) && !html.includes("d1-esum") && !html.includes("d1-esave"));

const minor = ctx.joinerFieldsHtml("rv", 2, [], null, { you: "Kid Leo", booker: { age: "minor" }, ageFromProfile: true });
check("A minor's profile age still shows the guardian fields", minor.includes("Kid Leo · Under 18") && /id="rv-gbox1"(?![^>]*hidden)/.test(minor));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
