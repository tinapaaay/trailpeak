// TP-027 booking, payment and refund states (ADR-005). Upgrades from main (645658b) with real
// bookings in every state, runs the schema twice. Checks that the states follow the existing
// actions (no drift), the history, the per-role transition matrix and the seat invariants.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "645658b:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
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
// As the database owner (cron, SQL editor): no signed-in user.
const q = async (s, p) => { await db.exec("select set_config('request.jwt.claim.sub','',false)"); return (await db.query(s, p)).rows; };
const as = async (uid, sql, role = "authenticated") => { await db.exec(`select set_config('request.jwt.claim.sub','${uid || ""}',false); set role ${role};`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); } };
const CHECK = '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}';
const day = n => new Date(Date.now() + 8 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const FAR = day(30), SOON = day(3), PAST = day(-5);
const EM = `'{"name":"Mom","phone":"0917 000 0000"}'::jsonb`;
const book = async (uid, date = FAR, size = 1) => {
  const r = await as(uid, `select ref from public.book_trip('s-trip','${date}',${size},'Cubao','2 AM','GCash','','',false,'${JSON.stringify(Array.from({ length: size - 1 }, (_, i) => ({ name: "Friend " + i, age: "adult" })))}'::jsonb,${EM})`);
  if (!r.ok) throw Error(r.err); return r.rows[0].ref;
};
const st = async ref => (await q(`select status, payment_status, refund_status, size from bookings where ref=$1`, [ref]))[0];
const hist = async ref => q(`select * from booking_state_history where booking_ref=$1 order by id`, [ref]);
const receipt = (ref, amount, prev = "null") => as(ORG, `select * from public.record_dp_receipt(gen_random_uuid(), '${ref}', null, ${prev}, ${amount}, ${amount ? "'GCash'" : "null"}, ${amount ? "now()" : "null"}, 'test')`);
const tr = (uid, args, role = "authenticated") => as(uid, `select status, payment_status, refund_status from public.transition_booking_state(${args})`, role);
const lastReceipt = async ref => (await q(`select id from dp_receipts where booking_ref=$1 order by revision desc limit 1`, [ref]))[0]?.id;

// ---- Upgrade: bookings in every state on the old schema ----
await db.exec(base);
for (const u of [ORG, ORG2, J, K]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
for (const u of [ORG, ORG2]) await q(`select approve_organizer('${u}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await as(ORG, `insert into public.trips (id, organizer_id, org_name, details) values ('s-trip','${ORG}','Org S','{"title":"Mt. S","fee":1500,"dp":500}')`);
await as(ORG, `insert into public.departures (trip_id, date, capacity) values ('s-trip','${FAR}',10), ('s-trip','${SOON}',3), ('s-trip','${PAST}',10)`);
const oldNone = await book(J), oldSent = await book(J), oldPaid = await book(J), oldExpired = await book(K);
await as(J, `select public.send_dp_reference('${oldSent}', 'R1')`);
await as(J, `select public.send_dp_reference('${oldPaid}', 'R2')`);
await receipt(oldPaid, 500);
await q(`update bookings set hold_until = now() - interval '1 minute' where ref = '${oldExpired}'`);
await q(`select public.expire_holds()`);
await db.exec(current); await db.exec(current);
check("Backfill: no reference -> none", (await st(oldNone)).payment_status === "none");
check("Backfill: reference sent -> pending", (await st(oldSent)).payment_status === "pending");
check("Backfill: full DP recorded -> confirmed", (await st(oldPaid)).payment_status === "confirmed");
check("Backfill: expired hold -> failed", (await st(oldExpired)).payment_status === "failed" && (await st(oldExpired)).status === "expired");
check("Backfill writes no history for old rows", (await q(`select count(*)::int n from booking_state_history`))[0].n === 0);

// ---- No drift: the existing actions move the states and write history ----
const a = await book(J);
let h = await hist(a);
check("Booking: history row, +1 seat, by the joiner", h.length === 1 && h[0].to_booking_status === "confirmed" && h[0].slots_affected === 1 && h[0].actor_role === "joiner" && h[0].reason === "Booked", h);
await as(J, `select public.send_dp_reference('${a}', 'REF-A')`);
check("send_dp_reference -> payment pending", (await st(a)).payment_status === "pending");
await receipt(a, 200);
check("Partial DP recorded -> still pending (no extra history)", (await st(a)).payment_status === "pending" && (await hist(a)).length === 2);
await receipt(a, 500, `'${await lastReceipt(a)}'`);
h = await hist(a);
check("Full DP recorded -> confirmed, by the organizer", (await st(a)).payment_status === "confirmed" && h.at(-1).actor_role === "organizer" && h.at(-1).to_payment_status === "confirmed", h.at(-1));
await receipt(a, 0, `'${await lastReceipt(a)}'`);
check("DP record undone (0) -> back to pending", (await st(a)).payment_status === "pending");
await receipt(a, 500, `'${await lastReceipt(a)}'`);

const e1 = await book(K);
await q(`update bookings set hold_until = now() - interval '1 minute' where ref = '${e1}'`);
await q(`select public.expire_holds()`);
h = await hist(e1);
check("expire_holds -> expired + failed, by the system, records the -1 seat the lapse freed", (await st(e1)).payment_status === "failed" && h.at(-1).actor_role === "system" && h.at(-1).slots_affected === -1, h.at(-1));

// ---- Blocking 1: reviving an expired booking goes through rebook_expired (seats checked) ----
await q(`update departures set capacity = (select coalesce(sum(size),0) from bookings where trip_id='s-trip' and date='${FAR}' and public.booking_holds_seat(status, hold_until, dp_sent_at)) where trip_id='s-trip' and date='${FAR}'`);
let r = await tr(ORG, `'${e1}', p_to_booking => 'confirmed'`);
check("Organizer can't revive an expired booking when the date is full", !r.ok && /room|slots/i.test(r.err) && (await st(e1)).status === "expired", r);
await q(`update departures set capacity = 10 where trip_id='s-trip' and date='${FAR}'`);
r = await tr(ORG, `'${e1}', p_to_booking => 'confirmed'`);
h = await hist(e1);
check("With room: revived through rebook_expired, +1 seat, payment back to none", r.ok && r.rows[0].status === "confirmed" && r.rows[0].payment_status === "none" && h.at(-1).slots_affected === 1 && h.at(-1).actor_role === "organizer", { r, h: h.at(-1) });
check("Revive also leaves rebook_expired's activity entry", (await q(`select count(*)::int n from organizer_activity where booking_ref='${e1}' and kind='rebooked'`))[0].n === 1);
r = await tr(K, `'${e1}', p_to_booking => 'confirmed'`);
check("A joiner can't revive", !r.ok, r);
r = await tr(ORG, `'${a}', p_to_booking => 'cancelled'`);
check("Organizer can't cancel through this (Release slots or date cancel only)", !r.ok && /isn't allowed/.test(r.err), r);
r = await tr(ORG, `'${a}', p_to_booking => 'completed'`);
check("'completed' isn't a stored booking status", !r.ok, r);

// ---- Blocking 2: joiners never set a refund ----
const late = await book(J, SOON);
await as(J, `select public.send_dp_reference('${late}', 'REF-L')`); await receipt(late, 500);
r = await tr(J, `'${late}', p_to_refund => 'pending'`);
check("Joiner can't set refund pending", !r.ok && /organizer or TrailPeak support/.test(r.err) && (await st(late)).refund_status === "none", r);
r = await tr(J, `'${late}', p_to_payment => 'confirmed'`);
check("Nobody sets payment status by hand", !r.ok && /follows the DP/.test(r.err), r);

// ---- Blocking 4 + refund policy: cancelling goes through cancel_booking ----
r = await tr(J, `'${late}', p_to_booking => 'cancelled', p_reason => 'Sick'`);
let s = await st(late); h = await hist(late);
check("Late cancel (3 days before), DP confirmed -> refund none (DP kept)", r.ok && s.status === "cancelled" && s.refund_status === "none", s);
check("History: joiner, -1 seat, the joiner's reason", h.at(-1).actor_role === "joiner" && h.at(-1).slots_affected === -1 && h.at(-1).reason === "Sick", h.at(-1));
check("cancel_booking's note and activity still happen", /You cancelled/.test((await q(`select note from bookings where ref='${late}'`))[0].note)
  && (await q(`select count(*)::int n from organizer_activity where booking_ref='${late}' and kind='cancelled'`))[0].n === 1);
r = await tr(J, `'${late}', p_to_booking => 'cancelled'`);
check("Cancelling twice is refused, seats never released twice", !r.ok && (await hist(late)).filter(x => x.slots_affected < 0).length === 1, r);

const early = await book(J);
await as(J, `select public.send_dp_reference('${early}', 'REF-E')`); await receipt(early, 500);
await as(J, `select public.cancel_booking('${early}')`);          // the old path, not the new function
check("Early cancel through plain cancel_booking -> refund pending (no drift)", (await st(early)).refund_status === "pending" && (await hist(early)).at(-1).to_refund_status === "pending");
const unpaid = await book(J);
await as(J, `select public.cancel_booking('${unpaid}')`);
check("Unpaid cancel -> refund none", (await st(unpaid)).refund_status === "none");

const old = await book(J);
await q(`update bookings set date = '${PAST}' where ref = '${old}'`);
r = await tr(J, `'${old}', p_to_booking => 'cancelled'`);
check("Past date can't be cancelled (cancel_booking's rule)", !r.ok && /passed/.test(r.err) && (await st(old)).status === "confirmed", r);

// ---- Refund decisions: the per-role matrix ----
r = await tr(ORG, `'${early}', p_to_refund => 'completed'`);
check("Organizer marks refund sent: needs a reason", !r.ok && /reason/.test(r.err), r);
r = await tr(ORG2, `'${early}', p_to_refund => 'completed', p_reason => 'x'`);
check("Another organizer can't", !r.ok && /not found/.test(r.err), r);
r = await tr(null, `'${early}', p_to_refund => 'completed', p_reason => 'x'`, "anon");
check("Signed out can't", !r.ok, r);
r = await tr(ORG, `'${early}', p_to_refund => 'completed', p_reason => 'GCash ref 9876'`);
h = await hist(early);
check("pending -> completed by the organizer, reason kept, 0 seats", r.ok && r.rows[0].refund_status === "completed" && h.at(-1).actor_role === "organizer" && h.at(-1).reason === "GCash ref 9876" && h.at(-1).slots_affected === 0, h.at(-1));
r = await tr(ORG, `'${early}', p_to_refund => 'pending', p_reason => 'oops'`);
check("completed -> pending refused", !r.ok && /isn't allowed/.test(r.err), r);
r = await tr(ORG, `'${unpaid}', p_to_refund => 'completed', p_reason => 'x'`);
check("none -> completed refused (nothing owed)", !r.ok, r);
r = await tr(ORG, `'${a}', p_to_refund => 'pending', p_reason => 'x'`);
check("Organizer can't open a refund on an active booking", !r.ok, r);

// Organizer releases a paid overdue booking: the refund is owed (pending), by the organizer
const ov = await book(K, SOON, 2);
await as(K, `select public.send_dp_reference('${ov}', 'REF-O')`); await receipt(ov, 1000);
await q(`update bookings set companions = '[]'::jsonb where ref = '${ov}'`);
r = await as(ORG, `select status from public.release_overdue_booking('${ov}', 'Names not in', true)`);
s = await st(ov); h = await hist(ov);
check("Organizer release of a paid booking -> refund pending, by the organizer, -2 seats", r.ok && s.status === "cancelled" && s.refund_status === "pending" && h.at(-1).actor_role === "organizer" && h.at(-1).slots_affected === -2, { r, s, h: h.at(-1) });
r = await tr(ORG, `'${ov}', p_to_refund => 'declined', p_reason => 'Policy: no refund within 3 days'`);
check("pending -> declined by the organizer", r.ok && r.rows[0].refund_status === "declined", r);

// Support (SQL editor): reopen a declined refund
r = await q(`select refund_status from public.transition_booking_state('${ov}', p_to_refund => 'pending', p_reason => 'Dispute #12: organizer agreed')`).then(rows => ({ ok: true, rows }), e => ({ ok: false, err: e.message }));
h = await hist(ov);
check("Support reopens declined -> pending, recorded as support", r.ok && r.rows[0].refund_status === "pending" && h.at(-1).actor_role === "support", { r, h: h.at(-1) });
r = await tr(ORG, `'${ov}', p_to_refund => 'pending', p_reason => 'x'`);
check("Organizer can't reopen (support only)", !r.ok, r);

// DP confirmed after a cancel (they crossed): refund owed
const crossed = await book(K);
await as(K, `select public.send_dp_reference('${crossed}', 'REF-X')`);
await as(K, `select public.cancel_booking('${crossed}')`);
check("Cancelled with DP only pending -> refund none", (await st(crossed)).refund_status === "none");
await receipt(crossed, 500);
check("DP then confirmed on the cancelled booking -> refund pending", (await st(crossed)).payment_status === "confirmed" && (await st(crossed)).refund_status === "pending");

// ---- History: append-only, visible to the booker and organizer only ----
r = await as(J, `select count(*)::int n from public.booking_state_history`);
const mine = (await q(`select count(*)::int n from booking_state_history h join bookings b on b.ref = h.booking_ref where b.user_id = '${J}'`))[0].n;
check("Joiner reads their own bookings' history only", r.ok && r.rows[0].n === mine, r);
r = await as(ORG2, `select count(*)::int n from public.booking_state_history`);
check("Another organizer reads none", r.ok && r.rows[0].n === 0, r);
r = await as(null, `select * from public.booking_state_history`, "anon");
check("Signed out: denied", !r.ok, r);
r = await as(ORG, `delete from public.booking_state_history`);
check("No deletes", !r.ok && /permission denied/.test(r.err), r);
r = await as(J, `insert into public.booking_state_history (booking_ref, to_booking_status, to_payment_status, to_refund_status, actor_role) values ('${a}','confirmed','none','none','joiner')`);
check("No hand-written history", !r.ok && /permission denied/.test(r.err), r);

// ---- Seat invariant: per booking, the history's seats add up to what it holds now ----
const bad = await q(`select b.ref, b.size, public.booking_holds_seat(b.status, b.hold_until, b.dp_sent_at) held, sum(h.slots_affected)::int total
  from bookings b join booking_state_history h on h.booking_ref = b.ref
  where exists (select 1 from booking_state_history x where x.booking_ref = b.ref and x.reason = 'Booked')
  group by b.ref, b.size, b.status, b.hold_until, b.dp_sent_at
  having sum(h.slots_affected) <> case when public.booking_holds_seat(b.status, b.hold_until, b.dp_sent_at) then b.size else 0 end`);
check("Seats in history match seats held, for every booking made after the upgrade", bad.length === 0, bad);

await db.exec(current);
check("Running the schema again keeps states and history", (await st(early)).refund_status === "completed" && (await hist(early)).length >= 4);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
