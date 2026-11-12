// TP-013 last-slot safety under real concurrency. PGlite has one connection, so this test needs a
// real, disposable Postgres: DATABASE_URL=postgres://… node race.test.mjs (CI starts one). It
// rebuilds the schema from scratch, so never point it at a database you care about.
// Every scenario uses its own synthetic departure and runs requests on separate connections.
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const URL = process.env.DATABASE_URL;
if (!URL) { console.log("race.test.mjs skipped: set DATABASE_URL to a disposable Postgres to run the concurrency tests."); process.exit(0); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");

const admin = new pg.Client({ connectionString: URL }); await admin.connect();
await admin.query(`drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;`);
await admin.query(schema);

const ORG = "d0000000-0000-0000-0000-00000000000d";
const joiners = Array.from({ length: 16 }, (_, i) => `a0000000-0000-0000-0000-0000000000${String(i + 10).padStart(2, "0")}`);
for (const u of [ORG, ...joiners]) await admin.query(`insert into auth.users (id) values ($1)`, [u]);
await admin.query(`select approve_organizer($1, p_approver => 'Race test', p_checklist => '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}')`, [ORG]);
for (const u of joiners) await admin.query(`update profiles set name = 'Joiner ' || right($1::text, 2) where id = $1`, [u]);
await admin.query(`insert into trips (id, organizer_id, org_name, details) values ('race-trip', $1, 'Race Org', '{"title":"Race","fee":1500,"dp":500}')`, [ORG]);

let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
// A connection signed in as `uid` (Supabase's authenticated role), like a browser session.
async function session(uid) {
  const c = new pg.Client({ connectionString: URL }); await c.connect();
  await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]); await c.query(`set role authenticated`);
  return c;
}
const settle = p => p.then(r => ({ ok: true, rows: r.rows }), e => ({ ok: false, err: e.message }));
let dayN = 40; const nextDate = () => new Date(Date.now() + 8 * 3600e3 + (dayN++) * 864e5).toISOString().slice(0, 10);
async function departure(capacity) { const d = nextDate(); await admin.query(`insert into departures (trip_id, date, capacity) values ('race-trip', $1, $2)`, [d, capacity]); return d; }
const names = k => JSON.stringify(Array.from({ length: k }, (_, i) => ({ name: "Friend " + i, age: "adult" })));
const bookSql = `select ref from public.book_trip('race-trip', $1, $2, 'Cubao', '2 AM', 'GCash', '', '', false, $3::jsonb, '{"name":"Mom","phone":"0917 000 0000"}'::jsonb)`;
const book = (c, date, size) => settle(c.query(bookSql, [date, size, names(size - 1)]));
const outside = (c, date, size, req) => settle(c.query(`select id from public.add_outside_booking($1, 'race-trip', $2, 'Walk-in', $3, 'Cubao', '2 AM', 'messenger', null)`, [req || crypto.randomUUID(), date, size]));
// Raw occupancy: rows that hold seats, counted directly (not the clamped slots_left).
async function occupancy(date) {
  const r = await admin.query(`select d.capacity,
      coalesce((select sum(size) from bookings b where b.trip_id = d.trip_id and b.date = d.date and booking_holds_seat(b.status, b.hold_until, b.dp_sent_at)), 0)::int
      + coalesce((select sum(size) from outside_bookings o where o.trip_id = d.trip_id and o.date = d.date and o.status = 'confirmed'), 0)::int + d.sample_booked as taken
    from departures d where trip_id = 'race-trip' and date = $1`, [date]);
  return r.rows[0];
}
const pool = []; const S = async i => (pool[i] ||= await session(joiners[i]));
const org = await session(ORG), org2 = await session(ORG);

// 1. Two online groups of 2 race for the last 2 seats (repeated)
let ok1 = true, msg1 = "";
for (let k = 0; k < 10; k++) {
  const d = await departure(4); await book(await S(0), d, 2);
  const [a, b] = await Promise.all([book(await S(1), d, 2), book(await S(2), d, 2)]);
  const o = await occupancy(d), wins = [a, b].filter(x => x.ok).length;
  if (wins !== 1 || o.taken > o.capacity) ok1 = false;
  msg1 = [a, b].find(x => !x.ok)?.err || msg1;
}
check("Online vs online for the last 2 seats (x10): exactly one wins, never over capacity", ok1);
check("...the loser gets a clear message", /Not enough slots left/.test(msg1), msg1);

// 2. Proof the requests really overlap: A holds the date's lock in an open transaction; B waits for it.
{
  const d = await departure(2); const A = await S(3), B = await S(4);
  await A.query("begin"); await A.query(bookSql, [d, 2, names(1)]);
  let bDone = false; const bp = book(B, d, 2).then(r => { bDone = true; return r; });
  await new Promise(r => setTimeout(r, 400));
  check("B's booking waits while A's booking holds the date (real lock, not luck)", !bDone);
  await A.query("commit"); const b = await bp;
  check("...and once A commits, B is refused", !b.ok && /Not enough slots/.test(b.err), b);
}

// 3. Outside booking vs online booking, and two outside bookings (repeated)
let ok3 = true, ok4 = true;
for (let k = 0; k < 10; k++) {
  const d = await departure(4); await book(await S(0), d, 2);
  const r = await Promise.all([outside(org, d, 2), book(await S(5), d, 2)]);
  const o = await occupancy(d); if (r.filter(x => x.ok).length !== 1 || o.taken > o.capacity) ok3 = false;
  const d2 = await departure(3);
  const r2 = await Promise.all([outside(org, d2, 2), outside(org2, d2, 2)]);
  const o2 = await occupancy(d2); if (r2.filter(x => x.ok).length !== 1 || o2.taken > o2.capacity) ok4 = false;
}
check("Outside vs online for the last 2 seats (x10): exactly one wins", ok3);
check("Two outside bookings for 3 seats, 2 each (x10): exactly one wins", ok4);

// 4. Same submission sent twice at once: one booking, seats counted once
let ok5 = true;
for (let k = 0; k < 10; k++) {
  const d = await departure(6), req = crypto.randomUUID();
  const r = await Promise.all([outside(org, d, 2, req), outside(org2, d, 2, req)]);
  const n = (await admin.query(`select count(*)::int n from outside_bookings where request_id = $1`, [req])).rows[0].n;
  const o = await occupancy(d); if (!r.every(x => x.ok) || n !== 1 || o.taken !== 2) ok5 = false;
}
check("Outside: the same request sent twice at once (x10) makes one booking and uses 2 seats once", ok5);
let ok5b = true, d5b = null;
for (let k = 0; k < 5; k++) {
  const d = await departure(6), req = crypto.randomUUID(), J = await S(6);
  const sql = `select ref from public.book_trip('race-trip', $1, 2, 'Cubao', '2 AM', 'GCash', '', '', false, $2::jsonb, '{"name":"Mom","phone":"0917 000 0000"}'::jsonb, null, $3)`;
  const r = await Promise.all([settle(J.query(sql, [d, names(1), req])), settle((await S(6)).query(sql, [d, names(1), req]))]);
  const n = (await admin.query(`select count(*)::int n from bookings where date = $1`, [d])).rows[0].n;
  if (!r.every(x => x.ok) || n !== 1 || r[0].rows[0].ref !== r[1].rows[0].ref) { ok5b = false; d5b = { r, n }; }
}
check("Online: the same request sent twice at once (x5) makes one booking with one reference", ok5b, d5b);

// 5. Groups that both fit both succeed
{
  const d = await departure(4);
  const r = await Promise.all([book(await S(7), d, 2), book(await S(8), d, 2)]);
  const o = await occupancy(d);
  check("Two groups of 2 for 4 open seats: both confirm, 4 of 4 taken", r.every(x => x.ok) && o.taken === 4, { r, o });
}

// 6. Booking vs capacity edit, and booking vs closing the date
let ok6 = true;
for (let k = 0; k < 10; k++) {
  const d = await departure(4); await book(await S(0), d, 2);
  const r = await Promise.all([book(await S(9), d, 2), settle(org.query(`update departures set capacity = 2 where trip_id = 'race-trip' and date = $1`, [d]))]);
  const o = await occupancy(d); if (r.filter(x => x.ok).length !== 1 || o.taken > o.capacity) ok6 = false;
}
check("Booking 2 vs lowering capacity to 2 (x10): exactly one goes through, never over capacity", ok6);
{
  const d = await departure(4);
  await org.query("begin"); await org.query(`update departures set status = 'closed' where trip_id = 'race-trip' and date = $1`, [d]);
  let done = false; const bp = book(await S(10), d, 1).then(r => { done = true; return r; });
  await new Promise(r => setTimeout(r, 400));
  check("A booking waits while the organizer is closing the date", !done);
  await org.query("commit"); const b = await bp;
  check("...and is refused once the date is closed", !b.ok && /not open/.test(b.err), b);
}

// 7. Expiry vs reference: A's hold lapses while B books the freed seat
{
  const d = await departure(2); const A = await S(11), B = await S(12);
  const ref = (await book(A, d, 2)).rows[0].ref;
  await admin.query(`update bookings set hold_until = clock_timestamp() + interval '700 milliseconds' where ref = $1`, [ref]);
  // A opens a transaction before the deadline and sends the reference only after it (a slow connection).
  await A.query("begin"); await A.query("select now()");
  await new Promise(r => setTimeout(r, 900));
  const b = await book(B, d, 2);                  // seat is free now: B takes it
  const a = await settle(A.query(`select ref from public.send_dp_reference($1, 'LATE-123')`, [ref]));
  await A.query(a.ok ? "commit" : "rollback");
  const o = await occupancy(d);
  check("Hold lapses and B takes the seat: A's late reference is refused", b.ok && !a.ok && /expired/.test(a.err), { a, b });
  check("...never over capacity (2 of 2)", o.taken <= o.capacity, o);
}
{
  // Same race, but the freed seat goes to an outside booking (that path doesn't tidy expired holds first).
  const d = await departure(2); const A = await S(11);
  const ref = (await book(A, d, 2)).rows[0].ref;
  await admin.query(`update bookings set hold_until = clock_timestamp() + interval '700 milliseconds' where ref = $1`, [ref]);
  await A.query("begin"); await A.query("select now()");
  await new Promise(r => setTimeout(r, 900));
  const b = await outside(org, d, 2);
  const a = await settle(A.query(`select ref from public.send_dp_reference($1, 'LATE-456')`, [ref]));
  await A.query(a.ok ? "commit" : "rollback");
  const o = await occupancy(d);
  check("Hold lapses and an outside booking takes the seat: A's late reference is refused", b.ok && !a.ok, { a, b });
  check("...never over capacity", o.taken <= o.capacity, o);
}
{
  const d = await departure(2); const A = await S(13), B = await S(14);
  const ref = (await book(A, d, 2)).rows[0].ref;
  await admin.query(`update bookings set hold_until = clock_timestamp() + interval '1 second' where ref = $1`, [ref]);
  await (await S(13)).query(`select ref from public.send_dp_reference($1, 'ON-TIME-1')`, [ref]);   // in time
  await new Promise(r => setTimeout(r, 1200));
  const [b] = await Promise.all([book(B, d, 2), settle(admin.query(`select expire_holds()`))]);
  const st = (await admin.query(`select status from bookings where ref = $1`, [ref])).rows[0].status;
  check("Reference sent in time: the hold survives the deadline and the expiry job; B is refused", !b.ok && st === "confirmed", { b, st });
}

// 8. Two receipt saves from the same screen: one wins, the other is told to refresh
{
  const d = await departure(4); const ref = (await book(await S(15), d, 2)).rows[0].ref;
  const save = c => settle(c.query(`select id from public.record_dp_receipt(gen_random_uuid(), $1, null, null, 1000, 'GCash', now(), 'Checked')`, [ref]));
  const r = await Promise.all([save(org), save(org2)]);
  const n = (await admin.query(`select count(*)::int n from dp_receipts where booking_ref = $1`, [ref])).rows[0].n;
  check("Two receipt saves at once from the same screen: one saved, the other asked to refresh", r.filter(x => x.ok).length === 1 && n === 1 && /Refresh/.test(r.find(x => !x.ok)?.err || ""), r);
}

// 9. Rebook a late payer vs a new booking for the same last seats
let ok9 = true;
for (let k = 0; k < 5; k++) {
  const d = await departure(2); const ref = (await book(await S(0), d, 2)).rows[0].ref;
  await admin.query(`update bookings set hold_until = now() - interval '1 minute' where ref = $1`, [ref]);
  await admin.query(`select expire_holds()`);
  const r = await Promise.all([settle(org.query(`select status from public.rebook_expired($1)`, [ref])), book(await S(1), d, 2)]);
  const o = await occupancy(d); if (r.filter(x => x.ok).length !== 1 || o.taken > o.capacity) ok9 = false;
}
check("Rebooking a late payer vs a new booking for the last 2 seats (x5): exactly one wins", ok9);

// 10. Burst: 12 sessions, mixed online and outside, random sizes, 10 seats (repeated)
let ok10 = true, detail10 = [];
for (let k = 0; k < 5; k++) {
  const d = await departure(10);
  const reqs = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
    const size = 1 + ((i * 7 + k) % 3);
    return i % 3 === 0 ? { size, r: await outside(i % 2 ? org : org2, d, size) } : { size, r: await book(await S(i), d, size) };
  }));
  const won = reqs.filter(x => x.r.ok).reduce((a, x) => a + x.size, 0), o = await occupancy(d);
  detail10.push(`${won}/${o.capacity}`);
  if (o.taken > o.capacity || won !== o.taken) ok10 = false;
}
check(`Bursts of 12 mixed requests into 10 seats (x5): seats taken = seats won, never over capacity [${detail10.join(", ")}]`, ok10);

// 11. TP-027: reviving an expired booking through transition_booking_state vs a new booking for
// the last 2 seats (repeated). Revival must take the seat-checked path.
let ok11 = true;
for (let k = 0; k < 5; k++) {
  const d = await departure(4);
  await book(await S(2), d, 2);
  const ref = (await book(await S(3), d, 2)).rows[0].ref;
  await admin.query(`update bookings set hold_until = now() - interval '1 minute' where ref = $1`, [ref]);
  await admin.query(`select expire_holds()`);
  const r = await Promise.all([settle(org.query(`select status from public.transition_booking_state($1, p_to_booking => 'confirmed')`, [ref])), book(await S(4), d, 2)]);
  const o = await occupancy(d); if (r.filter(x => x.ok).length !== 1 || o.taken > o.capacity) ok11 = false;
}
check("Reviving an expired booking via transition_booking_state vs a new booking for the last 2 seats (x5): one wins, never over", ok11);

// 12. TP-027: the joiner cancels while the organizer records the full DP (repeated). Whatever the
// order, a cancelled booking with a confirmed DP (cancelled weeks ahead) ends with a refund owed,
// and the history holds exactly one seat release.
let ok12 = true, detail12 = [];
for (let k = 0; k < 5; k++) {
  const d = await departure(10), j = await S(5 + k);
  const ref = (await book(j, d, 1)).rows[0].ref;
  await j.query(`select public.send_dp_reference($1, 'R-' || $2)`, [ref, k]);
  await Promise.all([
    settle(j.query(`select status from public.transition_booking_state($1, p_to_booking => 'cancelled')`, [ref])),
    settle(org.query(`select * from public.record_dp_receipt(gen_random_uuid(), $1, null, null, 500, 'GCash', now(), 'race')`, [ref]))]);
  const b = (await admin.query(`select status, payment_status, refund_status from bookings where ref = $1`, [ref])).rows[0];
  const rel = (await admin.query(`select count(*)::int n from booking_state_history where booking_ref = $1 and slots_affected < 0`, [ref])).rows[0].n;
  detail12.push(`${b.status}/${b.payment_status}/${b.refund_status}`);
  if (b.status !== "cancelled" || b.payment_status !== "confirmed" || b.refund_status !== "pending" || rel !== 1) ok12 = false;
}
check(`Cancel vs DP recorded at the same moment (x5): ends cancelled, DP confirmed, refund pending, one seat release [${[...new Set(detail12)].join(", ")}]`, ok12);

for (const c of [...pool.filter(Boolean), org, org2]) await c.end();
await admin.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
