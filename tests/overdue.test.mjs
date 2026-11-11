// TP-016 overdue joiner details (ADR-008). Upgrades from main (8392957), runs the schema twice.
// "The due date arrives" is simulated by raising app_settings.details_due_days.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "8392957:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const D = "d0000000-0000-0000-0000-00000000000d", E = "e0000000-0000-0000-0000-00000000000e", J = "a0000000-0000-0000-0000-00000000000a";
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
const D20 = day(20), D40 = day(40);
const EM = `'{"name":"Mom","phone":"0917 000 0000"}'::jsonb`;
const names = k => `'${JSON.stringify(Array.from({ length: k }, (_, i) => ({ name: "Friend " + i, age: "adult" })))}'::jsonb`;
const book = (date, size, k) => as(J, `select ref from public.book_trip('d-trip','${date}',${size},'Cubao','2 AM','GCash','','',false,${names(k)},${EM})`);
const left = async (date = D20) => (await q(`select public.slots_left('d-trip','${date}') l`))[0].l;
const setDue = n => q(`update app_settings set value = ${n} where key = 'details_due_days'`);

await db.exec(base);
for (const u of [D, E, J]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
for (const u of [D, E]) await q(`select approve_organizer('${u}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await q(`update profiles set name='Ana Reyes' where id='${J}'`);
await as(D, `insert into public.trips (id, organizer_id, org_name, details) values ('d-trip','${D}','Org D','{"title":"Mt. D","fee":1500,"dp":500}')`);
await as(D, `insert into public.departures (trip_id, date, capacity) values ('d-trip','${D20}',10), ('d-trip','${D40}',10)`);
await db.exec(current); await db.exec(current);

// Bookings made while names could still wait
const partial = (await book(D20, 3, 1)).rows[0].ref;      // 1 of 2 names
const complete = (await book(D20, 2, 1)).rows[0].ref;     // all names
const whole = (await book(D20, 2, 0)).rows[0].ref;        // 0 of 1 names
const far = (await book(D40, 3, 0)).rows[0].ref;          // due later
const lapsed = (await book(D20, 2, 0)).rows[0].ref;
await q(`update bookings set hold_until = now() - interval '1 minute' where ref=$1`, [lapsed]);
await as(J, `select 1 from public.send_dp_reference('${partial}','R1')`);
await as(J, `select 1 from public.send_dp_reference('${whole}','R2')`);
await as(D, `select 1 from public.record_dp_receipt(gen_random_uuid(),'${whole}',null,null,500,'GCash',now(),'Checked')`);
check("Before the due date: nothing flagged", (await q(`select public.flag_overdue_details() n`))[0].n === 0);
r = await as(D, `select 1 from public.release_overdue_booking('${partial}','No names',false)`);
check("Before the due date: release refused", !r.ok && /aren't due yet/.test(r.err), r);
var r;

// The due date arrives for D20 (25 days before covers D20 but not D40)
await setDue(25);
await q(`select public.expire_holds()`);
r = await q(`select ref from bookings where details_alerted_at is not null order by ref`);
check("Due date: the two incomplete active bookings are flagged (not the complete, far, or lapsed ones)", JSON.stringify(r.map(x => x.ref).sort()) === JSON.stringify([partial, whole].sort()), r);
await q(`select public.expire_holds()`);
r = await as(D, `select booking_ref, summary from public.organizer_activity where kind='details_overdue' order by id`);
check("One alert per booking for the organizer, even when the job runs again", r.ok && r.rows.length === 2, r);
console.log("      alert: " + r.rows.find(x => x.booking_ref === partial)?.summary);
r = await as(E, `select * from public.organizer_activity where kind='details_overdue'`);
check("Another organizer sees no alerts", r.ok && r.rows.length === 0, r);
r = await as(D, `select ref, details_missing from public.organizer_overdue() order by ref`);
check("Organizer list of overdue bookings with what's missing", r.ok && r.rows.length === 2 && r.rows.find(x => x.ref === partial).details_missing[0].count === 1, r);
r = await as(E, `select * from public.organizer_overdue()`);
check("...empty for another organizer", r.ok && r.rows.length === 0, r);
r = await as(null, `select * from public.organizer_overdue()`, "anon");
check("...denied signed out", !r.ok, r);
r = await as(J, `select public.booking_details_missing(companions, size, emergency, booker) m from public.bookings where ref='${partial}'`);
check("The booker can read exactly what's missing on their booking", r.ok && JSON.stringify(r.rows[0].m) === '[{"item":"names","count":1}]', r);
r = await q(`select public.missing_details_text('[{"item":"names","count":2},{"item":"emergency"},{"item":"guardian"}]'::jsonb) t`);
check("Missing items read as words", r[0].t === "2 joiners' names, the emergency contact, a guardian for someone under 18", r);

// Release
const before = await left();
r = await as(E, `select 1 from public.release_overdue_booking('${partial}','x',false)`);
check("Another organizer can't release", !r.ok, r);
r = await as(J, `select 1 from public.release_overdue_booking('${partial}','x',false)`);
check("The joiner can't", !r.ok, r);
r = await as(null, `select 1 from public.release_overdue_booking('${partial}','x',false)`, "anon");
check("Signed out can't", !r.ok, r);
r = await as(D, `select 1 from public.release_overdue_booking('${partial}','  ',false)`);
check("A reason is required", !r.ok && /reason/.test(r.err), r);
r = await as(D, `select size, dp, balance, status, size_released, release_reason from public.release_overdue_booking('${partial}','No reply on Messenger',false)`);
check("Release the unnamed slot only: booking shrinks 3 → 2 and keeps going", r.ok && r.rows[0].size === 2 && r.rows[0].status === "confirmed" && r.rows[0].size_released === 1, r);
check("...DP and balance rescale (₱1,000 / ₱2,000)", r.rows[0]?.dp === 1000 && r.rows[0]?.balance === 2000, r.rows[0]);
check("...exactly 1 slot opens", (await left()) === before + 1, { before, now: await left() });
r = await as(D, `select 1 from public.release_overdue_booking('${partial}','again',false)`);
check("Releasing again is refused (details now complete)", !r.ok && /complete/.test(r.err), r);
r = await as(D, `select 1 from public.release_overdue_booking('${complete}','x',true)`);
check("A complete booking can't be released this way", !r.ok, r);
await q(`update bookings set emergency = null where ref=$1`, [whole]);
r = await as(D, `select 1 from public.release_overdue_booking('${whole}','x',false)`);
check("Emergency contact missing: only a whole release is possible", !r.ok && /whole booking/.test(r.err), r);
const b2 = await left();
r = await as(D, `select status, note from public.release_overdue_booking('${whole}','Unreachable',true)`);
check("Whole release cancels the booking and frees its 2 slots", r.ok && r.rows[0].status === "cancelled" && (await left()) === b2 + 2, { r, left: await left() });
console.log("      joiner sees: " + r.rows[0]?.note);
r = await as(D, `select amount from public.dp_receipts where booking_ref='${whole}'`);
check("The recorded DP is untouched (refund tracking stays separate)", r.ok && r.rows.length === 1 && r.rows[0].amount === 500, r);
r = await as(D, `select kind from public.organizer_activity where kind='released'`);
check("Both releases are in the organizer's activity", r.ok && r.rows.length === 2, r);
r = await as(J, `select ref, status, note from public.bookings where ref in ('${partial}','${whole}') order by ref`);
check("The joiner sees both notes in their bookings", r.ok && r.rows.every(x => /released/i.test(x.note)), r);
r = await as(D, `select 1 from public.release_overdue_booking('${far}','x',true)`);
check("The far booking (due later) can't be released yet", !r.ok, r);

// Fixing details clears the overdue state
await setDue(45);
const farRow = (await q(`select ref from bookings where ref=$1`, [far]))[0];
r = await as(J, `select 1 from public.update_booking_details('${far}',${names(2)},${EM})`);
r = await as(D, `select ref from public.organizer_overdue() where ref='${far}'`);
check("Once the booker adds every name, the booking leaves the overdue list", r.ok && r.rows.length === 0, r);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
