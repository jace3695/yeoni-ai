import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JAPANESE_LEVEL_ORDER, JAPANESE_LEVELS, getLevelLegacyLessons, nextLevelLessonId, isJapaneseLevel } from '../data/japaneseLevels.ts';
import { LEVEL_JOURNEY_KEY, chooseJapaneseLevel, dueUpperAnswers, emptyLevelJourney, learningOwner, readLevelJourney, rememberUpperAnswer, upperAnswerStable, writeLevelJourney, type JourneyStorage } from '../utils/japaneseLevelJourney.ts';
import { LANGUAGE_STORAGE_KEYS } from '../app/data/languageCloudSync.ts';
import { APP_RECORD_KEYS } from '../app/data/appRecordReset.ts';

function storage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  let writes = 0;
  const api: JourneyStorage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { writes++; entries.set(key, value); } };
  return { api, entries, writes: () => writes };
}
const answer = (attemptId: string, correct = true, neededHelp = false, questionId = 'upper-01-q1') => ({ lessonId: 'upper-01', questionId, attemptId, correct, neededHelp });

test('levels are explicit app paths, preserve existing IDs, and never link across a level boundary', () => {
  assert.deepEqual(JAPANESE_LEVEL_ORDER, ['beginner', 'intermediate', 'advanced']);
  assert.equal(getLevelLegacyLessons('beginner').length, 12);
  assert.equal(getLevelLegacyLessons('intermediate').length, 8);
  assert.equal(new Set([...JAPANESE_LEVELS.beginner.legacyLessonIds, ...JAPANESE_LEVELS.intermediate.legacyLessonIds]).size, 20);
  assert.equal(nextLevelLessonId('beginner', 'f11'), 'f12');
  assert.equal(nextLevelLessonId('beginner', 'f12'), undefined);
  assert.equal(nextLevelLessonId('intermediate', 'f20'), undefined);
  assert.equal(nextLevelLessonId('beginner', 'missing'), undefined);
  assert.equal(isJapaneseLevel('work'), false);
});

test('reading a new account does not create a learning record or touch legacy history', () => {
  const f = storage({ japaneseCurriculumProgressV1: '{"completedLessonIds":["f01"]}', grammarProgress: '[{"lessonId":"desu"}]' });
  assert.deepEqual(readLevelJourney(f.api), emptyLevelJourney());
  assert.equal(f.writes(), 0);
  assert.equal(f.entries.size, 2);
});

test('only explicit choice changes level and returning to beginner preserves all records', () => {
  const f = storage({ 'language-cloud-sync-user': 'synthetic-A', japaneseCurriculumProgressV1: '{"completedLessonIds":["f12"]}' });
  const owner = learningOwner(f.api);
  writeLevelJourney(f.api, owner, state => chooseJapaneseLevel(state, 'intermediate'));
  writeLevelJourney(f.api, owner, state => rememberUpperAnswer(state, answer('one'), new Date('2026-01-01T12:00:00Z')));
  assert.equal(readLevelJourney(f.api).selectedLevel, 'intermediate');
  writeLevelJourney(f.api, owner, state => chooseJapaneseLevel(state, 'beginner'));
  assert.equal(Object.keys(readLevelJourney(f.api).answers).length, 1);
  assert.equal(f.entries.get('japaneseCurriculumProgressV1'), '{"completedLessonIds":["f12"]}');
});

test('every save rereads latest state instead of replacing another tab’s independent result', () => {
  const f = storage(); const owner = learningOwner(f.api);
  writeLevelJourney(f.api, owner, state => rememberUpperAnswer(state, answer('one'), new Date('2026-01-01T12:00:00Z')));
  writeLevelJourney(f.api, owner, state => rememberUpperAnswer(state, answer('two', true, false, 'upper-01-q2'), new Date('2026-01-01T12:00:00Z')));
  writeLevelJourney(f.api, owner, state => chooseJapaneseLevel(state, 'advanced'));
  assert.equal(Object.keys(readLevelJourney(f.api).answers).length, 2);
});

test('duplicate save from one question attempt is idempotent', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const once = rememberUpperAnswer(emptyLevelJourney(), answer('same'), now);
  assert.deepEqual(rememberUpperAnswer(once, answer('same'), new Date('2026-01-03T12:00:00Z')), once);
  assert.equal(once.selectedLevel, 'beginner');
});

test('rapid same-day repetition cannot extend the interval or claim stable recall', () => {
  let state = emptyLevelJourney();
  for (let index = 0; index < 10; index++) state = rememberUpperAnswer(state, answer(`attempt-${index}`), new Date('2026-01-01T12:00:00Z'));
  const item = state.answers['upper-01-q1'];
  assert.equal(item.attempts, 10); assert.equal(item.intervalDays, 1);
  assert.equal(item.successDates.length, 1); assert.equal(upperAnswerStable(item), false);
  assert.equal(item.nextReviewAt, '2026-01-02T12:00:00.000Z');
});

test('separate-day independent recall advances 1, 3, 7 days without promotion', () => {
  let state = emptyLevelJourney();
  for (const [index, date] of ['2026-01-01', '2026-01-03', '2026-01-07'].entries()) state = rememberUpperAnswer(state, answer(`attempt-${index}`), new Date(`${date}T12:00:00Z`));
  assert.equal(state.answers['upper-01-q1'].intervalDays, 7);
  assert.equal(upperAnswerStable(state.answers['upper-01-q1']), true);
  assert.equal(state.selectedLevel, 'beginner');
  assert.equal(dueUpperAnswers(state, Date.parse('2026-01-13T12:00:00Z')).length, 0);
  assert.equal(dueUpperAnswers(state, Date.parse('2026-01-14T12:00:00Z')).length, 1);
});

for (const neededHelp of [false, true]) test(`wrong or assisted answer resets independent recall (help ${neededHelp})`, () => {
  let state = rememberUpperAnswer(emptyLevelJourney(), answer('first'), new Date('2026-01-01T12:00:00Z'));
  state = rememberUpperAnswer(state, answer('second', neededHelp, neededHelp), new Date('2026-01-04T12:00:00Z'));
  const item = state.answers['upper-01-q1'];
  assert.equal(item.intervalDays, 1); assert.deepEqual(item.successDates, []); assert.equal(upperAnswerStable(item), false);
});

for (const key of ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'languageRecordResetV1']) test(`stale ${key} boundary rejects the write before changing data`, () => {
  const f = storage({ [key]: 'before' }); const owner = learningOwner(f.api);
  f.entries.set(key, 'after');
  assert.throws(() => writeLevelJourney(f.api, owner, state => chooseJapaneseLevel(state, 'advanced')), /계정|기록/);
  assert.equal(f.writes(), 0); assert.equal(f.entries.has(LEVEL_JOURNEY_KEY), false);
});

for (const raw of ['{broken', 'null', '[]', '{"version":2}', '{"version":1,"selectedLevel":"all","answers":{},"practicedUnits":{}}', '{"version":1,"selectedLevel":"beginner","answers":{"q":{}},"practicedUnits":{}}']) test(`malformed or newer storage is preserved: ${raw.slice(0, 30)}`, () => {
  const f = storage({ [LEVEL_JOURNEY_KEY]: raw });
  assert.throws(() => readLevelJourney(f.api));
  assert.throws(() => writeLevelJourney(f.api, learningOwner(f.api), state => chooseJapaneseLevel(state, 'advanced')));
  assert.equal(f.entries.get(LEVEL_JOURNEY_KEY), raw); assert.equal(f.writes(), 0);
});

test('storage failure does not report a successful save or change existing data', () => {
  const f = storage(); const failing = { ...f.api, setItem: () => { throw new Error('quota'); } };
  assert.throws(() => writeLevelJourney(failing, learningOwner(failing), state => chooseJapaneseLevel(state, 'advanced')), /quota/);
  assert.equal(f.entries.has(LEVEL_JOURNEY_KEY), false);
});

test('new records participate in existing account isolation, sync and requested record reset', () => {
  assert.ok(LANGUAGE_STORAGE_KEYS.includes(LEVEL_JOURNEY_KEY));
  assert.ok(APP_RECORD_KEYS.language.includes(LEVEL_JOURNEY_KEY));
  assert.ok(!APP_RECORD_KEYS.fitness.includes(LEVEL_JOURNEY_KEY));
});

test('new UI has no text entry, microphone, recorder or voice-chat integration', () => {
  const source = readFileSync(new URL('../components/language/UpperReadingLesson.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<textarea|contentEditable|type=["']text["']|getUserMedia|MediaRecorder|SpeechRecognition|fetch\(/);
  assert.match(source, /type="checkbox"/);
  for (const path of ['conversation', 'practice', 'speaking']) {
    assert.match(readFileSync(new URL(`../app/language/${path}/page.tsx`, import.meta.url), 'utf8'), /RetiredPractice/);
  }
});
