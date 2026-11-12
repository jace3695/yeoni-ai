import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureLanguageReplySnapshot as capture, readLanguageReplySnapshot as read, LANGUAGE_REPLY_KEYS } from './language-reply-source.ts';
import { syntheticIndexedDB } from '../../tests/fixtures/languageIndexedDB.ts';
import { recordVersion, MockReplyLedger, MockRecordReplyService } from './generated-record-reply.ts';
import { emptyLevelJourney, chooseJapaneseLevel, rememberUpperAnswer } from '../../utils/japaneseLevelJourney.ts';
import { emptyChunkReview, rememberChunkAnswer } from '../../utils/japaneseChunkReview.ts';

const day = '2026-11-08', now = day + 'T00:00:00.000Z';
const levelKey = 'japaneseLevelJourneyV1', chunkKey = 'japaneseChunkReviewV1';
function fixture() {
  const data = new Map<string, string>([['fitness-cloud-sync-user', 'fixture-A'], ['language-cloud-sync-user', 'fixture-A'], ['fitness-cloud-sync-epoch', '1'], ['language-cloud-sync-epoch', '2']]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem() { throw Error('Unexpected record write'); }, removeItem() { throw Error('Unexpected record removal'); } };
  return { data, storage, source: () => capture(storage, 'fixture-A', true) };
}
function journey() {
  return rememberUpperAnswer(chooseJapaneseLevel(emptyLevelJourney(), 'intermediate', new Date(now)), { lessonId: 'lesson-1', questionId: 'question-1', attemptId: 'answer-1', correct: false, neededHelp: false }, new Date(now));
}
function chunk() {
  return rememberChunkAnswer(emptyChunkReview(), { lessonId: 'lesson-1', questionId: 'question-1', attemptId: 'chunk-1', correct: false, neededHelp: false, mode: 'choice' }, new Date(now));
}
const records = (f: ReturnType<typeof fixture>) => f.source().source.records as Record<string, unknown>;
async function version(f: ReturnType<typeof fixture>) { const s = f.source(); assert.equal(s.source.complete, true); return recordVersion(s.source.records); }

test('captures eleven scoped keys and reset without inventing missing study or default selection', () => {
  const f = fixture(); const s = f.source();
  assert.equal(s.state, 'ready'); assert.equal(s.source.complete, true);
  assert.deepEqual(Object.keys(records(f)).sort(), [...LANGUAGE_REPLY_KEYS, 'languageRecordResetV1'].sort());
  assert.ok(Object.values(records(f)).every(value => value === null));
  f.data.set(levelKey, JSON.stringify(journey())); f.data.set(chunkKey, JSON.stringify(chunk()));
  const r = records(f); assert.equal((r[levelKey] as { selectedLevel: string }).selectedLevel, 'intermediate');
  assert.equal(Object.keys((r[chunkKey] as { events: object }).events).length, 1);
});

for (const key of [levelKey, chunkKey]) test(key + ' addition, real edit and deletion change the content version', async () => {
  const f = fixture(); const initial = await version(f);
  f.data.set(key, JSON.stringify(key === levelKey ? journey() : chunk())); const added = await version(f); assert.notEqual(initial, added);
  if (key === levelKey) f.data.set(key, JSON.stringify({ ...journey(), selectedLevel: 'advanced' }));
  else f.data.set(key, JSON.stringify(rememberChunkAnswer(chunk(), { lessonId: 'lesson-1', questionId: 'question-1', attemptId: 'chunk-2', correct: true, neededHelp: false, mode: 'reading' }, new Date('2026-11-09T00:00:00.000Z'))));
  assert.notEqual(await version(f), added);
  f.data.delete(key); assert.equal(await version(f), initial);
});

test('only root reconciliation clocks are omitted; real attempt/practice/review dates remain', async () => {
  const f = fixture(); const j = journey(); f.data.set(levelKey, JSON.stringify(j)); const first = await version(f);
  f.data.set(levelKey, JSON.stringify({ ...j, updatedAt: '2027-01-01T00:00:00Z', selectionUpdatedAt: '2027-01-01T00:00:00Z' }));
  f.data.set('fitness-cloud-sync-epoch', '9'); f.data.set('language-cloud-sync-epoch', '9');
  assert.equal(await version(f), first);
  for (const change of [
    { ...j, practicedUnits: { 'lesson-1': '2026-11-09T00:00:00.000Z' } },
    { ...j, answers: { ...j.answers, 'question-1': { ...j.answers['question-1'], lastAnsweredAt: '2026-11-09T00:00:00.000Z' } } },
    { ...j, answers: { ...j.answers, 'question-1': { ...j.answers['question-1'], nextReviewAt: '2026-11-10T00:00:00.000Z' } } },
    { ...j, answers: { ...j.answers, 'question-1': { ...j.answers['question-1'], successDates: ['2026-11-08'] } } },
  ]) { f.data.set(levelKey, JSON.stringify(change)); assert.notEqual(await version(f), first); }
});

test('same owner/content reuses across date rollover, reopen, JSON formatting and metadata changes', async () => {
  const f = fixture(); f.data.set(levelKey, JSON.stringify(journey())); f.data.set(chunkKey, JSON.stringify(chunk()));
  const ledger = new MockReplyLedger(10); let calls = 0;
  const service = new MockRecordReplyService(ledger, { mode: 'mock', async generate() { calls++; return '가상 기록 분석'; } });
  const first = await service.analyze(f.source().source, day, now); assert.equal(first.status, 'ready');
  f.data.set(levelKey, JSON.stringify({ ...journey(), updatedAt: '2027-01-01T00:00:00Z' }, null, 2));
  f.data.set('language-cloud-sync-epoch', '3');
  const again = await service.analyze(f.source().source, '2027-01-01', '2027-01-01T00:00:00Z');
  assert.equal(again.status, 'ready'); if (again.status === 'ready') { assert.equal(again.reused, true); assert.equal(again.answer.analysisDate, day); }
  assert.equal(calls, 1);
  for (const owner of ['fixture-B']) { f.data.set('fitness-cloud-sync-user', owner); f.data.set('language-cloud-sync-user', owner); await service.analyze(capture(f.storage, owner, true).source, day, now); }
  const otherApp = { ...capture(f.storage, 'fixture-B', true).source, app: 'growth' as const };
  await service.analyze(otherApp, day, now); assert.equal(calls, 3);
});

test('reset generation changes version and suppresses older chunk events without touching stored bytes', async () => {
  const f = fixture(); const raw = JSON.stringify(chunk()); f.data.set(chunkKey, raw); const before = await version(f);
  const reset = '2026-11-09T00:00:00.000Z|reset-1'; f.data.set('languageRecordResetV1', reset);
  const snapshot = f.source(); assert.equal(snapshot.source.complete, true);
  assert.equal(records(f)[chunkKey], null); assert.equal(f.data.get(chunkKey), raw);
  const afterReset = await version(f); assert.notEqual(afterReset, before);
  f.data.delete(chunkKey); assert.equal(await version(f), afterReset);
  f.data.set(chunkKey, JSON.stringify(emptyChunkReview(reset))); assert.equal(await version(f), afterReset);
  f.data.set(chunkKey, JSON.stringify({ ...chunk(), generation: '2026-11-10T00:00:00.000Z|newer' }));
  assert.equal(f.source().state, 'error'); assert.equal(f.source().source.complete, false);
});

for (const [name, key, value] of [
  ['level array', levelKey, '[]'], ['chunk array', chunkKey, '[]'], ['invalid JSON', levelKey, '{bad'],
  ['unknown level version', levelKey, JSON.stringify({ ...journey(), version: 2 })],
  ['unknown level field', levelKey, JSON.stringify({ ...journey(), unknown: 1 })],
  ['unknown answer field', levelKey, JSON.stringify({ ...journey(), answers: { 'question-1': { ...journey().answers['question-1'], unknown: 1 } } })],
  ['invalid ignored clock', levelKey, JSON.stringify({ ...journey(), updatedAt: 'bad' })],
  ['invalid selection clock', levelKey, JSON.stringify({ ...journey(), selectionUpdatedAt: null })],
  ['unknown chunk field', chunkKey, JSON.stringify({ ...chunk(), unknown: 1 })],
  ['stored null', levelKey, 'null'], ['invalid reset', 'languageRecordResetV1', ''],
  ['legacy wrong shape', 'savedWords', '{}'],
] as const) test('damaged source fails closed: ' + name, async () => {
  const f = fixture(); f.data.set(key, value); const before = new Map(f.data); const source = f.source();
  assert.equal(source.state, 'error'); assert.equal(source.source.complete, false); assert.deepEqual(f.data, before);
  let calls = 0; const service = new MockRecordReplyService(new MockReplyLedger(10), { mode: 'mock', async generate() { calls++; return 'must not run'; } });
  assert.equal((await service.analyze(source.source, day, now)).status, 'incomplete'); assert.equal(calls, 0);
});

for (const key of ['yeoni-storage-transaction-v1', 'language-storage-transaction-v1']) for (const value of ['', '{}']) test('blocks journal presence even when empty: ' + key + value, () => {
  const f = fixture(); f.data.set(key, value); assert.equal(f.source().state, 'loading'); assert.equal(f.source().source.complete, false);
});

for (const key of ['fitness-cloud-sync-user', 'language-cloud-sync-user', 'fitness-cloud-sync-epoch', 'language-cloud-sync-epoch', 'languageRecordResetV1', levelKey, chunkKey, 'savedWords']) test('change during snapshot capture is suppressed: ' + key, () => {
  const f = fixture(); let count = 0;
  const s = capture({ getItem(k) { const value = f.storage.getItem(k); if (k === key && ++count === 1) f.data.set(k, key.includes('user') ? 'fixture-B' : key.includes('epoch') ? '99' : key === 'languageRecordResetV1' ? now : key === 'savedWords' ? '[]' : '{}'); return value; } }, 'fixture-A', true);
  assert.equal(s.source.complete, false);
});

test('owner/readiness guards and later raw mutation never deliver a previous source', () => {
  const f = fixture(); assert.equal(capture(f.storage, 'fixture-A', false).source.complete, false);
  assert.equal(capture(f.storage, 'fixture-B', true).source.complete, false);
  f.data.delete('language-cloud-sync-user'); assert.equal(f.source().source.complete, false);
  f.data.set('language-cloud-sync-user', 'fixture-A'); const s = f.source(); assert.equal(s.stillCurrent(), true);
  f.data.set(levelKey, JSON.stringify(journey())); assert.equal(s.stillCurrent(), false);
});

async function browserStorageFixture(locks: unknown, indexedDB: unknown, run: () => Promise<void>) {
  const originals = ['navigator', 'indexedDB'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB });
  try { await run(); } finally { for (const [key, original] of originals) { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); } }
}
test('uses shared IndexedDB gate with optional outer Web Lock', async () => {
  const f = fixture(); let locks = 0;
  await browserStorageFixture({ request: async (_name: string, _options: unknown, callback: () => unknown) => { locks++; return callback(); } }, syntheticIndexedDB().factory, async () => {
    assert.equal((await read(f.storage, 'fixture-A', true)).state, 'ready'); assert.equal(locks, 1);
  });
  await browserStorageFixture(undefined, syntheticIndexedDB().factory, async () => {
    assert.equal((await read(f.storage, 'fixture-A', true)).state, 'ready');
  });
});
test('missing or failed IndexedDB never falls back even when Web Locks exist', async () => {
  const failed = syntheticIndexedDB(); failed.controls.openError = true;
  for (const indexedDB of [undefined, failed.factory]) for (const locks of [undefined, { request: async (_name: string, _options: unknown, callback: () => unknown) => callback() }]) {
    let reads = 0;
    await browserStorageFixture(locks, indexedDB, async () => {
      assert.equal((await read({ getItem() { reads++; return null; } }, 'fixture-A', true)).state, 'error'); assert.equal(reads, 0);
    });
  }
});
test('a snapshot captured before IndexedDB abort is not delivered as complete', async () => {
  const f = fixture(), gate = syntheticIndexedDB(); gate.controls.abortAfterCallback = true;
  let reads = 0;
  await browserStorageFixture(undefined, gate.factory, async () => {
    const result = await read({ getItem(key) { reads++; return f.storage.getItem(key); } }, 'fixture-A', true);
    assert.ok(reads > 0); assert.equal(result.state, 'error'); assert.equal(result.source.complete, false);
  });
});
test('cancellation before a queued IDB grant reads no records; owner changes fail closed', async () => {
  for (const cancel of [false, true]) {
    const f = fixture(), gate = syntheticIndexedDB(), controller = new AbortController(); gate.pause();
    let reads = 0;
    await browserStorageFixture(undefined, gate.factory, async () => {
      const pending = read({ getItem(key) { reads++; return f.storage.getItem(key); } }, 'fixture-A', true, controller.signal);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.ok(gate.trace.some(entry => entry.startsWith('queue:')));
      if (cancel) controller.abort(); else f.data.set('language-cloud-sync-user', 'fixture-B');
      gate.resume(); assert.equal((await pending).source.complete, false);
      if (cancel) assert.equal(reads, 0);
      await new Promise<void>(resolve => setImmediate(resolve));
    });
  }
});
test('delayed locked result is suppressed after owner change or cancellation', async () => {
  for (const cancel of [false, true]) {
    const f = fixture(); let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); const notified = new Promise<void>(resolve => { entered = resolve; });
    const controller = new AbortController();
    await browserStorageFixture({ request: async (_name: string, _options: unknown, callback: () => unknown) => { const result = await callback(); assert.equal((result as { source: { complete: boolean } }).source.complete, true); entered(); await held; return result; } }, syntheticIndexedDB().factory, async () => {
      const pending = read(f.storage, 'fixture-A', true, controller.signal); await notified;
      if (cancel) controller.abort(); else f.data.set('language-cloud-sync-user', 'fixture-B');
      release(); assert.equal((await pending).source.complete, false);
    });
  }
});
test('AI endpoint remains unconditional 503; adapter has no transport or write/recovery call', async () => {
  const { POST } = await import('../../app/api/yeoni/record-reply/route.ts'); assert.equal((await POST()).status, 503);
  const text = readFileSync('lib/yeoni/language-reply-source.ts', 'utf8');
  assert.doesNotMatch(text, /fetch\(|\.setItem\(|\.removeItem\(|recoverLanguageStorage\(|writeLanguage|Date\.now\(|dueChunkReviews\(|dueUpperAnswers\(/);
});
