import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';
const P = 'dailyRoutineProgress', H = 'dailyLearningHistory', J = 'language-storage-transaction-v1';
function fixture(before = false) {
  const data = new Map<string, string>([['language-cloud-sync-user', 'synthetic-owner'], ['fitness-cloud-sync-user', 'synthetic-owner']]), writes: string[] = [];
  let day = '2026-11-09';
  let fail: (key: string, operation: string) => boolean = () => false;
  const storage = {
    getItem(key: string) { if (fail(key, 'read')) throw Error('read failure'); return data.get(key) ?? null; },
    setItem(key: string, value: string) { writes.push(key); if (fail(key, 'set')) throw Error('write failure'); data.set(key, value); },
    removeItem(key: string) { writes.push(`remove:${key}`); if (fail(key, 'remove')) throw Error('remove failure'); data.delete(key); },
  };
  const context = vm.createContext({ window: { localStorage: storage }, indexedDB: new IDBFactory(), setTimeout, clearTimeout, DOMException, console });
  const load = (path: string, imports: Record<string, unknown> = {}) => {
    const loaded = { exports: {} as Record<string, (...args: any[]) => any> };
    Object.assign(context, { __loaded: loaded, __require: (name: string) => imports[name] });
    vm.runInContext('(function(module, exports, require) {' + ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + '\n})(__loaded, __loaded.exports, __require)', context);
    return loaded.exports;
  };
  const lock = load('app/data/languageStorageLock.ts');
  const daily = load(before ? 'tests/fixtures/dailyRoutineProgress-before.txt' : 'utils/dailyRoutineProgress.ts', {
    '@/utils/dateKey': { getLocalDateKey: () => day }, '@/app/data/languageStorageLock': lock,
  });
  return { data, writes, context, daily, lock, setDay: (value: string) => { day = value; }, fail: (fn: typeof fail) => { fail = fn; },
    put: (key: string, value: unknown) => data.set(key, JSON.stringify(value)), read: (key: string) => JSON.parse(data.get(key)!),
    capture: (id = 'kana') => daily.captureDailyRoutineCompletion(id), save: (intent: unknown, guard?: unknown) => daily.saveDailyRoutineCompletion(intent, guard) };
}

test('BEFORE actual baseline: history failure reports success, retry skips missing history', () => {
  const f = fixture(true); f.fail(key => key === H);
  assert.doesNotThrow(() => f.daily.markTodayRoutineCompleted('kana'));
  assert.deepEqual(f.read(P).completedIds, ['kana']); assert.equal(f.data.has(H), false);
  f.fail(() => false); f.daily.markTodayRoutineCompleted('kana'); assert.equal(f.data.has(H), false);
});

test('AFTER same failure rejects, rolls back, and original intent retry repairs both', async () => {
  const f = fixture(), intent = f.capture(); f.fail(key => key === H);
  await assert.rejects(f.save(intent)); assert.equal(f.data.has(P), false); assert.equal(f.data.has(H), false);
  f.fail(() => false); await f.save(intent); assert.deepEqual(f.read(P).completedIds, ['kana']); assert.deepEqual(f.read(H)['2026-11-09'].completedIds, ['kana']);
  f.writes.length = 0; await f.save(intent); assert.deepEqual(f.writes, []);
});

test('merges IDs from both originals, repairs already-completed progress, preserves metadata and other days', async () => {
  const f = fixture(); f.put(P, { date: '2026-11-09', completedIds: ['kana'], extra: 7 });
  f.put(H, { '2026-11-08': { arbitrary: ['untouched'] }, rootMetadata: 'retain', '2026-11-09': { completedIds: ['words'], completedCount: 1, totalCount: 9, custom: 'keep' } });
  await f.save(f.capture()); assert.deepEqual(f.read(P), { date: '2026-11-09', completedIds: ['kana', 'words'], extra: 7 });
  const h = f.read(H); assert.equal(h.rootMetadata, 'retain'); assert.deepEqual(h['2026-11-08'], { arbitrary: ['untouched'] }); assert.equal(h['2026-11-09'].custom, 'keep'); assert.equal(h['2026-11-09'].totalCount, 9);
  f.writes.length = 0; await f.save(f.capture()); assert.deepEqual(f.writes, []);
});

test('count-only legacy retains count without guessed IDs or retry inflation', async () => {
  const f = fixture(); f.put(H, { '2026-11-09': { completedCount: 4, custom: 'legacy' } });
  await f.save(f.capture()); assert.equal(f.read(H)['2026-11-09'].completedCount, 4); assert.deepEqual(f.read(H)['2026-11-09'].completedIds, ['kana']);
  await f.save(f.capture('words')); assert.equal(f.read(H)['2026-11-09'].completedCount, 4);
  f.writes.length = 0; await f.save(f.capture('words')); assert.deepEqual(f.writes, []);
});

for (const key of [P, H]) for (const raw of ['{', '[]', 'null', '"text"', '']) test(`malformed ${key} ${raw} preserves both bytes`, async () => {
  const f = fixture(); f.data.set(key, raw); const before = [...f.data]; await assert.rejects(f.save(f.capture())); assert.deepEqual([...f.data], before); assert.deepEqual(f.writes, []);
});
for (const item of [null, [], {}, { completedIds: ['unknown'] }, { completedIds: null }, { completedCount: -1 }, { completedIds: [], completedCount: '2' }, { completedIds: [], updatedAt: null }]) test(`invalid target history ${JSON.stringify(item)} preserves bytes`, async () => {
  const f = fixture(); f.put(H, { '2026-11-09': item }); const before = [...f.data]; await assert.rejects(f.save(f.capture())); assert.deepEqual([...f.data], before); assert.deepEqual(f.writes, []);
});
test('unknown progress ID, invalid old progress and unreadable history fail before writes', async () => {
  for (const progress of [{ date: '2026-11-09', completedIds: ['future-id'] }, { date: 'bad', completedIds: [] }, { date: '2026-11-08', completedIds: null }]) {
    const f = fixture(); f.put(P, progress); await assert.rejects(f.save(f.capture())); assert.deepEqual(f.writes, []);
  }
  const f = fixture(); const intent = f.capture(); f.fail((key, op) => key === H && op === 'read'); await assert.rejects(f.save(intent)); assert.deepEqual(f.writes, []);
});

test('stale intent changes old history only, never moves achievement into newer progress', async () => {
  const f = fixture(), intent = f.capture(); f.setDay('2026-11-10'); f.put(P, { date: '2026-11-10', completedIds: ['words'], future: true }); const original = f.data.get(P);
  await f.save(intent); assert.equal(f.data.get(P), original); assert.deepEqual(f.read(H)['2026-11-09'].completedIds, ['kana']); assert.equal(f.read(H)['2026-11-10'], undefined);
  const g = fixture(), old = g.capture(); g.put(P, { date: '2026-11-09', completedIds: ['words'] }); g.setDay('2026-11-10'); await g.save(old); assert.equal(g.read(P).date, '2026-11-09'); assert.deepEqual(g.read(P).completedIds, ['words', 'kana']);
});
test('new day progress does not inherit old IDs; old-day retry with absent progress leaves it absent', async () => {
  const f = fixture(); f.put(P, { date: '2026-11-08', completedIds: ['words'] }); await f.save(f.capture()); assert.deepEqual(f.read(P).completedIds, ['kana']);
  const g = fixture(), old = g.capture(); g.setDay('2026-11-10'); await g.save(old); assert.equal(g.data.has(P), false);
});

for (const key of [J, P, H]) test(`journal/first/second write ${key} failure and retry`, async () => {
  const f = fixture(), intent = f.capture(); f.fail((k, op) => k === key && op === 'set'); await assert.rejects(f.save(intent)); assert.equal(f.data.has(P), false); assert.equal(f.data.has(H), false); f.fail(() => false); await f.save(intent); assert.equal(f.read(H)['2026-11-09'].completedCount, 1);
});
test('rollback failure retains journal and next retry recovers before saving', async () => {
  const f = fixture(); f.put(P, { date: '2026-11-09', completedIds: ['words'], original: true }); const intent = f.capture();
  f.fail((key, op) => key === H && op === 'set' || key === P && op === 'remove'); await assert.rejects(f.save(intent)); assert.equal(f.data.has(J), true);
  f.fail(() => false); await f.save(intent); assert.equal(f.data.has(J), false); assert.deepEqual(f.read(P).completedIds, ['words', 'kana']); assert.equal(f.read(P).original, true);
});
test('malformed journal and foreign journal block without writes', async () => {
  for (const key of [J, 'yeoni-storage-transaction-v1']) { const f = fixture(); f.data.set(key, '{'); await assert.rejects(f.save(f.capture())); assert.deepEqual(f.writes, []); }
});
for (const key of ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1']) test(`scope ${key} changed before or while waiting rejects`, async () => {
  for (const waiting of [false, true]) { const f = fixture(), intent = f.capture(); const pending = waiting ? f.save(intent) : undefined; f.data.set(key, 'changed'); await assert.rejects(pending ?? f.save(intent)); assert.deepEqual(f.writes, []); }
});
test('recovery-induced scope change is checked before completion write', async () => {
  const f = fixture(), intent = f.capture(); f.put(J, { 'language-cloud-sync-epoch': 'restored' }); await assert.rejects(f.save(intent)); assert.equal(f.data.get('language-cloud-sync-epoch'), 'restored'); assert.equal(f.data.has(P), false); assert.equal(f.data.has(H), false);
});
test('abort and stale current-state guard before and after waiting', async () => {
  for (const waiting of [false, true]) {
    const f = fixture(), controller = new AbortController(); if (!waiting) controller.abort(); const pending = f.save(f.capture(), { signal: controller.signal }); if (waiting) controller.abort(); await assert.rejects(pending); assert.deepEqual(f.writes, []);
    const g = fixture(); let current = waiting; const guarded = g.save(g.capture(), { isCurrent: () => current }); current = false; await assert.rejects(guarded); assert.deepEqual(g.writes, []);
  }
});
test('IDB unavailable rejects rather than unsafe fallback', async () => {
  const f = fixture(); f.context.indexedDB = undefined; await assert.rejects(f.save(f.capture())); assert.deepEqual(f.writes, []);
});
test('concurrent duplicate and distinct submissions serialize and preserve union', async () => {
  const f = fixture(), kana = f.capture(), words = f.capture('words'); await Promise.all([f.save(kana), f.save(words), f.save(kana)]); assert.deepEqual(f.read(P).completedIds, ['kana', 'words']); assert.deepEqual(f.read(H)['2026-11-09'].completedIds, ['kana', 'words']);
});
test('rollback restoration write fails, retains journal, then retry restores original metadata', async () => {
  const f = fixture(); f.put(P, { date: '2026-11-09', completedIds: ['words'], original: true });
  f.put(H, { '2026-11-09': { completedIds: ['words'], completedCount: 1, totalCount: 5, custom: 'kept' } });
  const intent = f.capture(); let progressSets = 0;
  f.fail((key, op) => op === 'set' && (key === H || key === P && ++progressSets > 1));
  await assert.rejects(f.save(intent)); assert.equal(f.data.has(J), true);
  f.fail(() => false); await f.save(intent); assert.equal(f.data.has(J), false); assert.equal(f.read(P).original, true); assert.equal(f.read(H)['2026-11-09'].custom, 'kept'); assert.deepEqual(f.read(P).completedIds, ['words', 'kana']);
});
test('journal cleanup failure leaves retryable recovery, not false success', async () => {
  const f = fixture(), intent = f.capture(); f.fail((key, op) => key === J && op === 'remove');
  await assert.rejects(f.save(intent)); assert.equal(f.data.has(J), true);
  f.fail(() => false); await f.save(intent); assert.equal(f.data.has(J), false); assert.deepEqual(f.read(P).completedIds, ['kana']);
});
test('current guard and abort are checked after recovery', async () => {
  for (const abort of [false, true]) {
    const f = fixture(), controller = new AbortController(); const intent = f.capture(); let calls = 0;
    f.put(J, { dailyRoutineProgress: null });
    await assert.rejects(f.save(intent, { signal: controller.signal, isCurrent: () => { calls++; if (calls === 3 && abort) controller.abort(); return calls !== 3 || abort; } }));
    assert.equal(f.data.has(P), false); assert.equal(f.data.has(H), false);
  }
});

for (const [languageOwner, fitnessOwner] of [[null, null], ['', ''], [' ', ' '], ['alice', 'bob'], ['alice', null], [null, 'alice']]) test(`unowned/mismatched cache ${languageOwner}/${fitnessOwner} rejects capture and save`, async () => {
  const f = fixture();
  if (languageOwner === null) f.data.delete('language-cloud-sync-user'); else f.data.set('language-cloud-sync-user', languageOwner);
  if (fitnessOwner === null) f.data.delete('fitness-cloud-sync-user'); else f.data.set('fitness-cloud-sync-user', fitnessOwner);
  assert.throws(() => f.capture());
  // Even a structurally supplied intent with a matching invalid snapshot is refused.
  const intent = { routineId: 'kana', dateKey: '2026-11-09', scope: JSON.stringify([languageOwner, null, fitnessOwner, null, null]) };
  await assert.rejects(f.save(intent)); assert.deepEqual(f.writes, []);
});
for (const key of ['completedCount', 'totalCount']) test(`unsafe integer ${key} preserves originals`, async () => {
  const f = fixture(); f.put(H, { '2026-11-09': { completedIds: [], [key]: Number.MAX_SAFE_INTEGER + 1 } });
  const before = [...f.data]; await assert.rejects(f.save(f.capture())); assert.deepEqual([...f.data], before); assert.deepEqual(f.writes, []);
});
test('recovery that clears ownership prevents completion writes', async () => {
  const f = fixture(), intent = f.capture(); f.put(J, { 'language-cloud-sync-user': null });
  await assert.rejects(f.save(intent)); assert.equal(f.data.has(P), false); assert.equal(f.data.has(H), false);
});

test('current state changing by lock completion rejects stale success even if local batch committed', async () => {
  const f = fixture(); let checks = 0;
  await assert.rejects(f.save(f.capture(), { isCurrent: () => ++checks < 5 }));
  assert.deepEqual(f.read(P).completedIds, ['kana']);
  assert.deepEqual(f.read(H)['2026-11-09'].completedIds, ['kana']);
});
