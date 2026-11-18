import {createConsentPreview,matchesConsentConfirmation,type AdviceDisclosure} from './advice-consent.ts';
import type {ReservationStore} from './general-reservation.ts';
/** Offline candidate only. Approval rows MUST be produced by a separately reviewed
 * authenticated monetary-approval flow. This module cannot create approvals.
 * No caller-provided disclosure, amount, model, budget or destination is accepted.
 */
export async function issueGeneralGrant(store:ReservationStore,input:{requestId:string;identity:{ownerId:string;sessionId:string};confirmation:unknown;now:number;reviewSyntheticDisclosure?:(d:AdviceDisclosure)=>void}){
 if(typeof input.requestId!=='string'||!input.requestId.trim()||input.requestId.length>200)throw new Error('INVALID_REQUEST');
 return store.transaction(async tx=>{
  const found=await tx.query(`SELECT disclosure,fingerprint FROM yeoni_openai_general.approvals
   WHERE request_id=$1 AND owner_id=$2 AND session_id=$3 AND approved=true AND issued=false
   AND expires_at>clock_timestamp() FOR UPDATE`,[input.requestId,input.identity.ownerId,input.identity.sessionId]);
  if(found.rows.length!==1)throw new Error('APPROVAL_UNAVAILABLE');
  const d=found.rows[0].disclosure as AdviceDisclosure;
  const preview=createConsentPreview(d,input.now);
  if(d.requestId!==input.requestId||preview.fingerprint!==found.rows[0].fingerprint||!matchesConsentConfirmation(input.confirmation,d,input.identity,input.now))throw new Error('APPROVAL_BINDING_MISMATCH');
  // No validated server classifier exists yet: refuse non-sensitive classification.
  // Do not infer safety from client false or from keyword absence.
  if(d.includesHealthData!==true){if(!input.reviewSyntheticDisclosure)throw new Error('HEALTH_CLASSIFICATION_UNAVAILABLE');input.reviewSyntheticDisclosure(d);}
  const claimed=await tx.query(`UPDATE yeoni_openai_general.approvals SET issued=true
   WHERE request_id=$1 AND approved=true AND issued=false
   AND expires_at>=to_timestamp($2::double precision/1000.0)
   AND to_timestamp($2::double precision/1000.0)>clock_timestamp()
   RETURNING budget_id`,[d.requestId,d.expiresAt]);
  if(claimed.rows.length!==1||typeof claimed.rows[0].budget_id!=='string')throw new Error('APPROVAL_EXPIRED');
  const budgetId=claimed.rows[0].budget_id;
  const grant=await tx.query(`INSERT INTO yeoni_openai_general.grants
   (request_id,owner_id,session_id,fingerprint,organization,project,currency,max_cost_micros,budget_id,consumed,expires_at)
   SELECT $1,$2,$3,$4,$5,$6,'USD',$7,b.id,false,to_timestamp($8::double precision/1000.0)
   FROM yeoni_openai_general.budgets b WHERE b.id=$9 AND b.owner_id=$2 AND b.organization=$5 AND b.project=$6
    AND b.currency='USD' AND b.enabled=true AND b.expires_at>=to_timestamp($8::double precision/1000.0)
    AND b.cap_micros-b.held_micros >= $7
    AND to_timestamp($8::double precision/1000.0)>clock_timestamp()
   ON CONFLICT(request_id) DO NOTHING RETURNING request_id`,[d.requestId,d.ownerId,d.sessionId,preview.fingerprint,d.organization,d.project,d.maxCostMicros,d.expiresAt,budgetId]);
  if(grant.rows.length!==1)throw new Error('GRANT_ISSUANCE_UNAVAILABLE');
  return Object.freeze({requestId:d.requestId,fingerprint:preview.fingerprint,state:'issued' as const});
 });
}
// Issuance does not reserve funds or authorize dispatch. reserveGeneralAdvice must
// later recheck and atomically consume grant + shared budget. Fresh authentication,
// dispatch claim and provider integration remain absent. Existing routes stay OFF.
