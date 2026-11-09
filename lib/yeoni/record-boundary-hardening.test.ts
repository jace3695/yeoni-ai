import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRecords, recordVersion, MockReplyLedger, MockRecordReplyService } from './generated-record-reply.ts';
import { replySource } from './record-reply-sources.ts';

const invalid: [string, () => unknown][] = [
  ['Date', () => new Date('2026-11-08T00:00:00Z')],
  ['Map', () => new Map([['record', 1]])],
  ['Set', () => new Set([1])],
  ['typed array', () => new Uint8Array([1])],
  ['class', () => new (class { amount = 1; })()],
  ['sparse array', () => new Array(1)],
  ['sparse trailing array', () => { const a = [1]; a.length = 2; return a; }],
  ['array with extra field', () => Object.assign([1], { extra: 2 })],
  ['hidden field', () => Object.defineProperty({}, 'secret', { value: 1 })],
  ['symbol field', () => ({ [Symbol('record')]: 1 })],
  ['inherited field', () => Object.create({ record: 1 })],
  ['undefined', () => undefined],
  ['undefined nested', () => ({ record: undefined })],
  ['nonfinite', () => ({ record: Infinity })],
  ['cyclic object', () => { const a: { a?: unknown } = {}; a.a = a; return a; }],
];
const source = (records: unknown) => ({ owner: 'fixture', app: 'diet' as const, records, complete: true });
for (const [name, make] of invalid) test('rejects ' + name + ' without cache reuse, call, or reservation', async () => {
  const bad = make();
  assert.throws(() => canonicalRecords(bad), /Unsupported record value/);
  assert.equal(replySource('fixture', 'diet', bad, true).complete, false);
  const ledger = new MockReplyLedger(10);
  let calls = 0;
  const service = new MockRecordReplyService(ledger, { mode: 'mock', async generate() { calls++; return '모의 응답'; } });
  await service.analyze(source({}), '2026-11-08', '2026-11-08T00:00:00Z');
  assert.equal((await service.analyze(source(bad), '2026-11-08', '2026-11-08T00:00:00Z')).status, 'incomplete');
  assert.equal(calls, 1);
  assert.equal(ledger.total('fixture'), 1);
});
test('rejects accessors without invoking getter or toJSON code', () => {
  let reads = 0;
  for (const value of [Object.defineProperty({}, 'record', { enumerable: true, get() { reads++; return 1; } }), { toJSON() { reads++; return {}; } }]) {
    assert.throws(() => canonicalRecords(value));
    assert.equal(replySource('fixture', 'diet', value, true).complete, false);
  }
  assert.equal(reads, 0);
});
test('valid JSON retains historical canonical bytes and shared noncyclic objects', async () => {
  const shared = { amount: 1 };
  const a = { z: [null, true, '문자', -0, shared, shared], a: Object.assign(Object.create(null), { value: 2 }) };
  const expected = '{"a":{"value":2},"z":[null,true,"문자",0,{"amount":1},{"amount":1}]}';
  assert.equal(canonicalRecords(a), expected);
  assert.equal(await recordVersion(a), await recordVersion(JSON.parse(expected)));
  assert.equal(replySource('fixture', 'diet', a, true).complete, true);
});
test('invalid refresh suppresses old in-flight display without refund or erasing valid cache', async () => {
  const ledger = new MockReplyLedger(10);
  let release!: (text: string) => void;
  const service = new MockRecordReplyService(ledger, { mode: 'mock', generate: () => new Promise(resolve => { release = resolve; }) });
  const pending = service.analyze(source({ valid: 1 }), '2026-11-08', '2026-11-08T00:00:00Z');
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal((await service.analyze(source(new Map()), '2026-11-08', '2026-11-08T00:00:00Z')).status, 'incomplete');
  release('모의 응답');
  assert.equal((await pending).status, 'stale');
  assert.equal(ledger.total('fixture'), 1);
  const reused = await service.analyze(source({ valid: 1 }), '2026-11-09', '2026-11-09T00:00:00Z');
  assert.equal(reused.status, 'ready');
  if (reused.status === 'ready') assert.equal(reused.reused, true);
});
