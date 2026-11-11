// TP-009 edit and cancel outside bookings. Upgrades from main before this change (058aeeb),
// runs the schema twice, then follows the issue's test plan plus permissions and history.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "058aeeb:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const A = "aaaaaaaa-0000-0000-0000-000000000001", C = "cccccccc-0000-0000-0000-000000000003", J = "b0000000-0000-0000-0000-000000000001";
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, sql, role = "authenticated") => { await db.exec(`select set_config('request.jwt.claim.sub','${uid || ""}',false); set role ${role};`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); } };
const D = new Date(Date.now() + 8 * 3600e3 + 30 * 864e5).toISOString().slice(0, 10);
const left = async () => (await as(null, `select left_count from public.all_slots() where trip_id='a-trip' and date='${D}'`, "anon")).rows[0].left_count;
const edit = (uid, id, rev, f = {}, role) => as(uid, `select id, revision, size, name, pickup, phone, expected_dp, total_fee from public.edit_outside_booking('${id}', ${rev},
  '${f.name ?? "Test Booker"}', ${f.size ?? 2}, '${f.pickup ?? "Cubao"}', '2:00 AM', '${f.source ?? "messenger"}', ${f.phone === undefined ? "null" : `'${f.phone}'`}, '${f.reason ?? "Fixed spelling"}')`, role);
const row = async id => (await q(`select * from outside_bookings where id=$1`, [id]))[0];

// Old schema: trip with capacity 4, an outside booking for 2 already saved.
await db.exec(base);
for (const u of [A, C, J]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await q(`select approve_organizer('${A}')`); await q(`select approve_organizer('${C}')`);
await as(A, `insert into public.trips (id, organizer_id, org_name, details) values ('a-trip','${A}','Org A','{"title":"Mt. Test","fee":1500,"dp":500}')`);
await as(A, `insert into public.departures (trip_id, date, capacity) values ('a-trip','${D}',4)`);
let r = await as(A, `select id from public.add_outside_booking(gen_random_uuid(),'a-trip','${D}','Tset Booker',2,'Cubao','2:00 AM','messenger',null)`);
const id = r.rows[0].id;
await db.exec(current); await db.exec(current);
let o = await row(id);
check("Upgrade: existing outside booking gets revision 1 and keeps its data", o.revision === 1 && o.status === "confirmed" && o.size === 2, o);
check("Setup: 2 of 4 slots left", (await left()) === 2, await left());

// Edit name / pick-up
r = await edit(A, id, 1, { name: "Test Booker", pickup: "Greenfield", phone: "0917 123 4567" });
check("Organizer fixes the name and pick-up", r.ok && r.rows[0].name === "Test Booker" && r.rows[0].pickup === "Greenfield" && r.rows[0].revision === 2, r);
check("...the mobile number is tidied", r.rows[0]?.phone === "+63 917 123 4567", r.rows[0]);
r = await edit(A, id, 1, { name: "Test Booker", pickup: "Greenfield", phone: "0917 123 4567" });
check("Same edit again (a retry with the old revision) changes nothing", r.ok && r.rows[0].revision === 2, r);
r = await edit(A, id, 1, { name: "Someone Else", pickup: "Greenfield" });
check("A different edit from an out-of-date screen is refused", !r.ok && /changed since you opened it/.test(r.err), r);
check("...and the booking is untouched", (await row(id)).name === "Test Booker");

// Size changes
await as(A, `select 1 from public.add_outside_booking(gen_random_uuid(),'a-trip','${D}','Other Group',1,'Cubao','2:00 AM','in_person',null)`);
check("Another booking leaves 1 slot", (await left()) === 1, await left());
r = await edit(A, id, 2, { size: 3, pickup: "Greenfield", phone: "0917 123 4567", reason: "Friend joined" });
check("Grow 2 → 3 with one slot left: allowed", r.ok && r.rows[0].size === 3 && (await left()) === 0, r);
check("...expected DP and fee rescale (₱1,500 / ₱4,500)", r.rows[0]?.expected_dp === 1500 && r.rows[0]?.total_fee === 4500, r.rows[0]);
r = await edit(A, id, 3, { size: 4, pickup: "Greenfield", phone: "0917 123 4567", reason: "Another friend" });
check("Grow 3 → 4 with no slot left: refused", !r.ok && /can't grow by 1/.test(r.err), r);
console.log("      message: " + r.err);
check("...and nothing changed", (await row(id)).size === 3 && (await left()) === 0);
r = await edit(A, id, 3, { size: 1, pickup: "Greenfield", phone: "0917 123 4567", reason: "Two dropped out" });
check("Shrink 3 → 1: releases exactly 2 slots", r.ok && (await left()) === 2, { r, left: await left() });
r = await edit(A, id, 4, { size: 1, pickup: "Greenfield", phone: "+63 999999999999", reason: "x" });
check("Bad mobile refused", !r.ok && /Philippine mobile/.test(r.err), r);
r = await edit(A, id, 4, { size: 1, pickup: "Greenfield", phone: "0917 123 4567", name: "New Name", reason: " " });
check("Missing reason refused", !r.ok && /reason/.test(r.err), r);
await as(A, `update public.departures set status='closed' where trip_id='a-trip' and date='${D}'`);
r = await edit(A, id, 4, { size: 2, pickup: "Greenfield", phone: "0917 123 4567", reason: "x" });
check("Closed date: can't add joiners", !r.ok && /closed/.test(r.err), r);
r = await edit(A, id, 4, { size: 1, pickup: "Cubao", phone: "0917 123 4567", reason: "Changed pick-up" });
check("Closed date: other fixes still allowed", r.ok, r);
await as(A, `update public.departures set status='open' where trip_id='a-trip' and date='${D}'`);

// Receipts stay
r = await as(A, `select amount from public.record_dp_receipt(gen_random_uuid(), null, '${id}', null, 500, 'GCash', now(), 'Checked')`);
check("DP recorded on the outside booking", r.ok, r);

// Permissions
r = await edit(C, id, 5, { size: 1, reason: "x" });
check("Another organizer can't edit it", !r.ok && /Only this trip's organizer/.test(r.err), r);
r = await edit(J, id, 5, { size: 1, reason: "x" });
check("A joiner can't edit it", !r.ok, r);
r = await edit(null, id, 5, { size: 1, reason: "x" }, "anon");
check("Signed out can't edit it", !r.ok, r);
r = await as(C, `select 1 from public.cancel_outside_booking('${id}','x')`);
check("Another organizer can't cancel it", !r.ok, r);
r = await as(null, `select 1 from public.cancel_outside_booking('${id}','x')`, "anon");
check("Signed out can't cancel it", !r.ok, r);
r = await as(A, `select 1 from public.edit_outside_booking('00000000-0000-0000-0000-000000000000',1,'x',1,'x',null,'messenger',null,'x')`);
check("A made-up id gets the same 'only the organizer' answer", !r.ok && /Only this trip's organizer/.test(r.err), r);
r = await as(A, `update public.outside_bookings set size = 1`);
check("Direct updates are still denied", !r.ok, r);
r = await as(A, `select public.lock_outside_booking('${id}')`);
check("The internal lock helper can't be called directly", !r.ok, r);

// Cancel
const before = await left();
r = await as(A, `select status from public.cancel_outside_booking('${id}','  ')`);
check("Cancel needs a reason", !r.ok && /reason/.test(r.err), r);
r = await as(A, `select status from public.cancel_outside_booking('${id}','Group backed out')`);
check("Cancel releases exactly its 1 slot", r.ok && r.rows[0].status === "cancelled" && (await left()) === before + 1, { r, left: await left() });
r = await as(A, `select status from public.cancel_outside_booking('${id}','Group backed out')`);
check("Cancelling again releases nothing more", r.ok && (await left()) === before + 1, { left: await left() });
r = await edit(A, id, 99, { size: 1, reason: "x" });
check("A cancelled booking can't be edited", !r.ok && /cancelled/.test(r.err), r);
r = await as(A, `select amount from public.dp_receipts where outside_id='${id}'`);
check("Cancelling leaves the recorded DP untouched (no refund declared)", r.ok && r.rows.length === 1 && r.rows[0].amount === 500, r);

// History
r = await as(A, `select action, reason, before->>'size' b, after->>'size' a from public.outside_booking_changes where outside_id='${id}' order by id`);
check("History keeps every change: 4 edits + 1 cancel, with reasons", r.ok && r.rows.map(x => x.action).join() === "edit,edit,edit,edit,cancel", r);
check("...with before/after sizes", r.rows[1]?.b === "2" && r.rows[1]?.a === "3" && r.rows[2]?.b === "3" && r.rows[2]?.a === "1", r.rows);
r = await as(A, `select count(*)::int n from public.outside_booking_changes where changed_by='${A}'`);
check("...and who made them", r.rows[0].n === 5, r);
r = await as(C, `select * from public.outside_booking_changes`);
check("Another organizer can't read the history", r.ok && r.rows.length === 0, r);
r = await as(J, `select * from public.outside_booking_changes`);
check("A joiner can't read it", r.ok && r.rows.length === 0, r);
o = await row(id);
check("The cancelled booking stays on record with its reason", o.status === "cancelled" && o.cancel_reason === "Group backed out" && o.cancelled_at, o);

// Public view agrees with the organizer's
r = await as(A, `select coalesce(sum(size),0)::int n from public.outside_bookings where trip_id='a-trip' and date='${D}' and status='confirmed'`);
check("Signed-out slots = capacity minus the organizer's confirmed outside bookings", (await left()) === 4 - r.rows[0].n, { left: await left(), outside: r.rows[0].n });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
