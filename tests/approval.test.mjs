// TP-003 pilot organizer approval checklist. Upgrades from main before this change (a81f00d),
// runs the schema twice, then checks the checklist, the approval log and who can publish.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = execFileSync("git", ["show", "a81f00d:supabase/schema.sql"], { cwd: root, encoding: "utf8" });
const current = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const db = new PGlite();
const OLD = "aaaaaaaa-0000-0000-0000-000000000001", NEW = "cccccccc-0000-0000-0000-000000000003", J = "b0000000-0000-0000-0000-000000000001";
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
let pass = 0, fail = 0;
const check = (n, c, d) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + JSON.stringify(d)}`); };
const owner = async (s) => { try { return { ok: true, rows: (await db.query(s)).rows }; } catch (e) { return { ok: false, err: e.message }; } };
const as = async (uid, sql, role = "authenticated") => { await db.exec(`select set_config('request.jwt.claim.sub','${uid || ""}',false); set role ${role};`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); } };
const ALL = '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}';
const publish = (u, id) => as(u, `insert into public.trips (id, organizer_id, org_name, details) values ('${id}','${u}','Org','{"title":"T","fee":1500,"dp":500}')`);
const prof = async u => (await db.query(`select role, organizer_status, id_verified, business from profiles where id=$1`, [u])).rows[0];

// Old schema: OLD was approved the old way; NEW applies.
await db.exec(base);
for (const u of [OLD, NEW, J]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await owner(`select approve_organizer('${OLD}')`);
await db.exec(current); await db.exec(current);
let r = await prof(OLD);
check("Upgrade: an organizer approved before the checklist stays approved", r.role === "organizer" && r.organizer_status === "approved", r);
r = await publish(OLD, "old-trip");
check("...and can still publish", r.ok, r);
r = await owner(`select id_verified from approve_organizer('${OLD}', true, p_approver => 'Christine')`);
check("...and their labels can change later without the checklist", r.ok && r.rows[0].id_verified === true, r);

// The checklist
await as(NEW, `select 1 from public.apply_as_organizer('Cris Org','0917 123 4567','Cris Treks','{"wallet":"GCash","number":"0917 123 4567"}'::jsonb)`);
check("Applicant is pending", (await prof(NEW)).organizer_status === "pending");
r = await publish(NEW, "new-1");
check("Pending applicant can't publish", !r.ok, r);
r = await owner(`select approve_organizer('${NEW}', p_checklist => '${ALL}')`);
check("Approval without the approver's name is refused", !r.ok && /p_approver/.test(r.err), r);
r = await owner(`select approve_organizer('${NEW}', p_approver => 'Christine')`);
check("First approval without the checklist is refused, listing all 6 items", !r.ok && (r.err.match(/^  - /gm) || []).length === 6, r);
console.log("      message:\n" + r.err.split("\n").map(l => "        " + l).join("\n"));
r = await owner(`select approve_organizer('${NEW}', p_approver => 'Christine', p_checklist => '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":"yes","pilot_rules":false}')`);
check("Partial checklist (one 'yes' instead of true, one false) is refused naming those two", !r.ok && /safety_plan/.test(r.err) && /pilot_rules/.test(r.err) && !/id_checked/.test(r.err), r);
check("...and nothing changed", (await prof(NEW)).organizer_status === "pending");
r = await owner(`select organizer_status from approve_organizer('${NEW}', p_approver => 'Christine', p_checklist => '${ALL}', p_note => 'Video call Nov 12')`);
check("Full checklist + approver: approved", r.ok && r.rows[0].organizer_status === "approved", r);
r = await publish(NEW, "new-2");
check("Approved organizer can publish", r.ok, r);
r = await owner(`select action, approver, checklist->>'pilot_rules' pr, note from organizer_approvals where user_id='${NEW}' order by id`);
check("Approval is logged with approver, checklist and note", r.rows.length === 1 && r.rows[0].action === "approve" && r.rows[0].approver === "Christine" && r.rows[0].pr === "true" && r.rows[0].note === "Video call Nov 12", r.rows);

// Revoke and re-approve
r = await owner(`select revoke_organizer('${NEW}')`);
check("Revoke without the approver's name is refused", !r.ok && /p_approver/.test(r.err), r);
r = await owner(`select organizer_status from revoke_organizer('${NEW}', p_approver => 'Christine', p_note => 'Missed reconciliation twice')`);
check("Revoked", r.ok && r.rows[0].organizer_status === "revoked", r);
r = await publish(NEW, "new-3");
check("Revoked account can't publish", !r.ok, r);
r = await as(NEW, `update public.trips set published = true where id='new-2'`);
check("...or edit their trips (0 rows)", r.ok && r.n === 0, r);
r = await as(NEW, `select 1 from public.apply_as_organizer('Cris Org','0917 123 4567','Cris Treks','{"wallet":"GCash","number":"0917 123 4567"}'::jsonb)`);
check("...or re-apply on their own", !r.ok, r);
r = await owner(`select approve_organizer('${NEW}', p_approver => 'Christine')`);
check("Re-approving a revoked organizer needs the checklist again", !r.ok && /checklist/.test(r.err), r);
r = await owner(`select action from organizer_approvals where user_id='${NEW}' order by id`);
check("Log shows approve, then revoke", r.rows.map(x => x.action).join() === "approve,revoke", r.rows);

// Website roles
r = await as(NEW, `select approve_organizer('${NEW}', p_approver => 'me', p_checklist => '${ALL}')`);
check("A signed-in user can't approve themselves", !r.ok, r);
r = await as(null, `select approve_organizer('${J}', p_approver => 'x', p_checklist => '${ALL}')`, "anon");
check("Signed out can't approve", !r.ok, r);
r = await as(OLD, `select * from public.organizer_approvals`);
check("Organizers can't read the approval log", !r.ok || r.rows.length === 0, r);
r = await as(J, `update public.profiles set organizer_status='approved', role='organizer' where id='${J}'`);
check("A joiner still can't approve themselves directly", !r.ok, r);
r = await publish(J, "j-trip");
check("...or publish", !r.ok, r);
r = await owner(`select count(*)::int n from pg_proc where proname in ('approve_organizer','revoke_organizer')`);
check("Only one version of each approval function exists", r.rows[0].n === 2, r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
