import type {AdviceDisclosure} from './advice-consent.ts';
import {createOpenAiAdviceService,type AdviceRequest,type ApprovedAdvice,type OpenAiPorts,OPENAI_ADVICE_DEPLOYMENT} from '../openai-advice-server.ts';
import type {ReservationStore} from './general-reservation.ts';
import {createGeneralIdentityAuthority} from './general-identity-authority.ts';
import {issueBoundGeneralGrant} from './general-bound-issuance.ts';
import {createGeneralOpenAiPorts} from './general-openai-ports.ts';
import {createGeneralQuoteCost,type QuoteRates} from './general-quote-cost.ts';
type Client={auth:{getUser():Promise<unknown>;getClaims():Promise<unknown>}};
/** Private composition candidate. No route imports this module. Default OFF.
 * A reviewed server approval + immutable quote + session epoch must preexist.
 * Does not create any of those authorities from user HTTP fields.
 * All external IO capabilities must be explicitly installed by a reviewed runtime.
 */
export function createGeneralRuntime(config:Readonly<{enabled:boolean;snapshotRaceAccepted:boolean}>=Object.freeze({...OPENAI_ADVICE_DEPLOYMENT,snapshotRaceAccepted:false}),
 dependencies?:{reviewSyntheticDisclosure?:(d:AdviceDisclosure)=>void;validateBoundGrant?:(grant:ApprovedAdvice)=>void;store:ReservationStore;createClient:(request:Request)=>Promise<Client>;credentials:OpenAiPorts['credentials'];transport:typeof fetch;reviewedLocalInputUpperBound:(grant:ApprovedAdvice,wireBody:string)=>Promise<number>;prepareReviewedWire?:(grant:ApprovedAdvice,wireBody:string)=>string;reviewedQuoteRates?:(grant:ApprovedAdvice)=>QuoteRates;validateReviewedResponse?:(grant:ApprovedAdvice,response:Response,signal?:AbortSignal)=>Promise<Response>;now:()=>number}){
 const enabled=config.enabled===true,snapshotAccepted=config.snapshotRaceAccepted===true;
 const capabilities=dependencies ? Object.freeze({...dependencies}) : undefined;
 return async(request:Request,advice:AdviceRequest,confirmation:unknown)=>{
  if(!enabled||!capabilities)throw Error('OPENAI_NOT_ACTIVATED');
  if(!snapshotAccepted)throw Error('SNAPSHOT_REVIEW_REQUIRED');
  // Fail malformed inputs before auth, issuance or monetary reservation.
  if(!advice||typeof advice!=='object'||Object.keys(advice).some(k=>!['requestId','feature','question'].includes(k))||
   !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(advice.requestId)||
   !['advice','conversation'].includes(advice.feature)||typeof advice.question!=='string'||!advice.question.trim()||advice.question.length>500)throw Error('INVALID_REQUEST');
  const dep=capabilities;
  const authority=await createGeneralIdentityAuthority(request,dep.createClient,dep.store,{snapshotRaceAccepted:true});
  const bound=await issueBoundGeneralGrant(authority.store,{request:advice,identity:authority.identity,confirmation,now:dep.now(),validateBoundGrant:dep.validateBoundGrant,reviewSyntheticDisclosure:dep.reviewSyntheticDisclosure});
  const cost=createGeneralQuoteCost(authority.settlementStore,dep.reviewedQuoteRates?.(bound.legacyGrant));
  // Require the exact quote snapshot before reserving or calling the provider.
  await cost(bound.legacyGrant,{promptTokens:0,completionTokens:0});
  const ports=createGeneralOpenAiPorts(authority,{confirmation,now:dep.now,credentials:dep.credentials,transport:async(url,options)=>{
   if(typeof options?.body!=='string'||typeof dep.reviewedLocalInputUpperBound!=='function')throw Error('INPUT_BOUND_UNAVAILABLE');
   // Must count the ACTUAL wire including system prompt and message framing.
   // No remote estimator or unreviewed byte heuristic; absent capability fails closed.
   const wire=dep.prepareReviewedWire ? dep.prepareReviewedWire(bound.legacyGrant,options.body) : options.body;
   const upper=await dep.reviewedLocalInputUpperBound(bound.legacyGrant,wire);
   await cost(bound.legacyGrant,{promptTokens:upper,completionTokens:bound.legacyGrant.maxOutputTokens});
   await authority.assertCurrent();
   if(request.signal.aborted||options.signal?.aborted||dep.now()>=Math.min(bound.legacyGrant.expiresAt,bound.legacyGrant.quoteExpiresAt,bound.legacyGrant.creditVerifiedUntil))throw Error('DISPATCH_EXPIRED');
   const response=await dep.transport(url,{...options,body:wire});
   return dep.validateReviewedResponse ? dep.validateReviewedResponse(bound.legacyGrant,response,options.signal ?? undefined) : response;
  },cost});
  // This config is private to this invocation, never mutates deployment flag.
  return createOpenAiAdviceService({enabled:true},ports)(advice,request.signal);
 };
}
