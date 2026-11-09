import { syntheticIndexedDB } from "./fixtures/languageIndexedDB.ts";
import { syntheticLocks } from "./fixtures/chunkReviewStorage.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLanguageState, mergeLanguageState, mergeLanguageStateFromBase, prepareLanguageLocalState } from '../app/data/languageCloudSync.ts';
import { LEVEL_JOURNEY_EVENT, LEVEL_JOURNEY_KEY, chooseJapaneseLevel, emptyLevelJourney, mergeLevelJourneySnapshots, rememberUpperAnswer } from '../utils/japaneseLevelJourney.ts';

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
