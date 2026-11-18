import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createGeneralSyntheticServer,composeGeneralSyntheticServer} from '../lib/openai-session/general-synthetic-server.ts';
import {GENERAL_SYNTHETIC_QUESTION} from '../lib/openai-session/general-synthetic-execution.ts';
const base={enabled:true,snapshotRaceAccepted:true,configurationReviewed:true,requestId:'10000000-0000-4000-8000-000000000001',ownerId:'10000000-0000-4000-8000-000000000002',sessionId:'10000000-0000-4000-8000-000000000003',expiresAt:2000,allowedOrigin:'https://synthetic.test'};
const request=(body:unknown)=>new Request('https://synthetic.test/api/ai/openai-general-synthetic/prepare',{method:'POST',headers:{origin:'https://synthetic.test','content-type':'application/json'},body:JSON.stringify(body)});
test('OFF and missing explicit reviews do not access environment/driver/dependencies',async()=>{
 const poison=new Proxy({},{get(){throw Error('unexpected access')}});
 for(const c of [{...base,enabled:false},{...base,snapshotRaceAccepted:false},{...base,configurationReviewed:false}]){
  const h=createGeneralSyntheticServer(c,{} as any,poison as any);assert.equal((await h.PREPARE(request({}))).status,503);
  assert.equal((await composeGeneralSyntheticServer(c,poison as any)).available,false);
 }
});
test('scope and real questions denied before auth or database',async()=>{
 let touched=0;const h=createGeneralSyntheticServer(base,{} as any,{now:()=>1000,createClient:async()=>{touched++;throw Error('unreachable')}} as any);
 for(const body of [{feature:'conversation',question:'real record question',scope:'synthetic'},{feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'fitness'}])assert.equal((await h.PREPARE(request(body))).status,503);
 assert.equal(touched,0);
});
test('routes use opt-in installation and server contains no product record aggregator',()=>{
 const s=fs.readFileSync(new URL('../lib/openai-session/general-synthetic-server.ts',import.meta.url),'utf8');
 for(const x of ['loadFreeAdviceContext','loadFreeAdviceRecords','.from('])assert.equal(s.includes(x),false);
 for(const path of ['../app/api/ai/openai-general-synthetic/route.ts','../app/api/ai/openai-general-synthetic/prepare/route.ts'])assert.match(fs.readFileSync(new URL(path,import.meta.url),'utf8'),/INSTALLED_SYNTHETIC_SERVER/);
});
test('invalid fixed scope fails before client/store or env',async()=>{
 const poison=new Proxy({},{get(){throw Error('unexpected env')}});
 const deps={now:()=>1000} as any;
 for(const c of [{...base,requestId:'bad'},{...base,expiresAt:NaN},{...base,expiresAt:301001},{...base,allowedOrigin:'http://synthetic.test'}]){
  assert.equal(createGeneralSyntheticServer(c,{} as any,deps).available,false);
  assert.equal((await composeGeneralSyntheticServer(c,poison as any,()=>1000)).available,false);
 }
});
test('authenticated different owner cannot register session or access ledger',async()=>{
 let writes=0;
 const client={auth:{getUser:async()=>({data:{user:{id:'10000000-0000-4000-8000-000000000099',is_anonymous:false}},error:null}),getClaims:async()=>({data:{claims:{sub:'10000000-0000-4000-8000-000000000099',session_id:base.sessionId,role:'authenticated',is_anonymous:false,exp:9999999999}},error:null})}};
 const h=createGeneralSyntheticServer(base,{} as any,{now:()=>1000,createClient:async()=>client,store:{transaction:()=>{writes++;throw Error('unreachable')}}} as any);
 assert.equal((await h.PREPARE(request({feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}))).status,503);assert.equal(writes,0);
});

test('authenticated mode is explicit, rejects mixed/missing mode and body session before auth',async()=>{
 const {sessionId,...withoutSession}=base;
 const deps={now:()=>1000,createClient:async()=>{throw Error('must not authenticate')}} as any;
 for(const c of [withoutSession,{...withoutSession,sessionBinding:'other'},{...base,sessionBinding:'authenticated'}])assert.equal(createGeneralSyntheticServer(c as any,{} as any,deps).available,false);
 const h=createGeneralSyntheticServer({...withoutSession,sessionBinding:'authenticated'},{} as any,deps);
 assert.equal(h.available,true);
 assert.equal((await h.PREPARE(request({feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic',sessionId}))).status,400);
 assert.equal(createGeneralSyntheticServer({...withoutSession,sessionBinding:'authenticated',expiresAt:1000},{} as any,deps).available,false);
});
test('authenticated owner mismatch or claims switch cannot register any ledger rows',async()=>{
 const {sessionId,...withoutSession}=base;
 for(const mode of ['wrong-owner','switch-session','switch-owner']){
  let writes=0,users=0,claims=0;
  const other='10000000-0000-4000-8000-000000000099';
  const client={auth:{getUser:async()=>({error:null,data:{user:{id:mode==='wrong-owner'||mode==='switch-owner'&&++users>1?other:base.ownerId,is_anonymous:false}}}),getClaims:async()=>({error:null,data:{claims:{sub:mode==='wrong-owner'?other:base.ownerId,session_id:mode==='switch-session'&&++claims>1?other:sessionId,role:'authenticated',is_anonymous:false,exp:9999999999}}})}};
  const h=createGeneralSyntheticServer({...withoutSession,sessionBinding:'authenticated'},{} as any,{now:()=>1000,createClient:async()=>client,store:{transaction:()=>{writes++;throw Error('unexpected ledger')}}} as any);
  assert.equal((await h.PREPARE(request({feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}))).status,503);assert.equal(writes,0,mode);
 }
});
test('authenticated first proposal wins across concurrent sessions and handler restarts; provider executes once',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  for(const f of ['general-reservation-candidate.sql','general-approval-candidate.sql','general-bound-issuance-candidate.sql','general-dispatch-candidate.sql','general-identity-candidate.sql','general-quote-candidate.sql','general-proposal-store-candidate.sql','general-session-registration-candidate.sql'])await db.exec(fs.readFileSync(new URL('../checks/sql/'+f,import.meta.url),'utf8'));
  await db.exec(`CREATE SCHEMA yeoni_connector;CREATE FUNCTION yeoni_connector.live_session(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';`);
  await db.query("INSERT INTO yeoni_openai_general.budgets VALUES('budget',$1,'synthetic-org','synthetic-project','USD',1000000,0,true,clock_timestamp()+interval '1 hour')",[base.ownerId]);
  const n=Date.now(),{sessionId,...withoutSession}=base,c={...withoutSession,sessionBinding:'authenticated' as const,expiresAt:n+240000};let now=n,sends=0;
  const sessions=[sessionId,'10000000-0000-4000-8000-000000000004'];
  const make=()=>createGeneralSyntheticServer(c,{verifiedAt:n-1000,expiresAt:n+250000,globalStandardPricingReviewed:true},{store:{transaction:work=>db.transaction(tx=>work(tx as any))},now:()=>now,billing:async()=>({budgetId:'budget',organization:'synthetic-org',project:'synthetic-project',creditVerifiedUntil:n+250000}),createClient:async r=>{
   const session=sessions[Number(r.headers.get('x-synthetic-session'))];
   return {auth:{getUser:async()=>({error:null,data:{user:{id:base.ownerId,is_anonymous:false}}}),getClaims:async()=>({error:null,data:{claims:{sub:base.ownerId,session_id:session,role:'authenticated',is_anonymous:false,exp:Math.floor(n/1000)+3600}}})}};
  },credentials:async()=> 'synthetic-not-real-key',transport:async(_url,init)=>{
   const wire=JSON.parse(String(init?.body));assert.deepEqual(JSON.parse(wire.messages[1].content),{question:GENERAL_SYNTHETIC_QUESTION,recordSummary:'{}'});assert.equal(wire.max_completion_tokens,512);sends++;
   return Response.json({model:'gpt-5.4-mini-2026-03-17',service_tier:'default',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'연결 확인',nextSteps:['가상 확인'],basis:'합성자료',limitations:'실제 호출 아님'})}}],usage:{prompt_tokens:10,completion_tokens:8}});
  }});
  const req=(index:number,body:unknown)=>new Request('https://synthetic.test/api/synthetic',{method:'POST',headers:{origin:'https://synthetic.test','content-type':'application/json','x-synthetic-session':String(index)},body:JSON.stringify(body)});
  const prepare={feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'};
  const results=await Promise.all(sessions.map((_,index)=>make().PREPARE(req(index,prepare))));
  assert.equal(results.filter(x=>x.status===200).length,1);const winner=results.findIndex(x=>x.status===200),loser=1-winner;
  const {preview}=await results[winner].json();assert.equal(sends,0);
  const rows=await db.query<{session_id:string}>('SELECT session_id FROM yeoni_openai_general.proposals');assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].session_id,sessions[winner]);
  const body={request:{requestId:base.requestId,feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION},confirmation:{accepted:true,healthAccepted:false,requestId:base.requestId,fingerprint:preview.fingerprint}};
  assert.notEqual((await make().POST(req(loser,body))).status,200);assert.equal(sends,0);
  assert.notEqual((await make().PREPARE(req(loser,prepare))).status,200);
  assert.equal((await make().POST(req(winner,body))).status,200);assert.equal(sends,1);
  for(const index of [winner,loser]){assert.notEqual((await make().POST(req(index,body))).status,200);assert.notEqual((await make().PREPARE(req(index,prepare))).status,200);}
  assert.equal(sends,1);assert.equal((await db.query('SELECT request_id FROM yeoni_openai_general.proposals')).rows.length,1);
  now=c.expiresAt;assert.notEqual((await make().PREPARE(req(winner,prepare))).status,200);assert.equal(sends,1);
 }finally{await db.close();}
});

test('expiry during authentication prevents registration writes',async()=>{
 const {sessionId,...withoutSession}=base;let now=1000,writes=0;
 const client={auth:{getUser:async()=>({error:null,data:{user:{id:base.ownerId,is_anonymous:false}}}),getClaims:async()=>{now=base.expiresAt;return {error:null,data:{claims:{sub:base.ownerId,session_id:sessionId,role:'authenticated',is_anonymous:false,exp:9999999999}}};}}};
 const h=createGeneralSyntheticServer({...withoutSession,sessionBinding:'authenticated'},{} as any,{now:()=>now,createClient:async()=>client,store:{transaction:()=>{writes++;throw Error('unexpected ledger')}}} as any);
 assert.equal((await h.PREPARE(request({feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}))).status,503);assert.equal(writes,0);
});
