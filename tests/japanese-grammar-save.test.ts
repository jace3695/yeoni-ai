import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GRAMMAR_LESSONS, GRAMMAR_PROGRESS_KEY, type GrammarProgressItem } from '../data/grammar.ts';
import { createRoutineCompletionQueue } from '../utils/routineCompletionQueue.ts';
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
  const input = { getStorage, key: GRAMMAR_PROGRESS_KEY, progress, lesson, choice: lesson.quiz.answer, answeredAt: at };
  const attempt = () => {
    const result = persistGrammarQuizAnswer(input);
    if (result.saved) routineCalls++;
    return result;
  };
  assert.deepEqual(attempt(), { saved: false });
  assert.deepEqual(JSON.parse(stored), original);
  assert.deepEqual(progress, original);
  assert.equal(routineCalls, 0);
  fail = false;
  const retry = attempt();
  assert.equal(retry.saved, true);
  if (!retry.saved) throw new Error('retry did not save');
  assert.equal(retry.progress[0].correctCount, 2);
  assert.equal(retry.progress[0].wrongCount, 2);
  assert.equal(retry.progress[0].lastResult, 'correct');
  assert.deepEqual(retry.progress[1], original[1]);
  assert.deepEqual(JSON.parse(stored), retry.progress);
  assert.equal(routineCalls, 1, "caller queues the routine only after the durable answer");
});

test('a blocked storage getter returns a recoverable failure without routine updates', () => {
  let routineCalls = 0;
  const result = persistGrammarQuizAnswer({ getStorage: () => { throw new Error('synthetic security failure'); },
    key: GRAMMAR_PROGRESS_KEY, progress, lesson, choice: lesson.quiz.answer, answeredAt: at,
    });
  if (result.saved) routineCalls++;
  assert.deepEqual(result, { saved: false });
  assert.equal(routineCalls, 0);
});

test('an asynchronous routine rejection and retry preserve the saved answer without replay', async () => {
  let stored = '';
  let writes = 0;
  const result = persistGrammarQuizAnswer({ getStorage: () => ({ setItem(_key: string, value: string) { writes++; stored = value; } }),
    key: GRAMMAR_PROGRESS_KEY, progress: [], lesson, choice: '私を学生です。', answeredAt: at });
  assert.equal(result.saved, true);
  if (!result.saved) throw new Error('answer should remain saved');
  let fail = true;
  let error = '';
  const queue = createRoutineCompletionQueue({ capture: date => Object.freeze({ date }), isCurrent: () => true,
    save: async () => { if (fail) throw new Error('routine failure'); }, publish: status => { error = status.error; } });
  queue.complete('2026-11-09');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(error, 'routine failure');
  fail = false; queue.retry(); queue.retry();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(error, '');
  assert.equal(writes, 1);
  assert.equal(result.progress[0].wrongCount, 1);
  assert.deepEqual(JSON.parse(stored), result.progress);
});

test('the grammar UI publishes answer state only after success and isolates repeated clicks and routine retries', () => {
  const source = readFileSync(new URL('../app/language/grammar/page.tsx', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('  const handleSelectAnswer ='), source.indexOf('  const changeStage ='));
  assert.match(handler, /selectedAnswers\[lesson\.id\] \|\| answeredLessons\.current\.has\(lesson\.id\)/);
  assert.ok(handler.indexOf('answeredLessons.current.add') < handler.indexOf('persistGrammarQuizAnswer'));
  const failure = handler.slice(handler.indexOf('if (!result.saved)'), handler.indexOf('setGrammarProgress(result.progress)'));
  assert.match(failure, /answeredLessons\.current\.delete\(lesson\.id\)/);
  assert.match(failure, /return;/);
  assert.doesNotMatch(failure, /setSelectedAnswers|setPinnedLessonId/);
  assert.match(handler, /routine.complete\(\)/);
  assert.doesNotMatch(handler, /routineSaved/);
  assert.match(source, /<DailyRoutineSaveNotice/);
  assert.match(source, /const changeStage = [\s\S]*?audio\.stop\(\);[\s\S]*?setStage\(next\)/);
});
