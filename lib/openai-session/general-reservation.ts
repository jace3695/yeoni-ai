import {createConsentPreview, matchesConsentConfirmation, type AdviceDisclosure} from './advice-consent.ts';

export interface ReservationTransaction {
  query(sql:string, parameters:unknown[]):Promise<{rows:Record<string,unknown>[]}>;
}
/** Adapter MUST own one real SQL transaction: commit only after callback success,
 * rollback on ANY exception, same connection throughout. Never install a bare pool.
 * These functions do not install schema, approve spend, issue grants or call OpenAI.
 */
export interface ReservationStore {
  transaction<T>(work:(tx:ReservationTransaction)=>Promise<T>):Promise<T>;
}
export const GENERAL_RESERVE_SQL = Object.freeze({
  consume:`UPDATE yeoni_openai_general.grants SET consumed=true
    WHERE request_id=$1 AND owner_id=$2 AND session_id=$3 AND fingerprint=$4
      AND max_cost_micros=$5 AND organization=$6 AND project=$7 AND currency='USD'
      AND consumed=false AND expires_at>clock_timestamp()
      AND to_timestamp($8::double precision/1000.0)>clock_timestamp()
    RETURNING budget_id`,
  budget:`UPDATE yeoni_openai_general.budgets
    SET held_micros=held_micros+$1
    WHERE id=$2 AND owner_id=$3 AND organization=$4 AND project=$5 AND currency='USD'
      AND enabled=true AND expires_at>clock_timestamp()
      AND held_micros <= cap_micros-$1
    RETURNING id`,
  receipt:`INSERT INTO yeoni_openai_general.reservations
    (request_id,owner_id,session_id,budget_id,fingerprint,held_micros,state)
    VALUES($1,$2,$3,$4,$5,$6,'reserved') RETURNING request_id`,
});
export async function reserveGeneralAdvice(store:ReservationStore, input:{
  current:AdviceDisclosure; confirmation:unknown;
  identity:{ownerId:string;sessionId:string}; now:number;
}) {
  // Caller must supply current server-resolved disclosure + verified auth, never body authority.
  const {current,confirmation,identity,now}=input;
  if(!matchesConsentConfirmation(confirmation,current,identity,now))throw new Error('CONSENT_MISMATCH');
  const {disclosure:d,fingerprint}=createConsentPreview(current,now);
  return store.transaction(async tx=>{
    const grant=await tx.query(GENERAL_RESERVE_SQL.consume,[d.requestId,d.ownerId,d.sessionId,fingerprint,d.maxCostMicros,d.organization,d.project,d.expiresAt]);
    if(grant.rows.length!==1||typeof grant.rows[0].budget_id!=='string')throw new Error('GRANT_UNAVAILABLE');
    const budgetId=grant.rows[0].budget_id;
    const budget=await tx.query(GENERAL_RESERVE_SQL.budget,[d.maxCostMicros,budgetId,d.ownerId,d.organization,d.project]);
    if(budget.rows.length!==1)throw new Error('BUDGET_UNAVAILABLE');
    const receipt=await tx.query(GENERAL_RESERVE_SQL.receipt,[d.requestId,d.ownerId,d.sessionId,budgetId,fingerprint,d.maxCostMicros]);
    if(receipt.rows.length!==1)throw new Error('RESERVATION_FAILED');
    return Object.freeze({requestId:d.requestId,fingerprint,budgetId,heldMicros:d.maxCostMicros,state:'reserved' as const});
  });
}
// No refund/retry/dispatch operation: cap stays held after uncertain outcomes.
// Reservation alone must NEVER authorize provider sending: fresh live-session,
// server issuance, single-use dispatch claim and actual cost controls remain required.
