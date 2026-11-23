import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPayloadPreviewEligibility} from '../lib/payload-preview-eligibility-client.ts';
import {PAYLOAD_PREVIEW_ELIGIBILITY_PATH,PAYLOAD_PREVIEW_PATH} from '../lib/openai-payload-preview-contract.ts';
import {createComputedPayloadPreviewHandler,isPayloadPreviewDiagnosticWindowOpen,reportPayloadPreviewPageStage} from '../lib/openai-session/general-payload-preview-route.ts';
import {POST as installed} from '../app/api/ai/openai-general-synthetic/payload-preview/eligibility/route.ts';
const origin='https://ai-fitness-app-ten.vercel.app',authOrigin='https://piqqukiiacncfbztktga.supabase.co';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const env={YEONI_OPENAI_PAYLOAD_PREVIEW_ENABLED:'true',YEONI_OPENAI_PAYLOAD_PREVIEW_OWNER:owner,NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const path=(suffix=PAYLOAD_PREVIEW_ELIGIBILITY_PATH,host=origin)=>new Request(host+suffix,{method:'POST',headers:{origin,'sec-fetch-site':'same-origin',authorization:'Bearer mock'}});
function fake(id=owner,sessionOwner=id){
 const calls:string[]=[];
 return {calls,factory:()=>async()=>({auth:{
  getUser:async()=>{calls.push('getUser');return {error:null,data:{user:{id,is_anonymous:false}}};},
  getClaims:async()=>{calls.push('getClaims');return {error:null,data:{claims:{sub:sessionOwner,session_id:other,role:'authenticated',is_anonymous:false,exp:Math.floor(Date.now()/1000)+60}}};},
 }})};
}
const session={owner,token:'fake'},tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('eligibility OFF, cross-origin and cross-route deny before Auth',async()=>{
 const f=fake(),h=createComputedPayloadPreviewHandler(env,f.factory,'eligibility');
 const cases=[await installed(path()),await h(path(PAYLOAD_PREVIEW_PATH)),await h(path(undefined,'https://elsewhere.test'))];
 assert.deepEqual(cases.map(r=>r.status),[404,404,404]);assert.deepEqual(f.calls,[]);
});
test('verified owner receives only empty 204/no-store, other owner and mismatched claims get generic 404',async()=>{
 for(const [f,status] of [[fake(),204],[fake(other),404],[fake(owner,other),404]] as const){
  const r=await createComputedPayloadPreviewHandler(env,f.factory,'eligibility')(path());
  assert.equal(r.status,status);assert.match(r.headers.get('cache-control')!,/no-store/);
  const body=await r.text();
  assert.equal(body,status===204?'':'{"code":"PREVIEW_UNAVAILABLE"}');
  assert.ok(!body.includes(owner)&&!body.includes(other));
 }
});
test('initial check is deduplicated; same-account token refresh after success does not poll',async()=>{
 const visible:boolean[]=[],calls:string[]=[];
 const app=createPayloadPreviewEligibility(async(p,init)=>{
  assert.equal(p,PAYLOAD_PREVIEW_ELIGIBILITY_PATH);assert.equal(init?.body,undefined);assert.equal(init?.redirect,'error');
  calls.push(new Headers(init?.headers).get('authorization')!);
  return new Response(null,{status:204});
 },v=>visible.push(v));
 app.change('INITIAL_SESSION',session);app.change('SIGNED_IN',session);await tick();
 app.change('TOKEN_REFRESHED',{...session,token:'new'});app.change('SIGNED_IN',{...session,token:'new'});await tick();
 assert.deepEqual(calls,['Bearer fake']);assert.deepEqual(visible,[false,true]);app.close();
});
test('different-account pending result cannot reveal panel; unauth and nonempty results fail closed',async()=>{
 const visible:boolean[]=[],waiters:Array<(r:Response)=>void>=[];
 const app=createPayloadPreviewEligibility(async()=>new Promise(resolve=>waiters.push(resolve)),v=>visible.push(v));
 app.change('INITIAL_SESSION',session);app.change('SIGNED_IN',{owner:other,token:'other-mock'});
 waiters[0](new Response(null,{status:204}));waiters[1](new Response('unavailable',{status:404}));await tick();
 assert.ok(visible.every(x=>x===false));
 app.change('SIGNED_OUT',null);app.change('SIGNED_IN',session);
 waiters[2](new Response('not an empty admission',{status:200}));await tick();assert.ok(visible.every(x=>x===false));app.close();
});
test('sign-out and unmount abort pending decisions; same-owner new login can recheck',async()=>{
 const visible:boolean[]=[],signals:AbortSignal[]=[],waiters:Array<(r:Response)=>void>=[];
 const app=createPayloadPreviewEligibility(async(_p,init)=>{
  signals.push(init!.signal!);return new Promise(resolve=>waiters.push(resolve));
 },v=>visible.push(v));
 app.change('INITIAL_SESSION',session);app.change('SIGNED_OUT',null);assert.equal(signals[0].aborted,true);
 app.change('SIGNED_IN',session);assert.equal(waiters.length,2);
 waiters[0](new Response(null,{status:204}));await tick();assert.ok(visible.every(x=>x===false));
 app.close();assert.equal(signals[1].aborted,true);waiters[1](new Response(null,{status:204}));await tick();
 assert.ok(visible.every(x=>x===false));
});
test('Settings injects only guarded admission inside existing app auth; first render has no panel or owner token',()=>{
 const read=(file:string)=>readFileSync(new URL(`../app/settings/openai-connection-test/${file}`,import.meta.url),'utf8');
 assert.match(read('page.tsx'),/enabled\?<PayloadPreviewAdmission\/>:null/);
 assert.match(read('TrialClient.tsx'),/<AuthGate><Trial>\{children\}<\/Trial><\/AuthGate>/);
 assert.match(read('PayloadPreviewAdmission.tsx'),/const \[allowed,setAllowed\]=useState\(false\)/);
 assert.match(read('PayloadPreviewAdmission.tsx'),/return allowed\?<PayloadPreviewPanel\/>:null/);
 assert.doesNotMatch(read('page.tsx'),/PAYLOAD_PREVIEW_OWNER|owner=/);
});
test('diagnostics only fixed server enums, opt-in, with unchanged public outcomes',async()=>{
 const lines:unknown[][]=[];
 const now=Date.now(),window=`${now-1000}:${now+1000*60}`;
 const warn=test.mock.method(console,'warn',(...parts:unknown[])=>lines.push(parts));
 try{
  const make=()=>createComputedPayloadPreviewHandler({...env,YEONI_OPENAI_PAYLOAD_PREVIEW_DIAGNOSTICS:window},fake().factory,'eligibility');
  assert.equal((await createComputedPayloadPreviewHandler(env,fake().factory,'eligibility')(path())).status,204);
  assert.deepEqual(lines,[]);
  assert.equal((await make()(path())).status,204);
  const failed=await make()(path(undefined,'https://loopback.test'));
  assert.equal(failed.status,404);assert.deepEqual(await failed.json(),{code:'PREVIEW_UNAVAILABLE'});
  const otherDenied=await createComputedPayloadPreviewHandler({...env,YEONI_OPENAI_PAYLOAD_PREVIEW_DIAGNOSTICS:window},fake(other).factory,'eligibility')(path());
  assert.equal(otherDenied.status,404);assert.deepEqual(await otherDenied.json(),{code:'PREVIEW_UNAVAILABLE'});
  assert.deepEqual(lines,[['YEONI_PAYLOAD_PREVIEW_STAGE','ACCEPTED'],['YEONI_PAYLOAD_PREVIEW_STAGE','REQUEST_AUTHORITY'],['YEONI_PAYLOAD_PREVIEW_STAGE','OWNER']]);
 }finally{warn.mock.restore();}
});

test('Settings page diagnostic is disabled by default and emits a fixed status at most once',()=>{
 const lines:unknown[][]=[];
 const warn=test.mock.method(console,'warn',(...parts:unknown[])=>lines.push(parts));
 try{
  reportPayloadPreviewPageStage(env,true);
  assert.deepEqual(lines,[]);
  const now=Date.now();
  const optedIn={...env,YEONI_OPENAI_PAYLOAD_PREVIEW_DIAGNOSTICS:`${now-1000}:${now+1000*60}`};
  reportPayloadPreviewPageStage(optedIn,true);reportPayloadPreviewPageStage(optedIn,false);
  assert.deepEqual(lines,[['YEONI_PAYLOAD_PREVIEW_STAGE','PAGE_ENABLED']]);
 }finally{warn.mock.restore();}
});

test('diagnostic window strictly valid, inclusive start and exclusive end, max 15 minutes',()=>{
 const start=1_795_420_000_000,end=start+900_000,window=`${start}:${end}`;
 for(const invalid of [undefined,'','true',' 1234:5678','00:900000','-1:22','12.5:30','1:2:3','9007199254740994:9007199254740995',
  `${end}:${start}`,`${start}:${end+1}`,`${start}:${start}`])assert.equal(isPayloadPreviewDiagnosticWindowOpen(invalid,start),false);
 assert.equal(isPayloadPreviewDiagnosticWindowOpen(window,start-1),false);
 assert.equal(isPayloadPreviewDiagnosticWindowOpen(window,start),true);
 assert.equal(isPayloadPreviewDiagnosticWindowOpen(window,end-1),true);
 assert.equal(isPayloadPreviewDiagnosticWindowOpen(window,end),false);
});
test('same loaded route remains silent before/after the window, even if Auth crossed expiry',async()=>{
 const start=1_795_420_000_000,end=start+900_000;let now=start-1;
 const lines:unknown[][]=[];
 const warn=test.mock.method(console,'warn',(...parts:unknown[])=>lines.push(parts));
 const clock=test.mock.method(Date,'now',()=>now);
 try{
  const {factory}=fake();
  const restricted={...env,YEONI_OPENAI_PAYLOAD_PREVIEW_DIAGNOSTICS:`${start}:${end}`};
  const handler=createComputedPayloadPreviewHandler(restricted,factory,'eligibility');
  assert.equal((await handler(path())).status,204);assert.deepEqual(lines,[]);
  now=start;assert.equal((await handler(path())).status,204);
  assert.deepEqual(lines,[['YEONI_PAYLOAD_PREVIEW_STAGE','ACCEPTED']]);
  lines.length=0;now=end;
  assert.equal((await handler(path())).status,204);assert.deepEqual(lines,[]);
  now=end-1;
  const crossing=createComputedPayloadPreviewHandler(restricted,()=>async()=>{
   const client=await factory()();
   return {auth:{...client.auth,getClaims:async()=>{now=end;return client.auth.getClaims();}}};
  },'eligibility');
  assert.equal((await crossing(path())).status,204);assert.deepEqual(lines,[]);
  assert.equal((await createComputedPayloadPreviewHandler({...env,YEONI_OPENAI_PAYLOAD_PREVIEW_DIAGNOSTICS:'true'},factory,'eligibility')(path())).status,204);
  assert.deepEqual(lines,[]);
 }finally{clock.mock.restore();warn.mock.restore();}

});
