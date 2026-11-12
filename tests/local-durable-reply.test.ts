import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDurableReplyClient as Client } from '../lib/yeoni/local-durable-reply.ts';
import type { Analysis } from '../lib/yeoni/generated-record-reply.ts';
const schema=readFileSync('docs/yeoni-durable-reply/schema.local.sql','utf8');
const answer=(version:string):Analysis=>({text:'모의 응답: 저장된 기록을 확인했어요.',generatedAt:'2026-11-06T00:00:00Z',analysisDate:'2026-11-06',sourceVersion:version,mode:'mock'});
async function setup(path?:string){const db=new PGlite(path);await db.exec(schema);await db.exec("insert into reply_local.policies values('analysis',5600000000,2800000000),('voice',2400000000,1200000000)");return db;}
async function client(db:PGlite,owner='synthetic-a'){const c=new Client(db,{mode:'synthetic',owner});await c.login();return c;}
test('persistent exact-version cache survives disk reopen, logout and invalid quote; isolated owner',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'yeoni-ledger-'));let db=await setup(dir);
 try{let c=await client(db);const v=await c.publish('diet',1,{meals:1});assert.equal((await c.reserve('diet',1,v,'analysis',100)).status,'reserved');await c.claim('diet',1,v,'analysis','invocation-1');await c.finish('diet',v,'analysis',answer(v),'invocation-1');await c.logout();await db.close();db=new PGlite(dir);c=await client(db);
 for(const q of [null,NaN,Infinity,-1,0])assert.equal((await c.reserve('diet',1,v,'analysis',q)).status,'ready');
 assert.equal((await c.reserve('diet',1,v,'analysis',null)).answer?.generatedAt,'2026-11-06T00:00:00Z');
 const other=await client(db,'synthetic-b');await other.publish('diet',1,{meals:1});assert.equal((await other.reserve('diet',1,v,'analysis',null)).status,'budget');
 }finally{await db.close();rmSync(dir,{recursive:true,force:true});}
});
test('two clients simultaneous duplicate and project/account/pool limits serialize in local engine',async()=>{
 const db=await setup();try{const a=await client(db),b=await client(db);const v=await a.publish('diet',1,{n:1});const results=await Promise.all(Array.from({length:30},(_,i)=>(i%2?a:b).reserve('diet',1,v,'analysis',1000000000)));assert.equal(results.filter(r=>r.status==='reserved').length,1);assert.equal(results.filter(r=>r.status==='busy').length,29);
 const people=await Promise.all(Array.from({length:8},(_,i)=>client(db,'synthetic-'+i)));const versions=await Promise.all(people.map((c,i)=>c.publish('diet',1,{n:i})));
 const mixed=await Promise.all(people.map((c,i)=>c.reserve('diet',1,versions[i],'analysis',1000000000)));assert.equal(mixed.filter(r=>r.status==='reserved').length,4);
 const v2=await a.publish('diet',2,{n:2});assert.equal((await a.reserve('diet',2,v2,'voice',1100000000)).status,'reserved');assert.equal((await a.reserve('diet',2,v2,'analysis',2000000000)).status,'budget');
 }finally{await db.close();}
});
test('source revisions, deletion and late completion cannot resurrect; logout preserves in-flight cache',async()=>{
 const db=await setup();try{const c=await client(db);const v=await c.publish('growth',1,{done:1});await c.reserve('growth',1,v,'analysis',100);await c.claim('growth',1,v,'analysis','invocation-1');await c.logout();assert.equal((await c.reserve('growth',1,v,'analysis',null)).status,'stale');await c.finish('growth',v,'analysis',answer(v),'invocation-1');await c.login();assert.equal((await c.reserve('growth',1,v,'analysis',null)).status,'ready');
 const v2=await c.publish('growth',2,{done:2});await c.reserve('growth',2,v2,'analysis',100);assert.equal(await c.claim('growth',2,v2,'analysis','invocation-2'),true);assert.equal((await c.reserve('growth',1,v,'analysis',null)).status,'stale');await c.publish('growth',3,null,true);assert.equal(await c.finish('growth',v2,'analysis',answer(v2),'invocation-2'),false);await c.publish('growth',4,{done:2});assert.equal((await c.reserve('growth',4,v2,'analysis',100)).status,'deleted');await assert.rejects(c.publish('growth',2,{done:2}));
 const v3=await c.publish('growth',5,{done:3});assert.equal((await c.reserve('growth',5,v3,'analysis',null)).status,'budget');
 const totals=await db.query<{n:string}>('select sum(cost) n from reply_local.receipts');assert.equal(Number(totals.rows[0].n),200);
 }finally{await db.close();}
});
test('unknown commit, timeout, settlement failure and month rollover retain obligations',async()=>{
 const db=await setup();try{const c=await client(db);const v=await c.publish('fitness',1,{done:1});
 const broken=new Client({async query<T>(sql:string,params?:unknown[]){const r=await db.query<T>(sql,params);if(sql.includes('reply_local.reserve'))throw new Error('lost commit acknowledgement');return r;}},{mode:'synthetic',owner:'synthetic-a'});await broken.login();assert.equal((await broken.reserve('fitness',1,v,'analysis',2000000000)).status,'unavailable');assert.equal((await c.reserve('fitness',1,v,'analysis',2000000000)).status,'busy');await c.claim('fitness',1,v,'analysis','invocation-1');await c.finish('fitness',v,'analysis',null,'invocation-1');
 await db.query("update reply_local.receipts set month='2025-12'");const v2=await c.publish('fitness',2,{done:2});assert.equal((await c.reserve('fitness',2,v2,'analysis',1000000000)).status,'budget');
 await assert.rejects(db.query('select reply_local.settle($1,$2,$3,$4,$5)',['synthetic-a','fitness',v,'analysis',-1]));await db.query('select reply_local.settle($1,$2,$3,$4,$5)',['synthetic-a','fitness',v,'analysis',6000000000]);assert.equal((await c.reserve('fitness',2,v2,'analysis',1)).status,'budget');await assert.rejects(db.query('select reply_local.settle($1,$2,$3,$4,$5)',['synthetic-a','fitness',v,'analysis',100]));
 }finally{await db.close();}
});
test('missing policy or store fails closed; local adapter is absent from runtime and 503 gate unchanged',async()=>{
 const db=await setup();try{const c=await client(db);const v=await c.publish('budget',1,{n:1});await db.query('delete from reply_local.policies');assert.equal((await c.reserve('budget',1,v,'analysis',1)).status,'budget');await db.query('drop table reply_local.mutex');assert.equal((await c.reserve('budget',1,v,'analysis',1)).status,'unavailable');
 assert.match(readFileSync('app/api/yeoni/record-reply/route.ts','utf8'),/503/);
 }finally{await db.close();}
});
test('claim acknowledgement loss cannot regrant; late prior-month answer does not erase unsettled cost',async()=>{
 const db=await setup();try{const c=await client(db);const v=await c.publish('diet',1,{n:1});await c.reserve('diet',1,v,'analysis',2000000000);
 const broken=new Client({async query<T>(sql:string,params?:unknown[]){const r=await db.query<T>(sql,params);if(sql.includes('reply_local.claim'))throw new Error('ACK lost');return r;}},{mode:'synthetic',owner:'synthetic-a'});await broken.login();await assert.rejects(broken.claim('diet',1,v,'analysis','dispatch-1'));assert.equal(await c.claim('diet',1,v,'analysis','dispatch-1'),false);assert.equal(await c.claim('diet',1,v,'analysis','dispatch-2'),false);
 await db.query("update reply_local.receipts set month='2025-12'");assert.equal(await c.finish('diet',v,'analysis',answer(v),'wrong-owner'),false);await c.finish('diet',v,'analysis',answer(v),'dispatch-1');const v2=await c.publish('diet',2,{n:2});assert.equal((await c.reserve('diet',2,v2,'analysis',1000000000)).status,'budget');
 }finally{await db.close();}
});
test('delayed claim delivery after logout is suppressed while durable claim remains consumed',async()=>{
 const db=await setup();try{let release!:()=>void;let notify!:()=>void;const held=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>notify=r);
 const c=new Client({async query<T>(sql:string,params?:unknown[]){const result=await db.query<T>(sql,params);if(sql.includes('reply_local.claim')){notify();await held;}return result;}},{mode:'synthetic',owner:'synthetic-a'});await c.login();const v=await c.publish('diet',1,{n:1});await c.reserve('diet',1,v,'analysis',100);const pending=c.claim('diet',1,v,'analysis','dispatch-1');await entered;await c.logout();await c.login();release();assert.equal(await pending,false);assert.equal(await c.claim('diet',1,v,'analysis','dispatch-2'),false);
 }finally{await db.close();}
});
test('finalization checks authoritative current source and never displays an obsolete in-flight result',async()=>{
 const db=await setup();try{const c=await client(db);const v=await c.publish('diet',1,{n:1});await c.reserve('diet',1,v,'analysis',100);assert.equal(await c.claim('diet',1,v,'analysis','dispatch-1'),true);await c.publish('diet',2,{n:2});assert.equal(await c.finish('diet',v,'analysis',answer(v),'dispatch-1'),false);await c.publish('diet',3,{n:1});assert.equal((await c.reserve('diet',3,v,'analysis',null)).status,'uncertain');
 }finally{await db.close();}
});
