import type {ApprovedAdvice,Usage} from '../openai-advice-server.ts';
import type {ReservationStore} from './general-reservation.ts';
export type QuoteRates=Readonly<{inputMicrosPerMillion:number;outputMicrosPerMillion:number;maxPromptTokens:number;maxOutputTokens:number}>;
const uint=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
/** USD micro-units, conservative no-cache discount. BigInt avoids floating-point
 * underbilling. A single ceiling covers the sum, not separate per-token rounding.
 * Provider reported usage only; no browser estimates or configured live rates.
 */
export function calculateGeneralQuoteCost(r:QuoteRates,u:Usage):number{
 if(!r||!u||![r.inputMicrosPerMillion,r.outputMicrosPerMillion,r.maxPromptTokens,r.maxOutputTokens,u.promptTokens,u.completionTokens].every(uint)||
 r.inputMicrosPerMillion<=0||r.outputMicrosPerMillion<=0||r.maxPromptTokens<=0||r.maxOutputTokens<=0||
 u.promptTokens>r.maxPromptTokens||u.completionTokens>r.maxOutputTokens)throw Error('USAGE_OUTSIDE_QUOTE');
 const n=BigInt(u.promptTokens)*BigInt(r.inputMicrosPerMillion)+BigInt(u.completionTokens)*BigInt(r.outputMicrosPerMillion);
 const micros=(n+BigInt(999999))/BigInt(1000000);
 if(micros>BigInt(Number.MAX_SAFE_INTEGER))throw Error('COST_OVERFLOW');
 return Number(micros);
}
/** Server-only snapshot reader. Records must originate in reviewed approval flow.
 * No inserts/updates or rate discovery. Expiry does NOT erase incurred cost: read
 * the exact approved historical rates even after logout/quote expiry.
 * Insert-only immutable rows need no FOR SHARE (which would require UPDATE).
 */
export function createGeneralQuoteCost(store:ReservationStore,expected?:QuoteRates){
 const required=expected ? Object.freeze({...expected}) : undefined;
 return (grant:ApprovedAdvice,usage:Usage)=>store.transaction(async tx=>{
  const result=await tx.query(`SELECT input_micros_per_million,output_micros_per_million,max_prompt_tokens,max_output_tokens
   FROM yeoni_openai_general.quote_snapshots WHERE quote_id=$1 AND request_id=$2 AND owner_id=$3
   AND epoch=$4 AND grant_id=$5 AND approval_id=$6 AND fingerprint=$7
   AND organization=$8 AND project=$9 AND model=$10 AND pricing_version=$11
   AND max_cost_micros=$12 AND max_output_tokens=$13 AND currency='USD'`,
   [grant.quoteId,grant.requestId,grant.ownerId,grant.epoch,grant.id,grant.approvalId,grant.fingerprint,grant.organization,grant.project,grant.model,grant.pricingVersion,grant.maxCostMicros,grant.maxOutputTokens]);
  if(result.rows.length!==1)throw Error('QUOTE_SNAPSHOT_UNAVAILABLE');
  const row=result.rows[0];
  const number=(v:unknown)=>{if((typeof v!=='number'&&typeof v!=='string')||!/^\d+$/.test(String(v)))throw Error('QUOTE_SNAPSHOT_INVALID');const n=Number(v);if(!uint(n))throw Error('QUOTE_SNAPSHOT_INVALID');return n};
  const rates={inputMicrosPerMillion:number(row.input_micros_per_million),outputMicrosPerMillion:number(row.output_micros_per_million),maxPromptTokens:number(row.max_prompt_tokens),maxOutputTokens:number(row.max_output_tokens)};
  if(required&&Object.keys(required).some(k=>required[k as keyof QuoteRates]!==rates[k as keyof QuoteRates]))throw Error('QUOTE_POLICY_MISMATCH');
  if(calculateGeneralQuoteCost(rates,{promptTokens:rates.maxPromptTokens,completionTokens:rates.maxOutputTokens})>grant.maxCostMicros)throw Error('QUOTE_CAP_INSUFFICIENT');
  const cost=calculateGeneralQuoteCost(rates,usage);
  if(!uint(grant.maxCostMicros)||cost>grant.maxCostMicros)throw Error('COST_EXCEEDS_HOLD');
  return cost;
 });
}
