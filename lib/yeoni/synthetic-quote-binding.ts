/** Synthetic-only, inert request contract. This module never sends a request.
 * Hashes bind bytes and limits, not authenticity. Production server auth, price
 * authority, trusted DB time and an enforcing transport remain unimplemented.
 */
import { canonicalRecords, recordVersion, type RecordApp } from './generated-record-reply.ts';
import { quoteSyntheticCost, type CostPool, type SyntheticQuoteInput } from './synthetic-cost-quote.ts';

export type SyntheticBoundRequest = Readonly<{
  mode: 'synthetic'; provider: 'synthetic-only'; model: string;
  specificationVersion: string; sourceVersion: string; pool: CostPool;
  payloadSha256: string; maximumUnits: Readonly<Record<string, number>>;
  maxAttempts: 1; externalTools: false;
}>;
export type SyntheticQuoteScope = Readonly<{ owner: string; app: RecordApp; revision: number; sourceVersion: string }>;
export type SyntheticQuoteBinding = Readonly<{ quoteId: string; bindingHash: string; contractText: string }>;
export type BoundQuoteResult = Readonly<{ status: 'bound'; binding: SyntheticQuoteBinding } | { status: 'blocked'; reason: string }>;
const hashPattern = /^[a-f0-9]{64}$/;
const labelPattern = /^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$/;
const apps = ['fitness', 'diet', 'language', 'growth', 'budget', 'assistant'];
const requestKeys = ['mode', 'provider', 'model', 'specificationVersion', 'sourceVersion', 'pool', 'payloadSha256', 'maximumUnits', 'maxAttempts', 'externalTools'];

/** Snapshot first, so getters, mutable caller objects and async mutations cannot
 * change what was quoted or hashed. canonicalRecords rejects non-JSON values.
 */
export function canonicalBoundRequest(value: SyntheticBoundRequest): string {
  const text = canonicalRecords(value);
  const request = JSON.parse(text) as SyntheticBoundRequest;
  if (Object.keys(request).length !== requestKeys.length || requestKeys.some(key => !Object.hasOwn(request, key)) ||
      request.mode !== 'synthetic' || request.provider !== 'synthetic-only' ||
      typeof request.model !== 'string' || !labelPattern.test(request.model) || typeof request.specificationVersion !== 'string' || !labelPattern.test(request.specificationVersion) ||
      typeof request.sourceVersion !== 'string' || !hashPattern.test(request.sourceVersion) || typeof request.payloadSha256 !== 'string' || !hashPattern.test(request.payloadSha256) ||
      !['analysis', 'voice'].includes(request.pool) || request.maxAttempts !== 1 || request.externalTools !== false ||
      !request.maximumUnits || Array.isArray(request.maximumUnits) || typeof request.maximumUnits !== 'object') throw new Error('Invalid bounded request');
  const entries = Object.entries(request.maximumUnits);
  if (!entries.length || entries.length > 32 || entries.some(([key, units]) => !/^[a-z][a-z0-9_]{0,63}$/.test(key) || !Number.isSafeInteger(units) || units < 0)) throw new Error('Invalid bounded units');
  return text;
}

export async function bindSyntheticQuote(scope: SyntheticQuoteScope, input: SyntheticQuoteInput, request: SyntheticBoundRequest): Promise<BoundQuoteResult> {
  try {
    const frozen = JSON.parse(canonicalRecords({ scope, input, request })) as { scope: SyntheticQuoteScope; input: SyntheticQuoteInput; request: SyntheticBoundRequest };
    const s = frozen.scope, i = frozen.input, r = frozen.request;
    if (Object.keys(s).sort().join(',') !== 'app,owner,revision,sourceVersion' || typeof s.owner !== 'string' || !labelPattern.test(s.owner) || !apps.includes(s.app) || !Number.isSafeInteger(s.revision) || s.revision < 0 || typeof s.sourceVersion !== 'string' || !hashPattern.test(s.sourceVersion)) return { status: 'blocked', reason: 'invalid_scope' };
    const requestCanonical = canonicalBoundRequest(r);
    if (r.pool !== i.pool || r.sourceVersion !== s.sourceVersion || canonicalRecords(r.maximumUnits) !== canonicalRecords(i.maximumUnits)) return { status: 'blocked', reason: 'request_mismatch' };
    const quoted = quoteSyntheticCost(i);
    if (quoted.status !== 'quoted') return quoted;
    const contract = {
      schema: 'synthetic-quote-binding-v1', mode: 'synthetic', ...s, pool: i.pool,
      issuedAt: i.now, validUntil: quoted.validUntil,
      price: i.rateCard, fx: i.fx, boundsComplete: i.boundsComplete,
      taxBasisPoints: i.taxBasisPoints, marginBasisPoints: i.marginBasisPoints,
      perRequestCeilingMicroKrw: i.perRequestCeilingMicroKrw,
      allInMicroKrw: quoted.allInMicroKrw,
      requestCanonical, requestHash: await recordVersion(r),
    };
    const contractText = canonicalRecords(contract), bindingHash = await recordVersion(contract);
    return Object.freeze({ status: 'bound', binding: Object.freeze({ quoteId: 'sq1_' + bindingHash, bindingHash, contractText }) });
  } catch { return { status: 'blocked', reason: 'invalid_binding' }; }
}
