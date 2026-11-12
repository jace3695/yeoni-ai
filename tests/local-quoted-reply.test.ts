import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PGlite } from '@electric-sql/pglite';
import { LocalQuotedReplyClient as Client } from '../lib/yeoni/local-quoted-reply.ts';
import { LocalDurableReplyClient as Legacy } from '../lib/yeoni/local-durable-reply.ts';
import { canonicalRecords, recordVersion, type Analysis } from '../lib/yeoni/generated-record-reply.ts';
import { bindSyntheticQuote, canonicalBoundRequest, type SyntheticBoundRequest, type SyntheticQuoteBinding } from '../lib/yeoni/synthetic-quote-binding.ts';
import type { SyntheticQuoteInput } from '../lib/yeoni/synthetic-cost-quote.ts';
const base = readFileSync('docs/yeoni-durable-reply/schema.local.sql', 'utf8');
const overlay = readFileSync('docs/yeoni-durable-reply/schema.quote-bound.local.sql', 'utf8');
async function setup(owner = 'fixture-a') {
  const db = new PGlite(); await db.exec(base); await db.exec(overlay);
  await db.exec("insert into reply_local.policies values('analysis',1000,1000),('voice',1000,1000); update reply_local.quote_fixture_clock set trusted=true");
  const c = new Client(db, { mode: 'synthetic', owner }); await c.login();
  const v = await c.publish('budget', 1, { synthetic: 'original' });
  return { db, c, v, owner };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function dbTime(db: PGlite) {
  return Date.parse((await db.query<{ now: string }>(`select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') now`)).rows[0].now);
}
async function quote(f: Fixture, options: { expires?: number; now?: number; approve?: boolean; mutate?: (input: SyntheticQuoteInput, request: SyntheticBoundRequest) => void } = {}) {
  const now = options.now ?? await dbTime(f.db), expires = options.expires ?? now + 60_000;
  const request: SyntheticBoundRequest = {
    mode: 'synthetic', provider: 'synthetic-only', model: 'fixture-model-v1', specificationVersion: 'fixture-request-v1',
    sourceVersion: f.v, pool: 'analysis', payloadSha256: await recordVersion({ syntheticPayload: 'original' }),
    maximumUnits: { input_tokens: 2, output_tokens: 3, fixed_request: 1 }, maxAttempts: 1, externalTools: false,
  };
  const input: SyntheticQuoteInput = {
    mode: 'synthetic', pool: 'analysis', now: new Date(now).toISOString(),
    rateCard: { mode: 'synthetic', pool: 'analysis', currency: 'KRW', reference: 'fixture-price-v1', observedAt: new Date(now - 1000).toISOString(), validUntil: new Date(expires).toISOString(), dimensionsComplete: true,
      requiredDimensions: ['input_tokens', 'output_tokens', 'fixed_request'], rates: { input_tokens: { currencyMicros: 2, perUnits: 1 }, output_tokens: { currencyMicros: 2, perUnits: 1 }, fixed_request: { currencyMicros: 30, perUnits: 1 } } },
    fx: { mode: 'synthetic', currency: 'KRW', reference: 'fixture-fx-v1', observedAt: new Date(now - 1000).toISOString(), validUntil: new Date(expires).toISOString(), krwNumerator: 1, krwDenominator: 1 },
    maximumUnits: request.maximumUnits, boundsComplete: true, taxBasisPoints: 0, marginBasisPoints: 0, perRequestCeilingMicroKrw: 1000,
  };
  options.mutate?.(input, request);
  const result = await bindSyntheticQuote({ owner: f.owner, app: 'budget', revision: 1, sourceVersion: f.v }, input, request);
  assert.equal(result.status, 'bound');
  if (result.status !== 'bound') throw new Error('Expected bound quote');
  if (options.approve !== false) await approve(f.db, result.binding);
  return { binding: result.binding, request, input };
}
async function approve(db: PGlite, binding: SyntheticQuoteBinding) {
  // Trusted synthetic fixture setup, intentionally unavailable on Client.
  await db.query("insert into reply_local.quote_fixture_approvals values($1,'synthetic') on conflict do nothing", [binding.bindingHash]);
}
async function rehash(binding: SyntheticQuoteBinding, mutate: (c: Record<string, any>) => void) {
  const c = JSON.parse(binding.contractText); mutate(c);
  const contractText = canonicalRecords(c), bindingHash = await recordVersion(c);
  return { quoteId: 'sq1_' + bindingHash, bindingHash, contractText };
}
async function row(f: Fixture) {
  return (await f.db.query<Record<string, any>>('select * from reply_local.receipts where owner=$1 and app=$2 and version=$3 and pool=$4', [f.owner, 'budget', f.v, 'analysis'])).rows[0];
}
const reserve = (f: Fixture, q: SyntheticQuoteBinding | null) => f.c.reserve('budget', 1, f.v, 'analysis', q);
const claim = (f: Fixture, q: { binding: SyntheticQuoteBinding; request: SyntheticBoundRequest }, invocation = 'once') => f.c.claim('budget', 1, f.v, 'analysis', q.binding.quoteId, q.request, invocation);
const answer = (v: string): Analysis => ({ mode: 'mock', sourceVersion: v, text: '가상 비용 시험 응답', generatedAt: '2026-11-09T00:00:00Z', analysisDate: '2026-11-09' });

test('fixture approval and trusted DB clock are required; null/numeric/forged envelopes never reserve', async () => {
  const f = await setup(); try {
    const q = await quote(f, { approve: false });
    for (const input of [null, 40, { ...q.binding, bindingHash: '0'.repeat(64) }, q.binding]) assert.equal((await reserve(f, input as SyntheticQuoteBinding)).status, 'budget');
    await approve(f.db, q.binding);
    await f.db.exec('update reply_local.quote_fixture_clock set trusted=false');
    assert.equal((await reserve(f, q.binding)).status, 'budget');
    assert.equal(await row(f), undefined);
    await f.db.exec('update reply_local.quote_fixture_clock set trusted=true');
    assert.equal((await reserve(f, q.binding)).status, 'reserved');
    assert.equal(Number((await row(f)).cost), 40);
  } finally { await f.db.close(); }
});

test('binding hashes every price/FX/specification input without changing source content identity', async () => {
  const f = await setup(); try {
    const q = await quote(f), original = JSON.parse(q.binding.contractText);
    for (const mutate of [
      (c: any) => { c.price.reference = 'price-v2'; }, (c: any) => { c.fx.reference = 'fx-v2'; },
      (c: any) => { c.taxBasisPoints++; }, (c: any) => { c.marginBasisPoints++; },
      (c: any) => { c.perRequestCeilingMicroKrw++; }, (c: any) => { c.validUntil = '2099-01-01T00:00:00.000Z'; },
      (c: any) => { c.requestCanonical = c.requestCanonical.replace('fixture-model-v1', 'fixture-model-v2'); },
      (c: any) => { c.requestCanonical = c.requestCanonical.replace('fixture-request-v1', 'fixture-request-v2'); },
    ]) {
      const changed = await rehash(q.binding, mutate);
      assert.notEqual(changed.bindingHash, q.binding.bindingHash);
      assert.equal(JSON.parse(changed.contractText).sourceVersion, f.v);
    }
    assert.equal(original.sourceVersion, await recordVersion({ synthetic: 'original' }));
  } finally { await f.db.close(); }
});

test('independently approved malformed contracts still fail closed for nulls, missing fees, bad cost, FX, dates and limits', async () => {
  const f = await setup(); try {
    const q = await quote(f);
    const mutations = [
      (c: any) => { c.owner = null; }, (c: any) => { c.allInMicroKrw--; },
      (c: any) => { c.price.dimensionsComplete = false; }, (c: any) => { delete c.price.rates.fixed_request; },
      (c: any) => { c.fx.krwDenominator = 0; }, (c: any) => { c.fx.currency = 'USD'; },
      (c: any) => { c.validUntil = '2026-02-31T00:00:00.000Z'; }, (c: any) => { c.validUntil = null; },
      (c: any) => { c.perRequestCeilingMicroKrw = 39; }, (c: any) => { c.boundsComplete = false; },
      (c: any) => { c.requestHash = 'f'.repeat(64); }, (c: any) => { c.revision = 2; },
      (c: any) => { c.price.observedAt = '2099-01-01T00:00:00.000Z'; },
    ];
    for (const mutate of mutations) {
      const changed = await rehash(q.binding, mutate); await approve(f.db, changed);
      assert.equal((await reserve(f, changed)).status, 'budget');
    }
    assert.equal(await row(f), undefined);
  } finally { await f.db.close(); }
});

test('DB reserve rejects expired prices/FX and future caller clocks even when local quote construction succeeds', async () => {
  const f = await setup(); try {
    const now = await dbTime(f.db);
    for (const options of [{ now: now - 10_000, expires: now - 1000 }, { now: now + 10_000, expires: now + 20_000 }]) {
      const q = await quote(f, options); assert.equal((await reserve(f, q.binding)).status, 'budget');
    }
    const fxExpired = await quote(f, { now: now - 10_000, expires: now + 60_000, mutate(i) { (i.fx as any).validUntil = new Date(now - 1000).toISOString(); } });
    assert.equal((await reserve(f, fxExpired.binding)).status, 'budget');
    assert.equal(await row(f), undefined);
  } finally { await f.db.close(); }
});

test('quote expiry is strict at the boundary; delayed claim reads DB time and never releases debt', async () => {
  const f = await setup(); try {
    const q = await quote(f, { expires: await dbTime(f.db) + 800 });
    assert.equal((await reserve(f, q.binding)).status, 'reserved');
    const expiry = JSON.parse(q.binding.contractText).validUntil;
    const exact = await f.db.query<{ ok: boolean }>('select reply_local.validate_quote($1::jsonb,$2,$3,$4,$5,$6,$7::timestamptz) ok', [JSON.stringify(q.binding), f.owner, 'budget', 1, f.v, 'analysis', expiry]);
    assert.equal(exact.rows[0].ok, false);
    const before = await row(f);
    await delay(Math.max(0, Date.parse(expiry) - await dbTime(f.db)) + 20);
    assert.equal(await claim(f, q), false);
    assert.equal(await claim(f, q, 'retry'), false);
    const replacement = await quote(f);
    assert.equal((await reserve(f, replacement.binding)).status, 'busy');
    assert.equal(await claim(f, replacement, 'renewal'), false);
    assert.deepEqual(await row(f), before);
  } finally { await f.db.close(); }
});

test('quoteId and exact bounded request must match; legacy claim cannot consume bound receipts', async () => {
  const f = await setup(); try {
    const q = await quote(f); await reserve(f, q.binding);
    const legacy = new Legacy(f.db, { mode: 'synthetic', owner: f.owner }); await legacy.login();
    assert.equal(await legacy.claim('budget', 1, f.v, 'analysis', 'bypass'), false);
    assert.equal(await f.c.claim('budget', 1, f.v, 'analysis', 'sq1_' + '0'.repeat(64), q.request, 'bad-id'), false);
    for (const r of [
      { ...q.request, model: 'different-model' }, { ...q.request, specificationVersion: 'different-specification' },
      { ...q.request, maximumUnits: { ...q.request.maximumUnits, output_tokens: 100 } },
      { ...q.request, payloadSha256: '0'.repeat(64) }, { ...q.request, maxAttempts: 2 }, { ...q.request, externalTools: true },
    ]) assert.equal(await f.c.claim('budget', 1, f.v, 'analysis', q.binding.quoteId, r as SyntheticBoundRequest, 'mismatch'), false);
    assert.equal((await row(f)).claim, null);
    assert.equal(await claim(f, q), true);
    assert.equal(await claim(f, q), false);
    assert.equal(await claim(f, q, 'another'), false);
    assert.equal(await legacy.claim('budget', 1, f.v, 'analysis', 'bypass-after'), false);
  } finally { await f.db.close(); }
});

test('same source re-reservation cannot extend expiry, swap a quote, refund, or create another claim', async () => {
  const f = await setup(); try {
    const q = await quote(f); await reserve(f, q.binding);
    const before = await row(f), next = await quote(f, { expires: await dbTime(f.db) + 120_000 });
    assert.notEqual(q.binding.quoteId, next.binding.quoteId);
    assert.equal((await reserve(f, next.binding)).status, 'busy');
    assert.deepEqual(await row(f), before);
    assert.equal(await claim(f, next), false);
    assert.equal(await claim(f, q), true);
    assert.equal((await reserve(f, next.binding)).status, 'busy');
    assert.equal(Number((await row(f)).cost), 40);
    assert.equal((await f.db.query<{ n: number }>('select count(*)::int n from reply_local.receipts')).rows[0].n, 1);
    await assert.rejects(f.db.query('update reply_local.receipts set quote_contract=$1', [next.binding.contractText]), /Immutable quote binding/);
    await assert.rejects(f.db.exec('update reply_local.receipts set cost=1'), /Immutable quoted receipt/);
  } finally { await f.db.close(); }
});

test('legacy numeric reservations are never auto-adopted by quote API; legacy preparation is explicitly not globally protected', async () => {
  const f = await setup(); try {
    const legacy = new Legacy(f.db, { mode: 'synthetic', owner: f.owner }); await legacy.login();
    await legacy.reserve('budget', 1, f.v, 'analysis', 5);
    const q = await quote(f);
    assert.equal((await reserve(f, q.binding)).status, 'busy');
    assert.equal(await claim(f, q), false);
    assert.equal((await row(f)).quote_id, null);
    assert.equal(await legacy.claim('budget', 1, f.v, 'analysis', 'legacy-only'), true);
    assert.equal(await claim(f, q), false);
    assert.equal(Number((await row(f)).cost), 5);
  } finally { await f.db.close(); }
});

test('finished exact cache ignores unavailable prices, model changes, clock uncertainty and approval removal', async () => {
  const f = await setup(); try {
    const q = await quote(f, { expires: await dbTime(f.db) + 800 }); await reserve(f, q.binding); await claim(f, q);
    assert.equal(await f.c.finish('budget', f.v, 'analysis', answer(f.v), 'once'), true);
    const before = await row(f);
    await delay(Math.max(0, Date.parse(JSON.parse(q.binding.contractText).validUntil) - await dbTime(f.db)) + 20);
    await f.db.exec('delete from reply_local.quote_fixture_approvals; update reply_local.quote_fixture_clock set trusted=false; delete from reply_local.policies');
    assert.deepEqual((await reserve(f, null)).answer, answer(f.v));
    const changed = await rehash(q.binding, c => { c.price.reference = 'unknown-price'; });
    assert.equal((await reserve(f, changed)).status, 'ready');
    await f.c.publish('budget', 2, { synthetic: 'original' });
    assert.equal((await f.c.reserve('budget', 2, f.v, 'analysis', null)).status, 'ready');
    assert.deepEqual(await row(f), before);
  } finally { await f.db.close(); }
});

test('deletion preserves quote receipt, tombstone, actual overruns and lost/uncertain liabilities', async () => {
  const f = await setup(); try {
    const q = await quote(f); await reserve(f, q.binding); await claim(f, q);
    await f.c.finish('budget', f.v, 'analysis', null, 'once');
    await f.db.query('select reply_local.settle($1,$2,$3,$4,$5)', [f.owner, 'budget', f.v, 'analysis', 1500]);
    await f.c.publish('budget', 2, null, true); await f.c.publish('budget', 3, { synthetic: 'original' });
    assert.equal((await f.c.reserve('budget', 3, f.v, 'analysis', q.binding)).status, 'deleted');
    assert.equal(await f.c.claim('budget', 3, f.v, 'analysis', q.binding.quoteId, q.request, 'retry'), false);
    const receipt = await row(f);
    assert.equal(receipt.erased, true); assert.equal(receipt.answer, null); assert.equal(receipt.state, 'uncertain');
    assert.equal(Number(receipt.cost), 40); assert.equal(Number(receipt.actual), 1500); assert.equal(receipt.quote_id, q.binding.quoteId);
    await assert.rejects(f.db.query('select reply_local.settle($1,$2,$3,$4,$5)', [f.owner, 'budget', f.v, 'analysis', 1]), /Settlement conflict/);
    assert.equal(Number((await row(f)).actual), 1500);
  } finally { await f.db.close(); }
});

test('claim rechecks caps, fixture authority and clock while retaining the original reservation', async () => {
  const f = await setup(); try {
    const q = await quote(f); await reserve(f, q.binding); const before = await row(f);
    for (const sql of ["update reply_local.policies set project_cap=39", "update reply_local.policies set project_cap=1000,account_cap=0", 'update reply_local.quote_fixture_clock set trusted=false']) {
      await f.db.exec(sql); assert.equal(await claim(f, q), false);
    }
    await f.db.exec('update reply_local.policies set account_cap=1000; update reply_local.quote_fixture_clock set trusted=true; delete from reply_local.quote_fixture_approvals');
    assert.equal(await claim(f, q), false);
    assert.deepEqual(await row(f), before);
    await approve(f.db, q.binding); assert.equal(await claim(f, q), true);
  } finally { await f.db.close(); }
});

test('legacy overrun/old uncertain debt participates in new quote-bound dispatch checks; pools remain separate', async () => {
  const f = await setup(); try {
    const q = await quote(f); await reserve(f, q.binding);
    const legacy = new Legacy(f.db, { mode: 'synthetic', owner: 'fixture-other' }); await legacy.login();
    const v = await legacy.publish('diet', 1, { synthetic: 'other' });
    await legacy.reserve('diet', 1, v, 'analysis', 900); await legacy.claim('diet', 1, v, 'analysis', 'legacy');
    await legacy.finish('diet', v, 'analysis', null, 'legacy');
    await f.db.query('select reply_local.settle($1,$2,$3,$4,$5)', ['fixture-other', 'diet', v, 'analysis', 1500]);
    await legacy.publish('diet', 2, null, true);
    await f.db.exec("update reply_local.receipts set month='2025-01' where owner='fixture-other'");
    assert.equal(await claim(f, q), false); assert.equal((await row(f)).claim, null);
    const voice = await legacy.publish('growth', 1, { synthetic: 'voice' });
    assert.equal((await legacy.reserve('growth', 1, voice, 'voice', 40)).status, 'reserved');
    assert.equal(await legacy.claim('growth', 1, voice, 'voice', 'voice'), true);
  } finally { await f.db.close(); }
});

test('lost committed claim ACK and same-database re-login never acquire another grant or buy retry', async () => {
  const f = await setup(); try {
    const q = await quote(f); await reserve(f, q.binding);
    const broken = new Client({ async query<T>(sql: string, params?: unknown[]) {
      const result = await f.db.query<T>(sql, params);
      if (sql.includes('claim_quoted(')) throw new Error('Synthetic lost ACK');
      return result;
    } }, { mode: 'synthetic', owner: f.owner }); await broken.login();
    await assert.rejects(broken.claim('budget', 1, f.v, 'analysis', q.binding.quoteId, q.request, 'lost'), /lost ACK/);
    assert.equal((await row(f)).claim, 'lost');
    await f.c.login(); assert.equal(await claim(f, q, 'retry'), false);
    assert.equal((await reserve(f, q.binding)).status, 'busy');
    assert.equal(Number((await row(f)).cost), 40);
  } finally { await f.db.close(); }
});

test('same-client source mutation suppresses delayed committed claim ACK without refunding it', async () => {
  const f = await setup(); try {
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const notified = new Promise<void>(resolve => { entered = resolve; });
    const c = new Client({ async query<T>(sql: string, params?: unknown[]) {
      const result = await f.db.query<T>(sql, params);
      if (sql.includes('claim_quoted(')) { entered(); await held; }
      return result;
    } }, { mode: 'synthetic', owner: f.owner }); await c.login();
    const q = await quote(f); await reserve(f, q.binding);
    const pending = c.claim('budget', 1, f.v, 'analysis', q.binding.quoteId, q.request, 'late'); await notified;
    await c.publish('budget', 2, { synthetic: 'edited' }); release();
    assert.equal(await pending, false); assert.equal((await row(f)).claim, 'late');
    assert.equal(await claim(f, q, 'retry'), false);
  } finally { await f.db.close(); }
});

test('integer DB recomputation agrees with JS quote for adversarial ratios and rejects a one-micro-unit underestimate', async () => {
  const f = await setup(); try {
    for (const [units, price, divisor] of [[9007199254740990, 1, 9007199254740991], [1000000001, 1000000001, 1000000000], [999999999, 999999999, 999999998]]) {
      const q = await quote(f, { mutate(i, r) {
        (i as any).maximumUnits = (r as any).maximumUnits = { fixed_request: units };
        (i.rateCard as any).requiredDimensions = ['fixed_request'];
        (i.rateCard as any).rates = { fixed_request: { currencyMicros: price, perUnits: divisor } };
        (i as any).perRequestCeilingMicroKrw = Number.MAX_SAFE_INTEGER;
        (i as any).taxBasisPoints = 1234; (i as any).marginBasisPoints = 567;
      } });
      const params = [JSON.stringify(q.binding), f.owner, 'budget', 1, f.v, 'analysis'];
      assert.equal((await f.db.query<{ ok: boolean }>('select reply_local.validate_quote($1::jsonb,$2,$3,$4,$5,$6,clock_timestamp()) ok', params)).rows[0].ok, true);
      const under = await rehash(q.binding, c => { c.allInMicroKrw--; }); await approve(f.db, under); params[0] = JSON.stringify(under);
      assert.equal((await f.db.query<{ ok: boolean }>('select reply_local.validate_quote($1::jsonb,$2,$3,$4,$5,$6,clock_timestamp()) ok', params)).rows[0].ok, false);
    }
  } finally { await f.db.close(); }
});

test('builder snapshots inputs, rejects active getters and mismatched limits without executing a provider', async () => {
  const f = await setup(); try {
    const q = await quote(f); let executed = 0;
    const bad = { ...q.request, get model() { executed++; return 'bad'; } };
    assert.throws(() => canonicalBoundRequest(bad)); assert.equal(executed, 0);
    for (const field of ['model', 'specificationVersion', 'sourceVersion', 'payloadSha256']) {
      for (const value of [123, null, true, {}]) assert.throws(() => canonicalBoundRequest({ ...q.request, [field]: value } as SyntheticBoundRequest));
    }
    const mismatch = await bindSyntheticQuote({ owner: f.owner, app: 'budget', revision: 1, sourceVersion: f.v }, q.input, { ...q.request, maximumUnits: { ...q.request.maximumUnits, output_tokens: 4 } });
    assert.deepEqual(mismatch, { status: 'blocked', reason: 'request_mismatch' });
    const before = q.binding.contractText; (q.request.maximumUnits as any).output_tokens = 999;
    assert.equal(q.binding.contractText, before);
  } finally { await f.db.close(); }
});


test('FX expires first after reservation; the longer price lifetime cannot renew it', async () => {
  const f = await setup(); try {
    const fxEnd = await dbTime(f.db) + 800;
    const q = await quote(f, { mutate(i) { (i.fx as any).validUntil = new Date(fxEnd).toISOString(); } });
    assert.equal(JSON.parse(q.binding.contractText).validUntil, new Date(fxEnd).toISOString());
    assert.equal((await reserve(f, q.binding)).status, 'reserved');
    await delay(Math.max(0, fxEnd - await dbTime(f.db)) + 20);
    assert.equal(await claim(f, q), false);
    assert.equal((await row(f)).claim, null); assert.equal(Number((await row(f)).cost), 40);
  } finally { await f.db.close(); }
});

test('missing quote overlay fails closed with no numeric fallback, even with an existing legacy reservation', async () => {
  const db = new PGlite(); const calls: string[] = [];
  try {
    await db.exec(base); await db.exec("insert into reply_local.policies values('analysis',100,100)");
    const legacy = new Legacy(db, { mode: 'synthetic', owner: 'fixture-a' }); await legacy.login();
    const v = await legacy.publish('budget', 1, { synthetic: 'original' }); await legacy.reserve('budget', 1, v, 'analysis', 40);
    const c = new Client({ async query<T>(sql: string, params?: unknown[]) { calls.push(sql); return db.query<T>(sql, params); } }, { mode: 'synthetic', owner: 'fixture-a' });
    await c.login();
    assert.equal((await c.reserve('budget', 1, v, 'analysis', 40 as unknown as SyntheticQuoteBinding)).status, 'unavailable');
    const request: SyntheticBoundRequest = { mode: 'synthetic', provider: 'synthetic-only', model: 'fixture-model', specificationVersion: 'fixture-spec', sourceVersion: v, pool: 'analysis', payloadSha256: '0'.repeat(64), maximumUnits: { fixed_request: 1 }, maxAttempts: 1, externalTools: false };
    await assert.rejects(c.claim('budget', 1, v, 'analysis', 'sq1_' + '0'.repeat(64), request, 'no-fallback'), /claim_quoted/);
    assert.equal(calls.some(sql => /reply_local\.(reserve|claim)\(/.test(sql)), false);
    assert.equal((await db.query<{ claim: string | null }>('select claim from reply_local.receipts')).rows[0].claim, null);
  } finally { await db.close(); }
});


test('clean disk-backed PGlite close and reopen preserve quote, debt and consumed claim without legacy bypass', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeoni-synthetic-quote-reopen-'));
  let db: PGlite | null = new PGlite(directory);
  try {
    await db.exec(base); await db.exec(overlay);
    await db.exec("insert into reply_local.policies values('analysis',1000,1000),('voice',1000,1000); update reply_local.quote_fixture_clock set trusted=true");
    const owner = 'fixture-disk';
    const c = new Client(db, { mode: 'synthetic', owner }); await c.login();
    const v = await c.publish('budget', 1, { synthetic: 'original' });
    const f: Fixture = { db, c, owner, v };
    const q = await quote(f);
    assert.equal((await reserve(f, q.binding)).status, 'reserved');
    assert.equal(await claim(f, q, 'consumed-before-close'), true);
    await db.query('select reply_local.settle($1,$2,$3,$4,$5)', [owner, 'budget', v, 'analysis', 1500]);
    const before = await row(f);
    await db.close(); db = null;

    // A clean disk-backed database reopen in THIS OS process. This is not
    // independent-process concurrency, a crash, fsync loss, or network recovery.
    db = new PGlite(directory);
    const reopened = new Client(db, { mode: 'synthetic', owner }); await reopened.login();
    const restored: Fixture = { db, c: reopened, owner, v };
    assert.deepEqual(await row(restored), before);
    assert.equal((await row(restored)).quote_contract, q.binding.contractText);
    assert.equal(Number((await row(restored)).cost), 40);
    assert.equal(Number((await row(restored)).actual), 1500);
    assert.equal((await row(restored)).claim, 'consumed-before-close');
    assert.equal((await reserve(restored, q.binding)).status, 'busy');
    assert.equal(await claim(restored, q, 'consumed-before-close'), false);
    assert.equal(await claim(restored, q, 'new-after-reopen'), false);
    const replacement = await quote(restored, { expires: await dbTime(db) + 120_000 });
    assert.equal((await reserve(restored, replacement.binding)).status, 'busy');
    assert.equal(await claim(restored, replacement, 'replace-after-reopen'), false);
    const legacy = new Legacy(db, { mode: 'synthetic', owner }); await legacy.login();
    assert.equal(await legacy.claim('budget', 1, v, 'analysis', 'legacy-after-reopen'), false);
    await assert.rejects(db.query('select reply_local.settle($1,$2,$3,$4,$5)', [owner, 'budget', v, 'analysis', 1]), /Settlement conflict/);
    assert.deepEqual(await row(restored), before);

    const otherOwner = 'fixture-disk-other';
    const other = new Client(db, { mode: 'synthetic', owner: otherOwner }); await other.login();
    const otherVersion = await other.publish('budget', 1, { synthetic: 'other' });
    const otherFixture: Fixture = { db, c: other, owner: otherOwner, v: otherVersion };
    const otherQuote = await quote(otherFixture);
    assert.equal((await reserve(otherFixture, otherQuote.binding)).status, 'budget');
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from reply_local.receipts')).rows[0].n, 1);
  } finally {
    if (db) await db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
