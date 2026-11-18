import {createGeneralRuntime} from './general-runtime.ts';
import {createReviewedGeneralModelPolicy,assertReviewedGeneralResponse,GENERAL_MODEL_REFERENCE} from './general-model-policy.ts';
import type {ApprovedAdvice} from '../openai-advice-server.ts';
type Dependencies=Omit<NonNullable<Parameters<typeof createGeneralRuntime>[1]>,'reviewedLocalInputUpperBound'|'prepareReviewedWire'|'validateReviewedResponse'|'reviewedQuoteRates'>;
/** Evaluated pinned model only; private OFF by default. Does not change app's
 * deployment flag. Global standard review and conservative full-context hold
 * must be explicitly approved beforehand. No fallback model/tier/transport.
 */
export function createReviewedGeneralRuntime(config:{enabled:boolean;snapshotRaceAccepted:boolean},review:{verifiedAt:number;expiresAt:number;globalStandardPricingReviewed:boolean},deps:Dependencies){
 const policy=createReviewedGeneralModelPolicy(review,deps.now);
 return createGeneralRuntime(config,{...deps,
  reviewedLocalInputUpperBound:policy.acceptedInputUpperBound,
  reviewedQuoteRates:g=>policy.rates(g.maxOutputTokens),
  prepareReviewedWire:(g,wire)=>{
   if(g.model!==GENERAL_MODEL_REFERENCE.model||g.pricingVersion!==GENERAL_MODEL_REFERENCE.pricingVersion)throw Error('UNREVIEWED_MODEL');
   const p=JSON.parse(wire);
   if((p.service_tier!==undefined&&p.service_tier!=='default')||(p.reasoning_effort!==undefined&&p.reasoning_effort!=='none'))throw Error('UNREVIEWED_WIRE');
   // Policy version already bound to disclosed quote; no content or model changes.
   return JSON.stringify({...p,service_tier:'default',reasoning_effort:'none'});
  },
  validateReviewedResponse:readReviewedResponse,
 });
}
export async function readReviewedResponse(grant:ApprovedAdvice,response:Response,signal?:AbortSignal):Promise<Response>{
 if(!response.ok)return response; // existing service retains non-success as uncertain
 if(!response.body)throw Error('PROVIDER_RESPONSE_UNREADABLE');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 const deadline=AbortSignal.any([AbortSignal.timeout(25000),...(signal?[signal]:[])]);
 let rejectAbort:(reason:unknown)=>void=()=>{};
 const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject});
 const onAbort=()=>rejectAbort(Error('PROVIDER_RESPONSE_CANCELLED'));
 deadline.addEventListener('abort',onAbort,{once:true});
 const cancel=()=>{void reader.cancel().catch(()=>{})};
 try{for(;;){if(deadline.aborted)throw Error('PROVIDER_RESPONSE_CANCELLED');const {done,value}=await Promise.race([reader.read(),aborted]);if(done)break;size+=value.length;if(size>32768){cancel();throw Error('PROVIDER_RESPONSE_TOO_LARGE')}chunks.push(value)}}catch(error){cancel();throw error}finally{deadline.removeEventListener('abort',onAbort);reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('PROVIDER_RESPONSE_UNREADABLE')}
 assertReviewedGeneralResponse(grant,raw);
 return new Response(bytes,{status:response.status,headers:response.headers});
}
