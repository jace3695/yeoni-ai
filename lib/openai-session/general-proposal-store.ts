import type {createGeneralIdentityAuthority} from './general-identity-authority.ts';
import type {ServerApprovalProposal} from './general-approval-creation.ts';
import {recordConfirmedGeneralApproval} from './general-approval-creation.ts';
import type {AdviceRequest} from '../openai-advice-server.ts';
type Authority=Awaited<ReturnType<typeof createGeneralIdentityAuthority>>;
export async function saveGeneralProposal(a:Authority,p:ServerApprovalProposal){
 const saved=structuredClone(p),d=saved.disclosure;
 if(d.ownerId!==a.identity.ownerId||d.sessionId!==a.identity.sessionId||saved.binding.epoch!==a.identity.epoch)throw Error('PROPOSAL_IDENTITY_MISMATCH');
 return a.store.transaction(async tx=>{const r=await tx.query(`INSERT INTO yeoni_openai_general.proposals(request_id,owner_id,session_id,fingerprint,proposal,expires_at)
 SELECT $1,$2,$3,$4,($5::text)::jsonb,to_timestamp($6::double precision/1000.0) WHERE to_timestamp($6::double precision/1000.0)>clock_timestamp()
 ON CONFLICT DO NOTHING RETURNING request_id`,[d.requestId,d.ownerId,d.sessionId,saved.binding.consentFingerprint,JSON.stringify(saved),d.expiresAt]);if(r.rows.length!==1)throw Error('PROPOSAL_UNAVAILABLE')});
}
export async function confirmStoredGeneralProposal(a:Authority,r:AdviceRequest,confirmation:unknown,now:number,reviewSyntheticDisclosure?:(d:ServerApprovalProposal['disclosure'])=>void){
 return a.store.transaction(async tx=>{
  const found=await tx.query(`SELECT proposal,fingerprint FROM yeoni_openai_general.proposals WHERE request_id=$1 AND owner_id=$2 AND session_id=$3 AND consumed=false AND expires_at>clock_timestamp() FOR UPDATE`,[r.requestId,a.identity.ownerId,a.identity.sessionId]);
  if(found.rows.length!==1)throw Error('PROPOSAL_UNAVAILABLE');const p=found.rows[0].proposal as ServerApprovalProposal;
  if(p.disclosure.requestId!==r.requestId||p.disclosure.feature!==r.feature||p.disclosure.question!==r.question||p.binding.consentFingerprint!==found.rows[0].fingerprint)throw Error('PROPOSAL_MISMATCH');
  await recordConfirmedGeneralApproval({...a,store:{transaction:work=>work(tx)}},p,confirmation,now,reviewSyntheticDisclosure);
  const used=await tx.query(`UPDATE yeoni_openai_general.proposals SET consumed=true WHERE request_id=$1 AND consumed=false AND expires_at>clock_timestamp() RETURNING request_id`,[r.requestId]);
  if(used.rows.length!==1)throw Error('PROPOSAL_EXPIRED');
 });
}
