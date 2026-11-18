import {createHash} from 'node:crypto';
import type {ApprovedAdvice} from '../openai-advice-server.ts';
import {calculateGeneralQuoteCost} from './general-quote-cost.ts';
/** Evaluated option, NOT an app default or deployment approval.
 * Official model page + Chat Completions reference reviewed 2026-11-17.
 * Full-context reservation avoids pretending local tokenizer/framing estimates are exact.
 * It bounds billable accepted input, NOT proof a particular request fits context.
 */
export const GENERAL_MODEL_REFERENCE=Object.freeze({model:'gpt-5.4-mini-2026-03-17',contextTokens:400000,inputMicrosPerMillion:750000,outputMicrosPerMillion:4500000,pricingVersion:'official-gpt54mini-standard-global-20261117',source:'https://developers.openai.com/api/docs/models/gpt-5.4-mini'});
export function createReviewedGeneralModelPolicy(review:{verifiedAt:number;expiresAt:number;globalStandardPricingReviewed:boolean},now:()=>number){
 const checked=Object.freeze({...review});
 const current=()=>{const n=now();if(checked.globalStandardPricingReviewed!==true||!Number.isSafeInteger(n)||!Number.isSafeInteger(checked.verifiedAt)||!Number.isSafeInteger(checked.expiresAt)||checked.verifiedAt>n||checked.expiresAt<=n||checked.expiresAt-checked.verifiedAt>86400000)throw Error('MODEL_REVIEW_REQUIRED');};
 const rates=(maxOutputTokens:number)=>{current();if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>2048)throw Error('OUTPUT_LIMIT');return Object.freeze({inputMicrosPerMillion:750000,outputMicrosPerMillion:4500000,maxPromptTokens:400000,maxOutputTokens});};
 return Object.freeze({rates,
  maximumCost:(output:number)=>{const r=rates(output);return calculateGeneralQuoteCost(r,{promptTokens:r.maxPromptTokens,completionTokens:output})},
  acceptedInputUpperBound:async(g:ApprovedAdvice,wire:string)=>{
   current();if(g.model!==GENERAL_MODEL_REFERENCE.model||g.pricingVersion!==GENERAL_MODEL_REFERENCE.pricingVersion)throw Error('UNREVIEWED_MODEL');
   const r=rates(g.maxOutputTokens);if(!Number.isSafeInteger(g.maxCostMicros)||g.maxCostMicros<calculateGeneralQuoteCost(r,{promptTokens:400000,completionTokens:g.maxOutputTokens}))throw Error('FULL_CONTEXT_HOLD_REQUIRED');
   const p=JSON.parse(wire);const keys=['model','store','stream','max_completion_tokens','response_format','messages','service_tier','reasoning_effort'];
   if(!p||Object.keys(p).sort().join('|')!==keys.sort().join('|')||p.model!==g.model||p.store!==false||p.stream!==false||p.max_completion_tokens!==g.maxOutputTokens||p.service_tier!=='default'||p.reasoning_effort!=='none'||JSON.stringify(p.response_format)!==JSON.stringify({type:'json_object'})||!Array.isArray(p.messages)||p.messages.length!==2)throw Error('UNREVIEWED_WIRE');
   const [system,user]=p.messages;
   if(Object.keys(system).sort().join('|')!=='content|role'||Object.keys(user).sort().join('|')!=='content|role'||system.role!=='system'||user.role!=='user'||typeof system.content!=='string'||user.content!==JSON.stringify({question:g.question,recordSummary:g.summary}))throw Error('WIRE_BINDING_MISMATCH');
   const actual=createHash('sha256').update(JSON.stringify(['openai',g.ownerId,g.epoch,g.feature,g.organization,g.project,g.model,g.question,g.summary,system.content])).digest('hex');
   if(actual!==g.fingerprint)throw Error('WIRE_BINDING_MISMATCH');
   return 400000;
  },
 });
}
// Existing wire omits explicit tier/reasoning => refused. No silent provider change.
// Before install: approve conservative hold, guarantee global standard endpoint,
// bind policy/version to consent, verify returned model/tier and billing usage.
/** Fail closed on actual provider identity/tier/usage before price settlement.
 * Does not establish regional billing eligibility; that requires reviewed account
 * configuration. Unknown/absent metadata must retain the full uncertain hold.
 */
export function assertReviewedGeneralResponse(g:ApprovedAdvice,raw:unknown):void{
 const x=raw as {model?:unknown;service_tier?:unknown;usage?:{prompt_tokens?:unknown;completion_tokens?:unknown;prompt_tokens_details?:{audio_tokens?:unknown};completion_tokens_details?:{audio_tokens?:unknown;reasoning_tokens?:unknown}}};
 const valid=(v:unknown,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
 if(!x||g.model!==GENERAL_MODEL_REFERENCE.model||x.model!==g.model||x.service_tier!=='default'||!valid(x.usage?.prompt_tokens,400000)||!valid(x.usage?.completion_tokens,g.maxOutputTokens))throw Error('PROVIDER_PRICE_SCOPE_UNCONFIRMED');
 for(const count of [x.usage?.prompt_tokens_details?.audio_tokens,x.usage?.completion_tokens_details?.audio_tokens,x.usage?.completion_tokens_details?.reasoning_tokens])if(count!==undefined&&count!==0)throw Error('PROVIDER_PRICE_SCOPE_UNCONFIRMED');
}
