import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const dir=mkdtempSync(path.join(tmpdir(),'trailpeak-syntax-'));
try{
 for(const file of ['auth.js','api.js','cards.js','dashboard.html','mytrips.html','reserve.html','trip.html','signin.html']){
  const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const scripts=file.endsWith('.js')?[text]:Array.from(text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),m=>m[1]).filter(s=>s.trim());
  scripts.forEach((script,i)=>{const p=path.join(dir,file+'-'+i+'.js');writeFileSync(p,script);execFileSync(process.execPath,['--check',p]);});
 }
 // Verify the joiner mapping uses actual receipts, not legacy expected-DP fields.
 const api=readFileSync(new URL('../api.js',import.meta.url),'utf8');
 const source=api.slice(api.indexOf('function tpBooking('),api.indexOf('function tpUser('));
 const map=vm.runInNewContext(source+';tpBooking');
 const booking={ref:'TP-TEST',dp:1000,balance:1998};
 assert.equal(map(booking,[]).receivedDp,0);assert.equal(map(booking,[]).balance,2998);
 const partial=map(booking,[{booking_ref:'TP-TEST',amount:700}]);
 assert.equal(partial.receivedDp,700);assert.equal(partial.balance,2298);
 assert.equal(map(booking,null).paymentsReady,false);assert.equal(map(booking,null).balance,null);
 console.log('Changed JavaScript syntax and receipt-to-joiner mapping checks passed.');
}finally{rmSync(dir,{recursive:true,force:true});}
