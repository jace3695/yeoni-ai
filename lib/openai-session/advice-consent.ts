import { createHash } from 'node:crypto';

/** Server-only consent binding. It DOES NOT authorize a call, issue a spending
 * grant, store consent, or install a route. Inputs must be server resolved.
 * Durable atomic consume + current-session + shared budget checks remain required.
 */
export type AdviceDisclosure = Readonly<{
  ownerId: string; sessionId: string; requestId: string;
  feature: 'advice' | 'conversation'; provider: 'openai';
  organization: string; project: string; model: string;
  question: string; summary: string; contextRevision: string;
  includesHealthData: boolean; currency: 'USD'; maxCostMicros: number;
  maxOutputTokens: number; quoteId: string; pricingVersion: string;
  expiresAt: number;
}>;
export type ConsentPreview = Readonly<{
  disclosure: AdviceDisclosure; fingerprint: string;
  recipient: 'OpenAI'; noticeVersion: 'openai-advice-consent-v1';
  notice: string; healthNotice: string | null;
}>;
const keys = ['ownerId','sessionId','requestId','feature','provider','organization','project','model','question','summary','contextRevision','includesHealthData','currency','maxCostMicros','maxOutputTokens','quoteId','pricingVersion','expiresAt'].sort();
const clean = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
export function createConsentPreview(input: AdviceDisclosure, now: number): ConsentPreview {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join('|') !== keys.join('|')) throw new Error('INVALID_DISCLOSURE');
  if (!positive(now) || !positive(input.expiresAt) || input.expiresAt <= now || input.expiresAt - now > 300_000 ||
    !['advice','conversation'].includes(input.feature) || input.provider !== 'openai' || input.currency !== 'USD' ||
    ![input.ownerId,input.sessionId,input.requestId,input.organization,input.project,input.model,input.contextRevision,input.quoteId,input.pricingVersion].every(v=>clean(v,200)) ||
    !clean(input.question,500) || typeof input.summary !== 'string' || input.summary.length > 8000 ||
    typeof input.includesHealthData !== 'boolean' || !positive(input.maxCostMicros) || !positive(input.maxOutputTokens) || input.maxOutputTokens > 2048) throw new Error('INVALID_DISCLOSURE');
  // Copy every field; no reference to a mutable caller-owned object is retained.
  const disclosure = Object.freeze(Object.fromEntries(keys.map(k => [k,input[k as keyof AdviceDisclosure]]))) as AdviceDisclosure;
  const fingerprint = createHash('sha256').update(JSON.stringify(['openai-advice-consent-v1', ...keys.map(k=>disclosure[k as keyof AdviceDisclosure])])).digest('hex');
  return Object.freeze({disclosure,fingerprint,recipient:'OpenAI',noticeVersion:'openai-advice-consent-v1',
    notice:'표시된 질문과 기록 요약을 OpenAI로 전송해 조언을 받아요. 기록을 추가·수정·삭제하지 않아요. 응답이 끊겨도 비용이 발생할 수 있으며 자동 재시도하지 않아요.',
    healthNotice: disclosure.includesHealthData ? '이 질문 또는 요약에는 건강정보가 포함돼요. 해당 내용을 OpenAI에 보내는 것에 별도로 동의해야 해요.' : null});
}
/** Compare HTTP consent against the CURRENT server disclosure, never a body-supplied
 * snapshot. True means only consent matches, not that spend/access is authorized.
 * A question can itself contain health data; classify it along with summary.
 */
export function matchesConsentConfirmation(raw: unknown, current: AdviceDisclosure,
  identity: Readonly<{ownerId:string;sessionId:string}>, now: number): boolean {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const x=raw as Record<string,unknown>;
    if (Object.keys(x).sort().join('|') !== ['accepted','fingerprint','healthAccepted','requestId'].sort().join('|')) return false;
    if (current.ownerId !== identity.ownerId || current.sessionId !== identity.sessionId) return false;
    const preview=createConsentPreview(current,now);
    return x.accepted === true && typeof x.healthAccepted === 'boolean' &&
      (!current.includesHealthData || x.healthAccepted === true) &&
      x.requestId === current.requestId && x.fingerprint === preview.fingerprint;
  } catch { return false; }
}
