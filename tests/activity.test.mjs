// Organizer feedback (Nov 2026): PH mobile checks, DP transaction references and the
// organizer activity feed. Upgrades from main after PR #15, then runs the schema twice.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Upgrade base: main right after PR #15 (direct DP receipts) merged.
const base = execFileSync("git", ["show", "cb4c6a8:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const A = "aaaaaaaa-0000-0000-0000-000000000001", C = "cccccccc-0000-0000-0000-000000000003", J = "b0000000-0000-0000-0000-000000000001";
const D = "2027-03-06", D2 = "2027-03-13";
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
const q = async s => (await db.query(s)).rows;
const as = async (uid, sql, role = "authenticated") => { await db.exec(`select set_config('request.jwt.claim.sub','${uid || ""}',false); set role ${role};`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); } };
const uuid = () => crypto.randomUUID();
const book = (size, em = "0917 123 4567", comp = []) => as(J, `select (public.book_trip('a-trip','${D}',${size},'Cubao','2:00 AM','GCash','','',false,'${JSON.stringify(comp)}'::jsonb,'{"name":"Mom","phone":"${em}"}'::jsonb)).ref`);

// Old (deployed) schema with an organizer, trip, date, and one booking already made.
await db.exec(base);
for (const u of [A, C, J]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await q(`select approve_organizer('${A}')`); await q(`select approve_organizer('${C}')`);
await q(`update profiles set name='Ana Reyes' where id='${J}'`);
await as(A, `insert into public.trips (id, organizer_id, org_name, details) values ('a-trip','${A}','Org A','{"title":"Mt. Test","fee":1500,"dp":500}')`);
await as(A, `insert into public.departures (trip_id, date, capacity) values ('a-trip','${D}',10), ('a-trip','${D2}',10)`);
let r = await book(1); if (!r.ok) throw new Error(r.err);
const oldRef = r.rows[0].ref;
await db.exec(current);
await db.exec(current);
r = await q(`select count(*)::int n from bookings`);
check("Upgrade (run twice) keeps the existing booking", r[0].n === 1, r);
r = await q(`select count(*)::int n from organizer_activity`);
check("Upgrade doesn't invent activity for old bookings", r[0].n === 0, r);

// ph_mobile
const pm = async v => { try { return (await q(`select public.ph_mobile(${v === null ? "null" : `'${v}'`}, 'Mobile') m`))[0].m; } catch (e) { return "ERR"; } };
for (const [v, want] of [["0917 123 4567", "+63 917 123 4567"], ["9171234567", "+63 917 123 4567"], ["+63 917-123-4567", "+63 917 123 4567"], ["", null], [null, null],
  ["+63 999999999999", "ERR"], ["0917 123 456", "ERR"], ["0817 123 4567", "ERR"], ["63 917 123 45678", "ERR"], ["hello", "ERR"]])
  check(`Mobile "${v}" -> ${want}`, (await pm(v)) === want, await pm(v));

// Outside booking phone
r = await as(A, `select phone from public.add_outside_booking('${uuid()}','a-trip','${D}','Test Booker',1,'Cubao','2:00 AM','messenger','+63 999999999999')`);
check("Outside booking with +63 999999999999 is refused with a clear message", !r.ok && /Philippine mobile number/.test(r.err), r);
console.log("      message: " + r.err);
r = await as(A, `select phone from public.add_outside_booking('${uuid()}','a-trip','${D}','Test Booker',1,'Cubao','2:00 AM','messenger','09171234567')`);
check("Valid outside mobile is saved tidy", r.ok && r.rows[0].phone === "+63 917 123 4567", r);
r = await as(A, `select phone from public.add_outside_booking('${uuid()}','a-trip','${D}','No Phone',1,'Cubao','2:00 AM','in_person',null)`);
check("Outside booking without a mobile still works", r.ok && r.rows[0].phone === null, r);

// Joiner booking phones (direct API)
r = await book(1, "+63 999999999999");
check("Booking with a bad emergency mobile is refused", !r.ok && /emergency contact's mobile/.test(r.err), r);
r = await book(2, "0917 123 4567", [{ name: "Ben", age: "adult", phone: "12345" }]);
check("Booking with a bad joiner mobile is refused", !r.ok && /Joiner 2's mobile/.test(r.err), r);
r = await book(2, "0917 123 4567", [{ name: "Ben", age: "adult", phone: "0918 765 4321" }]);
check("Booking with valid mobiles works", r.ok, r);
const newRef = r.rows[0].ref;

// Activity
r = await as(A, `select kind, summary, booking_ref from public.organizer_activity order by id`);
check("New booking creates a 'booked' activity for the trip's organizer", r.ok && r.rows.length === 1 && r.rows[0].kind === "booked" && r.rows[0].booking_ref === newRef, r);
console.log("      summary: " + r.rows[0]?.summary);
check("...and it mentions the pending DP", /DP of ₱1,000 pending/.test(r.rows[0]?.summary), r.rows[0]?.summary);
r = await as(J, `select public.move_booking('${newRef}','${D2}')`);
r = await as(J, `select public.cancel_booking('${newRef}')`);
r = await as(A, `select kind from public.organizer_activity order by id`);
check("Move and cancel add 'moved' and 'cancelled' activity", r.ok && r.rows.map(x => x.kind).join() === "booked,moved,cancelled", r);
r = await as(C, `select * from public.organizer_activity`);
check("Another organizer sees none of it", r.ok && r.rows.length === 0, r);
r = await as(J, `select * from public.organizer_activity`);
check("The joiner sees none of it", r.ok && r.rows.length === 0, r);
r = await as(null, `select * from public.organizer_activity`, "anon");
check("Signed out can't read it", !r.ok, r);
r = await as(A, `insert into public.organizer_activity (organizer_id, trip_id, kind, summary) values ('${A}','a-trip','booked','fake')`);
check("Organizer can't write activity directly", !r.ok, r);
r = await as(A, `update public.organizer_activity set read_at = now()`);
check("Organizer can't update it directly", !r.ok, r);
r = await as(C, `select public.mark_activity_read()`);
check("Another organizer's 'mark read' changes nothing of A's", r.ok && r.rows[0].mark_activity_read === 0, r);
r = await as(A, `select public.mark_activity_read(array[(select min(id) from organizer_activity)])`);
check("Organizer marks one item read", r.ok && r.rows[0].mark_activity_read === 1, r);
r = await as(A, `select public.mark_activity_read()`);
check("Organizer marks the rest read", r.ok && r.rows[0].mark_activity_read === 2, r);
r = await as(null, `select public.mark_activity_read()`, "anon");
check("Signed out can't call mark read", !r.ok, r);

// Receipt reference
const req = uuid();
const rec = (ref, request = req, amount = 500) => as(A, `select reference from public.record_dp_receipt('${request}','${oldRef}',null,null,${amount},'GCash','2026-11-10T10:00:00Z','Checked wallet',${ref === null ? "null" : `'${ref}'`})`);
r = await rec("  1234 567 890  ");
check("DP recorded with a transaction reference (trimmed)", r.ok && r.rows[0].reference === "1234 567 890", r);
r = await rec("1234 567 890");
check("Same request again returns the same record", r.ok, r);
r = await rec("9999");
check("Same request with a different reference is refused", !r.ok, r);
r = await as(A, `select count(*)::int n from public.dp_receipts`);
check("...still one receipt", r.rows[0].n === 1, r);
r = await as(J, `select reference from public.dp_receipts`);
check("The joiner sees the reference on their own receipt", r.ok && r.rows[0]?.reference === "1234 567 890", r);
r = await as(A, `select reference from public.record_dp_receipt('${uuid()}','${oldRef}',null,null,500,'GCash',now(),'x','${"x".repeat(41)}')`);
check("Reference over 40 characters is refused", !r.ok, r);
r = await as(A, `select count(*)::int n from pg_proc where proname = 'record_dp_receipt'`);
check("Only one version of record_dp_receipt exists", r.rows[0].n === 1, r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
