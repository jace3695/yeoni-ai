import {createConsentPreview,matchesConsentConfirmation,type AdviceDisclosure} from './advice-consent.ts';
import {bindGeneralAdviceToLegacy,type LegacyApprovalBinding} from './general-legacy-binding.ts';
import {calculateGeneralQuoteCost,type QuoteRates} from './general-quote-cost.ts';
import type {createGeneralIdentityAuthority} from './general-identity-authority.ts';
/** SERVER-ONLY proposal, resolved before displaying consent. Neither rates, budget,
 * identities, fingerprints nor summaries may be copied from browser input.
 * Enabled shared budget MUST already represent reviewed monetary authorization.
 * This function neither provisions budgets nor grants new spending permission.
 */
export type ServerApprovalProposal=Readonly<{disclosure:AdviceDisclosure;binding:LegacyApprovalBinding;rates:QuoteRates}>;
export async function recordConfirmedGeneralApproval(authority:Awaited<ReturnType<typeof createGeneralIdentityAuthority>>,serverProposal:ServerApprovalProposal,confirmation:unknown,now:number,reviewSyntheticDisclosure?:(d:AdviceDisclosure)=>void){
 // Snapshot before awaiting; caller mutation cannot change stored price or scope.
 const p=structuredClone(serverProposal),d=p.disclosure,b=p.binding,rates=p.rates;
 const preview=createConsentPreview(d,now);
 if(!matchesConsentConfirmation(confirmation,d,authority.identity,now))throw Error('CONSENT_REQUIRED');
 if(d.includesHealthData!==true){if(!reviewSyntheticDisclosure)throw Error('CONSENT_REQUIRED');reviewSyntheticDisclosure(d);}
 bindGeneralAdviceToLegacy(d,b,authority.identity,{requestId:d.requestId,feature:d.feature,question:d.question},now);
 if(rates.maxOutputTokens!==d.maxOutputTokens||calculateGeneralQuoteCost(rates,{promptTokens:rates.maxPromptTokens,completionTokens:rates.maxOutputTokens})>d.maxCostMicros)throw Error('QUOTE_CAP_INSUFFICIENT');
 return authority.store.transaction(async tx=>{
  const budget=await tx.query(`SELECT id FROM yeoni_openai_general.budgets WHERE id=$1 AND owner_id=$2
   AND organization=$3 AND project=$4 AND currency='USD' AND enabled=true
   AND cap_micros-held_micros >= $5 AND expires_at>=to_timestamp($6::double precision/1000.0)
   AND to_timestamp($6::double precision/1000.0)>clock_timestamp()
   AND to_timestamp($7::double precision/1000.0)>clock_timestamp()
   AND to_timestamp($8::double precision/1000.0)>clock_timestamp() FOR SHARE`,
   [b.budgetId,d.ownerId,d.organization,d.project,d.maxCostMicros,d.expiresAt,b.quoteExpiresAt,b.creditVerifiedUntil]);
  if(budget.rows.length!==1)throw Error('APPROVED_BUDGET_UNAVAILABLE');
  const approval=await tx.query(`INSERT INTO yeoni_openai_general.approvals
   (request_id,owner_id,session_id,disclosure,fingerprint,budget_id,approved,issued,expires_at,legacy_binding)
   VALUES($1,$2,$3,$4::jsonb,$5,$6,true,false,to_timestamp($7::double precision/1000.0),$8::jsonb)
   ON CONFLICT(request_id) DO NOTHING RETURNING request_id`,[d.requestId,d.ownerId,d.sessionId,JSON.stringify(d),preview.fingerprint,b.budgetId,d.expiresAt,JSON.stringify(b)]);
  if(approval.rows.length!==1)throw Error('APPROVAL_ALREADY_EXISTS');
  const quote=await tx.query(`INSERT INTO yeoni_openai_general.quote_snapshots
   (quote_id,request_id,owner_id,epoch,grant_id,approval_id,fingerprint,organization,project,model,pricing_version,currency,max_cost_micros,input_micros_per_million,output_micros_per_million,max_prompt_tokens,max_output_tokens)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'USD',$12,$13,$14,$15,$16)
   ON CONFLICT DO NOTHING RETURNING quote_id`,[d.quoteId,d.requestId,d.ownerId,b.epoch,b.grantId,b.approvalId,b.legacyFingerprint,d.organization,d.project,d.model,d.pricingVersion,d.maxCostMicros,rates.inputMicrosPerMillion,rates.outputMicrosPerMillion,rates.maxPromptTokens,rates.maxOutputTokens]);
  if(quote.rows.length!==1)throw Error('QUOTE_ALREADY_EXISTS');
  return Object.freeze({requestId:d.requestId,quoteId:d.quoteId,fingerprint:preview.fingerprint,state:'approved' as const});
 });
}
// No HTTP endpoint, proposal source, live prices, session lifecycle or deployment.
// Approval does not consume funds; later runtime repeats validity and reserves.
