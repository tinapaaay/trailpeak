// Local synthetic UI fixture only. Never connects to live Supabase.
import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite(); const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const org='10000000-0000-0000-0000-000000000001', joiner='10000000-0000-0000-0000-000000000003';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
await db.exec(readFileSync(path.join(root,'supabase/schema.sql'),'utf8'));
await db.query('insert into auth.users(id) values ($1),($2)',[org,joiner]);
await db.query("update profiles set role='organizer',organizer_status='approved',name='Test Organizer',org='Local Trail Test' where id=$1",[org]);
await db.query("update profiles set name='Test Joiner',phone='synthetic' where id=$1",[joiner]);
// Reuse real trip content; only identity/date/price in this fixture are synthetic.
const {execFileSync}=await import('node:child_process');
const raw=execFileSync('node',['-e',`const fs=require('fs'),vm=require('vm');const c={console,localStorage:{getItem:()=>null},TP:{online:false,applyTo:()=>{}},mergeReviews:()=>{},getMyReviews:()=>[]};vm.createContext(c);vm.runInContext(fs.readFileSync('trips.js','utf8')+';this.trip=TRIPS[0]',c);console.log(JSON.stringify(c.trip))`],{cwd:root,encoding:'utf8'});
const details={...JSON.parse(raw),fee:1499,dp:500,group:10,title:'Local receipt test hike'};
await db.query('insert into trips(id,organizer_id,org_name,details) values ($1,$2,$3,$4)',['receipt-test',org,'Local Trail Test',details]);
await db.exec(`insert into departures(trip_id,date,capacity) values ('receipt-test','2099-01-01',10);
insert into bookings(ref,trip_id,date,user_id,size,pickup,pickup_time,dp,balance,wallet,wallet_number,hold_until)
values ('TP-LOCAL','receipt-test','2099-01-01','${joiner}',2,'Cubao','2 AM',1000,1998,'GCash','synthetic',now() + interval '6 hours'),
       ('TP-LATE','receipt-test','2099-01-01','${joiner}',1,'Cubao','2 AM',500,999,'GCash','synthetic',now() - interval '1 hour');
insert into outside_bookings(request_id,trip_id,date,created_by,name,size,pickup,pickup_time,source)
values (gen_random_uuid(),'receipt-test','2099-01-01','${org}','Tset Booker',2,'Cubao','2 AM','messenger');`);
const bridge=`window.TRAILPEAK_SUPABASE={url:'local-test',anonKey:'local-test'};
const testJoiner=new URLSearchParams(location.search).get('testRole')==='joiner';
const testId=testJoiner?'${joiner}':'${org}';
if(JSON.parse(localStorage.getItem('trailpeak.user')||'null')?.id!==testId)localStorage.setItem('trailpeak.user',JSON.stringify({id:testId,name:testJoiner?'Test Joiner':'Test Organizer',role:testJoiner?'joiner':'organizer',org:'Local Trail Test'}));
async function request(payload){return (await fetch('/test-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,user:testId})})).json();}
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:testId,email:'synthetic@example.test'}}}})},rpc:async(name,args)=>request({name,args}),from:(table)=>{const q={table,filters:[]};const b={select:()=>b,eq:(key,value)=>{q.filters.push([key,value]);return b},order:(key,opt)=>{q.order=key;q.desc=opt?.ascending===false;return b},is:()=>b,limit:()=>b,single:()=>{q.single=true;return b},then:(yes,no)=>request(q).then(yes,no)};return b}})};`;
let queue=Promise.resolve();
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/test-api'){
  let text='';for await(const chunk of req)text+=chunk;
  const q=JSON.parse(text);
  const task=async()=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[q.user]);try{
   let result;
   if(q.name){
    if(!['all_slots','all_reviews','organizer_bookings','record_dp_receipt','mark_activity_read','send_dp_reference','expire_holds','rebook_expired','edit_outside_booking','cancel_outside_booking'].includes(q.name))throw Error('Unexpected fixture RPC '+q.name);
    const args=Object.entries(q.args||{});result=await db.query(`select * from ${q.name}(${args.map(([k],i)=>k+'=> $'+(i+1)).join(',')})`,args.map(([,v])=>v));
   }else{
    if(!['profiles','trips','departures','bookings','reviews','outside_bookings','dp_receipts','organizer_activity','app_settings','outside_booking_changes'].includes(q.table))throw Error('Unexpected table');
    const filters=q.filters||[];for(const[k]of filters)if(!['id','user_id','status','outside_id'].includes(k))throw Error('Unexpected filter');
    const order=q.order;if(order&&!['revision','created_at','date','id'].includes(order))throw Error('Unexpected order');
    result=await db.query('select * from '+q.table+(filters.length?' where '+filters.map(([k],i)=>k+'=$'+(i+1)).join(' and '):'')+(order?' order by '+order+(q.desc?' desc':''):' '),filters.map(([,v])=>v));
   }
   return {data:q.single||q.name==='record_dp_receipt'?result.rows[0]:result.rows,error:null};
  }catch(e){return {data:null,error:{message:e.message}};}finally{await db.exec('reset role');}};
  const result=queue.then(task);queue=result.catch(()=>{});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await result,(key,value)=>key==='date'&&typeof value==='string'?value.slice(0,10):value));return;
 }
 if(url.pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');res.end(bridge);return;}
 const f=path.resolve(root,'.'+(url.pathname==='/'?'/dashboard.html':url.pathname));
 if(!f.startsWith(root+'/')||!existsSync(f)){res.writeHead(404);res.end();return;}
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(f)]||'application/octet-stream';res.setHeader('Content-Type',type);
 let data=readFileSync(f);if(f.endsWith('.html'))data=data.toString().replace(/<script src="https:\/\/cdn.jsdelivr.net[^>]+><\/script>/,'');
 res.end(data);
}catch(e){res.writeHead(500);res.end(e.message);}});
server.listen(8015,'127.0.0.1',()=>console.log('Synthetic preview: http://127.0.0.1:8015/dashboard.html ; My trips: /mytrips.html?testRole=joiner'));
