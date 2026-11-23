import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticInstallation,readSyntheticTrialConfig,acceptsSyntheticExecuteArm} from '../lib/openai-session/general-synthetic-installation.ts';
const now=1_795_420_000_000,startsAt=now+1_000,expiresAt=now+200_000;
const trial={ownerId:'11111111-1111-4111-8111-111111111111',sessionId:'22222222-2222-4222-8222-222222222222',
 requestId:'33333333-3333-4333-8333-333333333333',expiresAt,allowedOrigin:'https://synthetic.invalid'};
const base={YEONI_OPENAI_SYNTHETIC_ENABLED:'true',YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(trial),
 YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'true',YEONI_OPENAI_SNAPSHOT_REVIEWED:'true'};
const arm=(extra={})=>JSON.stringify({...trial,startsAt,...extra});
function req(origin=trial.allowedOrigin,method='POST',suffix=''){
 return new Request(trial.allowedOrigin+'/api/ai/openai-general-synthetic'+suffix,{method,headers:{origin,authorization:'Bearer fixture-only','sec-fetch-site':'same-origin','content-type':'application/json'}});
}
const response=(s=200)=>new Response(null,{status:s});
test('execute arm checks strict bounded absolute time and all exact trial identity fields',()=>{
 const c=readSyntheticTrialConfig(base,now)!;assert.ok(c);
 assert.equal(acceptsSyntheticExecuteArm(arm(),c,startsAt-1),false);
 assert.equal(acceptsSyntheticExecuteArm(arm(),c,startsAt),true);
 assert.equal(acceptsSyntheticExecuteArm(arm(),c,expiresAt-1),true);
 assert.equal(acceptsSyntheticExecuteArm(arm(),c,expiresAt),false);
 for(const a of [undefined,'','true','{}','bad',arm({startsAt:expiresAt-300_001}),arm({startsAt:'string'}),
   arm({expiresAt:expiresAt-1}),arm({ownerId:'different'}),arm({requestId:'different'}),arm({sessionId:'different'}),arm({allowedOrigin:'https://else.test'}),arm({extra:true})]){
  assert.equal(acceptsSyntheticExecuteArm(a,c,startsAt),false);
 }
 const dyn=readSyntheticTrialConfig({...base,YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify({...trial,sessionId:undefined,sessionBinding:'authenticated'})},now)!;
 assert.ok(dyn);assert.equal(acceptsSyntheticExecuteArm(arm(),dyn,startsAt),false);
 const bound=(extra={})=>arm({...extra,sessionId:undefined,sessionBinding:'first-verified-proposal'});
 assert.equal(acceptsSyntheticExecuteArm(bound(),dyn,startsAt),true);
 assert.equal(acceptsSyntheticExecuteArm(bound(),c,startsAt),false);
 assert.equal(acceptsSyntheticExecuteArm(bound({requestId:'wrong'}),dyn,startsAt),false);
 assert.equal(acceptsSyntheticExecuteArm(arm({sessionBinding:'first-verified-proposal'}),dyn,startsAt),false);
 assert.equal(acceptsSyntheticExecuteArm(bound(),dyn,startsAt-1),false);
 assert.equal(acceptsSyntheticExecuteArm(bound(),dyn,expiresAt),false);
});
test('OFF, PREPARE, early/late and wrong provenance never consult the key or live composer',async()=>{
 let time=now,reads=0,prepares=0;
 const e={...base,YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:arm(),get YEONI_OPENAI_API_KEY(){reads++;return 'fixture-only';}};
 const h=createSyntheticInstallation(e,()=>time,async(_c,prepareEnv)=>{
  assert.ok(!Object.hasOwn(prepareEnv,'YEONI_OPENAI_API_KEY'));prepares++;
  return {available:true,POST:async()=>response(500),PREPARE:async()=>response()};
 },async()=>{assert.fail('live composer denied');});
 assert.equal((await h.POST(req())).status,403);
 assert.equal((await h.PREPARE(req())).status,200);
 assert.equal(reads,0);assert.equal(prepares,1);
 time=startsAt;
 for(const r of [req('https://else.test'),req(trial.allowedOrigin,'GET'),req(trial.allowedOrigin,'POST','?bad=1'),
  new Request(req().url,{method:'POST',headers:{origin:trial.allowedOrigin,'sec-fetch-site':'same-origin','content-type':'application/json'}})])assert.equal((await h.POST(r)).status,403);
 time=expiresAt;
 assert.equal((await h.POST(req())).status,503);assert.equal(reads,0);
 for(const variation of [{...base,YEONI_OPENAI_SYNTHETIC_ENABLED:'false'},{...base,YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:arm({requestId:'mismatch'})},base]){
  time=startsAt;const denied=createSyntheticInstallation({...variation,get YEONI_OPENAI_API_KEY(){reads++;return 'fixture-only';}},()=>time,undefined,async()=>{assert.fail('unexpected execute setup');});
  assert.notEqual((await denied.POST(req())).status,200);
 }
 assert.equal(reads,0);
});
test('armed POST only delegates exact route, once composed; closure cannot later rearm expired config',async()=>{
 let time=startsAt,reads=0,loads=0,delegated=0;
 const e={...base,YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:arm(),get YEONI_OPENAI_API_KEY(){reads++;return 'fixture-only';}};
 const h=createSyntheticInstallation(e,()=>time,undefined,async(c,live)=>{
  loads++;assert.equal(c.requestId,trial.requestId);assert.equal(live.YEONI_OPENAI_API_KEY,'fixture-only');
  return {available:true,POST:async()=>{delegated++;return response();},PREPARE:async()=>response(500)};
 });
 assert.equal(reads,0);
 assert.equal((await h.POST(req())).status,200);
 assert.equal((await h.POST(req())).status,200); // durability is validated in actual composer/SQL tests, not in this mock
 assert.deepEqual([reads,loads,delegated],[1,1,2]);
 time=expiresAt;e.YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM=arm({expiresAt:expiresAt+1000});
 assert.equal((await h.POST(req())).status,503);assert.deepEqual([reads,loads,delegated],[1,1,2]);
});
test('expiry while the live composer is preparing never calls POST',async()=>{
 let time=startsAt,delegated=0;
 const e={...base,YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:arm(),YEONI_OPENAI_API_KEY:'fixture-only'};
 const h=createSyntheticInstallation(e,()=>time,undefined,async()=>{
  time=expiresAt;return {available:true,POST:async()=>{delegated++;return response();},PREPARE:async()=>response(500)};
 });
 assert.equal((await h.POST(req())).status,403);assert.equal(delegated,0);
});
test('live composition and rejected pre-consent POST never reads the existing key',async()=>{
 const {composeGeneralSyntheticServer}=await import('../lib/openai-session/general-synthetic-server.ts');
 const {createGeneralScopedCredentials}=await import('../lib/openai-session/general-server-dependencies.ts');
 const origin=trial.allowedOrigin,projectRef='piqqukiiacncfbztktga',host='fixture.pooler.supabase.com';
 let reads=0,loads=0,providerCalls=0;
 const env={...base,YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:arm(),
  YEONI_OPENAI_GLOBAL_PRICING_REVIEWED:'true',YEONI_OPENAI_PRICE_VERIFIED_AT_MS:String(now),YEONI_OPENAI_PRICE_EXPIRES_AT_MS:String(expiresAt+1000),
  YEONI_OPENAI_DATABASE_HOST:host,YEONI_OPENAI_DATABASE_URL:'postgresql://yeoni_openai_general_server.'+projectRef+':fixture@'+host+':6543/postgres',
  NEXT_PUBLIC_SUPABASE_URL:'https://'+projectRef+'.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',
  YEONI_OPENAI_ALLOWED_ORIGIN:origin,YEONI_OPENAI_BILLING_SCOPE:JSON.stringify({ownerId:trial.ownerId,budgetId:'fixture-budget',organization:'fixture-org',project:'fixture-project',creditVerifiedUntil:expiresAt+1000}),
  get YEONI_OPENAI_API_KEY():never{reads++;throw Error('key must not be consulted for rejected request');}};
 const load=async()=>({
  postgres:()=>{loads++;return {end:async()=>{}};},
  createGeneralAccountingStore:()=>({transaction:async()=>{assert.fail('bad payload reached store');}}),
  createGeneralBillingResolver:()=>async()=>{assert.fail('bad payload reached billing');},
  createGeneralBearerClient:()=>async()=>{assert.fail('bad payload reached Auth');},
  createGeneralScopedCredentials,
  createGeneralProviderTransport:()=>async()=>{providerCalls++;assert.fail('bad payload reached transport');}
 });
 const h=createSyntheticInstallation(env,()=>startsAt,undefined,(c,e,n)=>composeGeneralSyntheticServer(c,e,n,load as never));
 assert.equal((await h.POST(req())).status,400);
 assert.deepEqual([loads,reads,providerCalls],[1,0,0]);
});
test('first-binding manual PREPARE is blocked before its separate arm window; old no-arm stays independent',async()=>{
 let time=now,prepareCalls=0,loads=0;
 const dyn={...trial,sessionId:undefined,sessionBinding:'authenticated'};
 const e={...base,YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(dyn)};
 const mock=async()=>{loads++;return {available:true,POST:async()=>response(500),PREPARE:async()=>{prepareCalls++;return response();}};};
 const bounded=createSyntheticInstallation({...e,YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:arm({sessionId:undefined,sessionBinding:'first-verified-proposal'})},()=>time,mock);
 assert.equal((await bounded.PREPARE(req())).status,503);assert.deepEqual([loads,prepareCalls],[0,0]);
 assert.equal((await createSyntheticInstallation(e,()=>time,mock).PREPARE(req())).status,200);
 time=startsAt;
 assert.equal((await bounded.PREPARE(req())).status,200);assert.deepEqual([loads,prepareCalls],[2,2]);
 time=expiresAt;
 assert.equal((await bounded.PREPARE(req())).status,503);assert.deepEqual([loads,prepareCalls],[2,2]);
});
