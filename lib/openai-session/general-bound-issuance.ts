import type {AdviceDisclosure} from './advice-consent.ts';
import type {AdviceRequest,ApprovedAdvice} from '../openai-advice-server.ts';
import type {ReservationStore} from './general-reservation.ts';
import {bindGeneralAdviceToLegacy,type LegacyApprovalBinding} from './general-legacy-binding.ts';
import {issueGeneralGrant} from './general-grant-issuance.ts';
/** Server-only candidate. identity.epoch MUST be authenticated server authority,
 * not a browser field. Approval creation remains a separate reviewed operation.
 * Stores the exact same-row dual binding in the issued grant in ONE transaction.
 * No nested connection, credentials, provider, activation or network side effects.
 */
export async function issueBoundGeneralGrant(store:ReservationStore,input:{request:AdviceRequest;identity:{ownerId:string;sessionId:string;epoch:number};confirmation:unknown;now:number;validateBoundGrant?:(grant:ApprovedAdvice)=>void;reviewSyntheticDisclosure?:(d:AdviceDisclosure)=>void}){
 return store.transaction(async tx=>{
  const r=await tx.query(`SELECT disclosure,fingerprint,budget_id,legacy_binding
   FROM yeoni_openai_general.approvals WHERE request_id=$1 AND owner_id=$2 AND session_id=$3
   AND approved=true AND issued=false AND expires_at>clock_timestamp() FOR UPDATE`,
   [input.request.requestId,input.identity.ownerId,input.identity.sessionId]);
  if(r.rows.length!==1)throw new Error('BOUND_APPROVAL_UNAVAILABLE');
  const row=r.rows[0],b=row.legacy_binding as LegacyApprovalBinding;
  if(!b||b.budgetId!==row.budget_id||b.consentFingerprint!==row.fingerprint)throw new Error('BOUND_APPROVAL_MISMATCH');
  const bound=bindGeneralAdviceToLegacy(row.disclosure as AdviceDisclosure,b,input.identity,input.request,input.now);
  input.validateBoundGrant?.(bound.legacyGrant);
  await issueGeneralGrant({transaction:work=>work(tx)},{requestId:input.request.requestId,identity:input.identity,confirmation:input.confirmation,now:input.now,reviewSyntheticDisclosure:input.reviewSyntheticDisclosure});
  const saved=await tx.query(`UPDATE yeoni_openai_general.grants SET legacy_binding=$4::jsonb,
    expires_at=LEAST(expires_at,to_timestamp($7::double precision/1000.0),to_timestamp($8::double precision/1000.0))
   WHERE request_id=$1 AND owner_id=$2 AND session_id=$3 AND fingerprint=$5 AND budget_id=$6
    AND legacy_binding IS NULL AND consumed=false
    AND expires_at>clock_timestamp()
    AND to_timestamp($7::double precision/1000.0)>clock_timestamp()
    AND to_timestamp($8::double precision/1000.0)>clock_timestamp()
   RETURNING request_id`,[input.request.requestId,input.identity.ownerId,input.identity.sessionId,JSON.stringify(b),b.consentFingerprint,b.budgetId,b.quoteExpiresAt,b.creditVerifiedUntil]);
  if(saved.rows.length!==1)throw new Error('BOUND_GRANT_UNAVAILABLE');
  return bound;
 });
}
