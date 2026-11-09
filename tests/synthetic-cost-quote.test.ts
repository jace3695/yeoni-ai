import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { quoteSyntheticCost, syntheticAdmissionCeiling, MONTHLY_COST_GOALS_KRW, type SyntheticQuoteInput } from '../lib/yeoni/synthetic-cost-quote.ts';
import { LocalDurableReplyClient } from '../lib/yeoni/local-durable-reply.ts';

function fixture(): SyntheticQuoteInput {
  return { mode: 'synthetic', pool: 'analysis', now: '2026-11-09T00:00:00.000Z',
    rateCard: { mode: 'synthetic', pool: 'analysis', currency: 'USD', reference: 'SYNTHETIC FIXTURE NOT A MARKET PRICE',
      observedAt: '2026-11-08T00:00:00.000Z', validUntil: '2026-11-10T00:00:00.000Z', dimensionsComplete: true,
      requiredDimensions: ['input', 'output', 'request_fee'],
      rates: { input: { currencyMicros: 7, perUnits: 3 }, output: { currencyMicros: 11, perUnits: 5 }, request_fee: { currencyMicros: 2, perUnits: 1 } } },
    fx: { mode: 'synthetic', currency: 'USD', reference: 'SYNTHETIC FX NOT A MARKET RATE',
      observedAt: '2026-11-08T00:00:00.000Z', validUntil: '2026-11-09T12:00:00.000Z', krwNumerator: 1400, krwDenominator: 1 },
    maximumUnits: { input: 1, output: 1, request_fee: 1 }, boundsComplete: true,
    taxBasisPoints: 1000, marginBasisPoints: 2000, perRequestCeilingMicroKrw: 1_000_000 };
}
function blocked(value: unknown, reason?: string) {
  const got = quoteSyntheticCost(value as SyntheticQuoteInput);
  assert.equal(got.status, 'blocked');
  if (got.status === 'blocked' && reason) assert.equal(got.reason, reason);
}
test('synthetic all-in quote includes every dimension, rational FX, tax and margin with upward rounding', () => {
  const q = quoteSyntheticCost(fixture()); assert.equal(q.status, 'quoted');
  if (q.status !== 'quoted') return;
  assert.equal(q.currencyMicros, 8); assert.equal(q.beforeTaxMicroKrw, 11200);
  assert.equal(q.afterTaxMicroKrw, 12320); assert.equal(q.allInMicroKrw, 14784);
  assert.equal(q.validUntil, '2026-11-09T12:00:00.000Z');
  assert.equal(q.dimensions.request_fee, 2); assert.equal(Object.isFrozen(q), true);
  assert.equal(Object.isFrozen(q.dimensions), true);
});
test('rate/FX expiration and future observations fail closed at exact boundary', () => {
  const f = fixture();
  blocked({ ...f, now: f.fx.validUntil }, 'stale_or_future_price');
  blocked({ ...f, now: f.rateCard.validUntil }, 'stale_or_future_price');
  blocked({ ...f, fx: { ...f.fx, observedAt: '2026-11-09T00:00:00.001Z' } }, 'stale_or_future_price');
  blocked({ ...f, rateCard: { ...f.rateCard, observedAt: '2026-11-09T00:00:00.001Z' } }, 'stale_or_future_price');
});
test('strict UTC timestamps reject invalid calendar dates and ambiguous offsets', () => {
  for (const now of ['2026-02-30T00:00:00.000Z', '2026-11-09', '2026-11-09T09:00:00.000+09:00', '2026-11-09T00:00:00Z', '2026-11-09T24:00:00.000Z']) blocked({ ...fixture(), now }, 'invalid_time');
});
test('missing, extra and duplicate dimensions including fees never become a lower quote', () => {
  const f = fixture();
  blocked({ ...f, maximumUnits: { input: 1, output: 1 } }, 'dimension_mismatch');
  blocked({ ...f, maximumUnits: { ...f.maximumUnits, tool: 1 } }, 'dimension_mismatch');
  blocked({ ...f, rateCard: { ...f.rateCard, requiredDimensions: ['input', 'output', 'output'] } }, 'invalid_dimensions');
  blocked({ ...f, rateCard: { ...f.rateCard, rates: { input: f.rateCard.rates.input, output: f.rateCard.rates.output } } }, 'dimension_mismatch');
  blocked({ ...f, boundsComplete: false }, 'incomplete_cost_basis');
  blocked({ ...f, rateCard: { ...f.rateCard, dimensionsComplete: false } }, 'incomplete_cost_basis');
});
test('mode, pool, currency and explicit KRW conversion cannot be mixed', () => {
  const f = fixture();
  for (const mode of ['live', undefined]) blocked({ ...f, mode }, 'synthetic_only');
  blocked({ ...f, pool: 'voice' }, 'pool_mismatch');
  blocked({ ...f, fx: { ...f.fx, currency: 'EUR' } }, 'currency_mismatch');
  blocked({ ...f, rateCard: { ...f.rateCard, currency: 'KRW' }, fx: { ...f.fx, currency: 'KRW' } }, 'invalid_krw_conversion');
  const krw = quoteSyntheticCost({ ...f, rateCard: { ...f.rateCard, currency: 'KRW' }, fx: { ...f.fx, currency: 'KRW', krwNumerator: 1 } });
  assert.equal(krw.status, 'quoted');
});
test('unknown amounts, negative values, fractions and unsafe numbers are rejected', () => {
  const f = fixture();
  for (const value of [undefined, null, '1', NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    blocked({ ...f, maximumUnits: { ...f.maximumUnits, input: value } });
    blocked({ ...f, taxBasisPoints: value }); blocked({ ...f, marginBasisPoints: value });
    blocked({ ...f, fx: { ...f.fx, krwNumerator: value } });
  }
  blocked({ ...f, fx: { ...f.fx, krwDenominator: 0 } }, 'invalid_integer');
  blocked({ ...f, rateCard: { ...f.rateCard, rates: { ...f.rateCard.rates, input: { currencyMicros: 1, perUnits: 0 } } } }, 'invalid_integer');
});
test('per-request ceiling is inclusive, never clips or silently approves zero cost', () => {
  const f = fixture();
  assert.equal(quoteSyntheticCost({ ...f, perRequestCeilingMicroKrw: 14784 }).status, 'quoted');
  blocked({ ...f, perRequestCeilingMicroKrw: 14783 }, 'per_request_ceiling');
  blocked({ ...f, maximumUnits: { input: 0, output: 0, request_fee: 0 } }, 'zero_quote');
  blocked({ ...f, maximumUnits: { ...f.maximumUnits, input: Number.MAX_SAFE_INTEGER }, perRequestCeilingMicroKrw: Number.MAX_SAFE_INTEGER }, 'amount_overflow');
});
test('JSON-shaped inputs reject getters and hidden dimensions without running accessors', () => {
  const f = fixture(); let calls = 0;
  const units = { ...f.maximumUnits };
  Object.defineProperty(units, 'input', { enumerable: true, get() { calls++; return 0; } });
  blocked({ ...f, maximumUnits: units });
  const rate = { currencyMicros: 7, perUnits: 3 };
  Object.defineProperty(rate, 'currencyMicros', { enumerable: true, get() { calls++; return 0; } });
  blocked({ ...f, rateCard: { ...f.rateCard, rates: { ...f.rateCard.rates, input: rate } } });
  const top = { ...f }; Object.defineProperty(top, 'pool', { enumerable: true, get() { calls++; return 'analysis'; } }); blocked(top);
  const hidden = { ...f.maximumUnits }; Object.defineProperty(hidden, 'fee', { value: 100 }); blocked({ ...f, maximumUnits: hidden });
  assert.equal(calls, 0);
});
test('malformed containers and sparse dimension arrays fail closed', () => {
  for (const value of [null, undefined, true, 1, [], new Date()]) blocked(value);
  const f = fixture();
  blocked({ ...f, rateCard: { ...f.rateCard, requiredDimensions: Array(3) } }, 'invalid_dimensions');
  blocked({ ...f, maximumUnits: new Map() }, 'invalid_object');
  const inherited = Object.create(f.maximumUnits); blocked({ ...f, maximumUnits: inherited }, 'invalid_object');
});
test('currency objects and inherited missing fields cannot invoke coercion or prototype getters', () => {
  const f = fixture(); let calls = 0;
  const currency = { get toString() { calls++; return () => 'USD'; } };
  blocked({ ...f, rateCard: { ...f.rateCard, currency }, fx: { ...f.fx, currency } }, 'currency_mismatch');
  assert.equal(syntheticAdmissionCeiling(currency as unknown as 'analysis', 0), null);
  const top = { ...f } as Record<string, unknown>; delete top.mode;
  Object.defineProperty(Object.prototype, 'mode', { configurable: true, get() { calls++; return 'synthetic'; } });
  try { blocked(top, 'dimension_mismatch'); } finally { delete (Object.prototype as { mode?: unknown }).mode; }
  assert.equal(calls, 0);
});
test('integer arithmetic is conservative against exact rational reference for 200 synthetic combinations', () => {
  const f = fixture();
  for (let i = 1; i <= 200; i++) {
    const q = quoteSyntheticCost({ ...f, maximumUnits: { input: i, output: i + 3, request_fee: 1 },
      fx: { ...f.fx, krwNumerator: 17000 + i, krwDenominator: 13 }, taxBasisPoints: i, marginBasisPoints: 999,
      perRequestCeilingMicroKrw: Number.MAX_SAFE_INTEGER });
    assert.equal(q.status, 'quoted'); if (q.status !== 'quoted') continue;
    // Independent exact unrounded rational: (7*i/3 + 11*(i+3)/5 + 2) * FX * tax * margin.
    const numerator = (BigInt(7) * BigInt(i) * BigInt(5) + BigInt(11) * BigInt(i + 3) * BigInt(3) + BigInt(30)) * BigInt(17000 + i) * BigInt(10000 + i) * BigInt(10999);
    const denominator = BigInt(15) * BigInt(13) * BigInt(10000) * BigInt(10000);
    assert.ok(BigInt(q.allInMicroKrw) * denominator >= numerator);
  }
});
test('monthly targets are informational and headroom is explicit rather than a production default', () => {
  assert.deepEqual(MONTHLY_COST_GOALS_KRW, { analysis: 7000, voice: 3000 });
  assert.equal(syntheticAdmissionCeiling('analysis', 2000), 5_600_000_000);
  assert.equal(syntheticAdmissionCeiling('voice', 2000), 2_400_000_000);
  assert.equal(syntheticAdmissionCeiling('analysis', 10000), 0);
  assert.equal(syntheticAdmissionCeiling('voice', 0), 3_000_000_000);
  for (const v of [-1, 10001, NaN, 0.1, Infinity]) assert.equal(syntheticAdmissionCeiling('analysis', v), null);
  assert.equal(syntheticAdmissionCeiling('unknown' as 'analysis', 0), null);
});
test('new quote feeds local atomic project limit; expired price only permits exact cached answers', async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync('docs/yeoni-durable-reply/schema.local.sql', 'utf8'));
    const q = quoteSyntheticCost(fixture()); assert.equal(q.status, 'quoted'); if (q.status !== 'quoted') return;
    await db.query("insert into reply_local.policies values('analysis',$1,$1)", [q.allInMicroKrw * 2]);
    const clients = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
      const c = new LocalDurableReplyClient(db, { mode: 'synthetic', owner: 'synthetic-quote-' + i });
      await c.login(); const version = await c.publish('budget', 1, { syntheticCount: i }); return { c, version };
    }));
    const results = await Promise.all(clients.map(({ c, version }) => c.reserve('budget', 1, version, 'analysis', q.allInMicroKrw)));
    assert.equal(results.filter(r => r.status === 'reserved').length, 2);
    assert.equal(results.filter(r => r.status === 'budget').length, 4);
    const index = results.findIndex(r => r.status === 'reserved'), { c, version } = clients[index];
    assert.equal(await c.claim('budget', 1, version, 'analysis', 'synthetic-claim'), true);
    await c.finish('budget', version, 'analysis', { text: '가상 응답입니다.', generatedAt: '2026-11-09T00:00:00.000Z', analysisDate: '2026-11-09', sourceVersion: version, mode: 'mock' }, 'synthetic-claim');
    const expired = quoteSyntheticCost({ ...fixture(), now: fixture().fx.validUntil }); assert.equal(expired.status, 'blocked');
    assert.equal((await c.reserve('budget', 1, version, 'analysis', null)).status, 'ready');
    const next = await c.publish('budget', 2, { syntheticCount: 99 });
    assert.equal((await c.reserve('budget', 2, next, 'analysis', null)).status, 'budget');
  } finally { await db.close(); }
});
test('safety module remains disconnected from provider transport and actual endpoint stays disabled', () => {
  const source = readFileSync('lib/yeoni/synthetic-cost-quote.ts', 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|process\.env|https:\/\/|XMLHttpRequest/);
  assert.match(readFileSync('app/api/yeoni/record-reply/route.ts', 'utf8'), /503/);
});
