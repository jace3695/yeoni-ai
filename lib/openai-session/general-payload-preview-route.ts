import {PAYLOAD_PREVIEW_ELIGIBILITY_PATH,PAYLOAD_PREVIEW_PATH} from '../openai-payload-preview-contract.ts';
import {isPublicSupabaseKey} from './general-environment-composition.ts';
import {previewFixedGeneralPayload} from './general-payload-preview.ts';
import {createVerifiedUserBridge} from './verified-user.ts';
import {createLiveSessionLock} from './live-session-lock.ts';
import {createGeneralBearerClient} from './general-server-dependencies.ts';

const ORIGIN='https://ai-fitness-app-ten.vercel.app';
const AUTH_ORIGIN='https://piqqukiiacncfbztktga.supabase.co';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const unavailable=()=>Response.json({code:'PREVIEW_UNAVAILABLE'},{status:404,headers});
type Env=Readonly<Record<string,string|undefined>>;
function defaultAuthFactory(config:{url:string;publicKey:string}){
 const create=createGeneralBearerClient(config);
 return async(r:Request)=>{const {auth}=await create(r);return {auth:auth as {
  getUser:()=>Promise<unknown>;getClaims:()=>Promise<unknown>;}};};
}
export function isComputedPayloadPreviewEnabled(env:Env){
 return env.YEONI_OPENAI_PAYLOAD_PREVIEW_ENABLED==='true'&&uuid.test(env.YEONI_OPENAI_PAYLOAD_PREVIEW_OWNER??'');
}
type Stage='PAGE_ENABLED'|'PAGE_DISABLED'|'NOT_ENABLED'|'REQUEST_AUTHORITY'|'REQUEST_HEADERS'|'PUBLIC_AUTH_CONFIG'|
 'BODY'|'SDK'|'USER'|'OWNER'|'CLAIMS'|'AUTH_TIMEOUT'|'ACCEPTED'|'PREVIEW_ERROR';
/** Absolute reviewed runtime window; a deployed copy becomes permanently quiet
 * at the expiry even if its immutable environment is never updated. */
export function isPayloadPreviewDiagnosticWindowOpen(value:string|undefined,now=Date.now()){
 if(!value||!/^[1-9][0-9]{0,15}:[1-9][0-9]{0,15}$/.test(value)||!Number.isSafeInteger(now))return false;
 const [start,end]=value.split(':').map(Number);
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&end>start&&end-start<=15*60_000&&now>=start&&now<end;
}
function stageOnly(stage:Stage){
 try{console.warn('YEONI_PAYLOAD_PREVIEW_STAGE',stage);}catch{/* observability cannot affect answers */}
}
/** Fixed server-only enum, once per page isolate; no owner/environment values. */
let pageStageReported=false;
export function reportPayloadPreviewPageStage(env:Env,enabled:boolean){
 if(pageStageReported||!isPayloadPreviewDiagnosticWindowOpen(env.YEONI_OPENAI_PAYLOAD_PREVIEW_DIAGNOSTICS))return;
 pageStageReported=true;
 stageOnly(enabled?'PAGE_ENABLED':'PAGE_DISABLED');
}
/** Next's Node adapter supplies a stream even for a bodyless POST. Require EOF
 * before Auth, without buffering or waiting indefinitely for a first chunk. */
async function hasNoPayload(r:Request){
 if(r.signal.aborted||r.bodyUsed)return false;
 if(!r.body)return true;
 const reader=r.body.getReader();
 let eof=false,timer:ReturnType<typeof setTimeout>|undefined,stop:(()=>void)|undefined;
 try{
  const interrupted=new Promise<false>(resolve=>{
   stop=()=>resolve(false);
   timer=setTimeout(stop,750);
   r.signal.addEventListener('abort',stop,{once:true});
   if(r.signal.aborted)stop();
  });
  eof=await Promise.race([reader.read().then(({done})=>done===true,()=>false),interrupted]);
  return eof&&!r.signal.aborted;
 }finally{
  clearTimeout(timer);
  if(stop)r.signal.removeEventListener('abort',stop);
  if(!eof)void reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
/** Separate route, Auth-only. No record reading, ledger, grant, DB lock or provider. */
export function createComputedPayloadPreviewHandler(env:Env,createAuth:typeof defaultAuthFactory=defaultAuthFactory,mode:'preview'|'eligibility'='preview'){
 const path=mode==='eligibility'?PAYLOAD_PREVIEW_ELIGIBILITY_PATH:PAYLOAD_PREVIEW_PATH;
 const owner=isComputedPayloadPreviewEnabled(env)?env.YEONI_OPENAI_PAYLOAD_PREVIEW_OWNER:undefined;
 const diagnosticWindow=mode==='eligibility'?env.YEONI_OPENAI_PAYLOAD_PREVIEW_DIAGNOSTICS:undefined;
 return async(r:Request)=>{
  // Diagnostic output is gated to canonical-looking eligibility requests, or page
  // status above. This gate is not authentication and changes no eligibility rule.
  const canTrace=isPayloadPreviewDiagnosticWindowOpen(diagnosticWindow)&&r.method==='POST'&&r.headers.get('origin')===ORIGIN&&
   r.headers.get('sec-fetch-site')==='same-origin'&&/^Bearer [^\s,]+$/.test(r.headers.get('authorization')??'');
  const trace=(stage:Stage)=>{if(canTrace&&isPayloadPreviewDiagnosticWindowOpen(diagnosticWindow))stageOnly(stage);};
  const deny=(stage:Stage)=>{trace(stage);return unavailable();};
  if(!owner)return deny('NOT_ENABLED');
  if(r.method!=='POST'||r.signal.aborted)return unavailable();
  if(r.url!==ORIGIN+path)return deny('REQUEST_AUTHORITY');
  if(r.headers.get('origin')!==ORIGIN||r.headers.get('sec-fetch-site')!=='same-origin'||
   !/^(?:0)?$/.test(r.headers.get('content-length')??'')||
   r.headers.has('transfer-encoding')||!/^Bearer [^\s,]+$/.test(r.headers.get('authorization')??''))return deny('REQUEST_HEADERS');
  const key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(env.NEXT_PUBLIC_SUPABASE_URL!==AUTH_ORIGIN||!key||!isPublicSupabaseKey(key))return deny('PUBLIC_AUTH_CONFIG');
  let timer:ReturnType<typeof setTimeout>|undefined,expired=false,failure:Stage='BODY';
  try{
   if(!await hasNoPayload(r)||r.signal.aborted)return deny('BODY');
   const check=async()=>{
    failure='SDK';
    const client=await createAuth({url:AUTH_ORIGIN,publicKey:key})(r);
    if(expired||r.signal.aborted)return false;
    failure='USER';
    const user=await createVerifiedUserBridge(r,async()=>client).getUser(r);
    if(expired||r.signal.aborted)return false;
    failure='OWNER';
    if(user.data.user.id!==owner)return false;
    // Reuse verified claims evaluation, never the database assertAndLock method.
    failure='CLAIMS';
    const claims=await createLiveSessionLock(r,owner,{getClaims:async()=>{if(expired||r.signal.aborted)throw Error('PREVIEW_UNAVAILABLE');return client.auth.getClaims();}},'reviewed-snapshot');
    return claims.identity.ownerId===owner&&!expired&&!r.signal.aborted;
   };
   if(!await Promise.race([check(),new Promise<false>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(false);},6000);})])||r.signal.aborted)return deny(expired?'AUTH_TIMEOUT':failure);
   if(mode==='eligibility'){trace('ACCEPTED');return new Response(null,{status:204,headers});}
   failure='PREVIEW_ERROR';
   return Response.json(previewFixedGeneralPayload(),{headers});
  }catch{return deny(expired?'AUTH_TIMEOUT':failure);}
  finally{clearTimeout(timer);}
 };
}
