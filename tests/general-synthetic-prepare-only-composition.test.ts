import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createSyntheticInstallation} from '../lib/openai-session/general-synthetic-installation.ts';
import {composeGeneralSyntheticPrepareOnlyServer} from '../lib/openai-session/general-synthetic-server.ts';
import {createGeneralBillingResolver} from '../lib/openai-session/general-server-dependencies.ts';
import {GENERAL_SYNTHETIC_QUESTION} from '../lib/openai-session/general-synthetic-execution.ts';

test('installed PREPARE validates a real local ledger without reading an OpenAI credential or sending',async()=>{
 const db=new PGlite(), now=Date.now(), origin='https://synthetic.test';
 const owner='10000000-0000-4000-8000-000000000002', session='10000000-0000-4000-8000-000000000003', id='10000000-0000-4000-8000-000000000001';
 const projectRef='piqqukiiacncfbztktga', fixtureHost='synthetic.pooler.supabase.com';
 let secretReads=0, providerFactories=0, poolCalls=0, authCalls=0;
 const env={YEONI_OPENAI_SYNTHETIC_ENABLED:'true',YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify({ownerId:owner,requestId:id,sessionBinding:'authenticated',expiresAt:now+240000,allowedOrigin:origin}),
  YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'true',YEONI_OPENAI_SNAPSHOT_REVIEWED:'true',YEONI_OPENAI_GLOBAL_PRICING_REVIEWED:'true',
  YEONI_OPENAI_PRICE_VERIFIED_AT_MS:String(now-1000),YEONI_OPENAI_PRICE_EXPIRES_AT_MS:String(now+300000),YEONI_OPENAI_DATABASE_HOST:fixtureHost,
  YEONI_OPENAI_DATABASE_URL:'postgresql://yeoni_openai_general_server.'+projectRef+':fixture@'+fixtureHost+':6543/postgres',NEXT_PUBLIC_SUPABASE_URL:'https://'+projectRef+'.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',YEONI_OPENAI_ALLOWED_ORIGIN:origin,YEONI_OPENAI_BILLING_SCOPE:JSON.stringify({ownerId:owner,budgetId:'budget',organization:'synthetic-org',project:'synthetic-project',creditVerifiedUntil:now+300000})};
 Object.defineProperty(env,'YEONI_OPENAI_API_KEY',{enumerable:true,get(){secretReads++;throw Error('provider credentials forbidden for preparation')}});
 Object.defineProperty(env,'UNRELATED_PRIVATE_SETTING',{enumerable:true,get(){throw Error('unrelated environment read forbidden');}});
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('all network forbidden in this test');};
 try{
  for(const f of ['general-reservation-candidate.sql','general-approval-candidate.sql','general-bound-issuance-candidate.sql','general-dispatch-candidate.sql','general-identity-candidate.sql','general-quote-candidate.sql','general-proposal-store-candidate.sql','general-session-registration-candidate.sql'])await db.exec(fs.readFileSync(new URL('../checks/sql/'+f,import.meta.url),'utf8'));
  await db.exec("CREATE SCHEMA yeoni_connector;CREATE FUNCTION yeoni_connector.live_session(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';");
  await db.query("INSERT INTO yeoni_openai_general.budgets VALUES('budget',$1,'synthetic-org','synthetic-project','USD',1000000,0,true,clock_timestamp()+interval '1 hour')",[owner]);
  const load=async()=>({
   postgres:(_url:string,options:any)=>{poolCalls++;assert.equal(options.ssl.rejectUnauthorized,true);return {end:async()=>{}};},
   createGeneralAccountingStore:()=>({transaction:(work:any)=>db.transaction(work)}),
   createGeneralBillingResolver,
   createGeneralBearerClient:()=>async()=>({auth:{
    getUser:async()=>{authCalls++;return {error:null,data:{user:{id:owner,is_anonymous:false}}};},
    getClaims:async()=>({error:null,data:{claims:{sub:owner,session_id:session,role:'authenticated',is_anonymous:false,exp:Math.floor(now/1000)+3600}}})}}),
   createGeneralScopedCredentials:()=>{providerFactories++;throw Error('no credentials factory allowed');},
   createGeneralProviderTransport:()=>{providerFactories++;throw Error('no provider transport allowed');}
  }) as any;
  const h=createSyntheticInstallation(env,()=>now,(c,e,n)=>composeGeneralSyntheticPrepareOnlyServer(c,e,n,load));
  const req=(suffix:string,body:unknown)=>new Request(origin+'/api/ai/openai-general-synthetic'+suffix,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  const b={feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'};
  const res=await h.PREPARE(req('/prepare',b));const prepared=await res.json();
  assert.equal(res.status,200,JSON.stringify(prepared));
  assert.equal(prepared.sent,false);assert.equal(prepared.preview.question,GENERAL_SYNTHETIC_QUESTION);
  assert.equal(prepared.preview.summary,'{}');
  const exec=await h.POST(req('',{request:{requestId:id,feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION},confirmation:{accepted:true,healthAccepted:false,requestId:id,fingerprint:prepared.preview.fingerprint}}));
  assert.equal(exec.status,403);assert.equal((await exec.json()).code,'OPENAI_SYNTHETIC_PREPARE_ONLY');
  assert.equal(poolCalls,1);assert.ok(authCalls>0);assert.equal(providerFactories,0);assert.equal(secretReads,0);
  assert.equal((await db.query('SELECT request_id FROM yeoni_openai_general.proposals')).rows.length,1);
  for(const t of ['grants','reservations'])assert.equal((await db.query('SELECT request_id FROM yeoni_openai_general.'+t)).rows.length,0);
  assert.equal(Number((await db.query<{held_micros:number}>('SELECT held_micros FROM yeoni_openai_general.budgets')).rows[0].held_micros),0);
 }finally{globalThis.fetch=originalFetch;await db.close();}
});
