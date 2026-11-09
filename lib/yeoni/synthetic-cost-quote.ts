/** SYNTHETIC PREPARATION ONLY. No provider, account, network, environment or clock.
 * A quote is not authorization or a guarantee about an eventual provider invoice.
 * Authoritative rate/FX/usage completeness still needs a separately approved adapter.
 */
export type CostPool = 'analysis' | 'voice';
export type SyntheticRateCard = Readonly<{
  mode: 'synthetic'; pool: CostPool; currency: string; reference: string;
  observedAt: string; validUntil: string; dimensionsComplete: boolean;
  // Explicit dimension list must include every fee, including fixed/tool fees.
  requiredDimensions: readonly string[];
  rates: Readonly<Record<string, Readonly<{ currencyMicros: number; perUnits: number }>>>;
}>;
export type SyntheticFx = Readonly<{
  mode: 'synthetic'; currency: string; reference: string;
  observedAt: string; validUntil: string;
  // Rational KRW per one currency unit; explicit 1/1 required even for KRW.
  krwNumerator: number; krwDenominator: number;
}>;
export type SyntheticQuoteInput = Readonly<{
  mode: 'synthetic'; pool: CostPool; now: string; rateCard: SyntheticRateCard;
  fx: SyntheticFx; maximumUnits: Readonly<Record<string, number>>;
  boundsComplete: boolean; taxBasisPoints: number; marginBasisPoints: number;
  perRequestCeilingMicroKrw: number;
}>;
export type SyntheticQuoteResult =
  | Readonly<{ status: 'blocked'; reason: string }>
  | Readonly<{ status: 'quoted'; mode: 'synthetic'; pool: CostPool;
      allInMicroKrw: number; currencyMicros: number; beforeTaxMicroKrw: number;
      afterTaxMicroKrw: number; priceReference: string; fxReference: string;
      validUntil: string; dimensions: Readonly<Record<string, number>> }>;

class QuoteError extends Error {}
function reject(reason: string): never { throw new QuoteError(reason); }
function integer(value: unknown, positive = false): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) reject('invalid_integer');
  return BigInt(value);
}
function amount(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) reject('amount_overflow');
  return Number(value);
}
function up(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - BigInt(1)) / denominator;
}
function label(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$/.test(value)) reject('invalid_reference');
  return value;
}
function instant(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) reject('invalid_time');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) reject('invalid_time');
  return time;
}
function fresh(value: { observedAt: string; validUntil: string }, now: number) {
  const observed = instant(value.observedAt), expires = instant(value.validUntil);
  if (observed > now || expires <= now || expires <= observed) reject('stale_or_future_price');
  return expires;
}
/** Public input must be JSON-shaped. Never execute getters/toJSON in a quote. */
function plain(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('invalid_object');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) reject('invalid_object');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).some(k => typeof k !== 'string' || !descriptors[k].enumerable || !('value' in descriptors[k]))) reject('invalid_object');
  return input as Record<string, unknown>;
}
function exactKeys(input: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(input);
  if (keys.length !== expected.length || expected.some(key => !Object.hasOwn(input, key))) reject('dimension_mismatch');
}
function dimensions(input: unknown): string[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length < 1 || input.length > 32) reject('invalid_dimensions');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== input.length + 1) reject('invalid_dimensions');
  const values: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const d = descriptors[String(i)];
    if (!d || !('value' in d) || !d.enumerable || typeof d.value !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(d.value)) reject('invalid_dimensions');
    values.push(d.value);
  }
  if (new Set(values).size !== values.length) reject('invalid_dimensions');
  return values;
}
export function quoteSyntheticCost(value: SyntheticQuoteInput): SyntheticQuoteResult {
  try {
    exactKeys(plain(value), ['mode', 'pool', 'now', 'rateCard', 'fx', 'maximumUnits', 'boundsComplete', 'taxBasisPoints', 'marginBasisPoints', 'perRequestCeilingMicroKrw']);
    const price = value.rateCard, fx = value.fx;
    exactKeys(plain(price), ['mode', 'pool', 'currency', 'reference', 'observedAt', 'validUntil', 'dimensionsComplete', 'requiredDimensions', 'rates']);
    exactKeys(plain(fx), ['mode', 'currency', 'reference', 'observedAt', 'validUntil', 'krwNumerator', 'krwDenominator']);
    if (value.mode !== 'synthetic' || price.mode !== 'synthetic' || fx.mode !== 'synthetic') reject('synthetic_only');
    if (!['analysis', 'voice'].includes(value.pool) || price.pool !== value.pool) reject('pool_mismatch');
    if (price.dimensionsComplete !== true || value.boundsComplete !== true) reject('incomplete_cost_basis');
    if (typeof price.currency !== 'string' || !/^[A-Z]{3}$/.test(price.currency) || fx.currency !== price.currency) reject('currency_mismatch');
    const priceReference = label(price.reference), fxReference = label(fx.reference);
    const now = instant(value.now), expires = Math.min(fresh(price, now), fresh(fx, now));
    const required = dimensions(price.requiredDimensions), rates = plain(price.rates), units = plain(value.maximumUnits);
    exactKeys(rates, required); exactKeys(units, required);
    const numerator = integer(fx.krwNumerator, true), denominator = integer(fx.krwDenominator, true);
    if (price.currency === 'KRW' && numerator !== denominator) reject('invalid_krw_conversion');
    const tax = integer(value.taxBasisPoints), margin = integer(value.marginBasisPoints);
    const ceiling = integer(value.perRequestCeilingMicroKrw, true);
    let subtotal = BigInt(0);
    const parts: Record<string, number> = Object.create(null);
    for (const key of required) {
      const rate = plain(rates[key]);
      exactKeys(rate, ['currencyMicros', 'perUnits']);
      const cost = up(integer(rate.currencyMicros) * integer(units[key]), integer(rate.perUnits, true));
      parts[key] = amount(cost); subtotal += cost;
    }
    const converted = up(subtotal * numerator, denominator);
    const taxed = up(converted * (BigInt(10_000) + tax), BigInt(10_000));
    const allIn = up(taxed * (BigInt(10_000) + margin), BigInt(10_000));
    if (!allIn) reject('zero_quote');
    // Check overflow independently of the ceiling for an intelligible failure.
    const allInMicroKrw = amount(allIn);
    if (allIn > ceiling) reject('per_request_ceiling');
    return Object.freeze({ status: 'quoted', mode: 'synthetic', pool: value.pool,
      allInMicroKrw, currencyMicros: amount(subtotal), beforeTaxMicroKrw: amount(converted),
      afterTaxMicroKrw: amount(taxed), priceReference, fxReference,
      validUntil: new Date(expires).toISOString(), dimensions: Object.freeze(parts) });
  } catch (error) {
    return Object.freeze({ status: 'blocked', reason: error instanceof QuoteError ? error.message : 'invalid_input' });
  }
}

/** Informational targets only. They configure no ledger and grant no permission. */
export const MONTHLY_COST_GOALS_KRW = Object.freeze({ analysis: 7_000, voice: 3_000 });
export function syntheticAdmissionCeiling(pool: CostPool, headroomBasisPoints: number): number | null {
  try {
    if (typeof pool !== 'string' || !Object.hasOwn(MONTHLY_COST_GOALS_KRW, pool)) return null;
    const room = integer(headroomBasisPoints);
    if (room > BigInt(10_000)) return null;
    return amount(BigInt(MONTHLY_COST_GOALS_KRW[pool]) * BigInt(1_000_000) * (BigInt(10_000) - room) / BigInt(10_000));
  } catch { return null; }
}
