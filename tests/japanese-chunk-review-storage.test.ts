import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHUNK_REVIEW_KEY, CHUNK_REVIEW_EVENT, MAX_CHUNK_REVIEW_EVENTS, MAX_CHUNK_REVIEW_BYTES, emptyChunkReview, parseChunkReview, readChunkReview, rememberChunkAnswer, writeChunkReview, mergeChunkReviewSnapshots, chunkReviewItems, dueChunkReviews, type ChunkReviewState } from '../utils/japaneseChunkReview.ts';
import { learningOwner } from '../utils/japaneseLevelJourney.ts';
import { LANGUAGE_STORAGE_KEYS, applyLanguageState, clearLanguageLocalState, mergeLanguageState, mergeLanguageStateFromBase, prepareLanguageLocalState, readLanguageState, saveLanguageSyncBase } from '../app/data/languageCloudSync.ts';
import { APP_RECORD_KEYS } from '../app/data/appRecordReset.ts';
import { LANGUAGE_RECORD_LOCK, LANGUAGE_TRANSACTION_KEY } from '../app/data/languageStorageLock.ts';
import { withChunkBrowser } from './fixtures/chunkReviewStorage.ts';

const date = (day: number, time = '12:00:00') => new Date(`2026-01-${String(day).padStart(2, '0')}T${time}Z`);
const input = (attemptId = 'a', correct = false, neededHelp = false, questionId = 'f01-chunk-meaning') => ({ lessonId: 'f01', questionId, attemptId, correct, neededHelp, mode: 'choice' as const });
const add = (state = emptyChunkReview(), attemptId = 'a', day = 1, correct = false, neededHelp = false) => rememberChunkAnswer(state, input(attemptId, correct, neededHelp), date(day));
const raw = (state: ChunkReviewState) => JSON.stringify(state);
const wrap = (state: ChunkReviewState) => ({ [CHUNK_REVIEW_KEY]: raw(state), ...(state.generation ? { languageRecordResetV1: state.generation } : {}) });
const merged = (...states: ChunkReviewState[]) => parseChunkReview(mergeChunkReviewSnapshots(...states.map(raw)));
const markerA = '2026-01-04T12:00:00Z|a', markerB = '2026-01-04T12:00:00Z|b';

test('first independent success is not a review, while wrong/help and later attempts persist', () => {
  assert.deepEqual(add(emptyChunkReview(), 'clean', 1, true), emptyChunkReview());
  const state = add(add(), 'later', 1, true);
  assert.equal(Object.keys(state.events).length, 2);
  assert.equal(chunkReviewItems(state)[0].wrongAttempts, 1);
  assert.equal(chunkReviewItems(add(emptyChunkReview(), 'help', 1, true, true))[0].helpedAttempts, 1);
});

test('stable retry is idempotent and an attempt ID cannot change its observation', () => {
  const once = add();
  assert.deepEqual(rememberChunkAnswer(once, input(), date(20)), once);
  assert.throws(() => rememberChunkAnswer(once, input('a', true), date(20)), /바꿀/);
  assert.throws(() => mergeChunkReviewSnapshots(raw(once), raw(add(emptyChunkReview(), 'a', 2))), /서로 달라/);
});

test('same-question simultaneous failures and independent successes remain complete events', () => {
  const base = add(), a = add(base, 'remote', 2, true), b = add(base, 'local', 2, false);
  const union = merged(a, b);
  assert.deepEqual(Object.keys(union.events), ['a', 'local', 'remote']);
  assert.equal(chunkReviewItems(union)[0].attempts, 3);
  assert.equal(chunkReviewItems(union)[0].intervalDays, 1);
  assert.equal(union.events.remote.correct, true);
  assert.equal(union.events.local.correct, false);
});

test('valid event union is commutative, associative and idempotent under repeated snapshots', () => {
  const a = add(), b = add(emptyChunkReview(), 'b'), c = add(emptyChunkReview(), 'c');
  assert.equal(mergeChunkReviewSnapshots(raw(a), raw(b)), mergeChunkReviewSnapshots(raw(b), raw(a)));
  assert.deepEqual(merged(merged(a, b), c), merged(a, merged(b, c)));
  assert.deepEqual(merged(a, a, a), a);
  assert.deepEqual(merged(a, b, c, a, b), merged(a, b, c));
});

test('unknown future content IDs and prototype-like IDs are retained without curriculum lookup', () => {
  for (const attemptId of ['constructor', 'toString', 'hasOwnProperty']) {
    const state = rememberChunkAnswer(emptyChunkReview(), { ...input(attemptId), lessonId: 'future-500', questionId: 'future-500-question-99' }, date(1));
    assert.equal(merged(state, state).events[attemptId].lessonId, 'future-500');
  }
});

test('same day wrong then rapid success cannot extend interval or move the due date', () => {
  let state = add();
  for (let i = 0; i < 100; i++) state = rememberChunkAnswer(state, input(`s${i}`, true), new Date(date(1).getTime() + i * 1000));
  const item = chunkReviewItems(state)[0];
  assert.equal(item.intervalDays, 1); assert.deepEqual(item.successDates, []);
  assert.equal(item.nextReviewAt, '2026-01-02T12:00:00.000Z');
});

test('UTC midnight and Korean morning boundary do not allow interval growth before 24 hours', () => {
  const state = rememberChunkAnswer(emptyChunkReview(), input(), new Date('2026-01-01T23:59:00Z'));
  const retry = rememberChunkAnswer(state, input('retry', true), new Date('2026-01-02T00:01:00Z'));
  assert.equal(chunkReviewItems(retry)[0].intervalDays, 1);
  assert.equal(chunkReviewItems(retry)[0].nextReviewAt, '2026-01-02T23:59:00.000Z');
});

test('due independent recall advances conservatively and new failure resets the interval', () => {
  let state = add();
  state = add(state, 's1', 2, true); assert.equal(chunkReviewItems(state)[0].intervalDays, 3);
  state = add(state, 'too-early', 3, true); assert.equal(chunkReviewItems(state)[0].intervalDays, 3);
  state = add(state, 's2', 5, true); assert.equal(chunkReviewItems(state)[0].intervalDays, 7);
  assert.equal(dueChunkReviews(state, date(11).getTime()).length, 0);
  assert.equal(dueChunkReviews(state, date(12).getTime()).length, 1);
  state = add(state, 'wrong-again', 12); assert.equal(chunkReviewItems(state)[0].intervalDays, 1);
});

for (const invalid of ['{broken', 'null', '[]', '{"version":2,"events":{}}', '{"version":1,"events":{}}', raw({ ...emptyChunkReview(), extra: 1 } as ChunkReviewState)]) {
  test(`malformed/newer/unknown fields are preserved: ${invalid.slice(0, 40)}`, async () => withChunkBrowser(async ({ api, entries }) => {
    entries.set(CHUNK_REVIEW_KEY, invalid);
    assert.throws(() => readChunkReview(api));
    await assert.rejects(writeChunkReview(api, learningOwner(api), state => add(state)));
    assert.equal(entries.get(CHUNK_REVIEW_KEY), invalid);
  }));
}

test('size/count caps fail closed without trimming history, including an oversized union', () => {
  const many = emptyChunkReview();
  for (let i = 0; i < MAX_CHUNK_REVIEW_EVENTS; i++) many.events[`e${i}`] = { ...input(`e${i}`), answeredAt: date(1).toISOString() };
  assert.equal(Object.keys(parseChunkReview(raw(many)).events).length, MAX_CHUNK_REVIEW_EVENTS);
  assert.throws(() => add(many, 'overflow'), /한도/);
  assert.throws(() => mergeChunkReviewSnapshots(raw(many), raw(add())), /한도/);
  assert.equal(Object.keys(many.events).length, MAX_CHUNK_REVIEW_EVENTS);
  assert.throws(() => parseChunkReview(' '.repeat(MAX_CHUNK_REVIEW_BYTES + 1)), /한도/);
});

test('local persistence survives reread and cannot delete existing events through stale updates', async () => withChunkBrowser(async ({ api, entries }) => {
  entries.set('japaneseCurriculumProgressV1', '{"original":true}');
  const owner = learningOwner(api);
  await writeChunkReview(api, owner, () => add());
  await writeChunkReview(api, owner, () => add(emptyChunkReview(), 'b'));
  assert.equal(Object.keys(readChunkReview(api).events).length, 2);
  await writeChunkReview(api, owner, state => { state.events = {}; return state; });
  assert.equal(Object.keys(readChunkReview(api).events).length, 2);
  assert.equal(entries.get('japaneseCurriculumProgressV1'), '{"original":true}');
}));

test('two tabs submitting simultaneously serialize under the same lock and both survive', async () => withChunkBrowser(async ({ api }) => {
  const owner = learningOwner(api);
  await Promise.all([writeChunkReview(api, owner, state => add(state, 'tab-A')), writeChunkReview(api, owner, state => add(state, 'tab-B'))]);
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['tab-A', 'tab-B']);
}));

for (const key of ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1']) {
  test(`owner fence rejects a queued write after ${key} changes`, async () => withChunkBrowser(async ({ api, entries, locks }) => {
    let unlock!: () => void;
    const held = locks.request(LANGUAGE_RECORD_LOCK, {}, () => new Promise<void>(resolve => { unlock = resolve; }));
    await new Promise<void>(resolve => setImmediate(resolve));
    const pending = writeChunkReview(api, learningOwner(api), state => add(state));
    entries.set(key, key === 'languageRecordResetV1' ? markerA : 'changed');
    unlock(); await held;
    await assert.rejects(pending, /계정|기록/);
    assert.equal(entries.has(CHUNK_REVIEW_KEY), false);
  }));
}

test('aborting a queued write does not persist, and unsupported locks do not falsely save', async () => withChunkBrowser(async ({ api, entries, locks }) => {
  let unlock!: () => void;
  const held = locks.request(LANGUAGE_RECORD_LOCK, {}, () => new Promise<void>(resolve => { unlock = resolve; }));
  await new Promise<void>(resolve => setImmediate(resolve));
  const controller = new AbortController();
  const pending = writeChunkReview(api, learningOwner(api), state => add(state), controller.signal);
  controller.abort(); unlock(); await held;
  await assert.rejects(pending, /abort/i); assert.equal(entries.has(CHUNK_REVIEW_KEY), false);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  await assert.rejects(writeChunkReview(api, learningOwner(api), state => add(state)), /지원/);
  assert.deepEqual(readChunkReview(api), emptyChunkReview());
}));

test('quota failure retains original bytes and retry with same event succeeds once', async () => withChunkBrowser(async ({ api, entries }) => {
  entries.set(CHUNK_REVIEW_KEY, raw(add())); const before = entries.get(CHUNK_REVIEW_KEY);
  const owner = learningOwner(api), failing = { ...api, setItem: () => { throw new Error('quota'); } };
  await assert.rejects(writeChunkReview(failing, owner, state => add(state, 'retry')), /저장하지 못/);
  assert.equal(entries.get(CHUNK_REVIEW_KEY), before);
  await writeChunkReview(api, owner, state => add(state, 'retry'));
  await writeChunkReview(api, owner, state => add(state, 'retry'));
  assert.equal(Object.keys(readChunkReview(api).events).length, 2);
}));

test('baseline and old clients omitting the key are not deletion instructions', () => {
  const state = add();
  for (const result of [mergeLanguageState(wrap(state), {}), mergeLanguageState({}, wrap(state)), mergeLanguageStateFromBase(wrap(state), {}, wrap(state)), mergeLanguageStateFromBase(wrap(state), {}, {})]) {
    assert.deepEqual(parseChunkReview(result[CHUNK_REVIEW_KEY]), state);
  }
});

test('latest explicit generation defeats stale answers and ties converge in both directions', () => {
  const before = wrap(add()), resetA = { languageRecordResetV1: markerA }, resetB = wrap(add(emptyChunkReview(markerB), 'new'));
  for (const result of [mergeLanguageState(resetA, before), mergeLanguageState(before, resetA)]) assert.equal(result[CHUNK_REVIEW_KEY], undefined);
  assert.deepEqual(mergeLanguageState(resetA, resetB), mergeLanguageState(resetB, resetA));
  const newerBase = mergeLanguageStateFromBase(resetB, before, before);
  assert.equal(newerBase.languageRecordResetV1, markerB);
  assert.deepEqual(Object.keys(parseChunkReview(newerBase[CHUNK_REVIEW_KEY]).events), ['new']);
});

test('old server reset leaving old payload cannot resurrect events under a new marker', async () => withChunkBrowser(async ({ api, entries }) => {
  entries.set(CHUNK_REVIEW_KEY, raw(add())); entries.set('languageRecordResetV1', markerA);
  assert.deepEqual(readChunkReview(api), emptyChunkReview(markerA));
  const result = mergeLanguageState({ ...wrap(add()), languageRecordResetV1: markerA }, wrap(add()));
  assert.deepEqual(parseChunkReview(result[CHUNK_REVIEW_KEY]), emptyChunkReview(markerA));
  await writeChunkReview(api, learningOwner(api), state => add(state, 'after-reset'));
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['after-reset']);
}));

test('payload claiming an unconfirmed future generation fails closed', () => {
  assert.throws(() => mergeLanguageState({ [CHUNK_REVIEW_KEY]: raw(add(emptyChunkReview(markerB))) }, {}), /기준/);
});

test('same-tab apply retains a key absent from old remote, notifies changes, and validates before touching legacy data', async () => withChunkBrowser(async ({ api, entries, events }) => {
  entries.set(CHUNK_REVIEW_KEY, raw(add())); entries.set('savedWords', '["keep"]');
  await applyLanguageState({ savedWords: '["keep"]' });
  assert.equal(Object.keys(readChunkReview(api).events).length, 1);
  const before = new Map(entries);
  await assert.rejects(applyLanguageState({ savedWords: '[]', [CHUNK_REVIEW_KEY]: '{bad' }));
  assert.deepEqual(entries, before);
  await applyLanguageState(wrap(add(emptyChunkReview(), 'remote')));
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['a', 'remote']);
  assert.ok(events.includes(CHUNK_REVIEW_EVENT));
}));

test('apply waiting for lock rereads both chunk and existing curriculum updates', async () => withChunkBrowser(async ({ api, entries, locks }) => {
  const base = { ...wrap(add()), japaneseCurriculumProgressV1: '{"completedLessonIds":[]}' };
  for (const [key, value] of Object.entries(base)) entries.set(key, value);
  let unlock!: () => void;
  const held = locks.request(LANGUAGE_RECORD_LOCK, {}, () => new Promise<void>(resolve => { unlock = resolve; }));
  await new Promise<void>(resolve => setImmediate(resolve));
  const pending = applyLanguageState({ ...base, [CHUNK_REVIEW_KEY]: raw(add(add(), 'remote')) }, base);
  entries.set('japaneseCurriculumProgressV1', '{"completedLessonIds":["f01"]}');
  entries.set(CHUNK_REVIEW_KEY, raw(add(add(), 'during-wait')));
  unlock(); await held; await pending;
  assert.equal(entries.get('japaneseCurriculumProgressV1'), '{"completedLessonIds":["f01"]}');
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['a', 'during-wait', 'remote']);
}));

test('transaction journal failure and midway quota failure roll back all language keys', async () => withChunkBrowser(async ({ api, entries }) => {
  entries.set('savedWords', '["keep"]'); entries.set(CHUNK_REVIEW_KEY, raw(add()));
  const before = new Map(entries), set = api.setItem;
  for (const failureKey of [LANGUAGE_TRANSACTION_KEY, CHUNK_REVIEW_KEY]) {
    let failed = false;
    api.setItem = (key, value) => { if (key === failureKey && !failed) { failed = true; throw new Error('quota'); } set(key, value); };
    await assert.rejects(applyLanguageState({ savedWords: '[]', [CHUNK_REVIEW_KEY]: raw(add(add(), 'remote')) }), /quota/);
    assert.deepEqual(entries, before);
  }
}));

test('unfinished Japanese transaction is unreadable until lock-held recovery; next answer survives later reads', async () => withChunkBrowser(async ({ api, entries }) => {
  entries.set(CHUNK_REVIEW_KEY, raw(add(emptyChunkReview(), 'partial')));
  entries.set(LANGUAGE_TRANSACTION_KEY, JSON.stringify({ [CHUNK_REVIEW_KEY]: raw(add()) }));
  assert.throws(() => readChunkReview(api), /복구/);
  await writeChunkReview(api, learningOwner(api), state => add(state, 'after-recovery'));
  assert.deepEqual(Object.keys(readChunkReview(api).events), ['a', 'after-recovery']);
  assert.equal(entries.has(LANGUAGE_TRANSACTION_KEY), false);
  assert.deepEqual(parseChunkReview(readLanguageState()[CHUNK_REVIEW_KEY]), readChunkReview(api));
}));

test('another app journal is preserved and blocks a new answer rather than rolling it back later', async () => withChunkBrowser(async ({ api, entries }) => {
  entries.set(CHUNK_REVIEW_KEY, raw(add())); entries.set('yeoni-storage-transaction-v1', JSON.stringify({ [CHUNK_REVIEW_KEY]: null }));
  const before = new Map(entries);
  await assert.rejects(writeChunkReview(api, learningOwner(api), state => add(state, 'new')), /복구/);
  assert.deepEqual(entries, before);
}));

test('clear/prepare isolate accounts, invalidate pending owner, and stale acknowledgement cannot recreate a base', async () => withChunkBrowser(async ({ api, entries }) => {
  await prepareLanguageLocalState('A');
  const owner = learningOwner(api);
  await writeChunkReview(api, owner, state => add(state));
  await saveLanguageSyncBase('A', readLanguageState());
  await clearLanguageLocalState();
  assert.equal(entries.has(CHUNK_REVIEW_KEY), false);
  assert.equal(entries.has('language-cloud-sync-base:A'), false);
  await assert.rejects(writeChunkReview(api, owner, state => add(state)), /계정/);
  await assert.rejects(saveLanguageSyncBase('A', wrap(add())), /계정/);
  await prepareLanguageLocalState('B');
  assert.deepEqual(readChunkReview(api), emptyChunkReview());
}));

test('new key is scoped to language sync/reset; hook covers owner, journal and reset without network', () => {
  assert.ok(LANGUAGE_STORAGE_KEYS.includes(CHUNK_REVIEW_KEY)); assert.ok(APP_RECORD_KEYS.language.includes(CHUNK_REVIEW_KEY));
  assert.ok(!APP_RECORD_KEYS.fitness.includes(CHUNK_REVIEW_KEY));
  const hook = readFileSync(new URL('../components/language/useChunkReview.ts', import.meta.url), 'utf8');
  assert.match(hook, /await writeChunkReview/); assert.match(hook, /lifetime.current\?\.abort/);
  assert.match(hook, /next.owner !== learningOwner/); assert.match(hook, /recordReset === 'running'/);
  assert.doesNotMatch(hook, /fetch\(|supabase|MediaRecorder|getUserMedia/);
});

test('contaminated journal cannot recover or erase unrelated, auth, or journal keys', async () => withChunkBrowser(async ({ api, entries }) => {
  for (const key of ['other-app', 'sb-auth-token', 'yeoni-storage-transaction-v1', LANGUAGE_TRANSACTION_KEY, 'language-cloud-sync-base:', 'language-cloud-sync-base:../other']) {
    entries.clear(); entries.set('other-app', 'keep'); entries.set(CHUNK_REVIEW_KEY, raw(add()));
    entries.set(LANGUAGE_TRANSACTION_KEY, JSON.stringify({ [key]: null }));
    const before = new Map(entries);
    await assert.rejects(writeChunkReview(api, learningOwner(api), state => add(state, 'blocked')), /범위/);
    assert.deepEqual(entries, before);
  }
}));

test('runtime snapshot waits for a complete transaction and checks lifetime before any read', async () => withChunkBrowser(async ({ api, entries, locks }) => {
  const { readLanguageStateSafely } = await import('../app/data/languageCloudSync.ts');
  let unlock!: () => void;
  const held = locks.request(LANGUAGE_RECORD_LOCK, {}, () => new Promise<void>(resolve => { unlock = resolve; }));
  await new Promise<void>(resolve => setImmediate(resolve));
  let readComplete = false;
  const snapshot = readLanguageStateSafely().then(value => { readComplete = true; return value; });
  entries.set(LANGUAGE_TRANSACTION_KEY, JSON.stringify({ savedWords: '["before"]' }));
  entries.set('savedWords', '["partial"]');
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(readComplete, false);
  entries.set('savedWords', '["complete"]'); entries.delete(LANGUAGE_TRANSACTION_KEY);
  unlock(); await held;
  assert.equal((await snapshot).savedWords, '["complete"]');
  await assert.rejects(readLanguageStateSafely(() => { throw new Error('owner changed'); }), /owner changed/);
  assert.equal(api.getItem('savedWords'), '["complete"]');
}));

test('calendar-style cache reads exclude an old owner after unsupported cleanup without deleting data', async () => withChunkBrowser(async ({ api, entries }) => {
  const { readOwnedLanguageCache } = await import('../app/data/languageStorageLock.ts');
  entries.set('language-cloud-sync-user', 'A'); entries.set('fitness-cloud-sync-user', 'A'); entries.set('dailyLearningHistory', '{"old":"history"}');
  assert.equal(readOwnedLanguageCache(api, 'dailyLearningHistory', 'A'), '{"old":"history"}');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  await assert.rejects(clearLanguageLocalState(), /지원/);
  entries.set('fitness-cloud-sync-user', 'B');
  assert.equal(readOwnedLanguageCache(api, 'dailyLearningHistory', 'B'), null);
  assert.equal(entries.get('dailyLearningHistory'), '{"old":"history"}');
  entries.set('language-cloud-sync-user', 'B'); entries.set(LANGUAGE_TRANSACTION_KEY, '{}');
  assert.equal(readOwnedLanguageCache(api, 'dailyLearningHistory', 'B'), null);
}));
