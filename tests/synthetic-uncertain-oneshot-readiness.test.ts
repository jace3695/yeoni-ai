import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {composeGeneralSyntheticPrepareOnlyServer,composeGeneralSyntheticServer} from '../lib/openai-session/general-synthetic-server.ts';
import {GENERAL_SYNTHETIC_CAP,GENERAL_SYNTHETIC_QUESTION,assertGeneralSyntheticWire} from '../lib/openai-session/general-synthetic-execution.ts';
import {createSyntheticInstallation,readSyntheticTrialConfig} from '../lib/openai-session/general-synthetic-installation.ts';

import {createGeneralBillingResolver,createGeneralScopedCredentials} from '../lib/openai-session/general-server-dependencies.ts';

const ownerId='11111111-1111-4111-8111-111111111111';
const sessionId='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const allowedOrigin='https://synthetic.invalid';

test('exact reviewed synthetic route retains entire uncertain hold and cannot dispatch again after handler restart',async()=>{
 const db=new PGlite();let attempts=0,credentialResolutions=0;
 try{
  for(const name of ['general-reservation-candidate.sql','general-approval-candidate.sql','general-bound-issuance-candidate.sql',
   'general-dispatch-candidate.sql','general-identity-candidate.sql','general-quote-candidate.sql','general-proposal-store-candidate.sql','general-session-registration-candidate.sql']){
   await db.exec(readFileSync(new URL('../checks/sql/'+name,import.meta.url),'utf8'));
  }
  await db.exec("CREATE SCHEMA yeoni_connector;CREATE FUNCTION yeoni_connector.live_session(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';");
  await db.query("INSERT INTO yeoni_openai_general.budgets VALUES('fixture-budget',$1,'fixture-org','fixture-project','USD',$2,0,true,clock_timestamp()+interval '1 hour')",[ownerId,GENERAL_SYNTHETIC_CAP]);
  const n=Date.now(),expiresAt=n+240_000,projectRef='piqqukiiacncfbztktga',host='fixture.pooler.supabase.com';
  const trial={ownerId,sessionId,requestId,allowedOrigin,expiresAt};
  const env={YEONI_OPENAI_SYNTHETIC_ENABLED:'true',YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'true',YEONI_OPENAI_SNAPSHOT_REVIEWED:'true',
   YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(trial),YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:JSON.stringify({...trial,startsAt:n-1000}),
   YEONI_OPENAI_GLOBAL_PRICING_REVIEWED:'true',YEONI_OPENAI_PRICE_VERIFIED_AT_MS:String(n-1000),YEONI_OPENAI_PRICE_EXPIRES_AT_MS:String(n+250_000),
   YEONI_OPENAI_DATABASE_HOST:host,YEONI_OPENAI_DATABASE_URL:'postgresql://yeoni_openai_general_server.'+projectRef+':fixture@'+host+':6543/postgres',
   NEXT_PUBLIC_SUPABASE_URL:'https://'+projectRef+'.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',
   YEONI_OPENAI_ALLOWED_ORIGIN:allowedOrigin,YEONI_OPENAI_BILLING_SCOPE:JSON.stringify({ownerId,budgetId:'fixture-budget',organization:'fixture-org',project:'fixture-project',creditVerifiedUntil:n+250_000}),
   get YEONI_OPENAI_API_KEY(){credentialResolutions++;return 'synthetic-not-a-key';}};
  const load=async()=>({
   postgres:()=>({end:async()=>{}}),
   createGeneralAccountingStore:()=>({transaction:<T>(work:Parameters<typeof db.transaction<T>>[0])=>db.transaction(work)}),
   createGeneralBillingResolver,
   createGeneralScopedCredentials,
   createGeneralBearerClient:()=>async()=>({auth:{getUser:async()=>({error:null,data:{user:{id:ownerId,is_anonymous:false}}}),getClaims:async()=>({error:null,data:{claims:{sub:ownerId,session_id:sessionId,role:'authenticated',is_anonymous:false,exp:Math.floor(n/1000)+3600}}})}}),
   createGeneralProviderTransport:()=>async(_url:URL,init:RequestInit)=>{
    assertGeneralSyntheticWire(init?.body);
    assert.deepEqual(await ledger(),{held:GENERAL_SYNTHETIC_CAP,reservations:[{state:'sending',hold:GENERAL_SYNTHETIC_CAP}]});
    attempts++;throw Error('FAKE_LOST_PROVIDER_REPLY_AFTER_DISPATCH');
   },
  });
  const install=()=>createSyntheticInstallation(env,Date.now,
   (c,e,clock)=>composeGeneralSyntheticPrepareOnlyServer(c,e,clock,load as never),
   (c,e,clock)=>composeGeneralSyntheticServer(c,e,clock,load as never));
  const ledger=async()=>{
   const budget=(await db.query<{held_micros:number}>('SELECT held_micros FROM yeoni_openai_general.budgets')).rows[0];
   const reservations=(await db.query<{state:string;held_micros:number}>('SELECT state,held_micros FROM yeoni_openai_general.reservations')).rows;
   return {held:Number(budget.held_micros),reservations:reservations.map(r=>({state:r.state,hold:Number(r.held_micros)}))};
  };
  const post=(suffix:string,body:unknown)=>new Request(allowedOrigin+'/api/ai/openai-general-synthetic'+suffix,{method:'POST',
   headers:{origin:allowedOrigin,'content-type':'application/json','sec-fetch-site':'same-origin',authorization:'Bearer fixture-only'},body:JSON.stringify(body)});
  const server=install();
  const pre=await server.PREPARE(post('/prepare',{feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}));
  assert.equal(pre.status,200);const {preview}=await pre.json();assert.equal(attempts,0);assert.equal(credentialResolutions,0);
  assert.deepEqual(await ledger(),{held:0,reservations:[]});
  const body={request:{requestId,feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION},confirmation:{accepted:true,healthAccepted:false,requestId,fingerprint:preview.fingerprint}};
  const first=await server.POST(post('',body));assert.equal(first.status,503);
  assert.equal((await first.json()).code,'OPENAI_REQUEST_NOT_COMPLETED');
  assert.equal(attempts,1);assert.equal(credentialResolutions,1);
  assert.deepEqual(await ledger(),{held:GENERAL_SYNTHETIC_CAP,reservations:[{state:'uncertain',hold:GENERAL_SYNTHETIC_CAP}]});
  const restarted=install();
  assert.equal((await restarted.POST(post('',body))).status,503);
  assert.equal(attempts,1);assert.equal(credentialResolutions,1);
  assert.deepEqual(await ledger(),{held:GENERAL_SYNTHETIC_CAP,reservations:[{state:'uncertain',hold:GENERAL_SYNTHETIC_CAP}]});
 }finally{await db.close();}
});

test('legacy elapsed-time check alone becomes active near a far-future expiry; readiness requires separate absolute start',()=>{
 const n=1_795_420_000_000,expiresAt=n+600_000;
 const e={YEONI_OPENAI_SYNTHETIC_ENABLED:'true',YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'true',YEONI_OPENAI_SNAPSHOT_REVIEWED:'true',
  YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify({requestId,ownerId,sessionId,expiresAt,allowedOrigin})};
 assert.equal(readSyntheticTrialConfig(e,n),null);
 assert.equal(readSyntheticTrialConfig(e,n+299_999),null);
 assert.equal(readSyntheticTrialConfig(e,n+300_000)?.expiresAt,expiresAt);
 assert.equal(readSyntheticTrialConfig(e,expiresAt),null);
});
