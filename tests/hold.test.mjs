// TP-011 DP hold and expiry. Upgrades from main before this change (eb64d6e), runs the schema
// twice, then checks hold lengths, release, references, reminders and rebooking.
// Time is simulated by moving hold_until / dp_sent_at as the table owner.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "eb64d6e:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const A = "aaaaaaaa-0000-0000-0000-000000000001", C = "cccccccc-0000-0000-0000-000000000003";
const J1 = "b0000000-0000-0000-0000-000000000001", J2 = "b0000000-0000-0000-0000-000000000002", J3 = "b0000000-0000-0000-0000-000000000003";
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const as = async (uid, sql, role = "authenticated") => { await db.exec(`select set_config('request.jwt.claim.sub','${uid || ""}',false); set role ${role};`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); } };
const day = n => (new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10)); // Manila date n days ahead
const FAR = day(30), SOON = day(2);
const book = (u, size, date = FAR) => as(u, `select ref, hold_until from public.book_trip('a-trip','${date}',${size},'Cubao','2:00 AM','GCash','','',false,
  '${JSON.stringify(Array.from({ length: size - 1 }, (_, i) => ({ name: "Friend " + i, age: "adult" })))}'::jsonb,'{"name":"Mom","phone":"0917 000 0000"}'::jsonb)`);
const left = async (date = FAR) => (await q(`select public.slots_left('a-trip','${date}') l`))[0].l;
const status = async ref => (await q(`select status, expired_at, dp_sent_at, dp_reference from bookings where ref=$1`, [ref]))[0];
const lapse = ref => q(`update bookings set hold_until = now() - interval '1 minute' where ref=$1`, [ref]);
const hoursOf = h => (new Date(h) - Date.now()) / 3600e3;

// Old schema: one booking made before holds existed.
await db.exec(base);
for (const u of [A, C, J1, J2, J3]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await q(`select approve_organizer('${A}')`); await q(`select approve_organizer('${C}')`);
for (const u of [J1, J2, J3]) await q(`update profiles set name='Ana Reyes' where id=$1`, [u]);
await as(A, `insert into public.trips (id, organizer_id, org_name, details) values ('a-trip','${A}','Org A','{"title":"Mt. Test","fee":1500,"dp":500}')`);
for (const d of [FAR, SOON, day(3), day(4)]) await as(A, `insert into public.departures (trip_id, date, capacity) values ('a-trip','${d}',4)`);
let r = await as(J1, `select ref from public.book_trip('a-trip','${day(4)}',1,'Cubao','2:00 AM','GCash','','',false,'[]'::jsonb,'{"name":"Mom","phone":"0917 000 0000"}'::jsonb)`);
const legacy = r.rows[0].ref;
await db.exec(current); await db.exec(current);

// Upgrade
r = await status(legacy);
check("Upgrade: booking made before holds keeps no deadline and stays confirmed", r.status === "confirmed" && (await q(`select hold_until from bookings where ref=$1`, [legacy]))[0].hold_until === null, r);
await q(`select public.expire_holds()`);
check("...and expire_holds never expires it", (await status(legacy)).status === "confirmed");
r = await q(`select key, value::int v from app_settings where key like 'dp_%' order by key`);
check("Settings: 6 h hold, 2 h within 3 days, 24 h reminder", JSON.stringify(r) === JSON.stringify([{ key: "dp_hold_hours", v: 6 }, { key: "dp_hold_hours_soon", v: 2 }, { key: "dp_hold_soon_days", v: 3 }, { key: "dp_reminder_hours", v: 24 }]), r);

// Hold lengths and the 3-day boundary
r = await book(J1, 2); const far = r.rows[0].ref;
check("Trip 30 days away: slots held ~6 hours", r.ok && Math.abs(hoursOf(r.rows[0].hold_until) - 6) < 0.05, r);
r = await book(J2, 1, SOON); const soon = r.rows[0].ref;
check("Trip 2 days away: held ~2 hours", r.ok && Math.abs(hoursOf(r.rows[0].hold_until) - 2) < 0.05, r);
r = await book(J2, 1, day(3));
check("Boundary: trip exactly 3 days away gets the short 2-hour hold", r.ok && Math.abs(hoursOf(r.rows[0].hold_until) - 2) < 0.05, r);
r = await book(J3, 1, day(4));
check("Boundary: trip 4 days away gets the 6-hour hold", r.ok && Math.abs(hoursOf(r.rows[0].hold_until) - 6) < 0.05, r);
await q(`update app_settings set value = 8 where key = 'dp_hold_hours'`);
await db.exec(current);
r = await q(`select value::int v from app_settings where key='dp_hold_hours'`);
check("Changing the setting sticks, even after re-running schema.sql", r[0].v === 8, r);
r = await book(J3, 1);
check("...and the next booking uses it (8 hours)", r.ok && Math.abs(hoursOf(r.rows[0].hold_until) - 8) < 0.05, r);
const j3far = r.rows[0].ref;
await q(`update app_settings set value = 6 where key = 'dp_hold_hours'`);

// Release
check("Setup: 3 of 4 slots taken on the far date", (await left()) === 1, await left());
r = await book(J2, 2);
check("Full: another booking of 2 is refused", !r.ok && /Not enough slots/.test(r.err), r);
await lapse(far);
check("Hold lapses: its 2 slots are free immediately, before any job runs", (await left()) === 3, await left());
r = await as(J2, `select * from public.whos_going('a-trip','${FAR}')`);
check("...and it drops out of Who's going", r.ok && r.rows.length === 1, r);
r = await q(`select public.expire_holds() n`);
check("expire_holds marks it expired", r[0].n === 1 && (await status(far)).status === "expired", r);
check("...with expired_at = the deadline", (await status(far)).expired_at !== null);
r = await q(`select public.expire_holds() n`);
check("Running it again releases nothing more (exactly once)", r[0].n === 0 && (await left()) === 3, r);
r = await as(A, `select count(*)::int n from organizer_activity where kind='expired'`);
check("Organizer gets one 'expired' activity line", r.rows[0].n === 1, r);
console.log("      " + (await as(A, `select summary from organizer_activity where kind='expired'`)).rows[0].summary);

// Reference before / after expiry
r = await book(J1, 1); const b2 = r.rows[0].ref;
r = await as(J1, `select dp_reference, dp_sent_at from public.send_dp_reference('${b2}','  1012 345 678 ')`);
check("Joiner enters the reference just before the deadline: DP sent", r.ok && r.rows[0].dp_reference === "1012 345 678" && r.rows[0].dp_sent_at, r);
await lapse(b2);
await q(`select public.expire_holds()`);
check("...the clock stopped: past the deadline it still holds its slot and isn't expired", (await status(b2)).status === "confirmed" && (await left()) === 2, await left());
r = await as(J1, `select 1 from public.send_dp_reference('${b2}','1012 345 678')`);
r = await q(`select count(*)::int n from dp_reference_log where booking_ref=$1`, [b2]);
check("Same reference again: no new log entry", r[0].n === 1, r);
r = await as(J1, `select dp_reference from public.send_dp_reference('${b2}','1012 345 679')`);
r = await q(`select reference, previous from dp_reference_log where booking_ref=$1 order by id`, [b2]);
check("Changing it is logged with the previous value", r.length === 2 && r[1].previous === "1012 345 678", r);
r = await as(J1, `select 1 from public.send_dp_reference('${b2}','   ')`);
check("Clearing the reference is refused", !r.ok && /Enter the reference/.test(r.err), r);
r = await as(J1, `select 1 from public.send_dp_reference('${far}','5555')`);
check("Reference after expiry is refused with a clear message", !r.ok && /expired/.test(r.err), r);
console.log("      message: " + r.err);
r = await book(J1, 1); const b3 = r.rows[0].ref; await lapse(b3);
r = await as(J1, `select 1 from public.send_dp_reference('${b3}','5555')`);
check("Reference after the deadline but before the job ran is refused too", !r.ok && /expired/.test(r.err), r);
r = await as(J2, `select 1 from public.send_dp_reference('${b2}','9999')`);
check("Someone else can't send a reference for your booking", !r.ok, r);
r = await as(null, `select 1 from public.send_dp_reference('${b2}','9999')`, "anon");
check("Signed out can't", !r.ok, r);
r = await as(A, `select kind from organizer_activity where booking_ref='${b2}' order by id`);
check("Organizer sees 'booked' then 'dp_sent' (twice: sent, changed)", r.rows.map(x => x.kind).join() === "booked,dp_sent,dp_sent", r);

// Reminder after 24 h unconfirmed
await q(`update bookings set dp_sent_at = now() - interval '25 hours' where ref=$1`, [b2]);
await q(`select public.expire_holds()`); await q(`select public.expire_holds()`);
r = await as(A, `select count(*)::int n from organizer_activity where kind='reminder' and booking_ref='${b2}'`);
check("Unconfirmed 24 h after the reference: one reminder for the organizer", r.rows[0].n === 1, r);
r = await book(J2, 1, SOON); const b4 = r.rows[0].ref;
await as(J2, `select 1 from public.send_dp_reference('${b4}','777')`);
await as(A, `select 1 from public.record_dp_receipt(gen_random_uuid(),'${b4}',null,null,500,'GCash',now(),'Checked')`);
await q(`update bookings set dp_sent_at = now() - interval '25 hours' where ref=$1`, [b4]);
await q(`select public.expire_holds()`);
r = await as(A, `select count(*)::int n from organizer_activity where kind='reminder' and booking_ref='${b4}'`);
check("No reminder once the organizer recorded the DP", r.rows[0].n === 0, r);

// Paid after release: rebook or refund
r = await as(A, `select 1 from public.record_dp_receipt(gen_random_uuid(),'${far}',null,null,1000,'GCash',now(),'Paid late')`);
check("Organizer can record a DP on an expired booking (paid after release)", r.ok, r);
r = await as(C, `select 1 from public.rebook_expired('${far}')`);
check("Another organizer can't rebook it", !r.ok, r);
r = await as(J1, `select 1 from public.rebook_expired('${far}')`);
check("The joiner can't rebook it themselves", !r.ok, r);
r = await as(A, `select status from public.rebook_expired('${far}')`);
check("Owning organizer rebooks it while 2 slots remain", r.ok && r.rows[0].status === "confirmed" && (await left()) === 0, { r, left: await left() });
r = await as(A, `select status from public.rebook_expired('${far}')`);
check("Rebooking twice changes nothing more", r.ok && (await left()) === 0, r);
await lapse(j3far); await q(`select public.expire_holds()`);
r = await book(J2, 1);   // takes the slot j3far released
r = await as(A, `select 1 from public.rebook_expired('${j3far}')`);
check("No room left: rebooking is refused with a refund message", !r.ok && /Refund the DP/.test(r.err), r);
console.log("      message: " + r.err);

// Capacity guard and organizer view
r = await as(A, `update public.departures set capacity = 3 where trip_id='a-trip' and date='${FAR}'`);
check("Capacity guard counts held bookings (can't go below them)", !r.ok, r);
r = await as(A, `select status, hold_until, dp_reference from public.organizer_bookings() where ref='${j3far}'`);
check("Organizer list includes expired bookings with their hold fields", r.ok && r.rows[0]?.status === "expired" && r.rows[0].hold_until, r);
r = await as(null, `select key from public.app_settings`, "anon");
check("Anyone can read the hold settings (shown before booking)", r.ok && ["dp_hold_hours", "dp_hold_hours_soon", "dp_hold_soon_days", "dp_reminder_hours"].every(k => r.rows.some(x => x.key === k)), r);
r = await as(A, `update public.app_settings set value = 1`);
check("Nobody but the owner can change them", !r.ok, r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
