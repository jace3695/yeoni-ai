import {OPENAI_RECORD_NOTICE,type AdviceRequest} from '../openai-advice-server.ts';
import type {createGeneralRuntime} from './general-runtime.ts';
type Runtime = ReturnType<typeof createGeneralRuntime>;
const MAX_BYTES=8192;
const json=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const exact=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).sort().join('|')===keys.sort().join('|');
/** Uninstalled HTTP adapter for createGeneralRuntime. Never reads env/keys or
 * supplies auth, pricing, summary or approval authority from request fields.
 * Same-origin browser POST only; deployment and CORS remain unchanged.
 */
export function createGeneralRouteHandler(config:Readonly<{enabled:boolean;allowedOrigin?:string;bodyTimeoutMs?:number}>={enabled:false},run?:Runtime){
 // Snapshot gates so a mutable caller object cannot activate an existing handler.
 const enabled=config.enabled===true;const origin=config.allowedOrigin;
 const timeoutMs=config.bodyTimeoutMs??10000;
 const validTimeout=Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=10000;
 const validOrigin=(()=>{try{const u=new URL(origin??'');return u.protocol==='https:'&&u.origin===origin}catch{return false}})();
 return async(request:Request):Promise<Response>=>{
  if(!enabled||!run||!validOrigin||!validTimeout)return json({code:'OPENAI_NOT_ACTIVATED'},503);
  if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin')!==origin||new URL(request.url).origin!==origin||request.headers.get('sec-fetch-site')==='cross-site')return json({code:'ORIGIN_REJECTED'},403);
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))return json({code:'JSON_REQUIRED'},415);
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES))return json({code:'REQUEST_TOO_LARGE'},413);
  if(request.signal.aborted)return json({code:'REQUEST_CANCELLED'},409);
  if(!request.body)return json({code:'INVALID_REQUEST'},400);
  const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;let raw:unknown;
  let timeout:ReturnType<typeof setTimeout>|undefined;let onAbort!:()=>void;
  const stop=new Promise<never>((_,reject)=>{
   const cancel=(code:string)=>{reject(Error(code));void reader.cancel().catch(()=>{});};
   onAbort=()=>cancel('REQUEST_CANCELLED');
   request.signal.addEventListener('abort',onAbort,{once:true});
   timeout=setTimeout(()=>cancel('REQUEST_TIMEOUT'),timeoutMs);
   if(request.signal.aborted)onAbort();
  });
  try{
   for(;;){const {done,value}=await Promise.race([reader.read(),stop]);if(done)break;size+=value.length;if(size>MAX_BYTES){void reader.cancel().catch(()=>{});return json({code:'REQUEST_TOO_LARGE'},413)}chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
   raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch(error){
   const code=error instanceof Error?error.message:'';
   return code==='REQUEST_CANCELLED'?json({code},409):code==='REQUEST_TIMEOUT'?json({code},408):json({code:'INVALID_REQUEST'},400);
  }finally{clearTimeout(timeout);request.signal.removeEventListener('abort',onAbort);try{reader.releaseLock()}catch{/* cancellation may still be pending */}}
  if(request.signal.aborted)return json({code:'REQUEST_CANCELLED'},409);
  if(!record(raw)||!exact(raw,['request','confirmation'])||!record(raw.request)||!record(raw.confirmation))return json({code:'INVALID_REQUEST'},400);
  const r=raw.request,c=raw.confirmation;
  if(!exact(r,['requestId','feature','question'])||typeof r.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.requestId)||!['advice','conversation'].includes(String(r.feature))||typeof r.question!=='string'||!r.question.trim()||r.question.length>500||
   !exact(c,['accepted','healthAccepted','requestId','fingerprint'])||c.accepted!==true||typeof c.healthAccepted!=='boolean'||c.requestId!==r.requestId||typeof c.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(c.fingerprint))return json({code:'INVALID_REQUEST'},400);
  try{
   // Runtime resolves the owner/session and the preexisting approval/quote itself.
   const advice=await run(request,Object.freeze({...r}) as AdviceRequest,Object.freeze({...c}));
   if(request.signal.aborted)return json({code:'REQUEST_CANCELLED'},409);
   return json({advice,provider:'openai',recordActionsPerformed:false,recordNotice:OPENAI_RECORD_NOTICE},200);
  }catch{
   // Never expose SQL, provider/credential details, internal exception messages.
   return json({code:'OPENAI_REQUEST_NOT_COMPLETED',message:'승인·연결 상태를 확인해야 해요. 자동으로 다시 전송하지 않습니다.'},503);
  }
 };
}
