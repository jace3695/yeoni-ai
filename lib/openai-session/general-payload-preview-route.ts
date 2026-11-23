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
 return async(r:Request)=>{
  if(!owner||r.method!=='POST'||r.signal.aborted||r.url!==ORIGIN+path||
   r.headers.get('origin')!==ORIGIN||r.headers.get('sec-fetch-site')!=='same-origin'||
   !/^(?:0)?$/.test(r.headers.get('content-length')??'')||
   r.headers.has('transfer-encoding')||!/^Bearer [^\s,]+$/.test(r.headers.get('authorization')??''))return unavailable();
  const key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(env.NEXT_PUBLIC_SUPABASE_URL!==AUTH_ORIGIN||!key||!isPublicSupabaseKey(key))return unavailable();
  let timer:ReturnType<typeof setTimeout>|undefined,expired=false;
  try{
   if(!await hasNoPayload(r)||r.signal.aborted)return unavailable();
   const check=async()=>{
    const client=await createAuth({url:AUTH_ORIGIN,publicKey:key})(r);
    if(expired||r.signal.aborted)return false;
    const user=await createVerifiedUserBridge(r,async()=>client).getUser(r);
    if(expired||r.signal.aborted||user.data.user.id!==owner)return false;
    // Reuse verified claims evaluation, never the database assertAndLock method.
    const claims=await createLiveSessionLock(r,owner,{getClaims:async()=>{if(expired||r.signal.aborted)throw Error('PREVIEW_UNAVAILABLE');return client.auth.getClaims();}},'reviewed-snapshot');
    return claims.identity.ownerId===owner&&!expired&&!r.signal.aborted;
   };
   if(!await Promise.race([check(),new Promise<false>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(false);},6000);})])||r.signal.aborted)return unavailable();
   if(mode==='eligibility')return new Response(null,{status:204,headers});
   return Response.json(previewFixedGeneralPayload(),{headers});
  }catch{return unavailable();}
  finally{clearTimeout(timer);}
 };
}
