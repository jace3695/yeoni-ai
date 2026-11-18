import type {ReservationStore} from './general-reservation.ts';
type Binding=Readonly<{requestId:string;ownerId:string;sessionId:string;fingerprint:string}>;
function parameters(b:Binding){const p=[b.requestId,b.ownerId,b.sessionId,b.fingerprint];if(!p.every(v=>typeof v==='string'&&v.trim().length>0&&v.length<=200))throw new Error('INVALID_BINDING');return p;}
/** Durable bookkeeping only. Caller must independently verify live session and
 * authorization before any dispatch. No provider, auth, cost estimator or route installed.
 * Store must commit callback atomically or roll back on any error, same connection.
 */
export async function claimGeneralDispatch(store:ReservationStore,b:Binding){const p=parameters(b);return store.transaction(async tx=>{
 const r=await tx.query(`UPDATE yeoni_openai_general.reservations r SET state='sending'
 FROM yeoni_openai_general.grants g,yeoni_openai_general.budgets budget
 WHERE r.request_id=$1 AND r.owner_id=$2 AND r.session_id=$3 AND r.fingerprint=$4 AND r.state='reserved'
 AND g.request_id=r.request_id AND g.owner_id=r.owner_id AND g.session_id=r.session_id AND g.fingerprint=r.fingerprint
 AND g.max_cost_micros=r.held_micros AND budget.held_micros>=r.held_micros
 AND g.budget_id=r.budget_id AND g.consumed=true AND g.expires_at>clock_timestamp()
 AND budget.id=r.budget_id AND budget.owner_id=r.owner_id AND budget.organization=g.organization AND budget.project=g.project
 AND budget.enabled=true AND budget.expires_at>clock_timestamp()
 RETURNING r.request_id`,p);
 if(r.rows.length!==1)throw new Error('DISPATCH_CLAIM_UNAVAILABLE');
 return Object.freeze({requestId:b.requestId,state:'sending' as const});
 });}
/** Usage must be independently reconciled from verified provider evidence. Never
 * accept user-supplied amounts, missing usage, or unverified zero as a refund.
 * Above-cap/unknown costs must remain held and be reconciled; no false bill guarantee.
 */
export async function settleGeneralDispatch(store:ReservationStore,b:Binding,actualMicros:number){const p=parameters(b);if(!Number.isSafeInteger(actualMicros)||actualMicros<0)throw new Error('INVALID_USAGE');return store.transaction(async tx=>{
 const r=await tx.query(`UPDATE yeoni_openai_general.reservations SET state='settled',actual_micros=$5
 WHERE request_id=$1 AND owner_id=$2 AND session_id=$3 AND fingerprint=$4 AND state='sending'
 AND held_micros >= $5 RETURNING budget_id,held_micros`,[...p,actualMicros]);
 if(r.rows.length!==1)throw new Error('SETTLEMENT_UNAVAILABLE');
 const held=Number(r.rows[0].held_micros),budgetId=r.rows[0].budget_id;
 if(!Number.isSafeInteger(held)||held<actualMicros||typeof budgetId!=='string')throw new Error('INVALID_RESERVATION');
 const refund=held-actualMicros;
 const q=await tx.query(`UPDATE yeoni_openai_general.budgets SET held_micros=held_micros-$1
 WHERE id=$2 AND owner_id=$3 AND held_micros >= $4 RETURNING id`,[refund,budgetId,b.ownerId,held]);
 if(q.rows.length!==1)throw new Error('SETTLEMENT_BUDGET_UNAVAILABLE');
 return Object.freeze({requestId:b.requestId,state:'settled' as const,chargedMicros:actualMicros,releasedMicros:refund});
 });}
export async function markGeneralDispatchUncertain(store:ReservationStore,b:Binding){const p=parameters(b);return store.transaction(async tx=>{
 const r=await tx.query(`UPDATE yeoni_openai_general.reservations SET state='uncertain'
 WHERE request_id=$1 AND owner_id=$2 AND session_id=$3 AND fingerprint=$4 AND state='sending' RETURNING request_id`,p);
 if(r.rows.length!==1)throw new Error('UNCERTAIN_TRANSITION_UNAVAILABLE');
 return Object.freeze({requestId:b.requestId,state:'uncertain' as const});
 });}
// No reset/retry/reclaim API. Failure after claim leaves sending; uncertainty holds cap.
// Settled actual cost remains in shared budget held_micros as consumed budget, while
// only unspent headroom is released. No period reset or approval expansion is implied.
