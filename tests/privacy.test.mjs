// TP-005 booking privacy: every role × every way to read booking data, through direct table
// reads and RPCs (no UI). Upgrades from main before this check (7f7abc4), runs the schema twice.
// Prints a role-by-operation matrix: "rows/fields" seen, or "denied".
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "7f7abc4:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const U = { A: "a0000000-0000-0000-0000-00000000000a", B: "b0000000-0000-0000-0000-00000000000b", C: "c0000000-0000-0000-0000-00000000000c",
            D: "d0000000-0000-0000-0000-00000000000d", E: "e0000000-0000-0000-0000-00000000000e", F: "f0000000-0000-0000-0000-00000000000f" };
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
const owner = s => db.query(s);
const as = async (who, sql) => {
  const anon = who === "anon";
  await db.exec(`select set_config('request.jwt.claim.sub','${anon ? "" : U[who]}',false); set role ${anon ? "anon" : "authenticated"};`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); }
};
const D1 = new Date(Date.now() + 8 * 3600e3 + 30 * 864e5).toISOString().slice(0, 10), D2 = new Date(Date.now() + 8 * 3600e3 + 37 * 864e5).toISOString().slice(0, 10);
const CHECK = '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}';
const book = (who, date, listed, extra = {}) => as(who, `select ref from public.book_trip('d-trip','${date}',2,'Cubao','2 AM','GCash','+63 917 555 0000','',${listed},
  '[{"name":"Friend Of ${who}","age":"adult","phone":"0918 000 0000"}]'::jsonb,'{"name":"Mom Of ${who}","phone":"0917 000 0000"}'::jsonb)`);

await db.exec(base);
for (const k of Object.keys(U)) await owner(`insert into auth.users (id) values ('${U[k]}')`);
for (const k of ["D", "E"]) await owner(`select approve_organizer('${U[k]}', p_approver => 'Test', p_checklist => '${CHECK}')`);
for (const k of Object.keys(U)) await owner(`update profiles set name='Person ${k}', phone='+63 917 000 000${Object.keys(U).indexOf(k)}' where id='${U[k]}'`);
await as("D", `insert into public.trips (id, organizer_id, org_name, details) values ('d-trip','${U.D}','Org D','{"title":"D Trip","fee":1500,"dp":500}')`);
await as("E", `insert into public.trips (id, organizer_id, org_name, details) values ('e-trip','${U.E}','Org E','{"title":"E Trip","fee":1500,"dp":500}')`);
await as("D", `insert into public.departures (trip_id, date, capacity) values ('d-trip','${D1}',20), ('d-trip','${D2}',20)`);
await db.exec(current); await db.exec(current);

// Bookings: A (listed) and B (not listed) on D1; C on D2 (different date); F on D1 then cancels.
const refA = (await book("A", D1, true)).rows[0].ref;
const refB = (await book("B", D1, false)).rows[0].ref;
const refC = (await book("C", D2, true)).rows[0].ref;
const refF = (await book("F", D1, true)).rows[0].ref;
await as("F", `select public.cancel_booking('${refF}')`);
await as("A", `select 1 from public.send_dp_reference('${refA}','REF-A-123')`);
await as("D", `select 1 from public.record_dp_receipt(gen_random_uuid(),'${refA}',null,null,500,'GCash',now(),'Checked','GC-999')`);
const out = (await as("D", `select id from public.add_outside_booking(gen_random_uuid(),'d-trip','${D1}','Outside Person',1,'Cubao','2 AM','messenger','0919 111 2222')`)).rows[0].id;
await as("D", `select 1 from public.edit_outside_booking('${out}',1,'Outside Person',1,'Cubao','2 AM','in_person','0919 111 2222','Source fix')`);

const PRIVATE = ["wallet_number", "companions", "emergency", "phone", "dp_reference", "joiner_phone", "names"];
const roles = ["A", "B", "C", "D", "E", "anon"];
const matrix = {};
const cell = (op, who, v) => { (matrix[op] ||= {})[who] = v; };
const desc = r => !r.ok ? "denied" : `${r.rows.length} row${r.rows.length === 1 ? "" : "s"}`;
const leaks = rows => rows.filter(x => PRIVATE.some(k => k in x && x[k] != null && !(Array.isArray(x[k]) && !x[k].length) && JSON.stringify(x[k]) !== "[]"));

// 1. Direct table reads
const tables = { bookings: `select * from public.bookings`, profiles: `select * from public.profiles`, outside_bookings: `select * from public.outside_bookings`,
  dp_receipts: `select * from public.dp_receipts`, dp_reference_log: `select * from public.dp_reference_log`, organizer_activity: `select * from public.organizer_activity`,
  outside_booking_changes: `select * from public.outside_booking_changes`, organizer_approvals: `select * from public.organizer_approvals`, reviews: `select * from public.reviews` };
const R = {};
for (const [t, sql] of Object.entries(tables)) for (const who of roles) { const r = await as(who, sql); R[t + who] = r; cell(`table ${t}`, who, desc(r)); }
check("Booker A reads only their own booking", R.bookingsA.ok && R.bookingsA.rows.length === 1 && R.bookingsA.rows[0].ref === refA, R.bookingsA);
check("Same-date joiner B reads only their own", R.bookingsB.ok && R.bookingsB.rows.every(x => x.user_id === U.B), R.bookingsB);
check("Unrelated joiner C reads only their own", R.bookingsC.ok && R.bookingsC.rows.every(x => x.user_id === U.C), R.bookingsC);
check("Owning organizer D reads the bookings on their trip (incl. cancelled)", R.bookingsD.ok && R.bookingsD.rows.length === 4, R.bookingsD.rows?.length);
check("Other organizer E reads none", R.bookingsE.ok && R.bookingsE.rows.length === 0, R.bookingsE);
check("Signed out is denied the bookings table", !R.bookingsanon.ok, R.bookingsanon);
for (const who of ["A", "B", "C", "D", "E"]) check(`${who} reads only their own profile`, R["profiles" + who].ok && R["profiles" + who].rows.length === 1 && R["profiles" + who].rows[0].id === U[who], R["profiles" + who].rows?.length);
check("Signed out is denied profiles", !R.profilesanon.ok);
check("Only D reads outside bookings (with the phone)", R.outside_bookingsD.rows?.length === 1 && ["A", "B", "C", "E"].every(w => R["outside_bookings" + w].ok && R["outside_bookings" + w].rows.length === 0) && !R.outside_bookingsanon.ok);
check("Receipt for A: A and D read it, B, C, E don't, signed out denied", R.dp_receiptsA.rows?.length === 1 && R.dp_receiptsD.rows?.length === 1 && ["B", "C", "E"].every(w => R["dp_receipts" + w].rows?.length === 0) && !R.dp_receiptsanon.ok);
check("DP reference log: A and D only", R.dp_reference_logA.rows?.length === 1 && R.dp_reference_logD.rows?.length === 1 && ["B", "C", "E"].every(w => R["dp_reference_log" + w].rows?.length === 0) && !R.dp_reference_loganon.ok);
check("Organizer activity: D only", R.organizer_activityD.rows?.length > 0 && ["A", "B", "C", "E"].every(w => R["organizer_activity" + w].rows?.length === 0) && !R.organizer_activityanon.ok);
check("Outside booking history: D only", R.outside_booking_changesD.rows?.length === 1 && ["A", "B", "C", "E"].every(w => R["outside_booking_changes" + w].rows?.length === 0) && !R.outside_booking_changesanon.ok);
check("Approval log: nobody on the website", ["A", "B", "C", "D", "E", "anon"].every(w => !R["organizer_approvals" + w].ok || R["organizer_approvals" + w].rows.length === 0));

// 2. RPCs
for (const who of roles) {
  const ob = await as(who, `select * from public.organizer_bookings()`); cell("rpc organizer_bookings", who, desc(ob)); R["ob" + who] = ob;
  const wg = await as(who, `select * from public.whos_going('d-trip','${D1}')`); cell("rpc whos_going(D1)", who, wg.ok ? `${wg.rows.filter(x => x.display_name).length} names / ${wg.rows.length}` : "denied"); R["wg" + who] = wg;
  const mc = await as(who, `select * from public.my_booking_contacts()`); cell("rpc my_booking_contacts", who, desc(mc)); R["mc" + who] = mc;
  const sl = await as(who, `select * from public.all_slots()`); cell("rpc all_slots", who, sl.ok ? `${sl.rows.length} rows, ${leaks(sl.rows).length} private` : "denied"); R["sl" + who] = sl;
  const rv = await as(who, `select * from public.all_reviews()`); cell("rpc all_reviews", who, desc(rv));
}
check("organizer_bookings: D gets their trip's bookings with contacts", R.obD.ok && R.obD.rows.length >= 3 && R.obD.rows.some(x => x.joiner_phone), R.obD.rows?.length);
check("organizer_bookings: everyone else gets nothing", ["A", "B", "C", "E"].every(w => R["ob" + w].ok && R["ob" + w].rows.length === 0) && !R.obanon.ok);
check("all_slots never returns private fields", roles.every(w => R["sl" + w].ok && leaks(R["sl" + w].rows).length === 0));

// 3. Who's going
const names = w => R["wg" + w].rows.filter(x => x.display_name).map(x => x.display_name).sort();
check("Who's going: B (same date, opted out) sees A's opted-in name and their own", JSON.stringify(names("B")) === JSON.stringify(["Person A.", "Person B."]), names("B"));
check("...B sees their own name too (self-name: you always see yourself)", names("B").includes("Person B."));
check("Who's going: A sees A only (B opted out)", JSON.stringify(names("A")) === JSON.stringify(["Person A."]), names("A"));
check("Who's going: C (different date) sees counts but no names", R.wgC.ok && names("C").length === 0 && R.wgC.rows.length === 2, R.wgC.rows);
check("Who's going: cancelled F isn't counted and sees no names", (await as("A", `select count(*)::int n from public.whos_going('d-trip','${D1}')`)).rows[0].n === 2 && (await as("F", `select * from public.whos_going('d-trip','${D1}')`)).rows.every(x => !x.display_name));
check("Who's going: organizers and signed out see counts only", ["D", "E", "anon"].every(w => R["wg" + w].ok && names(w).length === 0), { D: names("D"), E: names("E"), anon: names("anon") });
check("Who's going never returns contacts, emergency or wallet fields", roles.every(w => R["wg" + w].ok && leaks(R["wg" + w].rows).length === 0 && R["wg" + w].rows.every(x => Object.keys(x).join() === "display_name,size,is_you")));
// a lapsed (unpaid) hold doesn't make you "booked on that date"
const refL = (await book("C", D1, false)).rows[0].ref;
await owner(`update bookings set hold_until = now() - interval '1 minute' where ref='${refL}'`);
const wgL = await as("C", `select * from public.whos_going('d-trip','${D1}')`);
check("Who's going: a joiner whose hold lapsed (not yet marked expired) sees no names", wgL.ok && wgL.rows.every(x => !x.display_name), wgL.rows);

// 4. Contacts and detail edits
check("my_booking_contacts: bookers get the organizer number for their trip only", ["A", "B", "C"].every(w => R["mc" + w].ok && R["mc" + w].rows.every(x => x.trip_id === "d-trip")) && R.mcE.rows.length === 0 && !R.mcanon.ok);
let r = await as("C", `select 1 from public.update_booking_details('${refA}','[]'::jsonb,'{"name":"Hacker","phone":"0917 000 0000"}'::jsonb)`);
check("C can't edit A's joiner details", !r.ok, r);
r = await as("D", `select 1 from public.update_booking_details('${refA}','[]'::jsonb,'{"name":"Org Edit","phone":"0917 000 0000"}'::jsonb)`);
check("Even the organizer can't edit A's details through the joiner function", !r.ok, r);
r = await as("C", `select 1 from public.move_booking('${refA}','${D2}')`);
check("C can't move A's booking", !r.ok, r);
r = await as("E", `select 1 from public.cancel_booking('${refA}')`);
check("E can't cancel A's booking", !r.ok, r);
r = await as("A", `update public.bookings set emergency = null where ref='${refA}'`);
check("Direct writes to bookings are denied, even for the booker", !r.ok, r);
r = await as("E", `select 1 from public.send_dp_reference('${refA}','X')`);
check("E can't send a DP reference for A", !r.ok, r);
r = await as("C", `select 1 from public.rebook_expired('${refA}')`);
check("C can't use organizer rebooking", !r.ok, r);

console.log("\nRole × operation (what each role gets back)\n");
const ops = Object.keys(matrix), w0 = Math.max(...ops.map(o => o.length));
console.log("".padEnd(w0) + " | " + roles.map(r => r.padEnd(18)).join(" | "));
for (const op of ops) console.log(op.padEnd(w0) + " | " + roles.map(r => String(matrix[op][r]).padEnd(18)).join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
