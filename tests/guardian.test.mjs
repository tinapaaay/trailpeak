// TP-015 a guardian for every under-18 hiker (ADR-007). Upgrades from main (d4f6676), runs the
// schema twice, then checks booking and later edits.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "d4f6676:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const D = "d0000000-0000-0000-0000-00000000000d", J = "a0000000-0000-0000-0000-00000000000a";
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
const as = async (uid, sql) => { await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); } };
const CHECK = '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}';
const DATE = new Date(Date.now() + 8 * 3600e3 + 30 * 864e5).toISOString().slice(0, 10);
const EM = `'{"name":"Mom","phone":"0917 000 0000"}'::jsonb`;
const j = v => `'${JSON.stringify(v)}'::jsonb`;
const book = (size, comps, booker) => as(J, `select ref, booker, companions from public.book_trip('d-trip','${DATE}',${size},'Cubao','2 AM','GCash','','',false,${j(comps)},${EM}${booker === undefined ? "" : `,${j(booker)}`})`);
const edit = (ref, comps, booker) => as(J, `select booker, companions from public.update_booking_details('${ref}',${j(comps)},${EM}${booker === undefined ? "" : `,${j(booker)}`})`);
const kid = (name, guardian, relation = "parent") => ({ name, age: "minor", guardian, relation });
const adult = name => ({ name, age: "adult" });

await db.exec(base);
for (const u of [D, J]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await db.query(`select approve_organizer('${D}', p_approver => 'Test', p_checklist => '${CHECK}')`);
await db.query(`update profiles set name='Ana Reyes' where id='${J}'`);
await as(D, `insert into public.trips (id, organizer_id, org_name, details) values ('d-trip','${D}','Org D','{"title":"D","fee":1500,"dp":500}')`);
await as(D, `insert into public.departures (trip_id, date, capacity) values ('d-trip','${DATE}',40)`);
let r = await as(J, `select ref from public.book_trip('d-trip','${DATE}',2,'Cubao','2 AM','GCash','','',false,'[{"name":"Old Kid","age":"minor"}]'::jsonb,${EM})`);
const legacy = r.rows[0].ref;
await db.exec(current); await db.exec(current);
r = await db.query(`select booker, status from bookings where ref=$1`, [legacy]);
check("Upgrade: an older booking keeps its data; the booker counts as 18 or older", r.rows[0].status === "confirmed" && r.rows[0].booker.age === "adult", r.rows[0]);

// Booking
r = await book(2, [kid("Kid One", 1)]);
check("Adult booker + child with the booker as parent: allowed", r.ok && r.rows[0].booker.age === "adult" && r.rows[0].companions[0].guardian === 1 && r.rows[0].companions[0].relation === "parent", r);
const ref1 = r.rows?.[0]?.ref;
r = await book(2, [{ name: "Kid Two", age: "minor" }]);
check("Child with no guardian chosen: refused", !r.ok && /Kid Two is under 18/.test(r.err), r);
console.log("      message: " + r.err);
r = await book(2, [kid("Kid Three", 2)]);
check("Child named as their own guardian: refused", !r.ok, r);
r = await book(3, [kid("Kid A", 3), kid("Kid B", 1)]);
check("Child whose 'guardian' is another child: refused", !r.ok && /Kid A/.test(r.err), r);
r = await book(2, [kid("Kid Four", 1, "friend")]);
check("Unknown relationship: refused", !r.ok && /related/.test(r.err), r);
r = await book(2, [kid("Kid Five", "abc")]);
check("Guardian that isn't a joiner number: refused", !r.ok, r);
r = await book(1, [], { age: "minor" });
check("Under-18 booker alone: refused", !r.ok && /You're under 18/.test(r.err), r);
console.log("      message: " + r.err);
r = await book(2, [adult("Tita Rosa")], { age: "minor", guardian: 1, relation: "parent" });
check("Under-18 booker choosing themself: refused", !r.ok, r);
r = await book(2, [adult("Tita Rosa")], { age: "minor", guardian: 2, relation: "permitted_adult" });
check("Under-18 booker with an adult companion as guardian: allowed and recorded", r.ok && r.rows[0].booker.guardian === 2 && r.rows[0].booker.relation === "permitted_adult", r);
r = await book(2, [adult("Tita Rosa")], { age: "minor", guardian: 2 });
check("...but not without the relationship", !r.ok && /related to you/.test(r.err), r);
r = await book(4, [adult("Dad"), kid("Kid X", 2, "parent"), kid("Kid Y", 1, "guardian")]);
check("Two children with different adult guardians: allowed", r.ok, r);
r = await book(3, [kid("Kid Z", 1)]);
check("A child's name can wait (names later) but the named child still needs a guardian: allowed with one name", r.ok, r);

// Later edits
r = await edit(ref1, [{ ...kid("Kid One", 1) }], { age: "minor", guardian: 1, relation: "parent" });
check("Edit: booker switching to under 18 with no other adult is refused", !r.ok, r);
r = await edit(ref1, [{ name: "Kid One", age: "minor" }]);
check("Edit: removing the child's guardian is refused", !r.ok && /Kid One is under 18/.test(r.err), r);
r = await db.query(`select companions from bookings where ref=$1`, [ref1]);
check("...and the booking keeps its guardian", r.rows[0].companions[0].guardian === 1, r.rows[0]);
r = await book(3, [adult("Dad"), kid("Kid Q", 2)]); const ref2 = r.rows[0].ref;
r = await edit(ref2, [{ name: "Dad", age: "minor", guardian: 1, relation: "parent" }, kid("Kid Q", 2)]);
check("Edit: changing the guardian to under 18 leaves Kid Q without one: refused", !r.ok && /Kid Q/.test(r.err), r);
r = await edit(ref2, [kid("Kid Q", 2)]);
check("Edit: dropping the guardian from the list (Kid Q now points at nobody adult): refused", !r.ok, r);
r = await edit(ref2, [adult("Dad"), kid("Kid Q", 1, "guardian")]);
check("Edit: moving Kid Q's guardian to the booker: allowed", r.ok && r.rows[0].companions[1].guardian === 1, r);
r = await edit(ref1, [kid("Kid One", 1, "guardian")]);
check("Edit from an older page (no booker sent) keeps the booker and still checks", r.ok && r.rows[0].booker.age === "adult", r);
r = await edit(legacy, [{ name: "Old Kid", age: "minor" }]);
check("An older booking with an unguarded child must name a guardian on its next edit", !r.ok, r);
r = await edit(legacy, [kid("Old Kid", 1)]);
check("...and saves once one is chosen", r.ok, r);

// Organizer sees it
r = await as(D, `select booker, companions from public.organizer_bookings() where ref='${ref2}'`);
check("Organizer list includes the booker's age and each child's guardian", r.ok && r.rows[0].booker.age === "adult" && r.rows[0].companions[1].guardian === 1, r);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
