import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import {isZephyrSupabaseOrigin,hasZephyrIssuer,ZEPHYR_SUPABASE_ORIGIN} from '../lib/zephyr-28-host.ts';
import {createZephyrNextWrapper,createZephyrPreflightWrapper,ZEPHYR_PREVIEW_ORIGIN,ZEPHYR_PREVIEW_BRANCH} from '../lib/zephyr-28-wrappers.ts';
import {startZephyrEdge} from '../docs/zephyr-28-once/install/edge-index.ts';
import {syntheticTrialJwt} from './zephyr-28-fixtures.ts';
const origin=ZEPHYR_PREVIEW_ORIGIN;
const jwt=(iss:unknown)=>'e30.'+Buffer.from(JSON.stringify({iss})).toString('base64url')+'.SYNTHETIC';
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:ZEPHYR_PREVIEW_BRANCH,YEONI_ZEPHYR_28_ONCE_ENABLED:'1',YEONI_ZEPHYR_28_TRUSTED_ORIGIN:origin,NEXT_PUBLIC_SUPABASE_URL:ZEPHYR_SUPABASE_ORIGIN};
const request=(token=syntheticTrialJwt)=>new Request(origin+'/api/tts/once-28/preflight',{method:'POST',headers:{origin,authorization:'Bearer '+token}});
test('canonical fixed host rejects credentials/path/query/fragment/port/whitespace and issuer is rejection-only',()=>{
 for(const value of [ZEPHYR_SUPABASE_ORIGIN,ZEPHYR_SUPABASE_ORIGIN+'/'])assert.equal(isZephyrSupabaseOrigin(value),true);
 for(const value of ['https://other.supabase.co',ZEPHYR_SUPABASE_ORIGIN+'/auth/v1',ZEPHYR_SUPABASE_ORIGIN+'?x=1',ZEPHYR_SUPABASE_ORIGIN+'#x',ZEPHYR_SUPABASE_ORIGIN+':8443','https://user:pass@piqqukiiacncfbztktga.supabase.co',' '+ZEPHYR_SUPABASE_ORIGIN,ZEPHYR_SUPABASE_ORIGIN+'/../',ZEPHYR_SUPABASE_ORIGIN+'\\x'])assert.equal(isZephyrSupabaseOrigin(value),false,value);
 assert.equal(hasZephyrIssuer('Bearer '+syntheticTrialJwt),true,'shape/iss match does not establish signature authenticity');
 for(const token of ['', 'opaque', jwt('https://other.supabase.co/auth/v1'),jwt(ZEPHYR_SUPABASE_ORIGIN+'/auth/v1/'),jwt(null),'e30.e30.SYNTHETIC'])assert.equal(hasZephyrIssuer('Bearer '+token),false);
});
test('wrong configured host or issuer blocks before client construction for preflight and synthesis',async()=>{
 let clients=0,calls=0;
 const client=async()=>{clients++;throw Error('must not construct')};
 const transport:typeof fetch=async()=>{calls++;throw Error('must not send')};
 for(const settings of [{...env,NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'},{...env,NEXT_PUBLIC_SUPABASE_URL:ZEPHYR_SUPABASE_ORIGIN+'?x=1'}]){
  assert.equal((await createZephyrPreflightWrapper(()=>settings,client)(request())).status,403);
  const r=new Request(origin+'/api/tts/once-28',{method:'POST',headers:{origin,authorization:'Bearer '+syntheticTrialJwt,'content-type':'application/json'},body:JSON.stringify({requestId:'bba03bc1-0ca2-46a5-8635-55ed913bd424'})});
  assert.equal((await createZephyrNextWrapper(()=>settings,client,transport)(r)).status,403);
 }
 assert.equal((await createZephyrPreflightWrapper(()=>env,client)(request(jwt('https://other.supabase.co/auth/v1')))).status,403);
 assert.equal(clients,0);assert.equal(calls,0);
});
test('preflight requires real getUser result and returns only booleans; never Edge/REST/provider/key',async()=>{
 let calls=0;let accepted=false;let keyReads=0;
 const settings=Object.defineProperty({...env},'GOOGLE_TTS_API_KEY',{get(){keyReads++;throw Error('no key access')}});
 const client=createClient(ZEPHYR_SUPABASE_ORIGIN,'SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
  calls++;assert.equal(String(url),ZEPHYR_SUPABASE_ORIGIN+'/auth/v1/user');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+syntheticTrialJwt);
  return accepted?Response.json({id:'00000000-0000-4000-8000-000000000001'}):Response.json({message:'synthetic invalid signature'},{status:401});
 }}});
 const preflight=createZephyrPreflightWrapper(()=>settings,async()=>client);
 const denied=await preflight(request());assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{hostMatches:false,authenticated:false});
 accepted=true;const success=await preflight(request());assert.equal(success.status,200);assert.deepEqual(await success.json(),{hostMatches:true,authenticated:true});
 assert.equal(calls,2);assert.equal(keyReads,0);
 const noAuth=new Request(origin+'/api/tts/once-28/preflight',{method:'POST',headers:{origin}});assert.equal((await preflight(noAuth)).status,403);assert.equal(calls,2);
});
test('preflight abort after server auth suppresses successful proof',async()=>{
 const controller=new AbortController();const client=createClient(ZEPHYR_SUPABASE_ORIGIN,'SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{controller.abort();return Response.json({id:'00000000-0000-4000-8000-000000000001'})}}});
 const r=new Request(origin+'/api/tts/once-28/preflight',{method:'POST',headers:{origin,authorization:'Bearer '+syntheticTrialJwt},signal:controller.signal});
 const response=await createZephyrPreflightWrapper(()=>env,async()=>client)(r);assert.equal(response.status,401);assert.deepEqual(await response.json(),{hostMatches:false,authenticated:false});
});
test('Edge boot defaults off even with environment flag; only explicit approved entry selects activation',async()=>{
 let handler:((r:Request)=>Promise<Response>)|undefined;const reads:string[]=[];
 const runtime={env:{get(name:string){reads.push(name);return name==='YEONI_ZEPHYR_28_EDGE_ENABLED'?'1':undefined}},serve(fn:(r:Request)=>Promise<Response>){handler=fn}};
 startZephyrEdge(runtime);assert.equal((await handler!(request())).status,404);assert.ok(!reads.includes('YEONI_ZEPHYR_28_EDGE_ENABLED'));
 startZephyrEdge(runtime,true);assert.equal((await handler!(request())).status,503,'enabled path still refuses missing project credentials');
 assert.match(readFileSync('docs/zephyr-28-once/install/edge-approved-main.ts','utf8'),/startZephyrEdge\(Deno, true\)/);
 assert.doesNotMatch(readFileSync('docs/zephyr-28-once/install/edge-main.ts','utf8'),/startZephyrEdge\(Deno, true\)/);
});

test('actual Next Node adapter empty POST stream is accepted; any payload byte is rejected before auth',async()=>{
 const {NextRequestAdapter}=await import('next/dist/server/web/spec-extension/adapters/next-request.js');
 const {NodeNextRequest}=await import('next/dist/server/base-http/node.js');
 const {Readable}=await import('node:stream');
 let auth=0;
 const client=createClient(ZEPHYR_SUPABASE_ORIGIN,'SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{auth++;return Response.json({id:'00000000-0000-4000-8000-000000000001'})}}});
 const preflight=createZephyrPreflightWrapper(()=>env,async()=>client);
 for(const payload of ['', '{}',' ']){
  const raw=Object.assign(Readable.from(payload?[Buffer.from(payload)]:[]),{method:'POST',url:origin+'/api/tts/once-28/preflight',headers:{origin,authorization:'Bearer '+syntheticTrialJwt,'content-length':String(Buffer.byteLength(payload))}});
  const req=NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(raw as unknown as import('node:http').IncomingMessage),new AbortController().signal);
  assert.notEqual(req.body,null);const response=await preflight(req);assert.equal(response.status,payload?403:200);
 }assert.equal(auth,1);
});
test('empty-body preflight reader stops a hanging stream on cancellation without auth',async()=>{
 let auth=0;const controller=new AbortController();
 const req=new Request(origin+'/api/tts/once-28/preflight',{method:'POST',headers:{origin,authorization:'Bearer '+syntheticTrialJwt},body:new ReadableStream({pull(){}}),signal:controller.signal,duplex:'half'} as RequestInit);
 const pending=createZephyrPreflightWrapper(()=>env,async()=>{auth++;throw Error('must not auth')})(req);
 controller.abort();assert.equal((await pending).status,403);assert.equal(auth,0);
});
