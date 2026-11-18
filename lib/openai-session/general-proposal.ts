import {randomUUID} from 'node:crypto';
import {createConsentPreview,type AdviceDisclosure} from './advice-consent.ts';
import {adviceFingerprint} from '../openai-advice-server.ts';
import {GENERAL_MODEL_REFERENCE,createReviewedGeneralModelPolicy} from './general-model-policy.ts';
import type {ServerApprovalProposal} from './general-approval-creation.ts';
import type {GeneralConsentView} from './general-consent-view.ts';
import type {createGeneralIdentityAuthority} from './general-identity-authority.ts';
type Context={summary:string;revision:string;budgetId:string;organization:string;project:string;creditVerifiedUntil:number};
/** SERVER-ONLY trusted context callback. Raw body accepts only question/feature.
 * Server proposal must be retained server-side, never accepted back from browser.
 * No user record updates, external AI call or implicit approval.
 */
export async function prepareGeneralProposal(authority:Awaited<ReturnType<typeof createGeneralIdentityAuthority>>,raw:unknown,
 source:(identity:typeof authority.identity,feature:'advice'|'conversation')=>Promise<Context>,review:Parameters<typeof createReviewedGeneralModelPolicy>[0],now:()=>number):Promise<{serverProposal:ServerApprovalProposal;view:GeneralConsentView}>{
 const x=raw as {question?:unknown;feature?:unknown};
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join('|')!=='feature|question'||typeof x.question!=='string'||!x.question.trim()||x.question.length>500||(x.feature!=='advice'&&x.feature!=='conversation'))throw Error('INVALID_REQUEST');
 const question=x.question,feature=x.feature,checkedReview=Object.freeze({...review});
 await authority.assertCurrent();const context=Object.freeze({...await source(authority.identity,feature)});await authority.assertCurrent();
 const time=now(),policy=createReviewedGeneralModelPolicy(checkedReview,now),maxOutputTokens=512,rates=policy.rates(maxOutputTokens);
 const expiresAt=Math.min(time+300000,checkedReview.expiresAt,context.creditVerifiedUntil);
 const disclosure:AdviceDisclosure={...authority.identity,requestId:randomUUID(),feature,provider:'openai',organization:context.organization,project:context.project,model:GENERAL_MODEL_REFERENCE.model,question,summary:context.summary,contextRevision:context.revision,includesHealthData:true,currency:'USD',maxCostMicros:policy.maximumCost(maxOutputTokens),maxOutputTokens,quoteId:randomUUID(),pricingVersion:GENERAL_MODEL_REFERENCE.pricingVersion,expiresAt};
 // epoch is server authority, not part of disclosure schema.
 delete (disclosure as AdviceDisclosure&{epoch?:number}).epoch;
 const preview=createConsentPreview(disclosure,time);
 const binding=Object.freeze({epoch:authority.identity.epoch,grantId:randomUUID(),consentId:randomUUID(),approvalId:randomUUID(),budgetId:context.budgetId,consentFingerprint:preview.fingerprint,legacyFingerprint:adviceFingerprint({...disclosure,epoch:authority.identity.epoch}),quoteExpiresAt:expiresAt,creditVerifiedUntil:context.creditVerifiedUntil});
 const eligible=await authority.store.transaction(tx=>tx.query(`SELECT id FROM yeoni_openai_general.budgets WHERE id=$1 AND owner_id=$2 AND organization=$3 AND project=$4 AND enabled=true AND currency='USD' AND cap_micros-held_micros >= $5 AND expires_at>=to_timestamp($6::double precision/1000.0)`,[context.budgetId,authority.identity.ownerId,context.organization,context.project,disclosure.maxCostMicros,expiresAt]));
 if(eligible.rows.length!==1)throw Error('APPROVED_BUDGET_UNAVAILABLE');
 return {serverProposal:Object.freeze({disclosure:preview.disclosure,binding,rates}),view:Object.freeze({requestId:disclosure.requestId,fingerprint:preview.fingerprint,feature,question,summary:disclosure.summary,model:disclosure.model,maxCostMicros:disclosure.maxCostMicros,expiresAt,notice:preview.notice,healthNotice:preview.healthNotice!})};
}
