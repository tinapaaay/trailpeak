// TP-027 Separate booking, payment and refund states (ADR-005).
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "HEAD~1:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");

const db = new PGlite();
const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const J1 = "b0000000-0000-0000-0000-000000000001";
const J2 = "b0000000-0000-0000-0000-000000000002";
const CHECK = '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}';

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);

let pass = 0, fail = 0;
const check = (name, condition, details) => {
  condition ? pass++ : fail++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : "  -> " + JSON.stringify(details)}`);
};

const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid, sql, role = "authenticated") => {
  await db.exec(`select set_config('request.jwt.claim.sub','${uid || ""}',false); set role ${role};`);
  try {
    const r = await db.query(sql);
    return { ok: true, rows: r.rows, n: r.affectedRows };
  } catch (e) {
    return { ok: false, err: e.message };
  } finally {
    await db.exec("reset role");
  }
};

const day = n => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const FAR = day(20);

// Set up base schema with mock data
await db.exec(base);
for (const u of [A, B, J1, J2]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await q(`select approve_organizer('${A}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await q(`select approve_organizer('${B}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await q(`update profiles set name='Ana Booker' where id='${J1}'`);
await q(`update profiles set name='Ben Booker' where id='${J2}'`);

await as(A, `insert into public.trips (id, organizer_id, org_name, details, published, status)
  values ('trip-a','${A}','Org A','{"title":"Mt. Batulao","fee":1500,"dp":500}', true, 'published')`);
await as(A, `insert into public.departures (trip_id, date, capacity) values ('trip-a','${FAR}', 10)`);

// Legacy booking before upgrade
const legacyRes = await as(J1, `select ref from public.book_trip(
  'trip-a', '${FAR}', 2, 'Cubao', '3:00 AM', 'GCash', '', '', false,
  '[{"name":"Companion 1","age":"adult"}]'::jsonb,
  '{"name":"Emergency Contact","phone":"0917 111 2222"}'::jsonb
)`);
const legacyRef = legacyRes.rows[0].ref;

// Apply new schema twice to verify upgrade path and idempotence
await db.exec(current);
await db.exec(current);

// 1. Upgrade verification
const upgraded = (await q(`select ref, status, payment_status, refund_status from public.bookings where ref=$1`, [legacyRef]))[0];
check("Upgrade: existing booking gained default payment_status and refund_status",
  upgraded.payment_status === "none" && upgraded.refund_status === "none", upgraded);

const historyExists = await q(`select count(*) c from public.booking_state_history`);
check("Upgrade: booking_state_history table exists and is readable", historyExists[0].c !== undefined, historyExists);

// 2. Check initial slots
const initialSlots = (await q(`select public.slots_left('trip-a', '${FAR}') l`))[0].l;
check("Initial slots left: 8 (10 capacity - 2 booked)", initialSlots === 8, initialSlots);

// 3. Representing 'Cancelled with refund pending'
// Simulate DP confirmed by organizer
await as(A, `select * from public.transition_booking_state('${legacyRef}', null, 'confirmed', null, 'DP payment confirmed via GCash')`);
let state = (await q(`select status, payment_status, refund_status from public.bookings where ref=$1`, [legacyRef]))[0];
check("Payment confirmed on active booking", state.status === "confirmed" && state.payment_status === "confirmed", state);

// Joiner cancels booking 20 days in advance (>= 7 days policy)
const cancelRes = await as(J1, `select * from public.transition_booking_state('${legacyRef}', 'cancelled', null, 'pending', 'Cancelled >7 days before trip')`);
check("Joiner allowed to cancel own booking", cancelRes.ok, cancelRes.err);

state = (await q(`select status, payment_status, refund_status from public.bookings where ref=$1`, [legacyRef]))[0];
check("'Cancelled with refund pending' is representable",
  state.status === "cancelled" && state.refund_status === "pending" && state.payment_status === "confirmed", state);

// 4. Slots freed upon cancellation
const slotsAfterCancel = (await q(`select public.slots_left('trip-a', '${FAR}') l`))[0].l;
check("Slots restored to 10 after cancellation", slotsAfterCancel === 10, slotsAfterCancel);

// 5. Subsequent refund transition must NOT release slots twice!
const refundRes = await as(A, `select * from public.transition_booking_state('${legacyRef}', null, null, 'completed', 'Refund ₱1000 sent via GCash')`);
check("Organizer completes refund", refundRes.ok, refundRes.err);

state = (await q(`select status, payment_status, refund_status from public.bookings where ref=$1`, [legacyRef]))[0];
check("Refund status updated to completed", state.refund_status === "completed", state);

const slotsAfterRefund = (await q(`select public.slots_left('trip-a', '${FAR}') l`))[0].l;
check("Slots changes never released twice: slots remain 10 after refund completed", slotsAfterRefund === 10, slotsAfterRefund);

// 6. Audit history verified
const hist = await as(J1, `select * from public.booking_state_history where booking_ref='${legacyRef}' order by id asc`);
check("Audit history contains 3 transitions", hist.rows.length === 3, hist.rows.length);

const cancelEntry = hist.rows[1];
check("Cancellation entry records slots_affected = -2", cancelEntry.slots_affected === -2, cancelEntry);

const refundEntry = hist.rows[2];
check("Refund completion entry records slots_affected = 0 (no double release)", refundEntry.slots_affected === 0, refundEntry);
check("Cancellation records actor_role = 'joiner'", cancelEntry.actor_role === "joiner", cancelEntry);
check("Refund records actor_role = 'organizer'", refundEntry.actor_role === "organizer", refundEntry);

// 7. Security & actor permission tests
// Joiner 2 cannot modify Joiner 1's booking
const badJoiner = await as(J2, `select * from public.transition_booking_state('${legacyRef}', 'confirmed', null, null, 'hack')`);
check("Another joiner cannot transition booking state", !badJoiner.ok, badJoiner);

// Organizer B (not trip owner) cannot transition booking state
const badOrg = await as(B, `select * from public.transition_booking_state('${legacyRef}', null, null, 'declined', 'unauthorized')`);
check("Non-owning organizer cannot transition booking state", !badOrg.ok, badOrg);

// Signed out cannot call transition
const signedOut = await as(null, `select * from public.transition_booking_state('${legacyRef}', null, null, 'completed', 'anon')`, "anon");
check("Signed out cannot transition booking state", !signedOut.ok, signedOut);

// Organizer cannot revive cancelled booking
const revive = await as(A, `select * from public.transition_booking_state('${legacyRef}', 'confirmed', null, null, 'revive')`);
check("Cancelled booking cannot be revived", !revive.ok, revive);

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
