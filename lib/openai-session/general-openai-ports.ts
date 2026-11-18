import type {OpenAiPorts,ApprovedAdvice,Reservation,Usage} from '../openai-advice-server.ts';
import type {AdviceDisclosure} from './advice-consent.ts';
import type {ReservationStore} from './general-reservation.ts';
import {reserveGeneralAdvice} from './general-reservation.ts';
import {bindGeneralAdviceToLegacy,bindGeneralReservationToLegacy,type BoundGeneralAdvice,type LegacyApprovalBinding} from './general-legacy-binding.ts';
import {claimGeneralDispatch,markGeneralDispatchUncertain,settleGeneralDispatch} from './general-dispatch-ledger.ts';
import type {createGeneralIdentityAuthority} from './general-identity-authority.ts';
type Authority=Awaited<ReturnType<typeof createGeneralIdentityAuthority>>;
/** Uninstalled server-only ports, per REQUEST instance. The cost callback MUST
 * use server immutable quote rates, never caller price/usage. Transport and key
 * callbacks require separate authorization. No default fetch or credentials.
 */
export function createGeneralOpenAiPorts(authority:Authority,
 deps:{confirmation:unknown;now:()=>number;credentials:OpenAiPorts['credentials'];transport:typeof fetch;cost:(grant:ApprovedAdvice,usage:Usage)=>Promise<number>}):OpenAiPorts{
 let bound:BoundGeneralAdvice|undefined,disclosure:AdviceDisclosure|undefined,receipt:Reservation|undefined,claimed=false;
 const i=authority.identity;
 const match=(r:Reservation)=>{if(!receipt||r.id!==receipt.id||JSON.stringify(r)!==JSON.stringify(receipt))throw Error('RECEIPT_MISMATCH');return {requestId:r.requestId,ownerId:i.ownerId,sessionId:i.sessionId,fingerprint:bound!.consentFingerprint}};
 return {
  now:deps.now,isCurrent:authority.isLocallyCurrent,
  authenticate:async()=>{await authority.assertCurrent();return {ownerId:i.ownerId,epoch:i.epoch}},
  authorize:async(request,identity)=>{
   if(bound||!authority.isLocallyCurrent(identity))throw Error('REQUEST_SCOPE_MISMATCH');
   return authority.store.transaction(async tx=>{
    const r=await tx.query(`SELECT a.disclosure,g.legacy_binding,g.fingerprint,g.budget_id
     FROM yeoni_openai_general.approvals a JOIN yeoni_openai_general.grants g USING(request_id)
     WHERE a.request_id=$1 AND a.owner_id=$2 AND a.session_id=$3 AND a.approved=true AND a.issued=true
      AND g.owner_id=a.owner_id AND g.session_id=a.session_id AND g.consumed=false
      AND a.fingerprint=g.fingerprint AND a.budget_id=g.budget_id AND a.legacy_binding=g.legacy_binding
      AND a.expires_at>clock_timestamp() AND g.expires_at>clock_timestamp() FOR UPDATE OF a,g`,[request.requestId,i.ownerId,i.sessionId]);
    if(r.rows.length!==1)throw Error('BOUND_GRANT_UNAVAILABLE');
    const row=r.rows[0],b=row.legacy_binding as LegacyApprovalBinding;
    if(!b||b.consentFingerprint!==row.fingerprint||b.budgetId!==row.budget_id)throw Error('BOUND_GRANT_MISMATCH');
    disclosure=row.disclosure as AdviceDisclosure;bound=bindGeneralAdviceToLegacy(disclosure,b,i,request,deps.now());return bound.legacyGrant;
   });
  },
  reserve:async grant=>{
   if(!bound||!disclosure||receipt||JSON.stringify(grant)!==JSON.stringify(bound.legacyGrant))throw Error('GRANT_MISMATCH');
   const r=await reserveGeneralAdvice(authority.store,{current:disclosure,confirmation:deps.confirmation,identity:i,now:deps.now()});
   receipt=bindGeneralReservationToLegacy(bound,r,deps.now());return receipt;
  },
  claimDispatch:async r=>{const binding=match(r);await claimGeneralDispatch(authority.store,binding);claimed=true;return true},
  credentials:async(org,project)=>{await authority.assertCurrent();if(!bound||org!==bound.legacyGrant.organization||project!==bound.legacyGrant.project)throw Error('DESTINATION_MISMATCH');return deps.credentials(org,project)},
  request:async(url,options)=>{
   if(!claimed||!receipt||options?.signal?.aborted)throw Error('DISPATCH_NOT_CLAIMED');
   // A process-local one-shot gate supplements the durable sending claim.
   claimed=false;
   if(url!=='https://api.openai.com/v1/chat/completions'||options?.method!=='POST'||options.redirect!=='error')throw Error('TRANSPORT_SCOPE_MISMATCH');
   await authority.assertCurrent();
   if(deps.now()>=receipt.sendBefore||options?.signal?.aborted)throw Error('DISPATCH_EXPIRED');
   return deps.transport(url,options);
  },
  retain:async(r)=>{const binding=match(r);if(claimed)claimed=false;
   // Never refund even when no transport happened: timeout/commit may be uncertain.
   // Reserved state stays held; sending becomes uncertain if present.
   await markGeneralDispatchUncertain(authority.settlementStore,binding);
  },
  complete:async(r,usage)=>{const binding=match(r);const cost=await deps.cost(bound!.legacyGrant,usage);await settleGeneralDispatch(authority.settlementStore,binding,cost)},
 };
}
// Not installed into routes. Epoch provisioning, reviewed approval creation,
// actual pricing/credentials/transport and production permissions remain separate.
