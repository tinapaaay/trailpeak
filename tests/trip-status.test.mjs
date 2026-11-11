// TP-053 trip status: draft, published, archived (ADR-011). Upgrades from main (10d937f), runs the
// schema twice. Checks what each role reads straight through the database, and the archive rule.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "10d937f:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const ORG = "d0000000-0000-0000-0000-00000000000d", ORG2 = "e0000000-0000-0000-0000-00000000000e",
      J = "a0000000-0000-0000-0000-00000000000a", K = "b0000000-0000-0000-0000-00000000000b";
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
const D = day(10), D2 = day(20);
const EM = `'{"name":"Mom","phone":"0917 000 0000"}'::jsonb`;
const trip = (id, extra = "") => as(ORG, `insert into public.trips (id, organizer_id, org_name, details${extra ? ", status" : ""}) values ('${id}','${ORG}','Org S','{"title":"${id}","fee":1500,"dp":500}'${extra ? `, '${extra}'` : ""})`);
const dates = id => as(ORG, `insert into public.departures (trip_id, date, capacity) values ('${id}','${D}',10), ('${id}','${D2}',10)`);
const book = (uid, id, date = D) => as(uid, `select ref from public.book_trip('${id}','${date}',1,'Cubao','2 AM','GCash','','',false,'[]'::jsonb,${EM})`);
const ids = rows => rows.map(r => r.id || r.trip_id).filter((v, i, a) => a.indexOf(v) === i).sort().join(",");

await db.exec(base);
for (const u of [ORG, ORG2, J, K]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
for (const u of [ORG, ORG2]) await q(`select approve_organizer('${u}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await trip("old-trip"); await dates("old-trip");
await db.exec(current); await db.exec(current);
check("Upgrade: existing trips become published", (await q(`select status from trips where id='old-trip'`))[0].status === "published");

// Draft
let r = await trip("draft-trip", "draft"); await dates("draft-trip");
check("Organizer saves a draft", r.ok, r);
r = await as(null, `select id from public.trips`, "anon");
check("Signed out: draft not in trips", r.ok && ids(r.rows) === "old-trip", r);
r = await as(null, `select id from public.trips where id = 'draft-trip'`, "anon");
check("Signed out: draft not readable by direct id", r.ok && r.rows.length === 0, r);
r = await as(null, `select distinct trip_id from public.departures`, "anon");
check("Signed out: draft's dates hidden", r.ok && ids(r.rows) === "old-trip", r);
r = await as(null, `select distinct trip_id from public.all_slots()`, "anon");
check("Signed out: draft's slots hidden", r.ok && ids(r.rows) === "old-trip", r);
r = await as(J, `select id from public.trips`);
check("Joiner: draft not visible", r.ok && ids(r.rows) === "old-trip", r);
r = await as(ORG2, `select id from public.trips`);
check("Another organizer: draft not visible", r.ok && ids(r.rows) === "old-trip", r);
r = await as(ORG, `select id from public.trips`);
check("Its organizer sees the draft", r.ok && ids(r.rows) === "draft-trip,old-trip", r);
r = await as(ORG, `select distinct trip_id from public.all_slots()`);
check("Its organizer sees the draft's slots", r.ok && ids(r.rows) === "draft-trip,old-trip", r);
r = await book(J, "draft-trip");
check("Booking a draft is refused", !r.ok && /isn't open for booking/.test(r.err), r);
r = await as(ORG, `update public.trips set status = 'published' where id = 'draft-trip'`);
check("Publish the draft", r.ok && (await q(`select status from trips where id='draft-trip'`))[0].status === "published", r);
r = await as(null, `select id from public.trips where id = 'draft-trip'`, "anon");
check("Published: now public", r.ok && r.rows.length === 1, r);
r = await book(J, "draft-trip");
check("Published: can be booked", r.ok, r);

// Archive is refused while upcoming dates have people on them
r = await as(ORG, `update public.trips set status = 'archived' where id = 'draft-trip'`);
check("Archive refused with an upcoming booking, naming the date", !r.ok && /upcoming bookings: .*1 joiner\)/.test(r.err) && /Close or cancel those dates first/.test(r.err), r);
r = await as(ORG, `update public.trips set status = 'draft' where id = 'draft-trip'`);
check("Back to draft refused too", !r.ok && /upcoming bookings/.test(r.err), r);
await as(ORG, `select * from public.add_outside_booking(gen_random_uuid(),'old-trip','${D2}','Out Booker',2,'Cubao','2 AM','messenger')`);
r = await as(ORG, `update public.trips set status = 'archived' where id = 'old-trip'`);
check("Outside bookings count as upcoming bookings", !r.ok && /2 joiners/.test(r.err), r);
await as(ORG, `update public.departures set status = 'cancelled' where trip_id = 'old-trip' and date = '${D2}'`);
r = await as(ORG, `update public.trips set status = 'archived' where id = 'old-trip'`);
check("Archive allowed once that date is cancelled", r.ok, r);

// Archive the booked trip after its booking is cancelled
const ref = (await q(`select ref from bookings where trip_id='draft-trip'`))[0].ref;
await as(J, `select public.cancel_booking('${ref}')`);
r = await as(ORG, `update public.trips set status = 'archived' where id = 'draft-trip'`);
check("Archive allowed after the booking is cancelled", r.ok, r);
check("archived_at set", (await q(`select archived_at from trips where id='draft-trip'`))[0].archived_at !== null);
r = await as(null, `select id from public.trips`, "anon");
check("Signed out: archived trips out of search", r.ok && r.rows.length === 0, r);
r = await as(K, `select id from public.trips`);
check("Another joiner: archived trips hidden", r.ok && r.rows.length === 0, r);
r = await as(J, `select id, status from public.trips`);
check("A joiner with a booking on it still sees it (for My trips)", r.ok && ids(r.rows) === "draft-trip" && r.rows[0].status === "archived", r);
r = await as(J, `select ref, status from public.bookings`);
check("Bookings stay after archiving", r.ok && r.rows.length === 1 && r.rows[0].status === "cancelled", r);
r = await book(K, "draft-trip");
check("Booking an archived trip is refused", !r.ok && /isn't open for booking/.test(r.err), r);
r = await as(ORG, `select id, status from public.trips order by id`);
check("Organizer still sees archived trips", r.ok && r.rows.map(x => x.status).join() === "archived,archived", r);
check("Outside booking kept on the archived trip", (await q(`select count(*)::int n from outside_bookings where trip_id='old-trip'`))[0].n === 1);

// Restore
r = await as(ORG, `update public.trips set status = 'published' where id = 'old-trip'`);
check("Restore an archived trip", r.ok && (await q(`select archived_at from trips where id='old-trip'`))[0].archived_at === null, r);
r = await as(null, `select id from public.trips`, "anon");
check("Restored trip is public again", r.ok && ids(r.rows) === "old-trip", r);

// Other routes and roles
r = await as(ORG, `insert into public.trips (id, organizer_id, org_name, details, status) values ('x','${ORG}','Org S','{}','archived')`);
check("A new trip can't start archived", !r.ok && /can't start archived/.test(r.err), r);
r = await as(ORG, `insert into public.trips (id, organizer_id, org_name, details, status) values ('y','${ORG}','Org S','{}','hidden')`);
check("Unknown status refused", !r.ok, r);
r = await as(ORG2, `update public.trips set status = 'archived' where id = 'old-trip' returning id`);
check("Another organizer can't change the status", r.ok && r.rows.length === 0 && (await q(`select status from trips where id='old-trip'`))[0].status === "published", r);
r = await as(J, `update public.trips set status = 'draft' where id = 'old-trip'`);
check("A joiner can't change it", (!r.ok || true) && (await q(`select status from trips where id='old-trip'`))[0].status === "published", r);
r = await as(null, `update public.trips set status = 'draft' where id = 'old-trip'`, "anon");
check("Signed out can't change it", !r.ok && /permission denied/.test(r.err), r);
await q(`update trips set published = false where id = 'old-trip'`);
r = await as(null, `select id from public.trips`, "anon");
check("Owner's suspension switch (published = false) still hides a trip", r.ok && r.rows.length === 0, r);
await q(`update trips set published = true where id = 'old-trip'`);

await db.exec(current);
check("Running the schema again keeps statuses", (await q(`select string_agg(status, ',' order by id) s from trips`))[0].s === "archived,published");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
