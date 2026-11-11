// TP-014 joiner details cut-off (ADR-006). Upgrades from main (0a83731), runs the schema twice,
// then checks the Manila-date boundaries and booking enforcement.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "0a83731:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const D = "d0000000-0000-0000-0000-00000000000d", J = "a0000000-0000-0000-0000-00000000000a";
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
const one = async s => Object.values((await db.query(s)).rows[0])[0];
const as = async (uid, sql) => { await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); } };
const CHECK = '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}';
const ahead = async n => await one(`select (public.ph_today() + ${n})::text`);
const names = k => JSON.stringify(Array.from({ length: k }, (_, i) => ({ name: "Friend " + i, age: "adult" })));
const book = (date, size, k, em = '{"name":"Mom","phone":"0917 000 0000"}') => as(J, `select ref from public.book_trip('d-trip','${date}',${size},'Cubao','2 AM','GCash','','',false,'${names(k)}'::jsonb,'${em}'::jsonb)`);

await db.exec(base);
for (const u of [D, J]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await db.query(`select approve_organizer('${D}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await db.query(`update profiles set name='Ana Reyes' where id='${J}'`);
await as(D, `insert into public.trips (id, organizer_id, org_name, details) values ('d-trip','${D}','Org D','{"title":"D","fee":1500,"dp":500}')`);
const dates = {}; for (const n of [0, 1, 2, 3, 4, 10]) dates[n] = await ahead(n);
await as(D, `insert into public.departures (trip_id, date, capacity) values ${Object.values(dates).map(d => `('d-trip','${d}',30)`).join(",")}`);
// before the rule: a booking 2 days out with names missing
let r = await as(J, `select ref from public.book_trip('d-trip','${dates[2]}',3,'Cubao','2 AM','GCash','','',false,'[]'::jsonb,'{"name":"Mom","phone":"0917 000 0000"}'::jsonb)`);
const oldRef = r.rows[0].ref;
await db.exec(current); await db.exec(current);
check("Upgrade: a booking made before the rule keeps its missing names", (await one(`select status from bookings where ref='${oldRef}'`)) === "confirmed");
check("Setting details_due_days = 3", (await one(`select value::int from app_settings where key='details_due_days'`)) === 3);

// Pure boundary checks (explicit today)
check("Due date = trip date minus 3", (await one(`select public.details_due_date('2026-11-14')::text`)) === "2026-11-11");
check("4 days before the trip: not required yet", (await one(`select public.details_required('2026-11-14','2026-11-10')`)) === false);
check("Exactly 3 days before (the due date): required", (await one(`select public.details_required('2026-11-14','2026-11-11')`)) === true);
check("2 days before: required", (await one(`select public.details_required('2026-11-14','2026-11-12')`)) === true);
check("On the trip date: required", (await one(`select public.details_required('2026-11-14','2026-11-14')`)) === true);
check("Midnight in Manila: 15:59:59 UTC is still Nov 10", (await one(`select public.ph_date('2026-11-10T15:59:59Z')::text`)) === "2026-11-10");
check("...16:00:00 UTC is already Nov 11 (the due date for a Nov 14 trip)", (await one(`select public.ph_date('2026-11-10T16:00:00Z')::text`)) === "2026-11-11");
check("So for a Nov 14 trip, a booking at 11:59:59 PM Manila on Nov 10 may leave names for later; at midnight they're required",
  (await one(`select public.details_required('2026-11-14', public.ph_date('2026-11-10T15:59:59Z'))`)) === false && (await one(`select public.details_required('2026-11-14', public.ph_date('2026-11-10T16:00:00Z'))`)) === true);

// Booking enforcement with today's real date
r = await book(dates[10], 3, 0);
check("10 days out: booking for 3 with no names yet is allowed", r.ok, r);
r = await book(dates[4], 3, 1);
check("4 days out: 1 of 2 names is allowed (due tomorrow)", r.ok, r);
r = await book(dates[3], 3, 1);
check("Exactly 3 days out: 1 of 2 names is refused", !r.ok && /add every joiner's full name now \(1 of 2 still missing\)/.test(r.err), r);
console.log("      message: " + r.err);
r = await book(dates[3], 3, 2);
check("Exactly 3 days out: all names → allowed", r.ok, r);
r = await book(dates[1], 2, 0);
check("Tomorrow: missing the one companion name is refused", !r.ok, r);
r = await book(dates[0], 1, 0);
check("Today, booking just yourself: no companion names needed", r.ok, r);
r = await book(dates[2], 2, 1, '{"name":"","phone":""}');
check("Inside the window, a missing emergency contact is refused", !r.ok && /emergency contact/.test(r.err), r);
r = await book(dates[2], 2, 1, '{"name":"Mom","phone":"12345"}');
check("...and so is a bad emergency mobile", !r.ok && /mobile/.test(r.err), r);
await db.query(`update app_settings set value = 5 where key='details_due_days'`);
r = await book(dates[4], 3, 1);
check("Changing the setting to 5 days: 4 days out now needs every name", !r.ok, r);
await db.query(`update app_settings set value = 3 where key='details_due_days'`);
r = await as(J, `select jsonb_array_length(companions) n from public.update_booking_details('${oldRef}','${names(1)}'::jsonb,'{"name":"Mom","phone":"0917 000 0000"}'::jsonb)`);
check("A late booker can still save names one at a time in My trips (overdue handling is TP-016)", r.ok && r.rows[0].n === 1, r);
r = await as(J, `select public.details_required('${dates[3]}')`);
check("Website roles can call details_required (the page can ask)", r.ok && r.rows[0].details_required === true, r);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
