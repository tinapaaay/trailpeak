// TP-022 pilot funnel (ADR-012). Upgrades from main (eb1977a), runs the schema twice.
// Checks what events may hold and who can log or read them, the attribution window, first-time
// vs returning, and the waiting times.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "eb1977a:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const ORG = "d0000000-0000-0000-0000-00000000000d", J = "a0000000-0000-0000-0000-00000000000a", K = "b0000000-0000-0000-0000-00000000000b";
const V1 = "11111111-1111-4111-8111-111111111111", V2 = "22222222-2222-4222-8222-222222222222", V3 = "33333333-3333-4333-8333-333333333333";
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, sql, role = "authenticated") => { await db.exec(`select set_config('request.jwt.claim.sub','${uid || ""}',false); set role ${role};`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); } };
const CHECK = '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}';
const day = n => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const D = day(20);
const EM = `'{"name":"Mom","phone":"0917 000 0000"}'::jsonb`;
const log = (uid, args, role = "authenticated") => as(uid, `select public.log_event(${args})`, role);
const book = async uid => (await as(uid, `select ref from public.book_trip('f-trip','${D}',1,'Cubao','2 AM','GCash','','',false,'[]'::jsonb,${EM})`)).rows[0].ref;
const count = async (where = "true") => (await q(`select count(*)::int n from pilot_events where ${where}`))[0].n;

await db.exec(base);
for (const u of [ORG, J, K]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await q(`select approve_organizer('${ORG}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await as(ORG, `insert into public.trips (id, organizer_id, org_name, details) values ('f-trip','${ORG}','Org F','{"title":"Mt. F","fee":1500,"dp":500}')`);
await as(ORG, `insert into public.trips (id, organizer_id, org_name, details, status) values ('f-draft','${ORG}','Org F','{"title":"Mt. G","fee":1500,"dp":500}','draft')`);
await as(ORG, `insert into public.departures (trip_id, date, capacity) values ('f-trip','${D}',20)`);
await db.exec(current); await db.exec(current);
check("Upgrade: event and admin tables exist, empty", (await count()) === 0 && (await q(`select count(*)::int n from pilot_admin_log`))[0].n === 0);

// Logging: what anyone may log, and what's refused quietly
let r = await log(null, `'trip_view','${V1}','f-trip',null,'share'`, "anon");
check("Signed out: a shared-link visit is logged", r.ok && await count(`kind='trip_view' and source='share'`) === 1, r);
await log(null, `'trip_view','${V1}','f-trip',null,'share'`, "anon");
check("Same browser, same trip, same day: counted once", await count(`kind='trip_view'`) === 1);
await log(null, `'trip_view','${V2}','f-trip',null,'whatever'`, "anon");
check("Unknown source becomes 'direct'", await count(`visitor='${V2}' and source='direct'`) === 1);
await log(null, `'trip_view','${V3}','f-draft',null,'share'`, "anon");
check("Draft trip visits aren't counted", await count(`trip_id='f-draft'`) === 0);
await log(null, `'trip_view','${V3}','nope',null,'share'`, "anon");
check("Unknown trip ignored", await count(`visitor='${V3}'`) === 0);
r = await log(null, `'admin',  '${V3}'`, "anon");
check("Unknown kind ignored, no error for the page", r.ok && await count(`visitor='${V3}'`) === 0, r);
r = await log(null, `'signed_in','${V3}'`, "anon");
check("signed_in needs a session", r.ok && await count(`kind='signed_in'`) === 0, r);

// Sign-in timing, then a reservation from the shared-link browser
await q(`insert into pilot_events (kind, visitor, created_at) values ('code_sent','${V1}', now() - interval '4 minutes')`);
await log(J, `'signed_in','${V1}'`);
const ref1 = await book(J);
r = await log(K, `'reserved','${V1}',null,'${ref1}'`);
check("Someone else can't tag a booking", r.ok && await count(`kind='reserved'`) === 0, r);
await log(J, `'reserved','${V1}',null,'${ref1}'`);
await log(J, `'reserved','${V2}',null,'${ref1}'`);
check("The booker tags their booking once", await count(`kind='reserved' and booking_ref='${ref1}' and visitor='${V1}'`) === 1 && await count(`kind='reserved'`) === 1);

// Privacy: events hold no account ids, names, emails or phones, and nobody reads them through the API
const cols = (await q(`select column_name from information_schema.columns where table_name='pilot_events' order by ordinal_position`)).map(c => c.column_name).join(",");
check("Event columns: no user id, name, email or phone", cols === "id,kind,visitor,trip_id,booking_ref,source,created_at", cols);
check("No hiker details in any stored event", !(await q(`select * from pilot_events`)).some(e => /Mom|0917|@|Ana/.test(JSON.stringify(e))));
for (const [who, role] of [[null, "anon"], [J, "authenticated"], [ORG, "authenticated"]]) {
  for (const t of ["pilot_events", "pilot_admin_log", "pilot_bookings", "pilot_funnel_weekly", "pilot_waits_weekly", "pilot_admin_weekly"]) {
    const x = await as(who, `select * from public.${t}`, role);
    check(`${role === "anon" ? "Signed out" : who === ORG ? "Organizer" : "Joiner"} can't read ${t}`, !x.ok && /permission denied/.test(x.err), x);
  }
}
r = await as(J, `insert into public.pilot_events (kind, visitor) values ('code_sent','${V3}')`);
check("No direct inserts", !r.ok && /permission denied/.test(r.err), r);

// A second booking by the same joiner (returning), with no shared visit (direct)
await q(`insert into pilot_events (kind, visitor, trip_id, source) values ('trip_view','${V2}','f-trip','direct') on conflict do nothing`);
const ref2 = await book(J);
await log(J, `'reserved','${V2}',null,'${ref2}'`);
// K: shared visit 8 days before the booking (outside the 7-day window)
await q(`insert into pilot_events (kind, visitor, trip_id, source, created_at) values ('trip_view','${V3}','f-trip','share', now() - interval '8 days')`);
const ref3 = await book(K);
await log(K, `'reserved','${V3}',null,'${ref3}'`);

let pb = Object.fromEntries((await q(`select * from pilot_bookings`)).map(b => [b.ref, b]));
check("First booking from a shared link (within 7 days): from_share", pb[ref1].from_share === true);
check("Direct visit: not from_share", pb[ref2].from_share === false);
check("Shared visit 8 days earlier: outside the window", pb[ref3].from_share === false);
check("First-time vs returning", pb[ref1].first_time === true && pb[ref2].first_time === false && pb[ref3].first_time === true);
await q(`update app_settings set value = 9 where key = 'attribution_days'`);
check("Window is a setting (9 days: now counts)", (await q(`select from_share from pilot_bookings where ref='${ref3}'`))[0].from_share === true);
await q(`update app_settings set value = 7 where key = 'attribution_days'`);

// DP sent, then confirmed by the organizer 5 hours later; a partial receipt doesn't confirm
await as(J, `select public.send_dp_reference('${ref1}', 'REF123')`);
await q(`update bookings set dp_sent_at = now() - interval '5 hours' where ref = '${ref1}'`);
await as(ORG, `select * from public.record_dp_receipt(gen_random_uuid(), '${ref1}', null, null, 500, 'GCash', now(), 'GCash received')`);
await as(K, `select public.send_dp_reference('${ref3}', 'REF456')`);
await as(ORG, `select * from public.record_dp_receipt(gen_random_uuid(), '${ref3}', null, null, 200, 'GCash', now(), 'Partial')`);
pb = Object.fromEntries((await q(`select * from pilot_bookings`)).map(b => [b.ref, b]));
check("Full receipt: DP confirmed", pb[ref1].dp_confirmed_at !== null);
check("Partial receipt: not confirmed yet", pb[ref3].dp_sent_at !== null && pb[ref3].dp_confirmed_at === null);

const f = (await q(`select * from pilot_funnel_weekly`)).at(-1);
check("Funnel row: 1 shared visitor this week (the 8-day one is last week)", Number(f.shared_link_visitors) === 1, f);
check("Funnel row: 3 reservations, 1 from a shared link", Number(f.reservations) === 3 && Number(f.reservations_from_share) === 1, f);
check("Funnel row: 2 DP sent, 1 confirmed", Number(f.dp_sent) === 2 && Number(f.dp_confirmed) === 1, f);
check("Funnel row: 2 first-time, 1 returning", Number(f.first_time_joiners) === 2 && Number(f.returning_joiners) === 1, f);
check("Funnel row: rates", Number(f.share_to_reserve_pct) === 100 && Number(f.reserve_to_confirmed_pct) === 33.3, f);

const w = (await q(`select * from pilot_waits_weekly`)).at(-1);
check("Email wait: ~4 minutes, timed once", Number(w.sign_ins_timed) === 1 && Math.abs(Number(w.email_median_minutes) - 4) < 0.2, w);
check("Organizer wait: ~5 hours", Number(w.dps_timed) === 1 && Math.abs(Number(w.organizer_median_hours) - 5) < 0.1, w);

// Owner's weekly admin log (SQL editor) plus organizers' incident log
await q(`insert into pilot_admin_log (week_of, organizer, admin_minutes, messages, corrections, support_cases, note)
         values (date_trunc('week', now() at time zone 'Asia/Manila')::date, 'Org F', 45, 12, 1, 2, 'Two DP questions')`);
await as(ORG, `select * from public.log_departure_check('f-trip','${D}','overbooking','Ana', p_note => 'Late Messenger entry')`);
const a = (await q(`select * from pilot_admin_weekly`)).at(-1);
check("Admin week: minutes, messages, corrections, support cases", Number(a.admin_minutes) === 45 && Number(a.messages) === 12 && Number(a.corrections) === 1 && Number(a.support_cases) === 2, a);
check("Admin week: overbookings from the reconciliation log", Number(a.overbookings) === 1, a);

await db.exec(current);
check("Running the schema again keeps the data", await count() === 8 && (await q(`select count(*)::int n from pilot_admin_log`))[0].n === 1, await count());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
