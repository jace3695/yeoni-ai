import {ZEPHYR_ONCE} from './zephyr-28-policy.ts';
/** Reviewed evidence for THIS request only, not a billing-account-wide cap or a free allowance. */
export type RequestCostEvidence = {
  schemaVersion: 1; evidenceRef: string; approvalId: string; requestId: string;
  text: string; voice: string; encoding: string; requests: number; unit: string; quantity: number;
  currency: string; sku: string; unitPriceMicrousd: number; priceSource: string; priceCheckedAt: number;
  taxUpperMicrousd: number; taxBasisRef: string; taxCheckedAt: number;
  feeUpperMicrousd: number; feeBasisRef: string; feeCheckedAt: number;
  additionalPaidCalls: number; maximumMicrousd: number; reviewedAt: number; expiresAt: number;
};
const day = 86_400_000;
const ref = (v: unknown) => typeof v === 'string' && v.length <= 500 && /^[A-Za-z0-9]/.test(v) && !/[^A-Za-z0-9._:/#?=&%+@-]/.test(v);
const amount = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 10_000;
export function validRequestCost(value: unknown, now: number, permitExpiresAt = now): value is RequestCostEvidence {
  if (!value || typeof value !== 'object' || !Number.isFinite(now) || !Number.isFinite(permitExpiresAt)) return false;
  const e = value as RequestCostEvidence;
  if (e.schemaVersion !== 1 || !ref(e.evidenceRef) || e.approvalId !== ZEPHYR_ONCE.approvalId || e.requestId !== ZEPHYR_ONCE.requestId
    || e.text !== ZEPHYR_ONCE.text || e.voice !== ZEPHYR_ONCE.voice || e.encoding !== 'MP3' || e.requests !== 1
    || e.unit !== 'character' || e.quantity !== 28 || Array.from(e.text).length !== e.quantity || e.currency !== 'USD'
    || e.sku !== 'F977-2280-6F1B' || e.unitPriceMicrousd !== 30
    || e.priceSource !== 'https://cloud.google.com/text-to-speech/pricing'
    || e.additionalPaidCalls !== 0 || e.maximumMicrousd !== 10_000
    || !amount(e.taxUpperMicrousd) || !ref(e.taxBasisRef) || !amount(e.feeUpperMicrousd) || !ref(e.feeBasisRef)) return false;
  for (const checkedAt of [e.priceCheckedAt,e.taxCheckedAt,e.feeCheckedAt,e.reviewedAt]) {
    if (!Number.isSafeInteger(checkedAt) || checkedAt <= 0 || checkedAt > now || now - checkedAt > day || checkedAt > e.reviewedAt) return false;
  }
  if (!Number.isSafeInteger(e.expiresAt) || e.expiresAt <= now || e.expiresAt > e.reviewedAt + day || e.expiresAt < permitExpiresAt) return false;
  // Integer micro-USD arithmetic; subtotal is computed, never supplied as an authorization.
  return e.requests * e.quantity * e.unitPriceMicrousd + e.taxUpperMicrousd + e.feeUpperMicrousd <= e.maximumMicrousd;
}
