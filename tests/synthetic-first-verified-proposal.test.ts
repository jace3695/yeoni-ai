import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createSyntheticInstallation} from '../lib/openai-session/general-synthetic-installation.ts';
import {composeGeneralSyntheticPrepareOnlyServer,composeGeneralSyntheticServer} from '../lib/openai-session/general-synthetic-server.ts';
import {createGeneralBillingResolver,createGeneralScopedCredentials} from '../lib/openai-session/general-server-dependencies.ts';
import {GENERAL_SYNTHETIC_CAP,GENERAL_SYNTHETIC_QUESTION,assertGeneralSyntheticWire} from '../lib/openai-session/general-synthetic-execution.ts';

const ownerId='11111111-1111-4111-8111-111111111111',requestId='33333333-3333-4333-8333-333333333333';
const sessions=['22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444'];
const allowedOrigin='https://synthetic.invalid';

test('installed first-proposal arm binds the winning verified session and epoch; losing EXECUTE has zero write/key/provider',async()=>{
 const db=new PGlite();
 let keyReads=0,attempts=0,writes=0;
 let start=Date.now();
 const noNet=test.mock.method(globalThis,'fetch',async()=>{assert.fail('external network forbidden');});
 try{
  for(const name of ['general-reservation-candidate.sql','general-approval-candidate.sql','general-bound-issuance-candidate.sql',
   'general-dispatch-candidate.sql','general-identity-candidate.sql','general-quote-candidate.sql','general-proposal-store-candidate.sql','general-session-registration-candidate.sql']){
   await db.exec(readFileSync(new URL('../checks/sql/'+name,import.meta.url),'utf8'));
  }
  await db.exec("CREATE SCHEMA yeoni_connector;CREATE FUNCTION yeoni_connector.live_session(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';");
  await db.query("INSERT INTO yeoni_openai_general.budgets VALUES('fixture-budget',$1,'fixture-org','fixture-project','USD',$2,0,true,clock_timestamp()+interval '1 hour')",[ownerId,GENERAL_SYNTHETIC_CAP]);
  // The losing session already has a live epoch. Absence of an epoch cannot
  // explain the losing case below; the stored proposal binding must reject it.
  await db.query("INSERT INTO yeoni_openai_general.session_epochs VALUES($1,$2,500,true,clock_timestamp()+interval '5 minutes')",[ownerId,sessions[1]]);
  start=Date.now();
  const expiresAt=start+240_000,projectRef='piqqukiiacncfbztktga',host='fixture.pooler.supabase.com';
  const trial={ownerId,requestId,allowedOrigin,expiresAt,sessionBinding:'authenticated'};
  const e={YEONI_OPENAI_SYNTHETIC_ENABLED:'true',YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(trial),YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'true',
   YEONI_OPENAI_SNAPSHOT_REVIEWED:'true',YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:JSON.stringify({...trial,sessionBinding:'first-verified-proposal',startsAt:start-1000}),
   YEONI_OPENAI_GLOBAL_PRICING_REVIEWED:'true',YEONI_OPENAI_PRICE_VERIFIED_AT_MS:String(start-1000),YEONI_OPENAI_PRICE_EXPIRES_AT_MS:String(start+250_000),
   YEONI_OPENAI_DATABASE_HOST:host,YEONI_OPENAI_DATABASE_URL:'postgresql://yeoni_openai_general_server.'+projectRef+':fixture@'+host+':6543/postgres',
   NEXT_PUBLIC_SUPABASE_URL:'https://'+projectRef+'.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',
   YEONI_OPENAI_ALLOWED_ORIGIN:allowedOrigin,YEONI_OPENAI_BILLING_SCOPE:JSON.stringify({ownerId,budgetId:'fixture-budget',organization:'fixture-org',project:'fixture-project',creditVerifiedUntil:start+250_000}),
   get YEONI_OPENAI_API_KEY(){keyReads++;return 'synthetic-not-a-key';}};
  const load=async()=>({
   postgres:()=>({end:async()=>{}}),
   createGeneralAccountingStore:()=>({transaction:<T>(work:(tx:{query:(sql:string,values?:unknown[])=>Promise<unknown>})=>Promise<T>)=>db.transaction(tx=>work({query:async(sql,values)=>{
    if(!/^\s*SELECT\b/i.test(sql))writes++;
    return tx.query(sql,values);
   }}))}),
   createGeneralBillingResolver,createGeneralScopedCredentials,
   createGeneralBearerClient:()=>async(r:Request)=>{
    const sessionId=sessions[r.headers.get('authorization')==='Bearer fixture-loser'?1:0];
    return {auth:{
     getUser:async()=>({error:null,data:{user:{id:ownerId,is_anonymous:false}}}),
     getClaims:async()=>({error:null,data:{claims:{sub:ownerId,session_id:sessionId,role:'authenticated',is_anonymous:false,exp:Math.floor(start/1000)+600}}}),
    }};
   },
   createGeneralProviderTransport:()=>async(_url:URL,init:RequestInit)=>{
    assertGeneralSyntheticWire(init.body);attempts++;
    return Response.json({model:'gpt-5.4-mini-2026-03-17',service_tier:'default',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'연결 확인',nextSteps:['가상 확인'],basis:'가상 자료',limitations:'실제 전송 아님'})}}],usage:{prompt_tokens:10,completion_tokens:8}});
   },
  });
  const install=()=>createSyntheticInstallation(e,Date.now,(c,v,n)=>composeGeneralSyntheticPrepareOnlyServer(c,v,n,load as never),
   (c,v,n)=>composeGeneralSyntheticServer(c,v,n,load as never));
  const req=(suffix:string,body:unknown,loser=false)=>new Request(allowedOrigin+'/api/ai/openai-general-synthetic'+suffix,{method:'POST',
   headers:{origin:allowedOrigin,'content-type':'application/json','sec-fetch-site':'same-origin',authorization:loser?'Bearer fixture-loser':'Bearer fixture-winner'},body:JSON.stringify(body)});
  const shape={request:{requestId,feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION},confirmation:{accepted:true,healthAccepted:false,requestId,fingerprint:'a'.repeat(64)}};

  // Before any manual PREPARE, even a previously registered live session is read-only.
  assert.equal((await install().POST(req('',shape,true))).status,503);
  assert.deepEqual([writes,keyReads,attempts],[0,0,0]);
  const prepared=await install().PREPARE(req('/prepare',{feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}));
  assert.equal(prepared.status,200);const {preview}=await prepared.json();
  assert.deepEqual([keyReads,attempts],[0,0]);
  const proposal=(await db.query<{session_id:string;epoch:string}>("SELECT session_id,proposal #>> '{binding,epoch}' AS epoch FROM yeoni_openai_general.proposals")).rows[0];
  assert.equal(proposal.session_id,sessions[0]);assert.ok(Number(proposal.epoch)>0);
  const consent={...shape,confirmation:{...shape.confirmation,fingerprint:preview.fingerprint}};
  const before=writes,otherEpoch=(await db.query<{expires_at:Date}>('SELECT expires_at FROM yeoni_openai_general.session_epochs WHERE session_id=$1',[sessions[1]])).rows[0].expires_at;
  assert.equal((await install().POST(req('',consent,true))).status,503);
  assert.deepEqual([writes,keyReads,attempts],[before,0,0]);
  assert.deepEqual((await db.query<{expires_at:Date}>('SELECT expires_at FROM yeoni_openai_general.session_epochs WHERE session_id=$1',[sessions[1]])).rows[0].expires_at,otherEpoch);

  // Verify stale prepared epoch is denied before any mutation, then restore
  // only this in-memory fixture for the successful same-session control.
  await db.query('UPDATE yeoni_openai_general.session_epochs SET epoch=$1 WHERE session_id=$2',[Number(proposal.epoch)+1000,sessions[0]]);
  assert.equal((await install().POST(req('',consent))).status,503);
  assert.deepEqual([writes,keyReads,attempts],[before,0,0]);
  await db.query('UPDATE yeoni_openai_general.session_epochs SET epoch=$1 WHERE session_id=$2',[Number(proposal.epoch),sessions[0]]);

  const won=await install().POST(req('',consent));
  assert.equal(won.status,200);assert.equal((await won.json()).advice.summary,'연결 확인');
  const handled=writes;
  for(const isOther of [false,true])assert.equal((await install().POST(req('',consent,isOther))).status,503);
  assert.deepEqual([writes,keyReads,attempts],[handled,1,1]);
  assert.deepEqual((await db.query<{state:string}>('SELECT state FROM yeoni_openai_general.reservations')).rows,[{state:'settled'}]);
  assert.equal(noNet.mock.callCount(),0);
 }finally{noNet.mock.restore();await db.close();}
});
