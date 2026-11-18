import type {GeneralConsentView} from './general-consent-view.ts';
type Runtime=(request:Request,raw:unknown)=>Promise<GeneralConsentView>;
const MAX_BYTES=8192;
const json=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const exact=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).sort().join('|')===keys.sort().join('|');
/** Uninstalled HTTP adapter for createGeneralRuntime. Never reads env/keys or
 * supplies auth, pricing, summary or approval authority from request fields.
 * Same-origin browser POST only; deployment and CORS remain unchanged.
 */
export function createGeneralPrepareHandler(config:Readonly<{enabled:boolean;allowedOrigin?:string;bodyTimeoutMs?:number}>={enabled:false},run?:Runtime){
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
  if(!record(raw)||!exact(raw,['feature','question','scope']))return json({code:'INVALID_REQUEST'},400);
  try{
   // Runtime resolves the owner/session and the preexisting approval/quote itself.
   const preview=await run(request,Object.freeze({...raw}));
   if(request.signal.aborted)return json({code:'REQUEST_CANCELLED'},409);
   return json({preview,provider:'openai',sent:false},200);
  }catch{
   // Never expose SQL, provider/credential details, internal exception messages.
   return json({code:'OPENAI_REQUEST_NOT_COMPLETED',message:'승인·연결 상태를 확인해야 해요. 자동으로 다시 전송하지 않습니다.'},503);
  }
 };
}
