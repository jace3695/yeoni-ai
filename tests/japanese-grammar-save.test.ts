import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GRAMMAR_LESSONS, GRAMMAR_PROGRESS_KEY, type GrammarProgressItem } from '../data/grammar.ts';
import { persistGrammarQuizAnswer } from '../utils/grammarQuizProgress.ts';

const lesson = GRAMMAR_LESSONS.find(item => item.id === 'desu')!;
const other = GRAMMAR_LESSONS.find(item => item.id === 'wa')!;
const at = '2026-11-09T12:00:00.000Z';
const progress: GrammarProgressItem[] = [
  { lessonId: lesson.id, title: lesson.title, category: lesson.category, pattern: lesson.pattern, correctCount: 1, wrongCount: 2, lastAnsweredAt: at, lastResult: 'wrong' },
  { lessonId: other.id, title: other.title, category: other.category, pattern: other.pattern, correctCount: 3, wrongCount: 0, lastAnsweredAt: at, lastResult: 'correct' },
];

test('a rejected grammar write keeps old progress and cannot complete the daily routine', () => {
  const original = structuredClone(progress);
  let stored = JSON.stringify(progress);
  let routineCalls = 0;
  let fail = true;
  const getStorage = () => ({ setItem(key: string, value: string) {
    assert.equal(key, GRAMMAR_PROGRESS_KEY);
    if (fail) throw new Error('synthetic quota failure');
    stored = value;
  } });
  const input = { getStorage, key: GRAMMAR_PROGRESS_KEY, progress, lesson, choice: lesson.quiz.answer, answeredAt: at, completeRoutine: () => { routineCalls++; } };
  assert.deepEqual(persistGrammarQuizAnswer(input), { saved: false });
  assert.deepEqual(JSON.parse(stored), original);
  assert.deepEqual(progress, original);
  assert.equal(routineCalls, 0);
  fail = false;
  const retry = persistGrammarQuizAnswer(input);
  assert.equal(retry.saved, true);
  if (!retry.saved) throw new Error('retry did not save');
  assert.equal(retry.progress[0].correctCount, 2);
  assert.equal(retry.progress[0].wrongCount, 2);
  assert.equal(retry.progress[0].lastResult, 'correct');
  assert.deepEqual(retry.progress[1], original[1]);
  assert.deepEqual(JSON.parse(stored), retry.progress);
  assert.equal(routineCalls, 1);
});

test('a blocked storage getter returns a recoverable failure without routine updates', () => {
  let routineCalls = 0;
  const result = persistGrammarQuizAnswer({ getStorage: () => { throw new Error('synthetic security failure'); },
    key: GRAMMAR_PROGRESS_KEY, progress, lesson, choice: lesson.quiz.answer, answeredAt: at,
    completeRoutine: () => { routineCalls++; } });
  assert.deepEqual(result, { saved: false });
  assert.equal(routineCalls, 0);
});

test('a routine write failure retains the successful grammar answer and does not request answer replay', () => {
  const events: string[] = [];
  let stored = '';
  const result = persistGrammarQuizAnswer({ getStorage: () => ({ setItem(_key: string, value: string) { events.push('grammar'); stored = value; } }),
    key: GRAMMAR_PROGRESS_KEY, progress: [], lesson, choice: '私を学生です。', answeredAt: at,
    completeRoutine: () => { events.push('routine'); throw new Error('synthetic routine-only failure'); } });
  assert.equal(result.saved, true);
  if (!result.saved) throw new Error('answer should remain saved');
  assert.equal(result.routineSaved, false);
  assert.equal(result.progress[0].correctCount, 0);
  assert.equal(result.progress[0].wrongCount, 1);
  assert.equal(result.progress[0].lastResult, 'wrong');
  assert.deepEqual(events, ['grammar', 'routine']);
  assert.deepEqual(JSON.parse(stored), result.progress);
});

test('the grammar UI publishes answer state only after success and isolates repeated clicks and routine retries', () => {
  const source = readFileSync(new URL('../app/language/grammar/page.tsx', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('  const handleSelectAnswer ='), source.indexOf('  const retryRoutineSave ='));
  assert.match(handler, /selectedAnswers\[lesson\.id\] \|\| answeredLessons\.current\.has\(lesson\.id\)/);
  assert.ok(handler.indexOf('answeredLessons.current.add') < handler.indexOf('persistGrammarQuizAnswer'));
  const failure = handler.slice(handler.indexOf('if (!result.saved)'), handler.indexOf('setGrammarProgress(result.progress)'));
  assert.match(failure, /answeredLessons\.current\.delete\(lesson\.id\)/);
  assert.match(failure, /return;/);
  assert.doesNotMatch(failure, /setSelectedAnswers|setPinnedLessonId/);
  const retry = source.slice(source.indexOf('  const retryRoutineSave ='), source.indexOf('  const changeStage ='));
  assert.match(retry, /markTodayRoutineCompleted\("grammar"\)/);
  assert.doesNotMatch(retry, /persistGrammarQuizAnswer|setGrammarProgress/);
  assert.match(source, /문법 답안은 저장됐지만 오늘 학습 체크를 저장하지 못했어요/);
  assert.match(source, /const changeStage = [\s\S]*?audio\.stop\(\);[\s\S]*?setStage\(next\)/);
});
