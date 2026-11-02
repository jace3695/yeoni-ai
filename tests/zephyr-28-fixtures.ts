/** SYNTHETIC cost inputs for local tests only. Never an executable approval seed. */
import {ZEPHYR_ONCE} from '../lib/zephyr-28-policy.ts';
import type {RequestCostEvidence} from '../lib/zephyr-28-cost.ts';
export function syntheticRequestCost(now=Date.now()): RequestCostEvidence {
 return {schemaVersion:1,evidenceRef:'SYNTHETIC-NOT-BILLING-EVIDENCE',approvalId:ZEPHYR_ONCE.approvalId,requestId:ZEPHYR_ONCE.requestId,
 text:ZEPHYR_ONCE.text,voice:ZEPHYR_ONCE.voice,encoding:'MP3',requests:1,unit:'character',quantity:28,currency:'USD',sku:'F977-2280-6F1B',
 unitPriceMicrousd:30,priceSource:'https://cloud.google.com/text-to-speech/pricing',priceCheckedAt:now,
 taxUpperMicrousd:84,taxBasisRef:'SYNTHETIC-TAX-NOT-REAL',taxCheckedAt:now,feeUpperMicrousd:0,feeBasisRef:'SYNTHETIC-FEE-NOT-REAL',feeCheckedAt:now,
 additionalPaidCalls:0,maximumMicrousd:10000,reviewedAt:now,expiresAt:now+600_000};
}

export const syntheticTrialJwt = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({iss:'https://piqqukiiacncfbztktga.supabase.co/auth/v1'})).toString('base64url')+'.SYNTHETIC_SIGNATURE';
