// TP-020 reconciliation and incident log (ADR-010). Upgrades from main (60349e9), runs the schema twice.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "60349e9:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const ORG = "d0000000-0000-0000-0000-00000000000d", ORG2 = "e0000000-0000-0000-0000-00000000000e", J = "a0000000-0000-0000-0000-00000000000a";
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
const D = day(2), D2 = day(9);

await db.exec(base);
for (const u of [ORG, ORG2, J]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
for (const u of [ORG, ORG2]) await q(`select approve_organizer('${u}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await as(ORG, `insert into public.trips (id, organizer_id, org_name, details) values ('c-trip','${ORG}','Org C','{"title":"Mt. C","fee":1500,"dp":500}')`);
await as(ORG, `insert into public.departures (trip_id, date, capacity) values ('c-trip','${D}',10), ('c-trip','${D2}',10)`);
await db.exec(current); await db.exec(current);
check("Upgrade: log table exists and is empty", (await q(`select count(*)::int n from departure_checks`))[0].n === 0);

const log = (uid, args, role) => as(uid, `select * from public.log_departure_check(${args})`, role);
let r = await log(ORG, `'c-trip','${D}','reconciled','Ana Reyes', p_trail => 'open', p_source => 'DENR Mt. C Facebook page, 9 AM', p_outside_entered => true`);
check("Organizer logs a reconciliation", r.ok && r.rows[0].kind === "reconciled" && r.rows[0].trail === "open" && r.rows[0].outside_entered === true, r);
check("Check time recorded", r.ok && r.rows[0].created_at instanceof Date, r);

r = await log(ORG, `'c-trip','${D}','reconciled','Ana', p_trail => 'open', p_source => 'Park page', p_outside_entered => false`);
check("Refused while outside bookings aren't all entered", !r.ok && /outside booking/.test(r.err), r);
r = await log(ORG, `'c-trip','${D}','reconciled','Ana', p_trail => 'open', p_outside_entered => true`);
check("Refused without a trail-status source", !r.ok && /where you checked/.test(r.err), r);
r = await log(ORG, `'c-trip','${D}','reconciled','Ana', p_source => 'Park page', p_outside_entered => true`);
check("Refused without open/closed", !r.ok && /open or closed/.test(r.err), r);
r = await log(ORG, `'c-trip','${D}','reconciled','  ', p_trail => 'open', p_source => 'Park page', p_outside_entered => true`);
check("Refused without the checker's name", !r.ok && /name of the person/.test(r.err), r);
r = await log(ORG, `'c-trip','${D}','overbooking','Ana'`);
check("Incident refused without a description", !r.ok && /Describe/.test(r.err), r);
r = await log(ORG, `'c-trip','${D}','refund','Ana', p_note => 'x'`);
check("Unknown kind refused", !r.ok && /Choose what/.test(r.err), r);
r = await log(ORG, `'c-trip','${day(30)}','other','Ana', p_note => 'x'`);
check("Date not on the trip refused", !r.ok && /isn't on the trip/.test(r.err), r);

r = await log(ORG, `'c-trip','${D}','overbooking','Ana Reyes', p_note => 'Messenger booking for 2 entered late; 12 of 10. Moved Ben (2) to ${D2} with his OK.'`);
check("Overbooking logged", r.ok && r.rows[0].kind === "overbooking" && r.rows[0].trail === null, r);
r = await log(ORG, `'c-trip','${D}','correction','Ana Reyes', p_note => 'Fixed pick-up for TP-ABC123', p_trail => 'closed', p_source => 'ignored'`);
check("Correction logged; trail fields ignored for incidents", r.ok && r.rows[0].trail === null && r.rows[0].source === null, r);
r = await log(ORG, `'c-trip','${D2}','reconciled','Ana', p_trail => 'closed', p_source => 'LGU advisory', p_outside_entered => true`);
check("A closed trail can be logged (the organizer then closes or cancels the date)", r.ok && r.rows[0].trail === "closed", r);
check("Logging never changes the date's status", (await q(`select status from departures where date='${D2}'`))[0].status === "open");

// Who can log and read
r = await log(ORG2, `'c-trip','${D}','other','Eve', p_note => 'x'`);
check("Another organizer can't log on this trip", !r.ok && /Only this trip/.test(r.err), r);
r = await log(J, `'c-trip','${D}','other','Joe', p_note => 'x'`);
check("A joiner can't log", !r.ok && /Only this trip/.test(r.err), r);
r = await log(null, `'c-trip','${D}','other','X', p_note => 'x'`, "anon");
check("Signed out can't log", !r.ok && /permission denied/.test(r.err), r);
r = await as(ORG, `select kind from public.departure_checks order by id`);
check("Organizer reads their log (4 entries, oldest first)", r.ok && r.rows.map(x => x.kind).join() === "reconciled,overbooking,correction,reconciled", r);
r = await as(ORG2, `select * from public.departure_checks`);
check("Another organizer reads nothing", r.ok && r.rows.length === 0, r);
r = await as(J, `select * from public.departure_checks`);
check("A joiner reads nothing", r.ok && r.rows.length === 0, r);
r = await as(null, `select * from public.departure_checks`, "anon");
check("Signed out: denied", !r.ok && /permission denied/.test(r.err), r);

// Append-only
r = await as(ORG, `update public.departure_checks set note = 'changed'`);
check("Entries can't be edited", !r.ok && /permission denied/.test(r.err), r);
r = await as(ORG, `delete from public.departure_checks`);
check("Entries can't be deleted", !r.ok && /permission denied/.test(r.err), r);
r = await as(ORG, `insert into public.departure_checks (trip_id, date, organizer_id, kind, checked_by, note) values ('c-trip','${D}','${ORG}','other','x','y')`);
check("No direct inserts (the function checks the rules)", !r.ok && /permission denied/.test(r.err), r);
check("Table rule backs the function: a reconciliation needs all three", !(await db.query(`insert into departure_checks (trip_id, date, organizer_id, kind, checked_by) values ('c-trip','${D}','${ORG}','reconciled','x')`).then(() => true, () => false)));

await db.exec(current);
check("Running the schema again keeps the log", (await q(`select count(*)::int n from departure_checks`))[0].n === 4);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
