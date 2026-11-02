import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createZephyrOnceRunner,createZephyrOnceHttpHandler,ZEPHYR_ONCE,type OnceDependencies} from '../lib/zephyr-28-once.ts';
import {createZephyrServerDependencies,createZephyrReservationBridge,readOnceJson} from '../lib/zephyr-28-adapters.ts';
const owner='00000000-0000-4000-8000-000000000001';
const origin='https://synthetic.invalid', backend='https://synthetic.supabase.co';
const input={requestId:ZEPHYR_ONCE.requestId};
const ok=(v:unknown)=>Response.json(v);
function fixture(){
 let consumed=false,google=0,rpc=0,auth=0,keyReads=0;const requests:string[]=[];
 let providerFailure=false;
 const fetcher:typeof fetch=async(url,init)=>{
  const address=String(url);requests.push(address);
  const headers=new Headers(init?.headers);
  if(address.startsWith(backend+'/auth/v1/user')){auth++;return ok({id:owner,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid'})}
  if(address.includes('/rest/v1/zephyr_28_once'))return ok([{owner_id:owner,approval_id:ZEPHYR_ONCE.approvalId,request_id:ZEPHYR_ONCE.requestId,expires_at:new Date(Date.now()+60_000).toISOString(),execution_approved:true,all_in_cap_verified:true,cost_evidence_id:'SYNTHETIC ONLY',reserved_at:consumed?'synthetic-consumed':null}]);
  if(address.includes('/rest/v1/rpc/reserve_zephyr_28_once')){
   rpc++;assert.deepEqual(JSON.parse(String(init?.body)),{p_owner:owner,p_approval:ZEPHYR_ONCE.approvalId,p_request:ZEPHYR_ONCE.requestId});
   if(consumed)return ok({allowed:false});consumed=true;const now=Date.now();return ok({allowed:true,ownerId:owner,approvalId:ZEPHYR_ONCE.approvalId,requestId:ZEPHYR_ONCE.requestId,characters:28,reservedAt:now,sendBefore:now+10_000});
  }
  if(address===backend+'/functions/v1/zephyr-28-once'){
   assert.equal(headers.has('x-goog-api-key'),false);assert.equal(init?.redirect,'error');
   return bridge(new Request(address,init));
  }
  if(address===ZEPHYR_ONCE.endpoint){google++;assert.equal(headers.get('x-goog-api-key'),'SYNTHETIC-NOT-A-KEY');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.equal(JSON.parse(String(init?.body)).input.text,ZEPHYR_ONCE.text);return providerFailure?new Response('synthetic reject',{status:503}):ok({audioContent:'SUQz'});}
  throw Error('Unexpected outbound request');
 };
 const client=(authorization?:string)=>createClient(backend,'SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetcher,headers:authorization?{Authorization:authorization}:{}}});
 const bridge=createZephyrReservationBridge({caller:authorization=>client(authorization),admin:()=>client()},true);
 const handler=createZephyrOnceHttpHandler({installed:true,environment:'preview',branch:'agent/fitness-record-priority',dependenciesFor:request=>createZephyrServerDependencies(request,client(),{trustedOrigin:origin,supabaseUrl:backend},fetcher,()=>{keyReads++;return 'SYNTHETIC-NOT-A-KEY'})});
 return{handler,fetcher,client,bridge,get google(){return google},get rpc(){return rpc},get auth(){return auth},get keyReads(){return keyReads},requests,fail(){providerFailure=true}};
}
const request=(signal?:AbortSignal)=>new Request(origin+'/api/tts/once-28',{method:'POST',headers:{origin,authorization:'Bearer SYNTHETIC-TOKEN','content-type':'application/json'},body:JSON.stringify(input),signal});
test('actual SDK auth/REST adapters and HTTP factory use fixed bridge/provider; fresh requests never retry provider',async()=>{
 const f=fixture();const responses=await Promise.all([f.handler(request()),f.handler(request())]);
 assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(f.google,1);assert.equal(f.keyReads,1);assert.ok(f.auth>=4);
 assert.equal((await f.handler(request())).status,403);assert.equal(f.google,1);
});
test('actual transport adapter rejected provider consumes synthetic durable state with no autoretry',async()=>{
 const f=fixture();f.fail();assert.equal((await f.handler(request())).status,409);assert.equal(f.google,1);
 await f.handler(request());assert.equal(f.google,1);
});
test('origin and bearer restrictions fail before server key read or any outgoing mock request',async()=>{
 for(const headers of [{origin:'https://other.invalid',authorization:'Bearer SYNTHETIC-TOKEN'}, {origin,authorization:''}]){
  const f=fixture();const req=new Request(origin+'/api/tts/once-28',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(input)});
  assert.equal((await f.handler(req)).status,403);assert.equal(f.requests.length,0);assert.equal(f.keyReads,0);
 }
});
test('cancellation before auth, after auth, pre-reserve, post-reserve and during send fails closed',async()=>{
 for(const stage of ['before','auth','preflight','reserve','dispatch']){
  const controller=new AbortController();let reserved=0,sent=0;
  const permit={ownerId:owner,approvalId:ZEPHYR_ONCE.approvalId,requestId:ZEPHYR_ONCE.requestId,expiresAt:Date.now()+60_000,executionApproved:true,allInCapVerified:true,costEvidenceId:'SYNTHETIC ONLY'};
  const deps:OnceDependencies={authenticate:async()=>{if(stage==='auth')controller.abort();return owner},preflight:async()=>{if(stage==='preflight')controller.abort();return permit},reserve:async()=>{reserved++;if(stage==='reserve')controller.abort();const now=Date.now();return{allowed:true,...permit,characters:28,reservedAt:now,sendBefore:now+10_000}},dispatch:async fixed=>{sent++;controller.abort();assert.equal(fixed.signal.aborted,true);return new Promise(()=>{})},now:Date.now};
  if(stage==='before')controller.abort();const run=createZephyrOnceRunner(deps);
  assert.equal((await run(input,controller.signal)).code,['reserve','dispatch'].includes(stage)?'CONSUMED_OR_UNKNOWN':'BLOCKED');
  assert.equal(reserved,['reserve','dispatch'].includes(stage)?1:0);assert.equal(sent,stage==='dispatch'?1:0);
  if(reserved){await run(input);assert.equal(reserved,1)}
 }
});
test('cancelled HTTP body and oversized streamed provider data never dispatch/retry',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();assert.equal((await f.handler(request(controller.signal))).status,403);assert.equal(f.google,0);
 await assert.rejects(readOnceJson(new Response('x'.repeat(300)).body,256,new AbortController().signal));
 const stream=new ReadableStream<Uint8Array>({pull(){}}),c=new AbortController();const pending=readOnceJson(stream,256,c.signal);c.abort();await assert.rejects(pending);
});
test('reservation bridge default off and invalid identity/action cannot touch service client',async()=>{
 let admin=0;const f=fixture();const clients={caller:()=>f.client(),admin:()=>{admin++;return f.client()}};
 assert.equal((await createZephyrReservationBridge(clients)(request())).status,404);
 const bridge=createZephyrReservationBridge(clients,true);
 const bad=new Request(backend+'/functions/v1/zephyr-28-once',{method:'POST',headers:{authorization:'Bearer SYNTHETIC','content-type':'application/json'},body:JSON.stringify({...input,action:'reserve',ownerId:'forged'})});
 assert.equal((await bridge(bad)).status,400);assert.equal(admin,0);
});
