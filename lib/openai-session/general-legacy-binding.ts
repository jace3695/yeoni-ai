import {createConsentPreview,type AdviceDisclosure} from './advice-consent.ts';
import {adviceFingerprint,type ApprovedAdvice,type Reservation,type AdviceRequest} from '../openai-advice-server.ts';
export type LegacyApprovalBinding=Readonly<{
 epoch:number;grantId:string;consentId:string;approvalId:string;budgetId:string;
 consentFingerprint:string;legacyFingerprint:string;
 quoteExpiresAt:number;creditVerifiedUntil:number;
}>;
export type BoundGeneralAdvice=Readonly<{legacyGrant:ApprovedAdvice;sessionId:string;consentFingerprint:string;budgetId:string}>;
const nonempty=(s:unknown)=>typeof s==='string'&&s.trim().length>0&&s.length<=200;
/** Pure compatibility boundary only: canonical disclosure AND both approved
 * fingerprints must come from the same persisted server approval. Never generate
 * a fresh legacy approval from a browser epoch or silently replace either digest.
 * The legacy digest binds its own SYSTEM text; the consent digest binds current
 * amount, output cap, question, summary, destination, session and expiry.
 */
export function bindGeneralAdviceToLegacy(d:AdviceDisclosure,b:LegacyApprovalBinding,
 verified:{ownerId:string;sessionId:string;epoch:number},request:AdviceRequest,now:number):BoundGeneralAdvice{
 const preview=createConsentPreview(d,now);
 if(!Number.isSafeInteger(b.epoch)||b.epoch<0||verified.epoch!==b.epoch||verified.ownerId!==d.ownerId||verified.sessionId!==d.sessionId||
  request.requestId!==d.requestId||request.feature!==d.feature||request.question!==d.question||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(d.requestId)||
  ![b.grantId,b.consentId,b.approvalId,b.budgetId].every(nonempty)||
  b.consentFingerprint!==preview.fingerprint||
  ![b.quoteExpiresAt,b.creditVerifiedUntil].every(v=>Number.isSafeInteger(v)&&v>now))throw new Error('LEGACY_BINDING_MISMATCH');
 const grant:ApprovedAdvice=Object.freeze({id:b.grantId,ownerId:d.ownerId,epoch:b.epoch,requestId:d.requestId,feature:d.feature,provider:'openai',organization:d.organization,project:d.project,model:d.model,question:d.question,summary:d.summary,fingerprint:b.legacyFingerprint,consentId:b.consentId,approvalId:b.approvalId,quoteId:d.quoteId,pricingVersion:d.pricingVersion,expiresAt:d.expiresAt,quoteExpiresAt:b.quoteExpiresAt,creditVerifiedUntil:b.creditVerifiedUntil,currency:'USD',maxCostMicros:d.maxCostMicros,maxOutputTokens:d.maxOutputTokens});
 if(b.legacyFingerprint!==adviceFingerprint(grant))throw new Error('LEGACY_WIRE_BINDING_MISMATCH');
 return Object.freeze({legacyGrant:grant,sessionId:d.sessionId,consentFingerprint:preview.fingerprint,budgetId:b.budgetId});
}
export function bindGeneralReservationToLegacy(bound:BoundGeneralAdvice,receipt:Readonly<{requestId:string;fingerprint:string;budgetId:string;heldMicros:number;state:'reserved'}>,now:number):Reservation{
 const g=bound.legacyGrant;
 if(receipt.state!=='reserved'||receipt.requestId!==g.requestId||receipt.fingerprint!==bound.consentFingerprint||receipt.budgetId!==bound.budgetId||receipt.heldMicros!==g.maxCostMicros||!Number.isSafeInteger(now)||now<=0||Math.min(g.expiresAt,g.quoteExpiresAt,g.creditVerifiedUntil)<=now)throw new Error('LEGACY_RECEIPT_BINDING_MISMATCH');
 return Object.freeze({id:g.requestId,grantId:g.id,ownerId:g.ownerId,epoch:g.epoch,requestId:g.requestId,fingerprint:g.fingerprint,organization:g.organization,project:g.project,model:g.model,currency:'USD',reservedMicros:receipt.heldMicros,sendBefore:Math.min(g.expiresAt,g.quoteExpiresAt,g.creditVerifiedUntil)});
}
// Does NOT install OpenAiPorts, accept credentials, check live sessions, provide
// synchronous isCurrent, calculate provider usage, authorize cost, or transmit.
// Persisted dual binding issuance + session/epoch authority is still required.
