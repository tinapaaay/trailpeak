// TP-017 hiker lists and data retention. Upgrades from main (1343bfa), runs the schema twice.
// Checks who can read emergency contacts and joiner details straight through the database, and
// the 30-day deletion at its boundary (trip date + 30 is the last day details are kept).
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "1343bfa:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
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
const EM = `'{"name":"Mom","relation":"mother","phone":"0917 000 0000"}'::jsonb`;
const PEOPLE = `'[{"name":"Ben Cruz","age":"adult","phone":"0917 111 2222"},{"name":"Cara Cruz","age":"minor","guardian":2,"relation":"parent"}]'::jsonb`;

// Old schema, with a booking already 31 days past (data from before this update)
await db.exec(base);
for (const u of [ORG, ORG2, J, K]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
for (const u of [ORG, ORG2]) await q(`select approve_organizer('${u}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await q(`update profiles set name='Ana Reyes', phone='0917 000 1111' where id='${J}'`);
await q(`update profiles set name='Kit Santos' where id='${K}'`);
await as(ORG, `insert into public.trips (id, organizer_id, org_name, details) values ('r-trip','${ORG}','Org R','{"title":"Mt. R","fee":1500,"dp":500}')`);
const future = day(40);
await as(ORG, `insert into public.departures (trip_id, date, capacity) values ('r-trip','${future}',20)`);
const book = async (uid, size = 3) => {
  const r = await as(uid, `select ref from public.book_trip('r-trip','${future}',${size},'Cubao','2 AM','GCash','','',false,${size === 3 ? PEOPLE : "'[]'::jsonb"},${EM})`);
  if (!r.ok) throw Error(r.err); return r.rows[0].ref;
};
// Move a booking to a past date (as the database owner: the pages can't do this).
const moveTo = async (ref, offset) => {
  await q(`insert into departures (trip_id, date, capacity) values ('r-trip', public.ph_today() + ${offset}, 20) on conflict do nothing`);
  await q(`update bookings set date = public.ph_today() + ${offset}, dp_sent_at = now() where ref = $1`, [ref]);
};
const oldRef = await book(J); await moveTo(oldRef, -31);

await db.exec(current); await db.exec(current);
check("Upgrade: old booking kept its details until the job runs", (await q(`select names from bookings where ref=$1`, [oldRef]))[0].names === "Ben Cruz, Cara Cruz");

// Bookings at the boundary: 30 days ago (kept), 31 days ago (deleted), upcoming (kept)
const b30 = await book(J), b31 = await book(J), up = await book(J), other = await book(K, 1);
await moveTo(b30, -30); await moveTo(b31, -31);
await as(J, `select add_review('${b31}', 5, 'Great trip')`);
const actBefore = (await q(`select count(*)::int n from organizer_activity`))[0].n;

// Before the job runs, the organizer's view already hides details past day 30
let ob = (await as(ORG, `select ref, companions, emergency from organizer_bookings()`)).rows;
const row = r => ob.find(x => x.ref === r);
check("Organizer view, trip 30 days ago: joiners and emergency shown", row(b30).companions.length === 2 && row(b30).emergency?.phone === "0917 000 0000", row(b30));
check("Organizer view, trip 31 days ago: hidden even before deletion runs", row(b31).companions.length === 0 && row(b31).emergency === null, row(b31));
check("Organizer view, upcoming trip: shown", row(up).companions.length === 2 && row(up).emergency?.name === "Mom", row(up));

// The 5-minute job (expire_holds) now runs the 30-day deletion
const ex = await as(J, `select public.expire_holds()`);
check("expire_holds runs for a signed-in caller", ex.ok, ex);
const after = async r => (await q(`select status, size, companions, emergency, names, booker, dp_sent_at from bookings where ref=$1`, [r]))[0];
const a31 = await after(b31), a30 = await after(b30), aOld = await after(oldRef), aUp = await after(up);
check("Day 31: joiner list emptied", a31.companions.length === 0, a31);
check("Day 31: emergency contact deleted", a31.emergency === null, a31);
check("Day 31: plain-text joiner names deleted too", a31.names === null, a31);
check("Day 31: booking itself kept (status, size, DP record)", a31.status === "confirmed" && a31.size === 3 && a31.dp_sent_at !== null, a31);
check("Day 31: review kept", (await q(`select count(*)::int n from reviews where booking_ref=$1`, [b31]))[0].n === 1);
check("Upgraded booking from before the update: deleted too", aOld.companions.length === 0 && aOld.emergency === null && aOld.names === null, aOld);
check("Day 30 (last day kept): untouched", a30.companions.length === 2 && a30.emergency !== null && a30.names === "Ben Cruz, Cara Cruz", a30);
check("Upcoming trip: untouched", aUp.companions.length === 2 && aUp.emergency !== null, aUp);
check("Deletion adds no activity entries", (await q(`select count(*)::int n from organizer_activity`))[0].n === actBefore);
await as(J, `select public.expire_holds()`);
check("Running again changes nothing", JSON.stringify(await after(b31)) === JSON.stringify(a31) && (await after(b30)).companions.length === 2);

// A day later, the day-30 booking crosses the boundary
await q(`update bookings set date = date - 1 where ref = $1`, [b30]);   // the day-31 date exists already
await as(ORG, `select public.expire_holds()`);
check("Next day: the day-30 booking is deleted too", (await after(b30)).emergency === null && (await after(b30)).names === null);

// Booking a new trip also runs the deletion (as before), and the booker can't edit past trips
const r = await as(J, `select public.update_booking_details('${b31}', ${PEOPLE}, ${EM})`);
check("Booker can't re-add details to a past trip", !r.ok && /passed/.test(r.err), r);

// Who can read emergency contacts and joiner details, straight through the database
const direct = uid => as(uid, `select ref, emergency, companions, names from public.bookings where ref='${up}'`);
let d = await direct(J);
check("Booker reads own emergency contact", d.ok && d.rows[0]?.emergency?.phone === "0917 000 0000", d);
d = await direct(ORG);
check("Trip's organizer reads it", d.ok && d.rows[0]?.emergency?.phone === "0917 000 0000", d);
d = await direct(K);
check("Another joiner on the same date: no row", d.ok && d.rows.length === 0, d);
d = await direct(ORG2);
check("Another organizer: no row", d.ok && d.rows.length === 0, d);
d = await as(null, `select emergency from public.bookings`, "anon");
check("Signed out: table denied", !d.ok && /permission denied/.test(d.err), d);
d = await as(K, `select count(*)::int n from public.bookings where emergency is not null and user_id <> '${K}'`);
check("Another joiner sees no one else's emergency contacts", d.ok && d.rows[0].n === 0, d);
d = await as(ORG2, `select * from organizer_bookings()`);
check("Another organizer's dashboard: none of these bookings", d.ok && d.rows.length === 0, d);
d = await as(null, `select * from organizer_bookings()`, "anon");
check("Signed out: organizer list denied", !d.ok && /permission denied/.test(d.err), d);
d = await as(K, `select * from public.whos_going('r-trip','${future}')`);
check("Who's going never carries contacts or joiner details", d.ok && d.rows.length > 0 && d.rows.every(x => !("emergency" in x) && !("companions" in x) && !("names" in x) && !Object.values(x).some(v => /0917/.test(String(v)))), d);
d = await as(K, `select * from public.all_slots()`);
check("Slots list: counts only", d.ok && d.rows.every(x => !Object.values(x).some(v => /Mom|Cruz|0917/.test(String(v)))), d);
d = await as(J, `select public.clear_old_details()`);
check("Signed-in users can't call the deletion directly", !d.ok && /permission denied/.test(d.err), d);
d = await as(null, `select public.clear_old_details()`, "anon");
check("Signed out can't call it either", !d.ok && /permission denied/.test(d.err), d);
d = await as(J, `update public.bookings set emergency = null where ref='${up}'`);
check("No one edits bookings directly (functions only)", !d.ok && /permission denied/.test(d.err), d);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
