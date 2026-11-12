import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { LocalDurableReplyClient as Legacy, type LocalReplyDatabase } from '../lib/yeoni/local-durable-reply.ts';
import { LocalQuotedReplyClient as Quoted } from '../lib/yeoni/local-quoted-reply.ts';
import { LocalBillingAdjustmentClient as Billing, bindSyntheticBillingSnapshot, type SyntheticBillingEnvelope, type SyntheticBillingSnapshot } from '../lib/yeoni/local-billing-adjustment.ts';
import { recordVersion, type Analysis } from '../lib/yeoni/generated-record-reply.ts';
import { bindSyntheticQuote, type SyntheticBoundRequest } from '../lib/yeoni/synthetic-quote-binding.ts';
const base = readFileSync('docs/yeoni-durable-reply/schema.local.sql', 'utf8');
const overlay = readFileSync('docs/yeoni-durable-reply/schema.quote-bound.local.sql', 'utf8');
const authority = { mode: 'synthetic', authority: 'fixture-only' } as const;
const owner = 'fixture-a';
async function setup(path?: string) {
  const db = new PGlite(path); await db.exec(base); await db.exec(overlay);
  await db.exec("insert into reply_local.policies values('analysis',1000,1000),('voice',1000,1000); update reply_local.quote_fixture_clock set trusted=true");
  const a = new Legacy(db, { mode: 'synthetic', owner }); await a.login();
  const version = await a.publish('budget', 1, { synthetic: 'billing-original' });
  await a.reserve('budget', 1, version, 'analysis', 100);
  assert.equal(await a.claim('budget', 1, version, 'analysis', 'original'), true);
  const answer: Analysis = { mode: 'mock', sourceVersion: version, text: 'SYNTHETIC ANSWER DO NOT RETAIN IN AUDIT', generatedAt: '2026-11-09T00:00:00Z', analysisDate: '2026-11-09' };
  assert.equal(await a.finish('budget', version, 'analysis', answer, 'original'), true);
  await db.query('select reply_local.settle($1,$2,$3,$4,$5)', [owner, 'budget', version, 'analysis', 50]);
  await db.exec("update reply_local.receipts set month='2000-01'");
  const billing = new Billing(db, authority);
  return { db, a, billing, version, answer };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function snapshot(f: Fixture, patch: Partial<SyntheticBillingSnapshot> = {}, approve = true) {
  const contract: SyntheticBillingSnapshot = {
    schema: 'synthetic-billing-adjustment-v1', mode: 'synthetic', kind: 'cumulative_receipt_total',
    eventId: 'event-1', snapshotId: 'snapshot-1', owner, app: 'budget', version: f.version, pool: 'analysis',
    sequence: 1, originalActualMicroKrw: 50, previousTotalMicroKrw: 50, totalActualMicroKrw: 80, ...patch,
  };
  const envelope = await bindSyntheticBillingSnapshot(contract);
  if (approve) await f.db.query("insert into reply_local.billing_fixture_approvals values($1,'synthetic') on conflict do nothing", [envelope.contractHash]);
  return envelope;
}
async function liability(f: Fixture, pool = 'analysis', who: string | null = null, month = '2099-12') {
  return (await f.db.query<{ total: string }>('select reply_local.billing_liability($1,$2,$3)::text total', [who, pool, month])).rows[0].total;
}
async function receipt(f: Fixture) {
  return (await f.db.query<Record<string, unknown>>('select * from reply_local.receipts where owner=$1 and version=$2', [owner, f.version])).rows[0];
}
async function counts(f: Fixture) {
  return (await f.db.query<{ events: number; holds: number }>('select (select count(*)::int from reply_local.billing_events) events,(select count(*)::int from reply_local.billing_holds) holds')).rows[0];
}
async function makeNew(f: Fixture, who = owner, pool: 'analysis' | 'voice' = 'analysis') {
  const client = new Legacy(f.db, { mode: 'synthetic', owner: who }); await client.login();
  const version = await client.publish('fitness', 1, { synthetic: 'new-' + who + pool });
  return { client, version, who, pool };
}
async function makeQuote(f: Fixture, next: Awaited<ReturnType<typeof makeNew>>) {
  const c = new Quoted(f.db, { mode: 'synthetic', owner: next.who }); await c.login();
  const now = Date.now(), iso = (ms: number) => new Date(ms).toISOString();
  const request: SyntheticBoundRequest = { mode: 'synthetic', provider: 'synthetic-only', model: 'fixture-model', specificationVersion: 'fixture-spec', sourceVersion: next.version, pool: next.pool, payloadSha256: await recordVersion({ fixture: true }), maximumUnits: { request: 1 }, maxAttempts: 1, externalTools: false };
  const result = await bindSyntheticQuote({ owner: next.who, app: 'fitness', revision: 1, sourceVersion: next.version }, {
    mode: 'synthetic', pool: next.pool, now: iso(now), rateCard: { mode: 'synthetic', pool: next.pool, currency: 'KRW', reference: 'fixture-price', observedAt: iso(now - 1000), validUntil: iso(now + 600000), dimensionsComplete: true, requiredDimensions: ['request'], rates: { request: { currencyMicros: 10, perUnits: 1 } } },
    fx: { mode: 'synthetic', currency: 'KRW', reference: 'fixture-fx', observedAt: iso(now - 1000), validUntil: iso(now + 600000), krwNumerator: 1, krwDenominator: 1 }, maximumUnits: request.maximumUnits, boundsComplete: true, taxBasisPoints: 0, marginBasisPoints: 0, perRequestCeilingMicroKrw: 10,
  }, request);
  assert.equal(result.status, 'bound'); if (result.status !== 'bound') throw new Error('quote');
  await f.db.query("insert into reply_local.quote_fixture_approvals values($1,'synthetic')", [result.binding.bindingHash]);
  return { c, request, binding: result.binding };
}

test('cumulative snapshots keep original receipt, count increase below quote and never double add', async () => {
  const f = await setup(); try {
    const before = await receipt(f); assert.equal(await liability(f), '0');
    const first = await snapshot(f);
    assert.deepEqual(await f.billing.append(first), { status: 'recorded', addedMicroKrw: 30 });
    assert.equal(await liability(f), '100'); // cumulative=80, increase=30, conservative hold=100
    assert.deepEqual(await receipt(f), before);
    assert.deepEqual(await f.billing.append(first), { status: 'duplicate', addedMicroKrw: 0 });
    assert.deepEqual(await f.billing.append(await snapshot(f, { eventId: 'alias-1' })), { status: 'duplicate', addedMicroKrw: 0 });
    assert.deepEqual(await f.billing.append(await snapshot(f, { eventId: 'snapshot-same-total', snapshotId: 'snapshot-2', sequence: 2, previousTotalMicroKrw: 80 })), { status: 'recorded', addedMicroKrw: 0 });
    assert.deepEqual(await f.billing.append(await snapshot(f, { eventId: 'snapshot-rise', snapshotId: 'snapshot-3', sequence: 3, previousTotalMicroKrw: 80, totalActualMicroKrw: 120 })), { status: 'recorded', addedMicroKrw: 40 });
    assert.equal(await liability(f), '120');
    assert.equal((await f.db.query<{ added: string }>('select sum(added)::text added from reply_local.billing_events')).rows[0].added, '70');
    assert.deepEqual(await receipt(f), before);
    assert.deepEqual(await counts(f), { events: 4, holds: 0 });
    await assert.rejects(f.db.query('select reply_local.settle($1,$2,$3,$4,$5)', [owner, 'budget', f.version, 'analysis', 120]), /Settlement conflict/);
  } finally { await f.db.close(); }
});

test('original period and recognition time are separate; current/future month sum each receipt only once', async () => {
  const f = await setup(); try {
    assert.equal(await liability(f, 'analysis', null, '2000-01'), '100');
    await f.billing.append(await snapshot(f));
    for (const month of ['2000-01', '2000-02', '2026-12', '2100-01']) assert.equal(await liability(f, 'analysis', null, month), '100');
    const event = (await f.db.query<{ receipt_month: string; recorded_at: Date }>('select receipt_month,recorded_at from reply_local.billing_events')).rows[0];
    assert.equal(event.receipt_month, '2000-01'); assert.ok(event.recorded_at);
    assert.equal(await liability(f, 'voice'), '0'); assert.equal(await liability(f, 'analysis', 'different-owner'), '0');
  } finally { await f.db.close(); }
});

for (const api of ['legacy', 'quoted'] as const) for (const stage of ['reserve', 'claim'] as const) for (const scope of ['project', 'account'] as const) {
  test(`${api} ${stage} uses late liabilities for ${scope} cap and exact cap`, async () => {
    const f = await setup(); try {
      const next = await makeNew(f, scope === 'project' ? 'fixture-b' : owner);
      const q = api === 'quoted' ? await makeQuote(f, next) : null;
      const reserve = () => q ? q.c.reserve('fitness', 1, next.version, 'analysis', q.binding) : next.client.reserve('fitness', 1, next.version, 'analysis', 10);
      const claim = () => q ? q.c.claim('fitness', 1, next.version, 'analysis', q.binding.quoteId, q.request, 'claim-next') : next.client.claim('fitness', 1, next.version, 'analysis', 'claim-next');
      if (stage === 'claim') assert.equal((await reserve()).status, 'reserved');
      await f.billing.append(await snapshot(f));
      await f.db.exec(`update reply_local.policies set ${scope}_cap=109 where pool='analysis'`);
      if (stage === 'reserve') assert.equal((await reserve()).status, 'budget'); else assert.equal(await claim(), false);
      await f.db.exec(`update reply_local.policies set ${scope}_cap=110 where pool='analysis'`);
      if (stage === 'reserve') assert.equal((await reserve()).status, 'reserved');
      assert.equal(await claim(), true);
      assert.equal(await claim(), false);
    } finally { await f.db.close(); }
  });
}

test('same-owner account cap does not charge unrelated owners; other pool is independent', async () => {
  const f = await setup(); try {
    await f.billing.append(await snapshot(f, { totalActualMicroKrw: 950 }));
    await f.db.exec("update reply_local.policies set account_cap=10 where pool='analysis'");
    const next = await makeNew(f, 'fixture-b');
    assert.equal((await next.client.reserve('fitness', 1, next.version, 'analysis', 10)).status, 'reserved');
    assert.equal(await next.client.claim('fitness', 1, next.version, 'analysis', 'b'), true);
    const voice = await makeNew(f, owner, 'voice');
    assert.equal((await voice.client.reserve('fitness', 1, voice.version, 'voice', 10)).status, 'reserved');
    assert.equal(await voice.client.claim('fitness', 1, voice.version, 'voice', 'voice'), true);
  } finally { await f.db.close(); }
});

test('deleted content stays deleted; audit is financial metadata only and cannot delete or rewrite history', async () => {
  const f = await setup(); try {
    await f.a.publish('budget', 2, [], true);
    const before = await receipt(f); assert.equal(before.answer, null); assert.equal(before.erased, true);
    await f.billing.append(await snapshot(f));
    assert.deepEqual(await receipt(f), before);
    const audit = (await f.db.query<Record<string, unknown>>('select * from reply_local.billing_events')).rows;
    assert.ok(!JSON.stringify(audit).includes(f.answer.text));
    assert.ok(!Object.hasOwn(audit[0], 'contract_text')); assert.ok(!Object.hasOwn(audit[0], 'answer'));
    for (const sql of ['update reply_local.billing_events set total_actual=81', 'delete from reply_local.billing_events', 'truncate reply_local.billing_events', 'update reply_local.receipts set actual=80', 'update reply_local.receipts set erased=false', 'delete from reply_local.receipts', 'truncate reply_local.receipts cascade']) await assert.rejects(f.db.exec(sql), /Append-only|Immutable billing|Billing receipt/);
    assert.deepEqual(await receipt(f), before); assert.equal(await liability(f), '100');
  } finally { await f.db.close(); }
});

test('missing receipt becomes durable pool hold; later receipt creation and new IDs do not clear it', async () => {
  const f = await setup(); try {
    const missing = await recordVersion({ synthetic: 'missing' });
    const e = await snapshot(f, { version: missing });
    assert.equal((await f.billing.append(e)).status, 'held'); assert.deepEqual(await counts(f), { events: 0, holds: 1 });
    await f.db.query("insert into reply_local.receipts(owner,app,version,pool,month,cost,actual,state) values($1,'budget',$2,'analysis','2000-01',100,50,'done')", [owner, missing]);
    assert.equal((await f.billing.append(e)).status, 'held');
    assert.equal((await f.billing.append(await snapshot(f, { eventId: 'new-valid', snapshotId: 'new-valid' }))).status, 'recorded');
    const next = await makeNew(f); assert.equal((await next.client.reserve('fitness', 1, next.version, 'analysis', 1)).status, 'budget');
    const voice = await makeNew(f, 'fixture-other', 'voice'); assert.equal((await voice.client.reserve('fitness', 1, voice.version, 'voice', 1)).status, 'reserved');
    for (const sql of ['delete from reply_local.billing_holds', 'update reply_local.billing_holds set reason=\'ignore\'', 'truncate reply_local.billing_holds']) await assert.rejects(f.db.exec(sql), /Append-only/);
  } finally { await f.db.close(); }
});

for (const cross of ['owner', 'pool', 'snapshot'] as const) test(`approved ${cross} identity collision is held without mutation or double addition`, async () => {
  const f = await setup(); try {
    const first = await snapshot(f); await f.billing.append(first);
    const changed = await snapshot(f, cross === 'owner' ? { owner: 'fixture-b' } : cross === 'pool' ? { pool: 'voice' } : { eventId: 'different-event', totalActualMicroKrw: 81 });
    assert.equal((await f.billing.append(changed)).status, 'held');
    assert.equal((await f.billing.append(changed)).status, 'held');
    assert.deepEqual(await f.billing.append(first), { status: 'duplicate', addedMicroKrw: 0 });
    assert.equal((await counts(f)).events, 1); assert.equal(await liability(f), '100');
    assert.equal((await f.db.query<{ clear: boolean }>("select reply_local.billing_clear('analysis') clear")).rows[0].clear, false);
    assert.equal((await f.db.query<{ clear: boolean }>("select reply_local.billing_clear('voice') clear")).rows[0].clear, cross !== 'pool');
  } finally { await f.db.close(); }
});

for (const api of ['legacy', 'quoted'] as const) test(`${api} unclaimed receipt is blocked by a known hold; cache remains readable`, async () => {
  const f = await setup(); try {
    const next = await makeNew(f); const q = api === 'quoted' ? await makeQuote(f, next) : null;
    const reserve = () => q ? q.c.reserve('fitness', 1, next.version, 'analysis', q.binding) : next.client.reserve('fitness', 1, next.version, 'analysis', 10);
    await reserve();
    await f.billing.append(await snapshot(f, { originalActualMicroKrw: 51 }));
    assert.equal(q ? await q.c.claim('fitness', 1, next.version, 'analysis', q.binding.quoteId, q.request, 'blocked') : await next.client.claim('fitness', 1, next.version, 'analysis', 'blocked'), false);
    assert.equal((await f.a.reserve('budget', 1, f.version, 'analysis', null)).status, 'ready');
    assert.equal((await f.db.query<{ claim: string | null }>('select claim from reply_local.receipts where version=$1', [next.version])).rows[0].claim, null);
  } finally { await f.db.close(); }
});

test('out-of-order sequence, stale total, altered baseline, zero/negative/unsafe totals cannot reduce debt', async () => {
  for (const patch of [
    { sequence: 3 }, { sequence: 1 }, { previousTotalMicroKrw: 50 }, { totalActualMicroKrw: 70 }, { originalActualMicroKrw: 49 },
    { totalActualMicroKrw: 0 }, { totalActualMicroKrw: -1 }, { totalActualMicroKrw: 1.5 }, { totalActualMicroKrw: Number.MAX_SAFE_INTEGER + 1 }, { sequence: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const f = await setup(); try {
      await f.billing.append(await snapshot(f));
      const bad = await snapshot(f, { eventId: 'event-bad', snapshotId: 'snapshot-bad', sequence: 2, previousTotalMicroKrw: 80, totalActualMicroKrw: 100, ...patch });
      assert.equal((await f.billing.append(bad)).status, 'held', JSON.stringify(patch));
      assert.equal((await counts(f)).events, 1); assert.equal(await liability(f), '100');
    } finally { await f.db.close(); }
  }
});

test('no approval, wrong hash, wrong mode, extra content, unknown schema and malformed contract fail closed', async () => {
  const f = await setup(); try {
    assert.throws(() => new Billing(f.db, { mode: 'live', authority: 'fixture-only' } as unknown as typeof authority));
    const no = await snapshot(f, {}, false);
    assert.equal((await f.billing.append(no)).status, 'rejected'); assert.deepEqual(await counts(f), { events: 0, holds: 0 });
    assert.equal((await f.billing.append({ ...no, contractHash: '0'.repeat(64) })).status, 'rejected');
    for (const patch of [{ mode: 'live' }, { schema: 'unknown' }, { answer: f.answer }, { totalActualMicroKrw: null }, { pool: null }, { owner: null }]) {
      const c = { ...JSON.parse(no.contractText), ...patch } as SyntheticBillingSnapshot;
      const e = await bindSyntheticBillingSnapshot(c); await f.db.query("insert into reply_local.billing_fixture_approvals values($1,'synthetic')", [e.contractHash]);
      assert.equal((await f.billing.append(e)).status, 'held');
    }
    assert.equal((await counts(f)).events, 0);
    const audit = (await f.db.query('select * from reply_local.billing_holds')).rows;
    assert.ok(!JSON.stringify(audit).includes(f.answer.text));
    await f.db.exec('delete from reply_local.billing_ledger_format');
    assert.equal((await f.billing.append(no)).status, 'unavailable');
    const next = await makeNew(f); assert.equal((await next.client.reserve('fitness', 1, next.version, 'analysis', 1)).status, 'budget');
  } finally { await f.db.close(); }
});

test('safe-integer upper edge is exact, aggregate beyond bigint never wraps, existing bigint actual is preserved', async () => {
  const f = await setup(); try {
    assert.deepEqual(await f.billing.append(await snapshot(f, { totalActualMicroKrw: Number.MAX_SAFE_INTEGER })), { status: 'recorded', addedMicroKrw: Number.MAX_SAFE_INTEGER - 50 });
    assert.equal(await liability(f), String(Number.MAX_SAFE_INTEGER));
    await f.db.exec("insert into reply_local.receipts(owner,app,version,pool,month,cost,actual,state) values('large-a','budget','large-a','analysis','2000-01',1,9223372036854775807,'done'),('large-b','budget','large-b','analysis','2000-01',1,9223372036854775807,'done')");
    assert.equal(await liability(f), String(BigInt('9223372036854775807') * BigInt(2) + BigInt(Number.MAX_SAFE_INTEGER)));
    const next = await makeNew(f); assert.equal((await next.client.reserve('fitness', 1, next.version, 'analysis', 1)).status, 'budget');
    const hugeVersion = await recordVersion({ synthetic: 'huge' });
    await f.db.query("insert into reply_local.receipts(owner,app,version,pool,month,cost,actual,state) values($1,'budget',$2,'analysis','2000-01',1,9223372036854775807,'done')", [owner, hugeVersion]);
    assert.equal((await f.billing.append(await snapshot(f, { eventId: 'huge', snapshotId: 'huge', version: hugeVersion, originalActualMicroKrw: Number.MAX_SAFE_INTEGER, previousTotalMicroKrw: Number.MAX_SAFE_INTEGER, totalActualMicroKrw: Number.MAX_SAFE_INTEGER }))).status, 'held');
    assert.equal((await f.db.query<{ actual: string }>('select actual::text actual from reply_local.receipts where version=$1', [hugeVersion])).rows[0].actual, '9223372036854775807');
  } finally { await f.db.close(); }
});

test('lost commit ACK returns uncertain, exact retry adds once; storage failure cannot masquerade as success', async () => {
  const f = await setup(); try {
    const e = await snapshot(f); let drop = true;
    const lost: LocalReplyDatabase = { async query<T>(sql: string, params?: unknown[]) { const result = await f.db.query<T>(sql, params); if (drop) { drop = false; throw new Error('synthetic lost commit ACK'); } return result; } };
    const c = new Billing(lost, authority);
    assert.deepEqual(await c.append(e), { status: 'uncertain' });
    assert.deepEqual(await c.append(e), { status: 'duplicate', addedMicroKrw: 0 });
    assert.equal((await counts(f)).events, 1); assert.equal(await liability(f), '100');
    const dead: LocalReplyDatabase = { async query<T>(): Promise<{ rows: T[] }> { throw new Error('storage unavailable'); } };
    assert.deepEqual(await new Billing(dead, authority).append(e), { status: 'uncertain' });
    assert.equal((await counts(f)).events, 1);
  } finally { await f.db.close(); }
});

test('two concurrent PGlite clients dedupe identical events and quarantine conflicting approved snapshots', async () => {
  const f = await setup(); try {
    const e = await snapshot(f); const b = new Billing(f.db, authority);
    const results = await Promise.all([f.billing.append(e), b.append(e)]);
    assert.deepEqual(results.map(r => r.status).sort(), ['duplicate', 'recorded']); assert.equal((await counts(f)).events, 1);
    const a = await snapshot(f, { eventId: 'race-a', snapshotId: 'race-a', sequence: 2, previousTotalMicroKrw: 80, totalActualMicroKrw: 100 });
    const c = await snapshot(f, { eventId: 'race-b', snapshotId: 'race-b', sequence: 2, previousTotalMicroKrw: 80, totalActualMicroKrw: 120 });
    const raced = await Promise.all([f.billing.append(a), b.append(c)]);
    assert.deepEqual(raced.map(r => r.status).sort(), ['held', 'recorded']); assert.equal((await counts(f)).events, 2); assert.equal((await counts(f)).holds, 1);
  } finally { await f.db.close(); }
});

test('normal same-process disk close/reopen preserves corrections, holds, erased marker and exact retry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeoni-billing-'));
  let f: Fixture | undefined;
  try {
    f = await setup(directory); const e = await snapshot(f); await f.billing.append(e);
    await f.a.publish('budget', 2, [], true);
    await f.billing.append(await snapshot(f, { eventId: 'conflict', snapshotId: 'conflict', sequence: 3, previousTotalMicroKrw: 80, totalActualMicroKrw: 90 }));
    const before = await receipt(f); await f.db.close();
    const db = new PGlite(directory); f = { ...f, db, billing: new Billing(db, authority) };
    assert.deepEqual(await f.billing.append(e), { status: 'duplicate', addedMicroKrw: 0 });
    assert.deepEqual(await receipt(f), before); assert.deepEqual(await counts(f), { events: 1, holds: 1 }); assert.equal(await liability(f), '100');
    const next = await makeNew(f); assert.equal((await next.client.reserve('fitness', 1, next.version, 'analysis', 1)).status, 'budget');
  } finally { if (f && !f.db.closed) await f.db.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('ambient transaction response is not commit ACK: rollback limitation remains explicit', async () => {
  const f = await setup(); try {
    const e: SyntheticBillingEnvelope = await snapshot(f);
    await f.db.exec('begin'); assert.equal((await f.billing.append(e)).status, 'recorded'); await f.db.exec('rollback');
    assert.equal((await counts(f)).events, 0); assert.equal(await liability(f), '0');
    assert.equal((await f.billing.append(e)).status, 'recorded');
  } finally { await f.db.close(); }
});

test('snapshot collision protects original pool before missing target or invalid-baseline rejection', async () => {
  const f = await setup(); try {
    await f.billing.append(await snapshot(f));
    const conflict = await snapshot(f, { eventId: 'cross-snapshot', owner: 'missing-owner', pool: 'voice', originalActualMicroKrw: 49 });
    assert.equal((await f.billing.append(conflict)).status, 'held');
    assert.equal((await counts(f)).events, 1); assert.equal((await counts(f)).holds, 2);
    for (const pool of ['analysis', 'voice']) assert.equal((await f.db.query<{ clear: boolean }>('select reply_local.billing_clear($1) clear', [pool])).rows[0].clear, false);
  } finally { await f.db.close(); }
});

test('approved scalar/malformed contracts and nonnumeric amounts yield persistent hold, not rolled-back validation', async () => {
  const f = await setup(); try {
    for (const contractText of ['null', '42', '[]', '{broken', (await snapshot(f)).contractText.replace('"totalActualMicroKrw":80', '"totalActualMicroKrw":"not-a-number"')]) {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(contractText))), b => b.toString(16).padStart(2, '0')).join('');
      await f.db.query("insert into reply_local.billing_fixture_approvals values($1,'synthetic')", [hash]);
      assert.equal((await f.billing.append({ contractText, contractHash: hash })).status, 'held');
    }
    assert.equal((await counts(f)).events, 0); assert.equal((await counts(f)).holds, 5);
    assert.equal(await liability(f), '0'); // hold is not an invented financial debit
  } finally { await f.db.close(); }
});

test('first valid zero snapshot is audited without hold or old-month admission; later increase is sequenced', async () => {
  const f = await setup(); try {
    const noIncrease = await snapshot(f, { totalActualMicroKrw: 50 });
    assert.deepEqual(await f.billing.append(noIncrease), { status: 'recorded', addedMicroKrw: 0 });
    assert.deepEqual(await f.billing.append(noIncrease), { status: 'duplicate', addedMicroKrw: 0 });
    assert.deepEqual(await counts(f), { events: 1, holds: 0 });
    for (const month of ['2000-02', '2026-12', '2100-01']) assert.equal(await liability(f, 'analysis', null, month), '0');
    assert.equal(await liability(f, 'analysis', null, '2000-01'), '100');
    assert.equal((await f.db.query<{ clear: boolean }>("select reply_local.billing_clear('analysis') clear")).rows[0].clear, true);
    assert.equal(Number((await receipt(f)).actual), 50);
    assert.deepEqual(await f.billing.append(await snapshot(f, { eventId: 'next', snapshotId: 'next', sequence: 2 })), { status: 'recorded', addedMicroKrw: 30 });
    assert.equal(await liability(f), '100');
    assert.equal((await f.billing.append(await snapshot(f, { totalActualMicroKrw: 80 }))).status, 'held');
    assert.equal((await counts(f)).events, 2);
    for (const total of [50, 49, 0, -1]) {
      assert.equal((await f.billing.append(await snapshot(f, { eventId: 'credit-' + total, snapshotId: 'credit-' + total, sequence: 3, previousTotalMicroKrw: 80, totalActualMicroKrw: total }))).status, 'held');
    }
    assert.equal((await counts(f)).events, 2); assert.equal(await liability(f), '100');
    assert.equal(Number((await receipt(f)).actual), 50);
  } finally { await f.db.close(); }
});

test('lost ACK for a committed conflict still leaves durable hold and no new claim authorization', async () => {
  const f = await setup(); try {
    const e = await snapshot(f, { version: await recordVersion({ synthetic: 'missing-for-ACK' }) });
    const lost: LocalReplyDatabase = { async query<T>(sql: string, params?: unknown[]) { await f.db.query<T>(sql, params); throw new Error('synthetic lost ACK after hold commit'); } };
    assert.deepEqual(await new Billing(lost, authority).append(e), { status: 'uncertain' });
    assert.equal((await counts(f)).holds, 1); assert.equal((await f.billing.append(e)).status, 'held');
    const next = await makeNew(f); assert.equal((await next.client.reserve('fitness', 1, next.version, 'analysis', 10)).status, 'budget');
  } finally { await f.db.close(); }
});

test('held event and snapshot identities cannot escape into another pool before any accepted event exists', async () => {
  for (const sameId of ['event', 'snapshot']) {
    const f = await setup(); try {
      const missing = await recordVersion({ synthetic: 'held-target' });
      assert.equal((await f.billing.append(await snapshot(f, { version: missing }))).status, 'held');
      const voiceVersion = await recordVersion({ synthetic: 'voice-receipt' });
      await f.db.query("insert into reply_local.receipts(owner,app,version,pool,month,cost,actual,state) values($1,'budget',$2,'voice','2000-01',100,50,'done')", [owner, voiceVersion]);
      const replay = await snapshot(f, { pool: 'voice', version: voiceVersion, eventId: sameId === 'event' ? 'event-1' : 'another-event', snapshotId: sameId === 'snapshot' ? 'snapshot-1' : 'another-snapshot' });
      assert.equal((await f.billing.append(replay)).status, 'held');
      assert.equal((await counts(f)).events, 0);
      for (const pool of ['analysis', 'voice']) assert.equal((await f.db.query<{ clear: boolean }>('select reply_local.billing_clear($1) clear', [pool])).rows[0].clear, false);
    } finally { await f.db.close(); }
  }
});

test('oversized but approved content cannot roll back a known unresolved signal into a silent rejection', async () => {
  const f = await setup(); try {
    const c = { ...JSON.parse((await snapshot(f)).contractText), unexpected: 'x'.repeat(4096) } as SyntheticBillingSnapshot;
    const e = await bindSyntheticBillingSnapshot(c);
    await f.db.query("insert into reply_local.billing_fixture_approvals values($1,'synthetic')", [e.contractHash]);
    assert.equal((await f.billing.append(e)).status, 'held');
    assert.equal((await counts(f)).events, 0); assert.equal((await counts(f)).holds, 1);
    for (const pool of ['analysis', 'voice']) assert.equal((await f.db.query<{ clear: boolean }>('select reply_local.billing_clear($1) clear', [pool])).rows[0].clear, false);
  } finally { await f.db.close(); }
});
