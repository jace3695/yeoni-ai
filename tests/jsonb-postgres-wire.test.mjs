import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {once} from 'node:events';
import postgres from 'postgres';
import {PGlite} from '@electric-sql/pglite';

const int=(n)=>{const b=Buffer.alloc(4);b.writeInt32BE(n);return b};
const frame=(tag,body)=>Buffer.concat([Buffer.from(tag),int(body.length+4),body]);
const pStatus=(k,v)=>frame('S',Buffer.from(k+'\0'+v+'\0'));
async function localPgWire(db){
 await db.waitReady;
 const sockets=new Set();
 const listener=createServer(socket=>{
  assert.equal(socket.remoteAddress,'127.0.0.1');
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
  let startup=true,buffer=Buffer.alloc(0),stream=Promise.resolve();
  socket.on('data',data=>{
   buffer=Buffer.concat([buffer,data]);
   while(buffer.length>=(startup?4:5)){
    const messageLen=startup?buffer.readUInt32BE(0):buffer.readUInt32BE(1)+1;
    if(messageLen>buffer.length)break;
    const message=buffer.subarray(0,messageLen);buffer=buffer.subarray(messageLen);
    if(startup){
     startup=false;
     socket.write(Buffer.concat([frame('R',int(0)),pStatus('server_version','17.0'),pStatus('client_encoding','UTF8'),
      frame('K',Buffer.concat([int(1000),int(1001)])),frame('Z',Buffer.from('I'))]));
    }else if(message[0]===88){socket.end();} // fixture client Terminate
    else{
     stream=stream.then(async()=>{
      const r=await db.execProtocolRaw(message,{syncToFs:false});
      if(r.length&&!socket.destroyed)socket.write(r);
     }).catch(e=>socket.destroy(e));
    }
   }
  });
 });
 listener.listen(0,'127.0.0.1');
 await once(listener,'listening');
 const port=listener.address().port;
 return {port,async close(){for(const s of sockets)s.destroy();await new Promise(resolve=>listener.close(resolve));}};
}

test('installed postgres.js 3.4.9 non-prepared driver describes JSONB and re-serializes pre-stringified values, text bind preserves object',async()=>{
 const db=new PGlite(),wire=await localPgWire(db);
 const sql=postgres({host:'127.0.0.1',port:wire.port,username:'fixture-only',database:'fixture-only',prepare:false,fetch_types:false,max:1,connect_timeout:2,idle_timeout:2});
 try{
  const fixture=JSON.stringify({example:'가상',nested:{number:7}});
  const [old]=await sql.unsafe('select jsonb_typeof($1::jsonb) as kind, $1::jsonb as value',[fixture]);
  const [fixed]=await sql.unsafe('select jsonb_typeof(($1::text)::jsonb) as kind, ($1::text)::jsonb as value',[fixture]);
  assert.equal(old.kind,'string');assert.equal(old.value,fixture);
  assert.equal(fixed.kind,'object');assert.deepEqual(fixed.value,{example:'가상',nested:{number:7}});
 }finally{await sql.end({timeout:1});await wire.close();await db.close();}
});
export {localPgWire};

test('corrected exact synthetic PREPARE/EXECUTE uses actual postgres.js wire JSON objects before mocked provider dispatch',async()=>{
 const {readFileSync}=await import('node:fs');
 const {createSyntheticInstallation}=await import('../lib/openai-session/general-synthetic-installation.ts');
 const {composeGeneralSyntheticPrepareOnlyServer,composeGeneralSyntheticServer}=await import('../lib/openai-session/general-synthetic-server.ts');
 const {createGeneralAccountingStore,createGeneralBillingResolver,createGeneralScopedCredentials}=await import('../lib/openai-session/general-server-dependencies.ts');
 const {GENERAL_SYNTHETIC_QUESTION,GENERAL_SYNTHETIC_CAP,assertGeneralSyntheticWire}=await import('../lib/openai-session/general-synthetic-execution.ts');

 const db=new PGlite(),fetched=test.mock.method(globalThis,'fetch',async()=>{assert.fail('external network forbidden');});
 let wire,sql,keys=0,sends=0;
 try{
  for(const name of ['general-reservation-candidate.sql','general-approval-candidate.sql','general-bound-issuance-candidate.sql',
   'general-dispatch-candidate.sql','general-identity-candidate.sql','general-quote-candidate.sql','general-proposal-store-candidate.sql','general-session-registration-candidate.sql']){
   await db.exec(readFileSync(new URL('../checks/sql/'+name,import.meta.url),'utf8'));
  }
  await db.exec("CREATE SCHEMA yeoni_connector;CREATE FUNCTION yeoni_connector.live_session(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';");
  const ownerId='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
  await db.query("INSERT INTO yeoni_openai_general.budgets VALUES('fixture-budget',$1,'fixture-org','fixture-project','USD',$2,0,true,clock_timestamp()+interval '1 hour')",[ownerId,GENERAL_SYNTHETIC_CAP]);
  wire=await localPgWire(db);
  sql=postgres({host:'127.0.0.1',port:wire.port,username:'fixture-only',database:'fixture-only',prepare:false,fetch_types:true,max:1,connect_timeout:2,idle_timeout:2});
  const n=Date.now(),expiresAt=n+240_000,projectRef='piqqukiiacncfbztktga',host='fixture.pooler.supabase.com',allowedOrigin='https://synthetic.invalid';
  const trial={ownerId,requestId,allowedOrigin,expiresAt,sessionBinding:'authenticated'};
  const e={YEONI_OPENAI_SYNTHETIC_ENABLED:'true',YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(trial),YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'true',
   YEONI_OPENAI_SNAPSHOT_REVIEWED:'true',YEONI_OPENAI_SYNTHETIC_EXECUTE_ARM:JSON.stringify({...trial,sessionBinding:'first-verified-proposal',startsAt:n-1000}),
   YEONI_OPENAI_GLOBAL_PRICING_REVIEWED:'true',YEONI_OPENAI_PRICE_VERIFIED_AT_MS:String(n-1000),YEONI_OPENAI_PRICE_EXPIRES_AT_MS:String(n+250_000),
   YEONI_OPENAI_DATABASE_HOST:host,YEONI_OPENAI_DATABASE_URL:'postgresql://yeoni_openai_general_server.'+projectRef+':fixture@'+host+':6543/postgres',
   NEXT_PUBLIC_SUPABASE_URL:'https://'+projectRef+'.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',
   YEONI_OPENAI_ALLOWED_ORIGIN:allowedOrigin,YEONI_OPENAI_BILLING_SCOPE:JSON.stringify({ownerId,budgetId:'fixture-budget',organization:'fixture-org',project:'fixture-project',creditVerifiedUntil:n+250_000}),
   get YEONI_OPENAI_API_KEY(){keys++;return 'synthetic-not-a-key';}};
  const load=async()=>({
   postgres:(_url,options)=>{assert.equal(options.prepare,false);assert.equal(options.ssl.rejectUnauthorized,true);return sql;},
   createGeneralAccountingStore,createGeneralBillingResolver,createGeneralScopedCredentials,
   createGeneralBearerClient:()=>async()=>({auth:{
    getUser:async()=>({error:null,data:{user:{id:ownerId,is_anonymous:false}}}),
    getClaims:async()=>({error:null,data:{claims:{sub:ownerId,session_id:sessionId,role:'authenticated',is_anonymous:false,exp:Math.floor(n/1000)+600}}}),
   }}),
   createGeneralProviderTransport:()=>async(_url,init)=>{
    assertGeneralSyntheticWire(init?.body);sends++;
    return Response.json({model:'gpt-5.4-mini-2026-03-17',service_tier:'default',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'연결 확인',nextSteps:['가상 확인'],basis:'가상 자료',limitations:'실제 전송 아님'})}}],usage:{prompt_tokens:10,completion_tokens:8}});
   },
  });
  const install=()=>createSyntheticInstallation(e,Date.now,
   (c,ec,t)=>composeGeneralSyntheticPrepareOnlyServer(c,ec,t,load),
   (c,ec,t)=>composeGeneralSyntheticServer(c,ec,t,load));
  const post=(suffix,body)=>new Request(allowedOrigin+'/api/ai/openai-general-synthetic'+suffix,{method:'POST',
   headers:{origin:allowedOrigin,'content-type':'application/json','sec-fetch-site':'same-origin',authorization:'Bearer fixture-only'},
   body:JSON.stringify(body)});
  const app=install();
  const pre=await app.PREPARE(post('/prepare',{feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}));
  const prepared=await pre.json();assert.equal(pre.status,200,JSON.stringify(prepared));
  assert.deepEqual([...await sql.unsafe('select jsonb_typeof(proposal) as type,consumed from yeoni_openai_general.proposals')],[{type:'object',consumed:false}]);
  assert.deepEqual([keys,sends],[0,0]);
  const consent={request:{requestId,feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION},confirmation:{accepted:true,healthAccepted:false,requestId,fingerprint:prepared.preview.fingerprint}};
  const got=await app.POST(post('',consent));
  const result=await got.json();assert.equal(got.status,200,JSON.stringify(result));assert.equal(result.advice.summary,'연결 확인');
  assert.deepEqual([...await sql.unsafe('select jsonb_typeof(disclosure) as disclosure,jsonb_typeof(legacy_binding) as binding from yeoni_openai_general.approvals')],[{disclosure:'object',binding:'object'}]);
  assert.deepEqual([...await sql.unsafe('select jsonb_typeof(legacy_binding) as binding from yeoni_openai_general.grants')],[{binding:'object'}]);
  assert.deepEqual([...await sql.unsafe('select state from yeoni_openai_general.reservations')],[{state:'settled'}]);
  assert.equal((await install().POST(post('',consent))).status,503);
  assert.deepEqual([keys,sends,fetched.mock.callCount()],[1,1,0]);
 }finally{fetched.mock.restore();if(sql)await sql.end({timeout:1});if(wire)await wire.close();await db.close();}
});
