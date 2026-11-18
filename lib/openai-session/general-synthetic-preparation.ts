import {randomUUID} from 'node:crypto';
import {createConsentPreview} from './advice-consent.ts';
import {adviceFingerprint} from '../openai-advice-server.ts';
import {createReviewedGeneralModelPolicy,GENERAL_MODEL_REFERENCE} from './general-model-policy.ts';
import {GENERAL_SYNTHETIC_QUESTION,GENERAL_SYNTHETIC_CAP} from './general-synthetic-execution.ts';
import {saveGeneralProposal,confirmStoredGeneralProposal} from './general-proposal-store.ts';
import type {ServerApprovalProposal} from './general-approval-creation.ts';
import type {GeneralConsentView} from './general-consent-view.ts';
import type {createGeneralIdentityAuthority} from './general-identity-authority.ts';
type Authority=Awaited<ReturnType<typeof createGeneralIdentityAuthority>>;
export type GeneralSyntheticPreparationConfig=Readonly<{requestId:string;ownerId:string;sessionId:string;expiresAt:number}>;
type Billing={budgetId:string;organization:string;project:string;creditVerifiedUntil:number};
type Review=Parameters<typeof createReviewedGeneralModelPolicy>[0];
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function scope(a:Authority,c:GeneralSyntheticPreparationConfig,now:number){
 if(![c.requestId,c.ownerId,c.sessionId].every(uuid)||!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=now||c.expiresAt-now>300000||a.identity.ownerId!==c.ownerId||a.identity.sessionId!==c.sessionId)throw Error('SYNTHETIC_SCOPE_REJECTED');
}
function exact(a:Authority,c:GeneralSyntheticPreparationConfig,p:ServerApprovalProposal,now:number){
 scope(a,c,now);const d=p?.disclosure,b=p?.binding;
 if(!d||!b||d.requestId!==c.requestId||d.ownerId!==c.ownerId||d.sessionId!==c.sessionId||b.epoch!==a.identity.epoch||d.feature!=='conversation'||d.question!==GENERAL_SYNTHETIC_QUESTION||d.summary!=='{}'||d.includesHealthData!==false||d.contextRevision!=='synthetic-empty-v1'||d.model!==GENERAL_MODEL_REFERENCE.model||d.pricingVersion!==GENERAL_MODEL_REFERENCE.pricingVersion||d.maxCostMicros!==GENERAL_SYNTHETIC_CAP||d.maxOutputTokens!==512||d.expiresAt>c.expiresAt||b.quoteExpiresAt!==d.expiresAt||b.creditVerifiedUntil<d.expiresAt)throw Error('SYNTHETIC_PROPOSAL_REJECTED');
 const preview=createConsentPreview(d,now);
 if(b.consentFingerprint!==preview.fingerprint||b.legacyFingerprint!==adviceFingerprint({...d,epoch:a.identity.epoch}))throw Error('SYNTHETIC_PROPOSAL_REJECTED');
 const r=p.rates;if(!r||r.inputMicrosPerMillion!==750000||r.outputMicrosPerMillion!==4500000||r.maxPromptTokens!==400000||r.maxOutputTokens!==512)throw Error('SYNTHETIC_PROPOSAL_REJECTED');
 return preview;
}
/** Server-owned fixed scope only. No record callback, environment, key or provider.
 * Existing approved budget is required. Duplicate request IDs fail without replacement.
 */
export async function prepareGeneralSyntheticProposal(a:Authority,config:GeneralSyntheticPreparationConfig,billing:()=>Promise<Billing>,review:Review,now:()=>number):Promise<GeneralConsentView>{
 const c=Object.freeze({...config}),checkedReview=Object.freeze({...review});scope(a,c,now());await a.assertCurrent();
 const context=Object.freeze({...await billing()});await a.assertCurrent();scope(a,c,now());
 if(![context.budgetId,context.organization,context.project].every(v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=200)||!Number.isSafeInteger(context.creditVerifiedUntil))throw Error('SYNTHETIC_BILLING_REQUIRED');
 const policy=createReviewedGeneralModelPolicy(checkedReview,now),rates=policy.rates(512),expiresAt=Math.min(c.expiresAt,checkedReview.expiresAt,context.creditVerifiedUntil);
 const d={ownerId:c.ownerId,sessionId:c.sessionId,requestId:c.requestId,feature:'conversation' as const,provider:'openai' as const,organization:context.organization,project:context.project,model:GENERAL_MODEL_REFERENCE.model,question:GENERAL_SYNTHETIC_QUESTION,summary:'{}',contextRevision:'synthetic-empty-v1',includesHealthData:false,currency:'USD' as const,maxCostMicros:policy.maximumCost(512),maxOutputTokens:512,quoteId:randomUUID(),pricingVersion:GENERAL_MODEL_REFERENCE.pricingVersion,expiresAt};
 const preview=createConsentPreview(d,now());
 const binding={epoch:a.identity.epoch,grantId:randomUUID(),consentId:randomUUID(),approvalId:randomUUID(),budgetId:context.budgetId,consentFingerprint:preview.fingerprint,legacyFingerprint:adviceFingerprint({...d,epoch:a.identity.epoch}),quoteExpiresAt:expiresAt,creditVerifiedUntil:context.creditVerifiedUntil};
 const p={disclosure:preview.disclosure,binding,rates};exact(a,c,p,now());
 await a.store.transaction(async tx=>{
  scope(a,c,now());
  const eligible=await tx.query(`SELECT id FROM yeoni_openai_general.budgets WHERE id=$1 AND owner_id=$2 AND organization=$3 AND project=$4 AND enabled=true AND currency='USD' AND cap_micros-held_micros >= $5 AND expires_at>=to_timestamp($6::double precision/1000.0) FOR SHARE`,[context.budgetId,c.ownerId,context.organization,context.project,GENERAL_SYNTHETIC_CAP,expiresAt]);
  if(eligible.rows.length!==1||eligible.rows[0].id!==context.budgetId)throw Error('APPROVED_BUDGET_UNAVAILABLE');
  exact(a,c,p,now());await saveGeneralProposal({...a,store:{transaction:work=>work(tx)}},p);
 });
 return Object.freeze({requestId:c.requestId,fingerprint:preview.fingerprint,feature:d.feature,question:d.question,summary:d.summary,model:d.model,maxCostMicros:d.maxCostMicros,expiresAt,notice:preview.notice,healthNotice:''});
}
/** Exact stored proposal is checked under the same transaction/row lock as confirmation. */
export async function confirmGeneralSyntheticProposal(a:Authority,config:GeneralSyntheticPreparationConfig,confirmation:unknown,now:()=>number){
 const c=Object.freeze({...config});scope(a,c,now());await a.assertCurrent();
 return a.store.transaction(async tx=>{
  scope(a,c,now());
  const found=await tx.query(`SELECT proposal,fingerprint FROM yeoni_openai_general.proposals WHERE request_id=$1 AND owner_id=$2 AND session_id=$3 AND consumed=false AND expires_at>clock_timestamp() FOR UPDATE`,[c.requestId,c.ownerId,c.sessionId]);
  if(found.rows.length!==1)throw Error('PROPOSAL_UNAVAILABLE');
  const p=found.rows[0].proposal as ServerApprovalProposal,preview=exact(a,c,p,now());
  if(found.rows[0].fingerprint!==preview.fingerprint)throw Error('SYNTHETIC_PROPOSAL_REJECTED');
  return confirmStoredGeneralProposal({...a,store:{transaction:work=>work(tx)}},{requestId:c.requestId,feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION},confirmation,now(),d=>{exact(a,c,{...p,disclosure:d},now());});
 });
}
