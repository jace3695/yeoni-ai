import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withChunkBrowser } from './fixtures/chunkReviewStorage.ts';
import { LANGUAGE_TRANSACTION_KEY, LanguageStorageUnavailableError, readOwnedLanguageCacheSnapshot, withLanguageRecordLock } from '../app/data/languageStorageLock.ts';
import { applyLanguageState, clearLanguageLocalState, prepareLanguageLocalState, readLanguageCacheOverview, readLanguageStateSafely, saveLanguageSyncBase } from '../app/data/languageCloudSync.ts';
import { CHUNK_REVIEW_KEY, readChunkReview, rememberChunkAnswer, writeChunkReview } from '../utils/japaneseChunkReview.ts';
import { emptyLevelJourney, chooseJapaneseLevel, learningOwner } from '../utils/japaneseLevelJourney.ts';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const withoutLocks = () => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
const input = (id: string) => ({ lessonId: 'f01', questionId: 'f01-choice', attemptId: id, mode: 'choice' as const, correct: false, neededHelp: false });
const owner = { 'language-cloud-sync-user': 'synthetic-A', 'fitness-cloud-sync-user': 'synthetic-A' };

test('no-WebLocks path supports initialization, answers, snapshot, apply, baseline and sign-out under the same IDB gate', async () => withChunkBrowser(async ({ api, entries, idb }) => {
  withoutLocks();
  await prepareLanguageLocalState('synthetic-A');
  const selected = JSON.stringify(chooseJapaneseLevel(emptyLevelJourney(), 'intermediate', new Date('2026-11-08T00:00:00Z')));
  entries.set('japaneseLevelJourneyV1', selected);
  await Promise.all(['tab-A', 'tab-B'].map(id => writeChunkReview(api, learningOwner(api), latest => rememberChunkAnswer(latest, input(id)))));
  const snapshot = await readLanguageStateSafely();
  await applyLanguageState(snapshot, snapshot);
  await saveLanguageSyncBase('synthetic-A', snapshot);
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['tab-A', 'tab-B']);
  assert.deepEqual(JSON.parse(entries.get('japaneseLevelJourneyV1')!), JSON.parse(selected));
  assert.ok(entries.has('language-cloud-sync-base:synthetic-A'));
  assert.ok(idb.trace.some(item => item.includes(':readwrite')));
  await clearLanguageLocalState();
  assert.equal(entries.has(CHUNK_REVIEW_KEY), false);
}, owner));

test('mixed WebLocks-present and absent callers all wait on the same IDB transaction completion', async () => withChunkBrowser(async ({ api, idb, locks }) => {
  const results: Promise<number>[] = [];
  for (let i = 0; i < 30; i++) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: i % 2 ? { locks } : {} });
    results.push(withLanguageRecordLock(() => {
      idb.trace.push(`callback:${i}`);
      const next = Number(api.getItem('synthetic-counter') ?? 0) + 1;
      api.setItem('synthetic-counter', String(next));
      return next;
    }).then(value => { idb.trace.push(`returned:${i}`); return value; }));
  }
  assert.equal(new Set(await Promise.all(results)).size, 30);
  assert.equal(api.getItem('synthetic-counter'), '30');
  let active = false, completed = 0;
  for (const event of idb.trace) {
    if (event.startsWith('grant:')) { assert.equal(active, false); active = true; }
    if (event.startsWith('callback:')) assert.equal(active, true);
    if (event.startsWith('complete:')) { assert.equal(active, true); active = false; completed++; }
    if (event.startsWith('returned:')) assert.ok(completed > 0);
  }
  assert.equal(completed, 30);
}));

test('constructing a queued transaction never grants permission to execute', async () => withChunkBrowser(async ({ idb }) => {
  withoutLocks(); idb.pause(); let called = 0;
  const pending = withLanguageRecordLock(() => ++called);
  await tick(); await tick(); assert.equal(called, 0);
  assert.ok(idb.trace.some(event => event.startsWith('queue:')));
  idb.resume(); assert.equal(await pending, 1);
}));

test('pre-aborted and queued-aborted callers cannot mutate; a subsequent caller still works', async () => withChunkBrowser(async ({ idb }) => {
  withoutLocks(); let called = 0;
  const early = new AbortController(); early.abort();
  await assert.rejects(withLanguageRecordLock(() => ++called, early.signal), /abort/i);
  assert.equal(idb.trace.length, 0);
  idb.pause(); const queued = new AbortController();
  const pending = withLanguageRecordLock(() => ++called, queued.signal);
  await tick(); queued.abort();
  await assert.rejects(pending, /abort/i);
  idb.resume(); await tick(); await tick(); assert.equal(called, 0);
  assert.equal(await withLanguageRecordLock(() => ++called), 1);
}));

for (const failure of ['openError', 'transactionError', 'requestError'] as const) {
  test(`IDB ${failure} fails closed without WebLocks-only fallback or callback`, async () => withChunkBrowser(async ({ idb }) => {
    idb.controls[failure] = true; let called = 0;
    await assert.rejects(withLanguageRecordLock(() => ++called), LanguageStorageUnavailableError);
    assert.equal(called, 0);
    idb.controls[failure] = false;
    assert.equal(await withLanguageRecordLock(() => ++called), 1);
  }));
}

for (const locks of [false, true]) {
  test(`missing IDB refuses mutation even with WebLocks ${locks ? 'present' : 'absent'}`, async () => withChunkBrowser(async () => {
    if (!locks) withoutLocks();
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    let called = 0;
    await assert.rejects(withLanguageRecordLock(() => ++called), LanguageStorageUnavailableError);
    assert.equal(called, 0);
  }));
}

test('denied IDB property access fails closed', async () => withChunkBrowser(async () => {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get: () => { throw new DOMException('denied', 'SecurityError'); } });
  await assert.rejects(withLanguageRecordLock(() => assert.fail('must not run')), LanguageStorageUnavailableError);
}));

test('blocked open settles promptly and closes a late successful connection without work', async () => withChunkBrowser(async ({ idb }) => {
  withoutLocks(); idb.controls.blocked = true; let called = 0;
  const pending = withLanguageRecordLock(() => ++called);
  await assert.rejects(pending, LanguageStorageUnavailableError);
  idb.releaseOpen(); await tick();
  assert.equal(called, 0);
  assert.equal(idb.trace.some(event => event.startsWith('queue:')), false);
}));

test('timed-out open never executes after later success; timeout is not lock takeover', async (t) => withChunkBrowser(async ({ idb }) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  withoutLocks(); idb.controls.hang = true; let called = 0;
  const pending = withLanguageRecordLock(() => ++called);
  await tick(); t.mock.timers.tick(10_001);
  await assert.rejects(pending, /지연/);
  idb.releaseOpen(); await tick(); assert.equal(called, 0);
}));

test('cancelled open never invokes callback when it later succeeds', async () => withChunkBrowser(async ({ idb }) => {
  withoutLocks(); idb.controls.hang = true; const controller = new AbortController();
  let called = 0;
  const pending = withLanguageRecordLock(() => ++called, controller.signal);
  await tick(); controller.abort(); await assert.rejects(pending, /abort/i);
  idb.releaseOpen(); await tick(); assert.equal(called, 0);
}));

for (const boundary of ['versionChange', 'closeConnections'] as const) {
  test(`${boundary} before grant cancels the queued callback without bypass`, async () => withChunkBrowser(async ({ idb }) => {
    withoutLocks(); idb.pause(); let called = 0;
    const pending = withLanguageRecordLock(() => ++called);
    await tick(); idb[boundary]();
    await assert.rejects(pending, LanguageStorageUnavailableError);
    idb.resume(); await tick(); await tick(); assert.equal(called, 0);
  }));
}

test('callback error is preserved and releases the next transaction', async () => withChunkBrowser(async () => {
  withoutLocks(); const original = new Error('synthetic quota');
  await assert.rejects(withLanguageRecordLock(() => { throw original; }), error => error === original);
  assert.equal(await withLanguageRecordLock(() => 7), 7);
}));

for (const failure of ['abortAfterCallback', 'closeAfterCallback'] as const) {
  test(`${failure} does not claim rollback or automatically repeat localStorage writes`, async () => withChunkBrowser(async ({ idb, api }) => {
    withoutLocks(); idb.controls[failure] = true; let called = 0;
    await assert.rejects(withLanguageRecordLock(() => { called++; api.setItem('synthetic', 'may-have-saved'); }), /반영됐을 수/);
    assert.equal(called, 1); assert.equal(api.getItem('synthetic'), 'may-have-saved');
  }));
}

test('async functions are refused before invocation, and thenable return is detected without retries', async () => withChunkBrowser(async ({ idb }) => {
  withoutLocks(); let called = 0;
  const misuse = withLanguageRecordLock as (run: () => unknown) => Promise<unknown>;
  await assert.rejects(misuse(async () => { called++; return 1; }), /비동기/);
  assert.equal(called, 0); assert.equal(idb.trace.length, 0);
  await assert.rejects(misuse(() => { called++; return Promise.resolve(1); }), /비동기/);
  assert.equal(called, 1);
}));

for (const key of ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1']) {
  test(`IDB-only queued answer rechecks ${key}`, async () => withChunkBrowser(async ({ api, entries, idb }) => {
    withoutLocks(); idb.pause();
    const pending = writeChunkReview(api, learningOwner(api), latest => rememberChunkAnswer(latest, input('stale')));
    await tick(); entries.set(key, key === 'languageRecordResetV1' ? '2026-11-08T00:00:00Z|new' : 'new');
    idb.resume(); await assert.rejects(pending, /계정|기록/);
    assert.equal(entries.has(CHUNK_REVIEW_KEY), false);
  }, owner));
}

test('IDB-only recovery restores the interrupted journal before a new answer', async () => withChunkBrowser(async ({ api, entries }) => {
  withoutLocks(); entries.set(LANGUAGE_TRANSACTION_KEY, JSON.stringify({ savedWords: '["preserved"]' }));
  entries.set('savedWords', '["partial"]');
  await writeChunkReview(api, learningOwner(api), latest => rememberChunkAnswer(latest, input('new')));
  assert.equal(entries.get('savedWords'), '["preserved"]');
  assert.equal(entries.has(LANGUAGE_TRANSACTION_KEY), false);
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['new']);
}, owner));

test('read-only overview never writes and excludes wrong-owner, unowned, or journal-blocked cache', async () => withChunkBrowser(async ({ api, entries }) => {
  withoutLocks(); Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  entries.set('japaneseCurriculumProgressV1', '{"completedLessonIds":["f01","f02"]}');
  entries.set('japaneseLevelJourneyV1', '{"selectedLevel":"intermediate"}');
  entries.set('dailyLearningHistory', '{"2026-11-08":{"completedCount":2}}');
  entries.set('savedWords', '["first","second"]');
  const before = new Map(entries);
  assert.deepEqual(readLanguageCacheOverview(api, 'synthetic-A'), { completedLessons: 2, studyDays: 1, savedWords: 2, selectedLevel: '중급' });
  assert.equal(readLanguageCacheOverview(api, 'synthetic-B'), null);
  assert.deepEqual(entries, before);
  entries.set(LANGUAGE_TRANSACTION_KEY, '{}'); assert.equal(readLanguageCacheOverview(api, 'synthetic-A'), null);
  entries.delete(LANGUAGE_TRANSACTION_KEY); entries.delete('language-cloud-sync-user');
  assert.equal(readLanguageCacheOverview(api, 'synthetic-A'), null);
}, owner));

test('read-only cache snapshot rejects either epoch changing during a read', async () => withChunkBrowser(async ({ api, entries }) => {
  for (const epoch of ['language-cloud-sync-epoch', 'fitness-cloud-sync-epoch']) {
    entries.set(epoch, 'before');
    const racing = { getItem: (key: string) => { if (key === 'savedWords') entries.set(epoch, 'after'); return api.getItem(key); } };
    assert.equal(readOwnedLanguageCacheSnapshot(racing, ['savedWords'], 'synthetic-A'), null);
  }
}, owner));

test('read-only summary rejects malformed data without rewriting it', async () => withChunkBrowser(async ({ api, entries }) => {
  entries.set('savedWords', '{"not":"array"}'); const before = new Map(entries);
  assert.throws(() => readLanguageCacheOverview(api, 'synthetic-A'), /요약 형식/);
  assert.deepEqual(entries, before);
}, owner));

test('read-only fallback is an isolated summary, never ordinary writer children', () => {
  const ui = readFileSync(new URL('../components/LanguageCloudSync.tsx', import.meta.url), 'utf8');
  assert.match(ui, /initialized && status !== "readonly" \? children/);
  assert.match(ui, /if \(!active \|\| !isOwner\(\) \|\| storageUnavailable\) return/);
  assert.match(ui, /setInitialized\(false\)/);
  const readonly = ui.slice(ui.indexOf('function ReadOnlyLanguageCache'), ui.indexOf('export default function'));
  assert.doesNotMatch(readonly, /setItem|removeItem|from\(|\.rpc\(|fetch\(/);
  assert.match(readonly, /yeoni-cloud-session-changed/);
});


test('throwing undefined still rejects and never signals a successful save', async () => withChunkBrowser(async () => {
  withoutLocks();
  let rejected = false;
  await withLanguageRecordLock(() => { throw undefined; }).then(() => assert.fail('must reject'), error => { rejected = true; assert.equal(error, undefined); });
  assert.equal(rejected, true);
}));

test('older AbortSignal without throwIfAborted still saves and cancels through the IDB gate', async () => withChunkBrowser(async ({ api }) => {
  withoutLocks(); const controller = new AbortController();
  Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
  await writeChunkReview(api, learningOwner(api), latest => rememberChunkAnswer(latest, input('older-signal')), controller.signal);
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['older-signal']);
  controller.abort();
  await assert.rejects(writeChunkReview(api, learningOwner(api), latest => rememberChunkAnswer(latest, input('cancelled')), controller.signal), /abort/i);
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['older-signal']);
}, owner));
