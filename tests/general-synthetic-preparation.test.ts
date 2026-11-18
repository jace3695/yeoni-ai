import test from 'node:test';import assert from 'node:assert/strict';
import {prepareGeneralSyntheticProposal as prepare,confirmGeneralSyntheticProposal as confirm} from '../lib/openai-session/general-synthetic-preparation.ts';
import {GENERAL_SYNTHETIC_QUESTION,GENERAL_SYNTHETIC_CAP} from '../lib/openai-session/general-synthetic-execution.ts';
import {adviceFingerprint} from '../lib/openai-advice-server.ts';
import {createConsentPreview} from '../lib/openai-session/advice-consent.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config={requestId:id(1),ownerId:id(2),sessionId:id(3),expiresAt:5000};
const review={verifiedAt:900,expiresAt:6000,globalStandardPricingReviewed:true};
function fixture(){let proposal:any,consumed=false,approved=false,writes=0,billingCalls=0,time=1000;const queries:string[]=[];
 const tx={query:async(q:string,p:any[])=>{queries.push(q);if(q.includes('SELECT id FROM yeoni_openai_general.budgets'))return {rows:[{id:'budget'}]};
 if(q.includes('INSERT INTO yeoni_openai_general.proposals')){if(proposal)return {rows:[]};writes++;proposal=JSON.parse(p[4]);return {rows:[{request_id:config.requestId}]};}
 if(q.includes('SELECT proposal,fingerprint'))return {rows:proposal&&!consumed?[{proposal,fingerprint:proposal.binding.consentFingerprint}]:[]};
 if(q.includes('INSERT INTO yeoni_openai_general.approvals')){if(approved)return {rows:[]};writes++;approved=true;return {rows:[{request_id:config.requestId}]};}
 if(q.includes('INSERT INTO yeoni_openai_general.quote_snapshots')){writes++;return {rows:[{quote_id:proposal.disclosure.quoteId}]};}
 if(q.includes('UPDATE yeoni_openai_general.proposals SET consumed=true')){writes++;consumed=true;return {rows:[{request_id:config.requestId}]};}
 throw Error('UNEXPECTED_SQL:'+q);
 }};
 const authority={identity:{ownerId:config.ownerId,sessionId:config.sessionId,epoch:7},assertCurrent:async()=>{},store:{transaction:async(work:any)=>work(tx)}} as any;
 const billing=async()=>{billingCalls++;return {budgetId:'budget',organization:'synthetic-org',project:'synthetic-project',creditVerifiedUntil:6000}};
 return {authority,billing,now:()=>time,setTime:(t:number)=>time=t,get:()=>({proposal,consumed,approved,writes,billingCalls,queries}),tamper:(fn:(p:any)=>void)=>fn(proposal)};
}
test('fixed request synthetic prepare and confirm store no actual records; second prepare/confirm fail',async()=>{
 const f=fixture(),v=await prepare(f.authority,config,f.billing,review,f.now);assert.equal(v.requestId,config.requestId);assert.equal(v.summary,'{}');assert.equal(v.question,GENERAL_SYNTHETIC_QUESTION);assert.equal(v.maxCostMicros,GENERAL_SYNTHETIC_CAP);assert.equal(v.healthNotice,'');
 const p=f.get().proposal;assert.equal(p.disclosure.includesHealthData,false);assert.equal(p.disclosure.maxOutputTokens,512);assert.equal(p.binding.legacyFingerprint,adviceFingerprint({...p.disclosure,epoch:7}));assert.equal(p.binding.consentFingerprint,createConsentPreview(p.disclosure,1000).fingerprint);
 await assert.rejects(prepare(f.authority,config,f.billing,review,f.now),/PROPOSAL_UNAVAILABLE/);assert.equal(f.get().writes,1);
 const confirmation={accepted:true,healthAccepted:false,requestId:v.requestId,fingerprint:v.fingerprint};await confirm(f.authority,config,confirmation,f.now);assert.equal(f.get().approved,true);assert.equal(f.get().consumed,true);assert.equal(f.get().writes,4);
 await assert.rejects(confirm(f.authority,config,confirmation,f.now),/PROPOSAL_UNAVAILABLE/);assert.equal(f.get().writes,4);
});
test('wrong owner session expired or nonUUID config stops before billing/store',async()=>{
 for(const patch of [{ownerId:id(8)},{sessionId:id(8)},{requestId:'bad'},{expiresAt:1000}]){const f=fixture();await assert.rejects(prepare(f.authority,{...config,...patch},f.billing,review,f.now));assert.equal(f.get().billingCalls,0);assert.equal(f.get().queries.length,0);}
});
test('tampered stored summary even with recomputed hashes fails before approval writes',async()=>{
 const f=fixture(),v=await prepare(f.authority,config,f.billing,review,f.now);f.tamper(p=>{p.disclosure.summary='SYNTHETIC_PRIVATE_SENTINEL';p.binding.consentFingerprint=createConsentPreview(p.disclosure,1000).fingerprint;p.binding.legacyFingerprint=adviceFingerprint({...p.disclosure,epoch:7});});
 await assert.rejects(confirm(f.authority,config,{accepted:true,healthAccepted:false,requestId:v.requestId,fingerprint:f.get().proposal.binding.consentFingerprint},f.now),/SYNTHETIC_PROPOSAL_REJECTED/);assert.equal(f.get().writes,1);assert.equal(f.get().approved,false);
});
test('missing consent and stale fixed scope never approve',async()=>{
 const f=fixture();await prepare(f.authority,config,f.billing,review,f.now);await assert.rejects(confirm(f.authority,config,{},f.now),/CONSENT_REQUIRED/);assert.equal(f.get().writes,1);f.setTime(5000);await assert.rejects(confirm(f.authority,config,{},f.now),/SYNTHETIC_SCOPE_REJECTED/);assert.equal(f.get().writes,1);
});
test('general primitive still rejects non-health approval without trusted synthetic validator',async()=>{
 const {recordConfirmedGeneralApproval}=await import('../lib/openai-session/general-approval-creation.ts');const f=fixture(),v=await prepare(f.authority,config,f.billing,review,f.now);
 await assert.rejects(recordConfirmedGeneralApproval(f.authority,f.get().proposal,{accepted:true,healthAccepted:false,requestId:v.requestId,fingerprint:v.fingerprint},1000),/CONSENT_REQUIRED/);assert.equal(f.get().writes,1);
});

test('stored scope, rates, cap, output and expiry are rechecked before confirmation writes',async()=>{
 for(const mutate of [(p:any)=>p.disclosure.maxCostMicros++, (p:any)=>p.disclosure.maxOutputTokens++, (p:any)=>p.disclosure.sessionId=id(9), (p:any)=>p.rates.inputMicrosPerMillion++, (p:any)=>p.disclosure.expiresAt=5500]){
  const f=fixture();await prepare(f.authority,config,f.billing,review,f.now);f.tamper(mutate);
  await assert.rejects(confirm(f.authority,config,{},f.now),/SYNTHETIC_PROPOSAL_REJECTED/);assert.equal(f.get().writes,1);assert.equal(f.get().approved,false);
 }
});
test('config is snapshotted before awaiting billing',async()=>{
 const f=fixture(),mutable={...config};const v=await prepare(f.authority,mutable,async()=>{mutable.requestId=id(9);mutable.ownerId=id(9);return f.billing()},review,f.now);assert.equal(v.requestId,config.requestId);assert.equal(f.get().proposal.disclosure.ownerId,config.ownerId);
});

test('PREPARE then POST uses real in-memory SQL ledger once; fake auth/provider only',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {readFileSync}=await import('node:fs');
 const {createGeneralSyntheticServer}=await import('../lib/openai-session/general-synthetic-server.ts');
 const db=new PGlite();try{
  for(const f of ['general-reservation-candidate.sql','general-approval-candidate.sql','general-bound-issuance-candidate.sql','general-dispatch-candidate.sql','general-identity-candidate.sql','general-quote-candidate.sql','general-proposal-store-candidate.sql','general-session-registration-candidate.sql'])await db.exec(readFileSync(new URL('../checks/sql/'+f,import.meta.url),'utf8'));
  await db.exec(`CREATE SCHEMA yeoni_connector;CREATE FUNCTION yeoni_connector.live_session(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';`);
  await db.query("INSERT INTO yeoni_openai_general.budgets VALUES('budget',$1,'synthetic-org','synthetic-project','USD',1000000,0,true,clock_timestamp()+interval '1 hour')",[config.ownerId]);
  let sends=0;const n=Date.now(),c={...config,enabled:true,snapshotRaceAccepted:true,configurationReviewed:true,allowedOrigin:'https://synthetic.invalid',expiresAt:n+240000};
  const server=createGeneralSyntheticServer(c,{verifiedAt:n-1000,expiresAt:n+250000,globalStandardPricingReviewed:true},{store:{transaction:work=>db.transaction(tx=>work(tx as any))},now:Date.now,billing:async()=>({budgetId:'budget',organization:'synthetic-org',project:'synthetic-project',creditVerifiedUntil:n+250000}),createClient:async()=>({auth:{getUser:async()=>({error:null,data:{user:{id:config.ownerId,is_anonymous:false}}}),getClaims:async()=>({error:null,data:{claims:{sub:config.ownerId,session_id:config.sessionId,role:'authenticated',is_anonymous:false,exp:Math.floor(n/1000)+3600}}})}}),credentials:async()=> 'synthetic-not-real-key',transport:async(url,init)=>{
   assert.equal(url,'https://api.openai.com/v1/chat/completions');const wire=JSON.parse(String(init?.body));assert.deepEqual(JSON.parse(wire.messages[1].content),{question:GENERAL_SYNTHETIC_QUESTION,recordSummary:'{}'});assert.equal(wire.max_completion_tokens,512);sends++;
   return Response.json({model:'gpt-5.4-mini-2026-03-17',service_tier:'default',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'연결 확인',nextSteps:['가상 확인'],basis:'합성자료',limitations:'실제 호출 아님'})}}],usage:{prompt_tokens:10,completion_tokens:8}});
  }});
  const req=(body:unknown)=>new Request('https://synthetic.invalid/api/synthetic',{method:'POST',headers:{origin:'https://synthetic.invalid','content-type':'application/json'},body:JSON.stringify(body)});
  const previewResponse=await server.PREPARE(req({feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}));assert.equal(previewResponse.status,200);const {preview}=await previewResponse.json();assert.equal(sends,0);
  const stored=(await db.query<{proposal:any}>('SELECT proposal FROM yeoni_openai_general.proposals')).rows[0].proposal;assert.equal(stored.disclosure.includesHealthData,false);assert.equal(stored.disclosure.summary,'{}');
  const body={request:{requestId:config.requestId,feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION},confirmation:{accepted:true,healthAccepted:false,requestId:config.requestId,fingerprint:preview.fingerprint}};
  const result=await server.POST(req(body));assert.equal(result.status,200);assert.equal((await result.json()).advice.summary,'연결 확인');assert.equal(sends,1);
  assert.equal((await db.query<{state:string}>('SELECT state FROM yeoni_openai_general.reservations')).rows[0].state,'settled');
  assert.equal((await db.query<{issued:boolean}>('SELECT issued FROM yeoni_openai_general.approvals')).rows[0].issued,true);
  assert.notEqual((await server.POST(req(body))).status,200);assert.equal(sends,1);
  assert.notEqual((await server.PREPARE(req({feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}))).status,200);assert.equal(sends,1);
 }finally{await db.close()}
});

test('general issuance remains fail-closed without explicit synthetic capability',async()=>{
 const {issueGeneralGrant}=await import('../lib/openai-session/general-grant-issuance.ts');const f=fixture(),v=await prepare(f.authority,config,f.billing,review,f.now);let writes=0;
 const p=f.get().proposal,store={transaction:async(work:any)=>work({query:async(q:string)=>{if(!/^\s*SELECT/.test(q)){writes++;throw Error('UNEXPECTED_WRITE')}return {rows:[{disclosure:p.disclosure,fingerprint:p.binding.consentFingerprint}]}}})};
 await assert.rejects(issueGeneralGrant(store,{requestId:config.requestId,identity:f.authority.identity,confirmation:{accepted:true,healthAccepted:false,requestId:v.requestId,fingerprint:v.fingerprint},now:1000}),/HEALTH_CLASSIFICATION_UNAVAILABLE/);assert.equal(writes,0);
});
