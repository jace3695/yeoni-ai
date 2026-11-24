import test from 'node:test';
import assert from 'node:assert/strict';
import { adviceFingerprint, assertAdviceDisplayPolicy, createOpenAiAdviceService, OpenAiAdviceError } from '../lib/openai-advice-server.ts';
import { createGeneralRouteHandler } from '../lib/openai-session/general-route-handler.ts';
import { createTrialClient, TRIAL_QUESTION } from '../lib/synthetic-trial-client.ts';
const ownerId='fixture-owner', epoch=1, requestId='00000000-0000-4000-8000-000000000001',
 origin='https://fixture.invalid', expiry=Date.now()+60000, now=()=>expiry-60000;
const model='gpt-5.4-mini-2026-03-17', maxCostMicros=302304;
const safe={summary:'연결 확인',basis:'가상 시험 문장',limitations:'실제 기록 없음',nextSteps:['검증 결과 확인']};
function make({advice=safe, rotateAfterPost=false, stallAfterSettlement=false,receiptEnabled=true,extraReceiptProperty=false,wrongReceiptStatus=false,completeError=false,staleAfterSettlement=false}={}){
 let sends=0, settled=0, retained=0, requests=0, status=0, token='fixture-auth', routeCode, routeBody, current=true;
 const grant={id:'fixture-grant',ownerId,epoch,requestId,feature:'conversation',provider:'openai',organization:'fixture-org',project:'fixture-project',
 model,question:TRIAL_QUESTION,summary:'{}',consentId:'fixture-consent',approvalId:'fixture-approval',quoteId:'fixture-quote',pricingVersion:'fixture-price',
 expiresAt:expiry,quoteExpiresAt:expiry,creditVerifiedUntil:expiry,currency:'USD',maxCostMicros,maxOutputTokens:512};
 grant.fingerprint=adviceFingerprint(grant);
 const receipt={...grant,id:'fixture-reservation',grantId:grant.id,reservedMicros:maxCostMicros,sendBefore:expiry};
 const service=createOpenAiAdviceService({enabled:true},{
  authenticate:async()=>({ownerId,epoch}),isCurrent:()=>current,authorize:async()=>grant,reserve:async()=>receipt,
  claimDispatch:async()=>true,credentials:async()=> 'fixture-only',retain:async()=>{retained++},
  complete:async()=>{
   if(completeError)throw new OpenAiAdviceError('UNVERIFIED_ACTION_CLAIM',422);
   settled++;if(staleAfterSettlement)current=false;
  },now,
  request:async()=>{sends++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(advice)}}],usage:{prompt_tokens:100,completion_tokens:10}});}
 });
 const route=createGeneralRouteHandler({enabled:true,allowedOrigin:origin,syntheticSettledReceipt:receiptEnabled},(r,req)=>service(req,r.signal));
 const fakeBrowser=createTrialClient(async()=>({token,owner:ownerId}),async(path,init)=>{
  if(path.endsWith('/prepare'))return Response.json({provider:'openai',sent:false,preview:{...grant,notice:'fixture',healthNotice:''}});
  requests++;
  const response=await route(new Request(origin+path,{...init,headers:{...init.headers,origin,'sec-fetch-site':'same-origin'}}));
  status=response.status; routeBody=await response.clone().json();routeCode=routeBody.code;
  if(rotateAfterPost)token='fixture-same-owner-refreshed-token';
  if(stallAfterSettlement)await new Promise(()=>{});
  if(extraReceiptProperty)return Response.json({...routeBody,advice});
  if(wrongReceiptStatus)return Response.json(routeBody,{status:202});
  return response;
 },now,stallAfterSettlement?250:30000);
 return {fakeBrowser,body:()=>routeBody,state:()=>({sends,settled,retained,requests,status,routeCode})};
}
test('normal settled result passes the exact route and browser result envelope',async()=>{
 const f=make(); await f.fakeBrowser.prepare(); const shown=await f.fakeBrowser.execute(true);
 assert.equal(shown.advice.summary,'연결 확인');
 assert.deepEqual(f.state(),{sends:1,settled:1,retained:0,requests:1,status:200,routeCode:undefined});
});
const withheldAdvice={...safe,limitations:'실제 기록을 변경하지 않고 응답을 전송했습니다.'};
test('scoped receipt is fixed, has no model text, and keeps once-only settlement',async()=>{
 assert.throws(()=>assertAdviceDisplayPolicy(withheldAdvice),e=>e.code==='UNVERIFIED_ACTION_CLAIM');
 const f=make({advice:withheldAdvice}); await f.fakeBrowser.prepare();
 const receipt={outcome:'settled_reply_withheld',provider:'openai',recordActionsPerformed:false};
 assert.deepEqual(await f.fakeBrowser.execute(true),receipt);
 assert.deepEqual(f.body(),receipt);
 assert.equal(JSON.stringify(f.body()).includes(withheldAdvice.limitations),false);
 assert.deepEqual(f.state(),{sends:1,settled:1,retained:0,requests:1,status:200,routeCode:undefined});
 await assert.rejects(f.fakeBrowser.execute(true),/CONSENT_REQUIRED/);assert.equal(f.state().sends,1);
});
test('default general handler still masks policy failure, not a settled receipt',async()=>{
 const advice={...safe,limitations:'실제 기록을 변경하지 않고 응답을 전송했습니다.'};
 assert.throws(()=>assertAdviceDisplayPolicy(advice),e=>e.code==='UNVERIFIED_ACTION_CLAIM');
 const f=make({advice,receiptEnabled:false}); await f.fakeBrowser.prepare(); await assert.rejects(f.fakeBrowser.execute(true),/OUTCOME_UNKNOWN/);
 assert.deepEqual(f.state(),{sends:1,settled:1,retained:0,requests:1,status:503,routeCode:'OPENAI_REQUEST_NOT_COMPLETED'});
 await assert.rejects(f.fakeBrowser.execute(true),/CONSENT_REQUIRED/);assert.equal(f.state().sends,1);
});
test('same-owner token rotation after server HTTP 200 discards answer even without an auth invalidation event',async()=>{
 const f=make({rotateAfterPost:true}); await f.fakeBrowser.prepare(); await assert.rejects(f.fakeBrowser.execute(true),/SESSION_CHANGED/);
 assert.deepEqual(f.state(),{sends:1,settled:1,retained:0,requests:1,status:200,routeCode:undefined});
 await assert.rejects(f.fakeBrowser.execute(true),/CONSENT_REQUIRED/);assert.equal(f.state().sends,1);
});
test('successful settlement and 200 can still be absent from browser after its deadline',async()=>{
 const f=make({stallAfterSettlement:true}); await f.fakeBrowser.prepare(); await assert.rejects(f.fakeBrowser.execute(true),/OUTCOME_UNKNOWN/);
 assert.deepEqual(f.state(),{sends:1,settled:1,retained:0,requests:1,status:200,routeCode:undefined});
 await assert.rejects(f.fakeBrowser.execute(true),/CONSENT_REQUIRED/);assert.equal(f.state().sends,1);
});

test('unrelated policy-coded failure before settlement cannot synthesize a receipt',async()=>{
 const f=make({advice:withheldAdvice,completeError:true}); await f.fakeBrowser.prepare();
 await assert.rejects(f.fakeBrowser.execute(true),/OUTCOME_UNKNOWN/);
 assert.equal(f.state().settled,0);assert.equal(f.body().outcome,undefined);
 assert.equal(f.state().retained,1);assert.equal(f.state().sends,1);
});
test('server account change after settle does not release a receipt or content',async()=>{
 const f=make({advice:withheldAdvice,staleAfterSettlement:true});await f.fakeBrowser.prepare();
 await assert.rejects(f.fakeBrowser.execute(true),/OUTCOME_UNKNOWN/);
 assert.equal(f.state().settled,1); assert.equal(f.body().outcome,undefined);assert.equal(f.body().advice,undefined);
});
test('client still denies post-settlement receipt after same-owner token change',async()=>{
 const f=make({advice:withheldAdvice,rotateAfterPost:true}); await f.fakeBrowser.prepare();
 await assert.rejects(f.fakeBrowser.execute(true),/SESSION_CHANGED/);
 assert.equal(f.body().outcome,'settled_reply_withheld');assert.equal(f.state().sends,1);
});
test('client rejects any added fields or a different HTTP status on a receipt',async()=>{
 for(const extra of [{extraReceiptProperty:true},{wrongReceiptStatus:true}]){
  const f=make({advice:withheldAdvice,...extra}); await f.fakeBrowser.prepare();
  await assert.rejects(f.fakeBrowser.execute(true),/OUTCOME_UNKNOWN/);assert.equal(f.state().sends,1);
 }
});
