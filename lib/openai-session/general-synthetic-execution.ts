import {createReviewedGeneralRuntime} from './general-reviewed-runtime.ts';
import {GENERAL_MODEL_REFERENCE} from './general-model-policy.ts';
import type {AdviceRequest} from '../openai-advice-server.ts';
type Deps=Parameters<typeof createReviewedGeneralRuntime>[2];
type Review=Parameters<typeof createReviewedGeneralRuntime>[1];
export const GENERAL_SYNTHETIC_QUESTION='가상 연결시험입니다. 실제 기록 없이 연결 확인이라고 답하세요.';
export const GENERAL_SYNTHETIC_CAP=302304; // 400000 input + 512 output, reviewed standard rates
/** Executes ONE already prepared/approved general-ledger request. No proposal creation,
 * record aggregation, schema installation, environment lookup or automatic activation.
 * Existing durable reservation handles cross-process replay/uncertain outcomes.
 */
export function createGeneralSyntheticExecution(config:{enabled:boolean;requestId:string;expiresAt:number},review:Review,deps:Deps){
 const c=Object.freeze({...config});
 return async(request:Request,advice:AdviceRequest,confirmation:unknown)=>{
  if(c.enabled!==true)throw Error('OPENAI_NOT_ACTIVATED');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.requestId)||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=deps.now()||c.expiresAt-deps.now()>300000)throw Error('SYNTHETIC_SCOPE_EXPIRED');
  if(!advice||advice.requestId!==c.requestId||advice.feature!=='conversation'||advice.question!==GENERAL_SYNTHETIC_QUESTION)throw Error('SYNTHETIC_INPUT_REJECTED');
  // Grant is checked BEFORE credentials or provider dispatch by the general runtime.
  // Wrapped transport checks the final wire again; no caller context is accepted.
  const runtime=createReviewedGeneralRuntime({enabled:true,snapshotRaceAccepted:true},review,{...deps,reviewSyntheticDisclosure:d=>{
   if(d.requestId!==c.requestId||d.feature!=='conversation'||d.question!==GENERAL_SYNTHETIC_QUESTION||d.summary!=='{}'||d.includesHealthData!==false||d.contextRevision!=='synthetic-empty-v1'||d.model!==GENERAL_MODEL_REFERENCE.model||d.pricingVersion!==GENERAL_MODEL_REFERENCE.pricingVersion||d.maxCostMicros!==GENERAL_SYNTHETIC_CAP||d.maxOutputTokens!==512||d.expiresAt>c.expiresAt)throw Error('SYNTHETIC_DISCLOSURE_REJECTED');
   deps.reviewSyntheticDisclosure?.(d);
  },validateBoundGrant:g=>{
   if(g.requestId!==c.requestId||g.question!==GENERAL_SYNTHETIC_QUESTION||g.summary!=='{}'||g.feature!=='conversation'||g.maxCostMicros!==GENERAL_SYNTHETIC_CAP||g.maxOutputTokens!==512||g.expiresAt>c.expiresAt)throw Error('SYNTHETIC_GRANT_REJECTED');
   deps.validateBoundGrant?.(g);
  },transport:async(url,init)=>{
   assertGeneralSyntheticWire(init?.body);
   if(deps.now()>=c.expiresAt)throw Error('SYNTHETIC_SCOPE_EXPIRED');
   return deps.transport(url,init);
  }});
  return runtime(request,advice,confirmation);
 };
}
export function assertGeneralSyntheticWire(body:unknown){
 if(typeof body!=='string')throw Error('SYNTHETIC_WIRE_REJECTED');
 const p=JSON.parse(body);
 if(p.model!==GENERAL_MODEL_REFERENCE.model||p.max_completion_tokens!==512||p.store!==false||p.stream!==false||p.service_tier!=='default'||p.reasoning_effort!=='none'||!Array.isArray(p.messages)||p.messages.length!==2||p.messages[1]?.role!=='user'||p.messages[1]?.content!==JSON.stringify({question:GENERAL_SYNTHETIC_QUESTION,recordSummary:'{}'}))throw Error('SYNTHETIC_WIRE_REJECTED');
}
