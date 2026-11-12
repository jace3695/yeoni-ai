import { syntheticIndexedDB } from "./fixtures/languageIndexedDB.ts";
import { syntheticLocks, withChunkBrowser } from "./fixtures/chunkReviewStorage.ts";
import { initializeCurriculumSync } from './fixtures/curriculumUiHarness.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLanguageState, mergeLanguageState, mergeLanguageStateFromBase, prepareLanguageLocalState } from '../app/data/languageCloudSync.ts';
import { LEVEL_JOURNEY_EVENT, LEVEL_JOURNEY_KEY, chooseJapaneseLevel, emptyLevelJourney, mergeLevelJourneySnapshots, readLevelJourney, rememberUpperAnswer } from '../utils/japaneseLevelJourney.ts';
import { LANGUAGE_TRANSACTION_KEY } from '../app/data/languageStorageLock.ts';

const stamp = (date: string) => new Date(`${date}T12:00:00Z`);
const wrap = (state: unknown) => ({ [LEVEL_JOURNEY_KEY]: JSON.stringify(state) });
const add = (state: ReturnType<typeof emptyLevelJourney>, q: string, date = '2026-01-01', correct = true) => rememberUpperAnswer(state, { lessonId: 'upper-01', questionId: q, attemptId: `${q}-${date}-${correct}`, correct, neededHelp: false }, stamp(date));

test('different devices retain independent answers and unit practice instead of choosing a whole string', () => {
  const base = emptyLevelJourney();
  const remote = { ...add(base, 'q1'), practicedUnits: { 'upper-01': stamp('2026-01-01').toISOString() } };
  const local = { ...add(base, 'q2'), practicedUnits: { 'upper-02': stamp('2026-01-02').toISOString() } };
  const merged = JSON.parse(mergeLanguageStateFromBase(wrap(base), wrap(remote), wrap(local))[LEVEL_JOURNEY_KEY] as string);
  assert.deepEqual(Object.keys(merged.answers).sort(), ['q1', 'q2']);
  assert.deepEqual(Object.keys(merged.practicedUnits).sort(), ['upper-01', 'upper-02']);
  const initialMerge = JSON.parse(mergeLanguageState(wrap(remote), wrap(local))[LEVEL_JOURNEY_KEY] as string);
  assert.deepEqual(Object.keys(initialMerge.answers).sort(), ['q1', 'q2']);
});

test('a later explicit level choice is not undone by another device answering a question', () => {
  const base = chooseJapaneseLevel(emptyLevelJourney(), 'beginner', stamp('2026-01-01'));
  const remote = chooseJapaneseLevel(base, 'intermediate', stamp('2026-01-02'));
  const local = add(base, 'q2', '2026-01-05');
  const result = JSON.parse(mergeLevelJourneySnapshots(JSON.stringify(base), JSON.stringify(remote), JSON.stringify(local)));
  assert.equal(result.selectedLevel, 'intermediate'); assert.ok(result.answers.q2);
});

test('conflicting explicit choices use their own times with symmetric results', () => {
  const base = emptyLevelJourney();
  const remote = chooseJapaneseLevel(base, 'intermediate', stamp('2026-01-02'));
  const local = chooseJapaneseLevel(base, 'advanced', stamp('2026-01-03'));
  const merge = (r: unknown, l: unknown) => JSON.parse(mergeLevelJourneySnapshots(JSON.stringify(base), JSON.stringify(r), JSON.stringify(l)));
  assert.equal(merge(remote, local).selectedLevel, 'advanced');
  assert.deepEqual(merge(remote, local), merge(local, remote));
});

test('same-question conflict takes a whole recent observation, including a recent failure', () => {
  const base = emptyLevelJourney();
  const remote = add(base, 'q1', '2026-01-01');
  const local = add(base, 'q1', '2026-01-02', false);
  const result = JSON.parse(mergeLevelJourneySnapshots(JSON.stringify(base), JSON.stringify(remote), JSON.stringify(local)));
  assert.equal(result.answers.q1.correct, false);
  assert.deepEqual(result.answers.q1.successDates, []);
});

test('newer explicit reset wins and never resurrects old question records', () => {
  const base = wrap(add(emptyLevelJourney(), 'q1'));
  const reset = { languageRecordResetV1: '2026-01-05T12:00:00Z|synthetic' };
  const modified = wrap(add(add(emptyLevelJourney(), 'q1'), 'q2'));
  const result = mergeLanguageStateFromBase(base, reset, modified);
  assert.equal(result[LEVEL_JOURNEY_KEY], undefined);
  assert.equal(result.languageRecordResetV1, reset.languageRecordResetV1);
});

test('malformed cloud journey blocks merge rather than erasing valid records', () => {
  assert.throws(() => mergeLanguageState(wrap(emptyLevelJourney()), { [LEVEL_JOURNEY_KEY]: '{bad' }));
});

test('same-tab remote apply notifies the visible journey and account preparation clears it', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalIDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: syntheticIndexedDB().factory });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: syntheticLocks() } });
  const entries = new Map<string, string>([['language-cloud-sync-user', 'synthetic-A']]);
  const events: string[] = [];
  const localStorage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage, dispatchEvent: (event: Event) => { events.push(event.type); return true; } } });
  try {
    const next = wrap(chooseJapaneseLevel(emptyLevelJourney(), 'intermediate', stamp('2026-01-01')));
    await applyLanguageState(next); assert.deepEqual(events, [LEVEL_JOURNEY_EVENT]);
    await applyLanguageState(next); assert.deepEqual(events, [LEVEL_JOURNEY_EVENT]);
    await applyLanguageState({ ...next, japaneseCurriculumProgressV1: '{"completedLessonIds":["f01"]}' });
    assert.deepEqual(events, [LEVEL_JOURNEY_EVENT, LEVEL_JOURNEY_EVENT]);
    await prepareLanguageLocalState('synthetic-B');
    assert.equal(entries.has(LEVEL_JOURNEY_KEY), false);
    assert.equal(entries.get('language-cloud-sync-user'), 'synthetic-B');
  } finally {
    if (originalIDB) Object.defineProperty(globalThis, "indexedDB", originalIDB); else Reflect.deleteProperty(globalThis, "indexedDB");
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else Reflect.deleteProperty(globalThis, 'navigator');
    if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window');
  }
});

// Preserve every own JSON key without matcher constructor/prototype heuristics.
const contents = (value: unknown): unknown => Array.isArray(value) ? ['array', value.map(contents)]
  : value !== null && typeof value === 'object' ? ['object', Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, contents(item)])]
    : ['value', value];
const sameContents = (actual: unknown, expected: unknown) => assert.deepEqual(contents(actual), contents(expected));
const syntheticAnswer = (id: string, date = '2001-01-01T00:00:00.000Z') => ({
  lessonId: 'synthetic-retired-lesson', questionId: id, lastAttemptId: `synthetic-history:${id}:${date}`,
  lastAnsweredAt: date, correct: false, neededHelp: false, attempts: 1, intervalDays: 1,
  nextReviewAt: '2001-01-04T00:00:00.000Z', successDates: [],
});
const accepted = (raw: string) => readLevelJourney({ getItem: () => raw, setItem: () => assert.fail('Read-only acceptance') });
const merge = (base: unknown, remote: unknown, local: unknown) => JSON.parse(mergeLevelJourneySnapshots(JSON.stringify(base), JSON.stringify(remote), JSON.stringify(local)));
const extension = <T,>(value: T) => ({ ...emptyLevelJourney(), extension: value });

for (const field of ['answers', 'practicedUnits'] as const) for (const id of ['synthetic-retired', '__proto__', 'constructor', 'prototype']) {
  test(`own ${field} key ${id} retains incoming values in all eight base/remote/local presence combinations`, () => {
    const prototype = Object.getOwnPropertyDescriptors(Object.prototype);
    const dates = ['2001-01-01T00:00:00.000Z', '2001-01-02T00:00:00.000Z', '2001-01-03T00:00:00.000Z'];
    for (let mask = 0; mask < 8; mask++) {
      const inputs = dates.map((date, side) => ({ ...emptyLevelJourney(),
        [field]: Object.fromEntries(mask & (1 << side) ? [[id, field === 'answers' ? syntheticAnswer(id, date) : date]] : []),
      }));
      const raw = inputs.map(value => JSON.stringify(value)); raw.forEach(accepted);
      const expectedSide = mask & 4 ? 2 : mask & 2 ? 1 : null;
      const expected = expectedSide === null ? {} : inputs[expectedSide][field];
      for (const order of [[1, 2], [2, 1]]) {
        const result = accepted(mergeLevelJourneySnapshots(raw[0], raw[order[0]], raw[order[1]]));
        sameContents(result[field], expected);
        assert.equal(Object.hasOwn(result[field], id), expectedSide !== null);
        assert.equal(Object.getPrototypeOf(result[field]), Object.prototype);
        const caller = mergeLanguageStateFromBase(wrap(inputs[0]), wrap(inputs[order[0]]), wrap(inputs[order[1]]));
        sameContents(accepted(caller[LEVEL_JOURNEY_KEY] as string)[field], expected);
      }
      assert.deepEqual(inputs.map(value => JSON.stringify(value)), raw);
    }
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype);
  });
}

test('safe map construction preserves whole observations, equal-clock tie breaks, and nested answer fields', () => {
  const base = emptyLevelJourney();
  const a = syntheticAnswer('__proto__'), b = { ...a, lastAttemptId: 'synthetic-other', correct: true, successDates: ['2001-01-01'] };
  const remote = { ...base, answers: Object.fromEntries([['__proto__', a]]) };
  const local = { ...base, answers: Object.fromEntries([['__proto__', b]]) };
  const result = merge(base, remote, local);
  sameContents(result, merge(base, local, remote));
  const winner = JSON.stringify(a).localeCompare(JSON.stringify(b)) >= 0 ? a : b;
  sameContents(result.answers.__proto__, winner);
  const extra = Object.fromEntries([...Object.entries(a), ['constructor', { retained: true }], ['__proto__', { nested: [false, 0, '0', null] }]]);
  const snapshot = { ...base, answers: Object.fromEntries([['__proto__', extra]]) };
  sameContents(merge(snapshot, snapshot, snapshot), snapshot);
  const selected = chooseJapaneseLevel(base, 'intermediate', stamp('2001-01-01'));
  const other = chooseJapaneseLevel(base, 'advanced', stamp('2001-01-01'));
  sameContents(merge(base, selected, other), merge(base, other, selected));
});

test('identical accepted snapshots retain unknown root and nested own special fields despite object reordering', () => {
  const prototype = Object.getOwnPropertyDescriptors(Object.prototype);
  const special = Object.fromEntries([['__proto__', { keep: [null, false, 0, '0'] }], ['constructor', { keep: true }], ['prototype', [1, 1, 2]]]);
  const state = Object.fromEntries([...Object.entries(extension({ nested: special, finite: 1e308 })), ...Object.entries(special)]);
  const reordered = (value: unknown): unknown => Array.isArray(value) ? value.map(reordered)
    : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reordered(item)])) : value;
  accepted(JSON.stringify(state));
  sameContents(merge(state, reordered(state), state), state);
  sameContents(merge(state, state, reordered(state)), state);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype);
});

test('extensions retain one-sided additions, nonconflicting edits, and disjoint nested object changes', () => {
  const base = extension({ left: 0, right: 0, special: Object.fromEntries([['__proto__', { keep: true }]]) });
  const remote = extension({ ...base.extension, left: 1 });
  const local = extension({ ...base.extension, right: 2 });
  sameContents(merge(base, remote, local), extension({ ...base.extension, left: 1, right: 2 }));
  sameContents(merge(base, local, remote), merge(base, remote, local));
  for (const value of [null, false, 0, '', [], {}, [1, 1, 2], { constructor: { keep: true } }]) {
    sameContents(merge(emptyLevelJourney(), extension(value), emptyLevelJourney()), extension(value));
    sameContents(merge(emptyLevelJourney(), emptyLevelJourney(), extension(value)), extension(value));
  }
  sameContents(merge(emptyLevelJourney(), extension({ a: 1 }), extension({ b: 2 })), extension({ a: 1, b: 2 }));
  sameContents(merge(extension(1), extension(2), extension(1)), extension(2));
  sameContents(merge(extension([1]), extension({ replaced: true }), extension([1])), extension({ replaced: true }));
  sameContents(merge(extension(1), extension(2), extension(2)), extension(2));
  const separateRoots = merge(emptyLevelJourney(), { ...emptyLevelJourney(), first: null }, { ...emptyLevelJourney(), second: false });
  sameContents(separateRoots, { ...emptyLevelJourney(), first: null, second: false });
  const prototype = Object.getOwnPropertyDescriptors(Object.prototype);
  const specialRemote = extension(Object.fromEntries([['__proto__', { a: 1 }], ['constructor', { keep: true }]]));
  const specialLocal = extension(Object.fromEntries([['__proto__', { b: 2 }], ['prototype', false]]));
  const specialExpected = extension(Object.fromEntries([['__proto__', { a: 1, b: 2 }], ['constructor', { keep: true }], ['prototype', false]]));
  sameContents(merge(emptyLevelJourney(), specialRemote, specialLocal), specialExpected);
  sameContents(merge(emptyLevelJourney(), specialLocal, specialRemote), specialExpected);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype);
});

test('both sides may omit an unknown field without resurrecting base-only root or nested data', () => {
  sameContents(merge(extension({ old: true }), emptyLevelJourney(), emptyLevelJourney()), emptyLevelJourney());
  sameContents(merge(extension({ old: true, keep: 1 }), extension({ keep: 1 }), extension({ keep: 1 })), extension({ keep: 1 }));
  // Recursion must not revive a jointly removed field while combining other edits.
  sameContents(merge(extension({ old: true, a: 0, b: 0 }), extension({ a: 1, b: 0 }), extension({ a: 0, b: 2 })), extension({ a: 1, b: 2 }));
});

const extensionConflicts: [unknown, unknown, unknown][] = [
  [extension(1), emptyLevelJourney(), extension(1)],
  [extension(1), emptyLevelJourney(), extension(2)],
  [extension({ a: 1 }), extension({}), extension({ a: 1 })],
  [extension({ a: 1, b: 0 }), extension({ b: 0 }), extension({ a: 1, b: 2 })],
  [extension({ a: null }), extension({}), extension({ a: null })],
  [extension(1), extension(2), extension(3)],
  [extension([1, 2]), extension([2, 1]), extension([1, 2, 1])],
  [extension(1), extension({ a: 1 }), extension([1])],
  [emptyLevelJourney(), extension(1), extension(2)],
  [extension(1), extension({ a: 1 }), extension({ b: 2 })],
];
test('opaque extension conflicts and unilateral omissions stop in both side orders without changing inputs', () => {
  for (const inputs of extensionConflicts) {
    const raw = inputs.map(value => JSON.stringify(value)); raw.forEach(accepted);
    for (const [remote, local] of [[1, 2], [2, 1]]) {
      assert.throws(() => mergeLevelJourneySnapshots(raw[0], raw[remote], raw[local]), /추가 기록.*보존/);
      const states = raw.map(value => ({ [LEVEL_JOURNEY_KEY]: value }));
      const before = states.map(value => JSON.stringify(value));
      assert.throws(() => mergeLanguageStateFromBase(states[0], states[remote], states[local]), /추가 기록.*보존/);
      assert.deepEqual(states.map(value => JSON.stringify(value)), before);
    }
    assert.deepEqual(inputs.map(value => JSON.stringify(value)), raw);
  }
});

const unsafeJourneyRaws = [
  '{"version":1,"selectedLevel":"beginner","answers":{},"practicedUnits":{},"extension":{"nested":[1e400]}}',
  '{"version":1,"selectedLevel":"beginner","answers":{},"practicedUnits":{},"extension":{"nested":[-0]}}',
  JSON.stringify({ ...emptyLevelJourney(), answers: { q: { ...syntheticAnswer('q'), extension: 'REPLACE' } } }).replace('"REPLACE"', '1e400'),
  JSON.stringify({ ...emptyLevelJourney(), answers: { q: { ...syntheticAnswer('q'), extension: 'REPLACE' } } }).replace('"REPLACE"', '-0'),
];
test('nonfinite and negative-zero values in any input stop before lossy reserialization', () => {
  for (const unsafe of unsafeJourneyRaws) {
    accepted(unsafe);
    for (let side = 0; side < 3; side++) {
      const raw = Array.from({ length: 3 }, (_, index) => side === index ? unsafe : JSON.stringify(emptyLevelJourney()));
      const before = [...raw];
      assert.throws(() => mergeLevelJourneySnapshots(raw[0], raw[1], raw[2]), /손실 없이.*보존/);
      const states = raw.map(value => ({ [LEVEL_JOURNEY_KEY]: value }));
      assert.throws(() => mergeLanguageStateFromBase(states[0], states[1], states[2]), /손실 없이.*보존/);
      assert.deepEqual(raw, before);
    }
  }
});

test('explicit newer reset still removes old conflicting extensions and lossy older-generation history', () => {
  for (const old of [JSON.stringify(extension({ a: 1 })), ...unsafeJourneyRaws]) {
    const reset = { languageRecordResetV1: '2026-01-05T12:00:00Z|synthetic' };
    const result = mergeLanguageStateFromBase({ [LEVEL_JOURNEY_KEY]: old }, reset, wrap(extension({ a: 2 })));
    assert.equal(result[LEVEL_JOURNEY_KEY], undefined);
    assert.equal(result.languageRecordResetV1, reset.languageRecordResetV1);
  }
});

const failureRaws = [
  ...[extensionConflicts[0], extensionConflicts[2], extensionConflicts[5]].map(values => values.map(value => JSON.stringify(value))),
  [JSON.stringify(emptyLevelJourney()), unsafeJourneyRaws[0], JSON.stringify(emptyLevelJourney())],
];
test('actual local-apply caller rejects extension failures with zero storage writes and exact raw bytes', async () => {
  for (const [base, remote, local] of failureRaws) await withChunkBrowser(async ({ api, entries, events }) => {
    const initial = [...entries]; let writes = 0;
    const set = api.setItem, remove = api.removeItem;
    api.setItem = (key, value) => { writes++; set(key, value); };
    api.removeItem = key => { writes++; remove(key); };
    await assert.rejects(applyLanguageState({ [LEVEL_JOURNEY_KEY]: remote }, { [LEVEL_JOURNEY_KEY]: base }), /보존/);
    assert.equal(writes, 0); assert.deepEqual([...entries], initial); assert.deepEqual(events, []);
    assert.equal(entries.get(LEVEL_JOURNEY_KEY), local);
  }, { 'language-cloud-sync-user': 'synthetic-a', [LEVEL_JOURNEY_KEY]: local, 'language-cloud-sync-base:synthetic-a': JSON.stringify({ [LEVEL_JOURNEY_KEY]: base }) });
});

test('actual provider conflict path preserves raw records with no remote or post-read local writes', async () => {
  for (const [base, remote, local] of failureRaws) await withChunkBrowser(async ({ api, entries, events }) => {
    const initial = [...entries], baselineKey = 'language-cloud-sync-base:synthetic-a';
    const trace: [string, string][] = []; let atRead: number | undefined;
    const set = api.setItem, remove = api.removeItem;
    api.setItem = (key, value) => { trace.push(['set', key]); set(key, value); };
    api.removeItem = key => { trace.push(['remove', key]); remove(key); };
    const remoteState = { [LEVEL_JOURNEY_KEY]: remote };
    const result = await initializeCurriculumSync({ remote: remoteState, onRemoteRead: () => { atRead ??= trace.length; } });
    assert.equal(result.thrown, undefined); assert.ok(result.remoteReads > 0); assert.notEqual(atRead, undefined);
    assert.deepEqual(result.writes, []); assert.equal(result.reloads, 0);
    assert.ok(result.statuses.includes('error')); assert.equal(result.statuses.includes('synced'), false);
    assert.ok(result.messages.some(message => /보존/.test(message)));
    assert.deepEqual(trace.slice(atRead), []);
    assert.equal(trace.some(([, key]) => key === LEVEL_JOURNEY_KEY || key === baselineKey), false);
    // Existing owner preparation happens before the remote-read/merge boundary.
    // It is metadata setup, not a claim that the entire initializer is write-free.
    assert.deepEqual(trace, [['set', LANGUAGE_TRANSACTION_KEY], ['set', 'language-cloud-sync-user'], ['remove', LANGUAGE_TRANSACTION_KEY]]);
    assert.deepEqual([...entries], initial); assert.deepEqual(events, []);
    assert.equal(entries.get(LEVEL_JOURNEY_KEY), local); assert.equal(remoteState[LEVEL_JOURNEY_KEY], remote);
    assert.deepEqual(result.remote, remoteState);
  }, { 'language-cloud-sync-user': 'synthetic-a', [LEVEL_JOURNEY_KEY]: local,
    'language-cloud-sync-base:synthetic-a': JSON.stringify({ [LEVEL_JOURNEY_KEY]: base }), savedWords: '["synthetic-sentinel"]' });
});
