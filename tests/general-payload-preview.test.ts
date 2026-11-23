import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IncomingMessage} from 'node:http';
import {Socket} from 'node:net';
import {NodeNextRequest} from 'next/dist/server/base-http/node.js';
import {NextRequestAdapter} from 'next/dist/server/web/spec-extension/adapters/next-request.js';
import {createComputedPayloadPreviewHandler} from '../lib/openai-session/general-payload-preview-route.ts';
import {previewFixedGeneralPayload} from '../lib/openai-session/general-payload-preview.ts';
import {PAYLOAD_PREVIEW_PATH,requestPayloadPreview} from '../lib/openai-payload-preview-contract.ts';
import {createPayloadPreviewAuthState} from '../lib/payload-preview-auth-state.ts';
import {POST as installed} from '../app/api/ai/openai-general-synthetic/payload-preview/route.ts';
const origin='https://ai-fitness-app-ten.vercel.app',auth='https://piqqukiiacncfbztktga.supabase.co';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const values={YEONI_OPENAI_PAYLOAD_PREVIEW_ENABLED:'true',YEONI_OPENAI_PAYLOAD_PREVIEW_OWNER:owner,NEXT_PUBLIC_SUPABASE_URL:auth,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const request=(extra:RequestInit={},url=origin+PAYLOAD_PREVIEW_PATH)=>new Request(url,{method:'POST',
 headers:{origin,'sec-fetch-site':'same-origin',authorization:'Bearer fake-session'},...extra});
function fixture(user=owner,sub=user,anonymous=false){
 const calls:string[]=[];
 return {calls,make:({url,publicKey}:{url:string;publicKey:string})=>{
  assert.equal(url,auth);assert.equal(publicKey,'sb_publishable_fixture');calls.push('SDK');
  return async(r:Request)=>{
   assert.equal(r.headers.get('authorization'),'Bearer fake-session');
   return {auth:{getUser:async()=>{calls.push('getUser');return {error:null,data:{user:{id:user,is_anonymous:anonymous}}};},
    getClaims:async()=>{calls.push('getClaims');return {error:null,data:{claims:{sub,session_id:other,role:'authenticated',is_anonymous:false,exp:Math.floor(Date.now()/1000)+10}}};}}};
  };
 }};
}
async function deny(r:Response){assert.equal(r.status,404);assert.deepEqual(await r.json(),{code:'PREVIEW_UNAVAILABLE'});assert.match(r.headers.get('cache-control')!,/no-store/);}
// The Next.js 16.4.6 Node App Route template constructs this exact adapter.
// The socket is never connected; complete the IncomingMessage in memory.
function adapted(headers:Record<string,string>={},bytes?:string){
 const incoming=new IncomingMessage(new Socket());
 incoming.method='POST';incoming.url=origin+PAYLOAD_PREVIEW_PATH;
 incoming.headers={origin,'sec-fetch-site':'same-origin',...headers};
 if(bytes!==undefined)incoming.push(Buffer.from(bytes));
 incoming.push(null);
 return NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming),new AbortController().signal);
}
test('actual Next Node adapter: repeated zero-byte POST reaches only the verified mock owner',async()=>{
 const f=fixture(),handle=createComputedPayloadPreviewHandler(values,f.make);
 const missing=adapted({'content-length':'0'});
 assert.notEqual(missing.body,null);
 await deny(await handle(missing));
 assert.deepEqual(f.calls,[]);
 for(const length of [{},{'content-length':'0'}] as Record<string,string>[]){
  const r=adapted({authorization:'Bearer fake-session',...length});
  assert.notEqual(r.body,null);
  const res=await handle(r);
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),previewFixedGeneralPayload());
 }
 assert.deepEqual(f.calls,['SDK','getUser','getClaims','SDK','getUser','getClaims']);
 const wrong=fixture(other);
 await deny(await createComputedPayloadPreviewHandler(values,wrong.make)(adapted({authorization:'Bearer fake-session','content-length':'0'})));
 assert.deepEqual(wrong.calls,['SDK','getUser']);
});
test('body proof denies bytes, framing, consumed/locked bodies and stream failure before Auth',async()=>{
 const f=fixture(),handle=createComputedPayloadPreviewHandler(values,f.make);
 const h={authorization:'Bearer fake-session'};
 await deny(await handle(adapted(h,'x')));
 await deny(await handle(adapted({...h,'content-length':'0'},'x')));
 await deny(await handle(adapted({...h,'content-length':'1'},'x')));
 await deny(await handle(adapted({...h,'transfer-encoding':'chunked'})));
 await deny(await handle(adapted({...h,'content-length':'00'})));
 const used=request({body:'x'});await used.text();await deny(await handle(used));
 const locked=request({body:'x'}),reader=locked.body!.getReader();
 try{await deny(await handle(locked));}finally{await reader.cancel();reader.releaseLock();}
 const broken=new ReadableStream<Uint8Array>({start(c){c.error(new Error('FIXTURE_BODY_ERROR'));}});
 await deny(await handle(request({body:broken,duplex:'half'} as RequestInit)));
 assert.deepEqual(f.calls,[]);
});
test('body proof times out or aborts before Auth and need not wait for cancellation',async()=>{
 const f=fixture(),handle=createComputedPayloadPreviewHandler(values,f.make);
 for(const earlyAbort of [false,true]){
  const stop=new AbortController();let cancelled=0;
  const stalled=new ReadableStream<Uint8Array>({cancel(){cancelled+=1;return new Promise(()=>{});}});
  const r=request({body:stalled,duplex:'half',signal:stop.signal} as RequestInit);
  const pending=handle(r);
  if(earlyAbort)queueMicrotask(()=>stop.abort());
  await deny(await pending);
  assert.equal(cancelled,1);
 }
 assert.deepEqual(f.calls,[]);
});
test('OFF installed route, invalid config, and strict browser provenance deny before Auth',async()=>{
 const f=fixture(),handler=createComputedPayloadPreviewHandler(values,f.make);
 await deny(await installed(request()));
 await deny(await createComputedPayloadPreviewHandler({...values,YEONI_OPENAI_PAYLOAD_PREVIEW_OWNER:'invalid'},f.make)(request()));
 for(const r of [request({method:'PUT'}),request({body:'x'}),request({body:'{}'}),request({},origin+PAYLOAD_PREVIEW_PATH+'?a=1'),request({},'https://foreign.test'+PAYLOAD_PREVIEW_PATH),
  request({headers:{origin,'sec-fetch-site':'same-site',authorization:'Bearer fake-session'}}),
  request({headers:{origin,'sec-fetch-site':'same-origin','content-length':'1',authorization:'Bearer fake-session'}}),
  request({headers:{origin:'https://foreign.test','sec-fetch-site':'same-origin',authorization:'Bearer fake-session'}}),
  request({headers:{origin,'sec-fetch-site':'same-origin'}})])await deny(await handler(r));
 for(const e of [{...values,NEXT_PUBLIC_SUPABASE_URL:'https://other.test'},{...values,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_fixture'}])await deny(await createComputedPayloadPreviewHandler(e,f.make)(request()));
 assert.deepEqual(f.calls,[]);
});
test('denies wrong verified owner, anonymous and discordant claims generically',async()=>{
 for(const f of [fixture(other),fixture(owner,other),fixture(owner,owner,true)])await deny(await createComputedPayloadPreviewHandler(values,f.make)(request()));
});
test('repeatable success computes exact metadata through Auth only with zero other network or private environment reads',async()=>{
 const f=fixture(),allowed=Object.keys(values),net=test.mock.method(globalThis,'fetch',async()=>{throw Error('NO_NETWORK');});
 const env=new Proxy(values,{get(o,k){assert.ok(allowed.includes(String(k)));return Reflect.get(o,k);}});
 try{
  const handle=createComputedPayloadPreviewHandler(env,f.make);
  for(let i=0;i<2;i++){
   const res=await handle(request());assert.equal(res.status,200);assert.match(res.headers.get('cache-control')!,/no-store/);
   const result=await res.json();assert.deepEqual(result,previewFixedGeneralPayload());assert.equal(result.sent,false);assert.equal(result.prepared,false);
   assert.equal(result.recordSummary,'{}');assert.equal(result.providerResponse,false);assert.equal(result.storage,false);
  }
  assert.deepEqual(f.calls,['SDK','getUser','getClaims','SDK','getUser','getClaims']);assert.equal(net.mock.callCount(),0);
 }finally{net.mock.restore();}
});
test('browser contract posts bodyless to exact route and requires original owner and token at completion',async()=>{
 const f=fixture(),handler=createComputedPayloadPreviewHandler(values,f.make);
 const send:typeof fetch=async(path,init)=>{
  assert.equal(path,PAYLOAD_PREVIEW_PATH);assert.equal(init?.body,undefined);assert.equal(init?.redirect,'error');
  const headers=new Headers(init?.headers);headers.set('origin',origin);headers.set('sec-fetch-site','same-origin');
  return handler(new Request(origin+path,{...init,headers}));
 };
 const session={owner,token:'fake-session'},signal=new AbortController().signal;
 assert.deepEqual(await requestPayloadPreview(async()=>session,send,signal),previewFixedGeneralPayload());
 for(const next of [{...session,owner:other},{...session,token:'fake-replacement-token'}]){
  let reads=0;await assert.rejects(requestPayloadPreview(async()=>reads++===0?session:next,send,signal),/PREVIEW_UNAVAILABLE/);
 }
 for(const resp of [{...previewFixedGeneralPayload(),sent:true},{...previewFixedGeneralPayload(),requestId:'id'},{...previewFixedGeneralPayload(),question:'not fixed'}])
  await assert.rejects(requestPayloadPreview(async()=>session,async()=>Response.json(resp),signal),/PREVIEW_INVALID/);
});
test('same screen accepts two manual requests around same-owner refresh',()=>{
 const s=createPayloadPreviewAuthState();s.event('INITIAL_SESSION',owner);
 const a=s.begin()!;assert.ok(s.bind(a,owner));assert.ok(s.finish(a));
 assert.equal(s.event('TOKEN_REFRESHED',owner),'ignore');
 const b=s.begin()!;assert.notEqual(a,b);assert.ok(s.bind(b,owner));assert.ok(s.finish(b));
});
test('pending token refresh, logout or account switch aborts and late results/finally cannot replace newer request',async()=>{
 for(const [event,next] of [['TOKEN_REFRESHED',owner],['SIGNED_OUT',undefined],['SIGNED_IN',other],['TOKEN_REFRESHED',other]] as const){
  const s=createPayloadPreviewAuthState();s.event('INITIAL_SESSION',owner);
  const a=s.begin()!;assert.ok(s.bind(a,owner));assert.equal(s.begin(),null);
  let release!:()=>void;const output=new Promise<void>(r=>{release=r;});
  const stale=output.then(()=>{assert.equal(s.current(a),false);assert.equal(s.finish(a),false);});
  assert.notEqual(s.event(event,next),'ignore');assert.equal(a.aborted,true);
  const b=s.begin()!;assert.ok(s.bind(b,next??owner));
  release();await stale;assert.ok(s.current(b));
 }
});
test('Settings keeps its existing AuthGate; preview is opt-in and has no execute controls',()=>{
 const read=(name:string)=>readFileSync(new URL(`../app/settings/openai-connection-test/${name}`,import.meta.url),'utf8');
 assert.match(read('TrialClient.tsx'),/<AuthGate><Trial>\{children\}<\/Trial><\/AuthGate>/);
 assert.match(read('page.tsx'),/enabled\?<PayloadPreviewAdmission\/>:null/);
 assert.doesNotMatch(read('PayloadPreviewPanel.tsx'),/localStorage|sessionStorage|\.from\(|\.rpc\(|consent|execute|response\.advice/);
});
