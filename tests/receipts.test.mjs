import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const oldSchema = execFileSync('git', ['show','f4c51425f2af2ce4de127005a4a8875b2e47028a:supabase/schema.sql'], {cwd:new URL('..',import.meta.url),encoding:'utf8'});
const org='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002',joiner='10000000-0000-0000-0000-000000000003';
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
await db.exec(oldSchema);
await db.query('insert into auth.users(id) values ($1),($2),($3)',[org,other,joiner]);
await db.query("update profiles set role='organizer',organizer_status='approved' where id in ($1,$2)",[org,other]);
await db.query(`insert into trips(id,organizer_id,org_name,details) values ('test',$1,'Test','{"fee":1499,"dp":500}')`,[org]);
await db.exec(`insert into departures(trip_id,date,capacity) values ('test','2099-01-01',10);
 insert into bookings(ref,trip_id,date,user_id,size,pickup,pickup_time,dp,balance,wallet,wallet_number)
 values ('TP-TEST','test','2099-01-01','${joiner}',2,'Cubao','2 AM',1000,1998,'GCash','test');
 insert into outside_bookings(request_id,trip_id,date,created_by,name,size,pickup,source)
 values ('20000000-0000-0000-0000-000000000001','test','2099-01-01','${org}','Outside Tester',2,'Cubao','messenger');`);
await db.exec(schema); await db.exec(schema);
let passes=0;
async function test(name,fn){await fn();console.log('PASS',name);passes++;}
async function as(user,fn,role='authenticated') {await db.exec(`set role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);try{return await fn();}finally{await db.exec('reset role');}}
const one=async(sql,p=[]) => (await db.query(sql,p)).rows[0];
let n=10; const uuid=()=>`30000000-0000-0000-0000-${String(n++).padStart(12,'0')}`;
const when='2026-01-01T02:00:00.000Z';
const call=(r={}) => db.query('select * from record_dp_receipt($1,$2,$3,$4,$5,$6,$7,$8)',[r.request||uuid(),r.booking===undefined?'TP-TEST':r.booking,r.outside||null,r.previous||null,r.amount===undefined?1000:r.amount,r.method===undefined?'GCash':r.method,r.when===undefined?when:r.when,r.reason===undefined?'Checked wallet':r.reason]);
await test('upgrade keeps old simulated DP values but creates no receipts',async()=>{assert.equal((await one('select count(*)::int n from dp_receipts')).n,0);assert.equal((await one("select dp from bookings where ref='TP-TEST'")).dp,1000);});
const outside=(await one('select id from outside_bookings')).id;
await test('outside price snapshot migrates existing record',async()=>{assert.deepEqual(await one('select expected_dp,total_fee from outside_bookings'),{expected_dp:1000,total_fee:2998});});
const before=await one("select seats_taken('test','2099-01-01') taken");
for(const [name,user,role] of [['joiner',joiner,'authenticated'],['other organizer',other,'authenticated'],['signed out',null,'anon']])
 await test(name+' cannot record receipt',()=>as(user,()=>assert.rejects(call),role));
let first,request=uuid();
await test('owner records direct DP and preserves balance calculation',async()=>as(org,async()=>{first=(await call({request})).rows[0];assert.equal(first.amount,1000);assert.equal(first.recorded_by,org);assert.equal((await one("select dp+balance-$1 remaining from bookings where ref='TP-TEST'",[first.amount])).remaining,1998);}));
await test('same request is idempotent',async()=>as(org,async()=>assert.equal((await call({request})).rows[0].id,first.id)));
await test('changed payload with same request is rejected',()=>as(org,()=>assert.rejects(call({request,amount:900}))));
await test('owner has immutable history read access',async()=>as(org,async()=>assert.equal((await one('select count(*)::int n from dp_receipts')).n,1)));
await test('booker sees matching receipt and history',async()=>as(joiner,async()=>assert.equal((await one('select amount from dp_receipts')).amount,1000)));
await test('other organizer sees no receipts',async()=>as(other,async()=>assert.equal((await one('select count(*)::int n from dp_receipts')).n,0)));
await test('signed out cannot read receipt table',()=>as(null,()=>assert.rejects(db.query('select * from dp_receipts')),'anon'));
for(const op of ["update dp_receipts set amount=0","delete from dp_receipts","insert into dp_receipts(request_id,trip_id,booking_ref,amount,recorded_by,reason) values (gen_random_uuid(),'test','TP-TEST',0,'"+org+"','forged')"])
 await test('direct receipt mutation denied: '+op.split(' ')[0],()=>as(org,()=>assert.rejects(db.exec(op))));
for(const input of [{amount:-1},{amount:1001},{amount:null},{reason:''},{reason:'x'.repeat(301)},{method:'Other'},{method:null},{when:null},{when:'2099-01-01'},{booking:'missing'},{outside,booking:'TP-TEST'}])
 await test('invalid input rejected '+JSON.stringify(input),()=>as(org,()=>assert.rejects(call({...input,previous:first.id}))));
let corrected;
await test('correction creates new history with actor, time and reason',async()=>as(org,async()=>{corrected=(await call({previous:first.id,amount:700,reason:'Corrected mistaken amount'})).rows[0];assert.equal(corrected.previous_id,first.id);assert.equal(corrected.amount,700);assert.equal(corrected.reason,'Corrected mistaken amount');assert.ok(corrected.recorded_at);}));
await test('stale correction is rejected',()=>as(org,()=>assert.rejects(call({previous:first.id,amount:800}))));
await test('partial receipt leaves correct balance',async()=>assert.equal((await one("select dp+balance-700 remaining from bookings where ref='TP-TEST'")).remaining,2298));
let zero;
await test('reset to pending retains both previous entries',async()=>as(org,async()=>{zero=(await call({previous:corrected.id,amount:0,method:null,when:null,reason:'Wrong booking; reset record'})).rows[0];assert.equal(zero.amount,0);assert.equal((await one('select count(*)::int n from dp_receipts')).n,3);}));
await test('outside receipt uses its own snapshot',async()=>as(org,async()=>{assert.equal((await call({booking:null,outside,amount:500})).rows[0].amount,500);}));
await test('booker cannot see outside receipt',async()=>as(joiner,async()=>assert.equal((await one('select count(*)::int n from dp_receipts where outside_id is not null')).n,0)));
await test('old request cannot be reused for another booking',()=>as(org,()=>assert.rejects(call({request,booking:null,outside}))));
await test('receipt writes never affect occupied seats',async()=>assert.deepEqual(await one("select seats_taken('test','2099-01-01') taken"),before));
await test('new outside booking snapshots fee',async()=>as(org,async()=>{const o=(await db.query("select * from add_outside_booking($1,'test','2099-01-01','New',1,'Cubao','2 AM','other',null)",[uuid()])).rows[0];assert.equal(o.expected_dp,500);assert.equal(o.total_fee,1499);}));
await test('price edit does not rewrite existing expected DP',async()=>{await db.exec(`update trips set details=details || '{"dp":600,"fee":1800}' where id='test'`);assert.equal((await one('select expected_dp from outside_bookings where id=$1',[outside])).expected_dp,1000);});
await test('new online reservation creates no receipt, even with legacy wallet fields',async()=>as(joiner,async()=>{
 const b=(await db.query("select * from book_trip('test','2099-01-01',1,'Cubao','2 AM','GCash','synthetic','',false,'[]','{\"name\":\"Emergency Tester\",\"phone\":\"0917 000 0000\"}')")).rows[0];
 assert.equal(b.dp,600);assert.equal((await one('select count(*)::int n from dp_receipts where booking_ref=$1',[b.ref])).n,0);
}));
await db.exec(`insert into trips(id,org_name,details) values ('demo','Sample Organizer','{"fee":1499,"dp":500}');
 insert into departures(trip_id,date,capacity) values ('demo','2099-02-01',8),('demo','2099-02-08',8);
 insert into bookings(ref,trip_id,date,user_id,size,pickup,pickup_time,dp,balance,wallet,wallet_number)
 values ('TP-DEMO','demo','2099-02-01','${joiner}',1,'Sample','2 AM',500,999,'GCash','synthetic');`);
const pilotSeats=await one("select seats_taken('test','2099-01-01') taken");
await test('direct demo-trip booking RPC is denied',()=>as(joiner,()=>assert.rejects(db.query("select * from book_trip('demo','2099-02-01',1,'Sample','2 AM','GCash','synthetic','',false,'[]','{\"name\":\"Emergency Tester\",\"phone\":\"0917 000 0000\"}')"))));
await test('legacy demo booking cannot be moved via RPC',()=>as(joiner,()=>assert.rejects(db.query("select * from move_booking('TP-DEMO','2099-02-08')"))));
await test('organizer cannot record receipt on sample trip',()=>as(org,()=>assert.rejects(call({booking:'TP-DEMO',amount:500}))));
await test('outside booking cannot target sample trip',()=>as(org,()=>assert.rejects(db.query("select * from add_outside_booking($1,'demo','2099-02-01','Sample',1,'Sample','2 AM','other',null)",[uuid()]))));
await test('client cannot flip demo ownership into pilot mode',async()=>as(org,async()=>{await db.query("update trips set organizer_id=$1 where id='demo'",[org]);assert.equal((await one("select organizer_id from trips where id='demo'")).organizer_id,null);}));
await test('denied demo actions leave pilot capacity and receipts unchanged',async()=>{assert.deepEqual(await one("select seats_taken('test','2099-01-01') taken"),pilotSeats);assert.equal((await one("select count(*)::int n from dp_receipts where booking_ref='TP-DEMO'")).n,0);});
await test('revoked organizer cannot record a DP',async()=>{await db.query("update profiles set role='joiner',organizer_status='revoked' where id=$1",[org]);await as(org,()=>assert.rejects(call({previous:zero.id})));});
await test('schema rerun preserves receipt history',async()=>{await db.exec(schema);assert.equal((await one('select count(*)::int n from dp_receipts')).n,4);});
// Fresh install path also parses, independent of the upgrade fixture.
console.log(`${passes} receipt database tests passed. PGlite is single-connection; true concurrent races and live Supabase are not exercised.`);
await db.close();
