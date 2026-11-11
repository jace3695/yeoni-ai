import { JAPANESE_UPPER_LESSONS } from '../data/japaneseUpperLessons.ts';
import { JAPANESE_READING_EXPANSION } from '../data/japaneseContentExpansion.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as chunkData from '../data/japaneseChunkLessons.ts';
import { JAPANESE_CORE_CHUNK_LESSONS } from '../data/japaneseCoreChunkLessons.ts';
import { JAPANESE_READING_CHUNK_LESSONS } from '../data/japaneseReadingChunkLessons.ts';
import { JAPANESE_WORK_CHUNK_LESSONS } from '../data/japaneseWorkChunkLessons.ts';
import { JAPANESE_TRAVEL_CHUNK_LESSONS } from '../data/japaneseTravelChunkLessons.ts';
import { JAPANESE_READING_LESSONS, getReadingLessonLevel } from '../data/japaneseReadingLessons.ts';
import * as practice from '../utils/japaneseChunkPractice.ts';
import * as chunkReview from '../utils/japaneseChunkReview.ts';
import * as journeys from '../utils/japaneseLevelJourney.ts';
import * as levels from '../data/japaneseLevels.ts';
import * as supports from '../data/japaneseReadingSupport.ts';
import * as enhancements from '../data/japaneseReadingEnhancements.ts';
import * as highlights from '../utils/japaneseReadingHighlight.ts';
import * as curriculum from '../data/curriculum.ts';
import * as learningSessions from '../utils/learningSession.ts';
import * as learningSettings from '../utils/integratedLearningSettings.ts';
import * as curriculumProgress from '../utils/curriculumProgress.ts';
import { FREE_MODE } from '../lib/free-mode.ts';

const { JAPANESE_CHUNK_LESSONS: lessons, getChunkLesson } = chunkData;
const { createChunkPractice, reduceChunkPractice } = practice;
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('82 optional chunk lessons preserve 20 core and 20 reading IDs and cover 22 work and 20 travel units', () => {
  assert.equal(lessons.length, 82);
  assert.equal(JAPANESE_CORE_CHUNK_LESSONS.length, 20);
  assert.equal(JAPANESE_READING_CHUNK_LESSONS.length, 20);
  assert.equal(JAPANESE_WORK_CHUNK_LESSONS.length, 22);
  assert.equal(JAPANESE_TRAVEL_CHUNK_LESSONS.length, 20);
  assert.deepEqual(JAPANESE_WORK_CHUNK_LESSONS.map(l => l.lessonId).sort(), curriculum.CURRICULUM.filter(l => l.track === 'work').map(l => l.id).sort());
  assert.deepEqual(JAPANESE_TRAVEL_CHUNK_LESSONS.map(l => l.lessonId).sort(), curriculum.CURRICULUM.filter(l => l.track === 'travel').map(l => l.id).sort());
  assert.deepEqual(JAPANESE_CORE_CHUNK_LESSONS.map(l => l.lessonId).sort(), Array.from({ length: 20 }, (_, i) => `f${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(JAPANESE_READING_CHUNK_LESSONS.map(l => l.lessonId).sort(), [...JAPANESE_UPPER_LESSONS, ...JAPANESE_READING_EXPANSION].map(l => l.id).sort());
  assert.equal(new Set(lessons.map(l => l.lessonId)).size, 82);
  assert.equal(new Set(lessons.flatMap(l => l.questions.map(q => q.id))).size, 246);
  for (const lesson of lessons) assert.strictEqual(getChunkLesson(lesson.lessonId), lesson);
  for (const id of ['', '__proto__', 'missing', 'f21']) assert.equal(getChunkLesson(id), undefined);
});

test('all 82 lessons have exact chunk composition, distinct word/tense examples, and three answerable question types', () => {
  for (const lesson of lessons) {
    assert.ok(lesson.sentence.includes(lesson.expression.replace(/^～/, '')), lesson.lessonId);
    assert.equal(lesson.chunks.map(c => c.text).join(''), lesson.sentence, lesson.lessonId);
    assert.ok(lesson.chunks.length >= 2);
    for (const chunk of lesson.chunks) {
      assert.ok(chunk.text.trim()); assert.match(chunk.meaning, /[가-힣]/); assert.match(chunk.role, /[가-힣]/);
    }
    assert.ok(lesson.chunks.some(c => /조사|어미|정중|종결|서술|인사|고정|명사|동사|부사|수동|부정/.test(c.role)), lesson.lessonId);
    assert.deepEqual([...new Set(lesson.variations.map(v => v.kind))].sort(), ['tense', 'word']);
    for (const variation of lesson.variations) {
      assert.notEqual(variation.sentence, lesson.sentence);
      assert.match(variation.meaning, /[가-힣]/); assert.match(variation.explanation, /[가-힣]/);
      assert.doesNotMatch(variation.sentence, /[가-힣]/);
      if (variation.kind === 'tense') assert.match(variation.explanation, /과거|시제|현재|미래|완료|비과거|어제|지난|이미|마친|그때|전에/);
    }
    assert.deepEqual(lesson.questions.map(q => q.kind), ['meaning', 'blank', 'listening']);
    for (const q of lesson.questions) {
      assert.ok(q.prompt.trim()); assert.match(q.explanation, /[가-힣]/);
      assert.ok(q.choices.length >= 3); assert.equal(new Set(q.choices).size, q.choices.length, q.id);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length);
      if (q.kind === 'listening') { assert.ok(q.audioText?.trim()); assert.doesNotMatch(q.prompt, new RegExp(q.audioText!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); }
      if (q.kind === 'blank') {
        assert.match(q.prompt, /＿|__|（\s*）|\(\s*\)|［\s*］|\[\s*\]|□|…/);
        assert.ok(q.choices[q.answer].trim());
      }
    }
    assert.doesNotMatch(JSON.stringify(lesson), /TODO|TBD|입력하세요|녹음하세요|마이크|합격 보장|청취 성공|수강 완료/);
  }
});

function advanceToQuestions(lesson: chunkData.JapaneseChunkLesson) {
  let state = createChunkPractice(lesson);
  for (let i = 0; i < 3; i++) state = reduceChunkPractice(lesson, state, { type: 'next', revision: state.revision });
  return state;
}

test('pure state rejects unanswered advance, invalid answers and stale double clicks; wrong queue shrinks only after a correct retry', () => {
  for (const lesson of lessons) {
    let state = advanceToQuestions(lesson);
    assert.strictEqual(reduceChunkPractice(lesson, state, { type: 'next', revision: state.revision }), state);
    for (const choice of [-1, 3.5, 100]) assert.strictEqual(reduceChunkPractice(lesson, state, { type: 'answer', choice, revision: state.revision }), state);
    for (const [index, q] of lesson.questions.entries()) {
      const action: practice.ChunkPracticeAction = { type: 'answer', choice: index === 1 ? q.answer : (q.answer + 1) % q.choices.length, revision: state.revision };
      state = reduceChunkPractice(lesson, state, action);
      assert.strictEqual(reduceChunkPractice(lesson, state, action), state);
      const next: practice.ChunkPracticeAction = { type: 'next', revision: state.revision };
      state = reduceChunkPractice(lesson, state, next);
      assert.strictEqual(reduceChunkPractice(lesson, state, next), state);
    }
    assert.equal(state.stage, 'done'); assert.deepEqual(state.wrong, [0, 2]);
    state = reduceChunkPractice(lesson, state, { type: 'retry-wrong', revision: state.revision });
    assert.deepEqual(state.queue, [0, 2]); assert.deepEqual(state.answers, {}); assert.equal(state.retryRound, true);
    for (const index of [0, 2]) {
      state = reduceChunkPractice(lesson, state, { type: 'answer', choice: lesson.questions[index].answer, revision: state.revision });
      state = reduceChunkPractice(lesson, state, { type: 'next', revision: state.revision });
    }
    assert.equal(state.stage, 'done'); assert.deepEqual(state.wrong, []);
    assert.strictEqual(reduceChunkPractice(lesson, state, { type: 'retry-wrong', revision: state.revision }), state);
    const restart = reduceChunkPractice(lesson, state, { type: 'restart', revision: state.revision });
    assert.deepEqual({ ...restart, revision: 0 }, createChunkPractice(lesson));
  }
});

test('previous, immediate retry and reading alternative keep feedback local and cannot mutate lesson data', () => {
  const lesson = lessons[0], before = JSON.stringify(lesson);
  let state = createChunkPractice(lesson);
  assert.strictEqual(reduceChunkPractice(lesson, state, { type: 'previous', revision: 0 }), state);
  state = advanceToQuestions(lesson);
  state = reduceChunkPractice(lesson, state, { type: 'answer', choice: (lesson.questions[0].answer + 1) % 3, revision: state.revision });
  state = reduceChunkPractice(lesson, state, { type: 'retry-question', revision: state.revision });
  assert.equal(state.answers[0], undefined); assert.deepEqual(state.wrong, [0]);
  state = reduceChunkPractice(lesson, state, { type: 'answer', choice: lesson.questions[0].answer, revision: state.revision });
  assert.deepEqual(state.wrong, []);
  state = reduceChunkPractice(lesson, state, { type: 'previous', revision: state.revision });
  assert.equal(state.stage, 'variations');
  state = reduceChunkPractice(lesson, state, { type: 'next', revision: state.revision });
  assert.equal(state.answers[0], lesson.questions[0].answer);
  state = reduceChunkPractice(lesson, state, { type: 'next', revision: state.revision });
  state = reduceChunkPractice(lesson, state, { type: 'answer', choice: lesson.questions[1].answer, revision: state.revision });
  state = reduceChunkPractice(lesson, state, { type: 'next', revision: state.revision });
  state = reduceChunkPractice(lesson, state, { type: 'reveal', revision: state.revision });
  assert.deepEqual(state.revealed, [2]); assert.equal(state.answers[2], undefined);
  state = reduceChunkPractice(lesson, state, { type: 'answer', choice: (lesson.questions[2].answer + 1) % 3, revision: state.revision });
  state = reduceChunkPractice(lesson, state, { type: 'retry-question', revision: state.revision });
  assert.deepEqual(state.revealed, []); assert.equal(state.answers[2], undefined);
  assert.equal(JSON.stringify(lesson), before);
});

type Element = React.ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => Element;
const require = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : String(name) });
function compile(file: string, dependencies: Record<string, unknown>) {
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: Record<string, Component> = {};
  vm.runInNewContext(source, { exports, AbortController, crypto, Error, require: (name: string) => name.endsWith('.module.css') ? css : dependencies[name] ?? require(name) });
  return exports;
}
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}
function label(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(label).join('');
  if (React.isValidElement<Record<string, unknown>>(node)) return label(node.props.children as React.ReactNode);
  return node === null || node === undefined || typeof node === 'boolean' ? '' : String(node);
}
/** Actual component with synthetic hook storage and a silent audio double.
 * This checks React output/event handlers, not browser layout/focus or real TTS. */
function chunkHarness(lesson: chunkData.JapaneseChunkLesson) {
  let state = createChunkPractice(lesson), stopped = 0, uses = 0, closed = false;
  const hookValues: unknown[] = []; let hook = 0;
  let saved = chunkReview.emptyChunkReview();
  const spoken: string[] = [];
  const Component = compile('../components/language/JapaneseChunkPractice.tsx', {
    react: { ...React, useEffect() {}, useRef(initial: unknown) { const index = hook++; if (!(index in hookValues)) hookValues[index] = { current: initial }; return hookValues[index]; }, useState(initial: unknown) { const index = hook++; if (!(index in hookValues)) hookValues[index] = typeof initial === 'function' ? initial() : initial; return [hookValues[index], (next: unknown) => { hookValues[index] = typeof next === 'function' ? next(hookValues[index]) : next; }]; }, useReducer: () => [state, (action: practice.ChunkPracticeAction) => { state = reduceChunkPractice(lesson, state, action); }] },
    'next/link': ({ children, ...props }: { children: React.ReactNode }) => React.createElement('a', props, children),
    '@/utils/japaneseChunkReview': chunkReview, './useChunkReview': { useChunkReview() { throw new Error('Use tested session with synthetic storage'); } },
    '@/utils/japaneseChunkPractice': practice,
    './useLearningAudio': { useLearningAudio: () => ({ playing: false, audioError: '', stop() { stopped++; }, play(text: string) { spoken.push(text); } }) },
  }).ChunkPracticeSession;
  const render = () => { hook = 0; return Component({ lesson, onUse() { uses++; }, onClose() { closed = true; }, update(change: (value: chunkReview.ChunkReviewState) => chunkReview.ChunkReviewState) { saved = change(saved); return saved; } }); };
  const button = (text: string) => {
    const value = elements(render()).find(node => node.type === 'button' && label(node.props.children as React.ReactNode) === text);
    assert.ok(value, `Button missing: ${text}`); return value;
  };
  const click = (text: string) => { const value = button(text); assert.ok(!value.props.disabled, `Button disabled: ${text}`); (value.props.onClick as () => void)(); };
  return { tree: render, html: () => renderToStaticMarkup(render()), button, click, state: () => state, stopped: () => stopped, spoken, uses: () => uses, closed: () => closed };
}

test('actual React buttons traverse all lessons, gate explanations, allow listening text, and retry only misses', async () => {
  for (const lesson of lessons) {
    const flow = chunkHarness(lesson);
    assert.match(flow.html(), /저장된 문제는 닫은 뒤에도 다시 풀 수 있어요/);
    assert.doesNotMatch(flow.html(), /<input|<textarea|contenteditable|draggable|<audio|<video/);
    flow.click('예문 소리 듣기'); assert.equal(flow.spoken[0], lesson.sentence);
    const staleNext = flow.button('조각별 뜻과 역할 보기').props.onClick as () => void;
    staleNext(); staleNext(); assert.equal(flow.state().stage, 'chunks');
    flow.click('단어·시제 바꾼 예문 보기'); flow.click('선택 문제 시작');
    for (const [i, q] of lesson.questions.entries()) {
      const html = flow.html(); assert.doesNotMatch(html, /내 선택:|정답:|data-correct="true"/); assert.ok(!html.includes(q.explanation));
      assert.doesNotMatch(html, /<input|<textarea|contenteditable|draggable/);
      if (q.kind === 'listening') {
        assert.ok(!html.includes(q.audioText!)); flow.click('문제 소리 듣기');
        assert.equal(flow.spoken.at(-1), q.audioText); flow.click('문장 보기로 대신하기');
        assert.ok(flow.html().includes(q.audioText!)); assert.equal(flow.state().answers[i], undefined);
      }
      const answer = i === 1 ? q.answer : (q.answer + 1) % q.choices.length;
      const staleAnswer = flow.button(q.choices[answer]).props.onClick as () => void;
      staleAnswer(); staleAnswer(); await Promise.resolve(); assert.equal(flow.state().answers[i], answer);
      assert.ok(flow.html().includes(q.explanation)); assert.match(flow.html(), /내 선택:.*정답:/);
      flow.click(i === 2 ? '이번 연습 확인' : '다음 문제');
    }
    flow.click('틀린 문제 2개만 다시 풀기'); assert.deepEqual(flow.state().queue, [0, 2]);
    for (const i of [0, 2]) { const q = lesson.questions[i]; assert.ok(!flow.html().includes(q.explanation)); flow.click(q.choices[q.answer]); await Promise.resolve(); flow.click(i === 2 ? '이번 연습 확인' : '다음 문제'); }
    assert.doesNotMatch(flow.html(), /틀린 문제 \d개만 다시 풀기/); flow.click('표현부터 새로 반복하기');
    assert.equal(flow.state().stage, 'expression'); assert.deepEqual(flow.state().wrong, []);
    const stops = flow.stopped(); flow.click('닫고 본수업으로'); assert.equal(flow.closed(), true); assert.equal(flow.stopped(), stops + 1); assert.ok(flow.uses() > 0);
    assert.equal(chunkHarness(lesson).state().stage, 'expression');
  }
});

function readingHarness(lesson: typeof JAPANESE_READING_LESSONS[number], reviewOnly = false, initialJourney = journeys.emptyLevelJourney()) {
  const states: unknown[] = []; let hook = 0, journey = initialJourney, stops = 0, failures = 0, uncertain = false;
  const hooks = { ...React, useEffect(run: () => void, deps: unknown[]) {
      const index = hook++; const previous = states[index] as unknown[] | undefined;
      if (!previous || deps.some((value, i) => value !== previous[i])) { states[index] = deps; run(); }
    }, useRef(initial: unknown) { const index = hook++; if (!(index in states)) states[index] = { current: initial }; return states[index]; }, useState(initial: unknown) {
    const index = hook++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  } };
  const Chunk = () => React.createElement('div', { 'data-chunk-double': true });
  const component = compile('../components/language/UpperReadingLesson.tsx', {
    react: hooks, 'next/link': ({ children, ...props }: { children: React.ReactNode }) => React.createElement('a', props, children),
    '@/data/japaneseLevels': levels, '@/data/japaneseReadingSupport': supports, '@/data/japaneseReadingEnhancements': enhancements,
    '@/data/japaneseChunkLessons': chunkData, './JapaneseChunkPractice': Chunk,
    '@/utils/japaneseReadingHighlight': highlights, '@/utils/japaneseLevelJourney': journeys,
    './ReadingLessonEnhancements': compile('../components/language/ReadingLessonEnhancements.tsx', {}),
    './useLearningAudio': { useLearningAudio: () => ({ playing: false, audioError: '', stop() { stops++; }, play() {} }) },
  }).default;
  const render = () => { hook = 0; return component({ lesson, level: getReadingLessonLevel(lesson.id), journey, reviewOnly, update: async (change: (state: journeys.LevelJourney) => journeys.LevelJourney) => { if (failures > 0) { failures--; throw new Error('합성 저장 실패'); } journey = change(journey); if (uncertain) { uncertain = false; throw new Error('합성 저장 미확인'); } return journey; } }); };
  const click = (text: string) => { const value = elements(render()).find(node => node.type === 'button' && label(node.props.children as React.ReactNode) === text); assert.ok(value, text); assert.ok(!value.props.disabled); return (value.props.onClick as () => void | Promise<void>)(); };
  const chunk = () => elements(render()).find(node => node.type === Chunk)!;
  return { html: () => renderToStaticMarkup(render()), click, chunk, journey: () => journey, stops: () => stops, failNext: () => { failures++; }, uncertainNext: () => { uncertain = true; }, otherAttempt: (questionId: string) => { journey = journeys.rememberUpperAnswer(journey, { lessonId: lesson.id, questionId, attemptId: 'synthetic-intervening', correct: false, neededHelp: true }); } };
}

test('reading opt-in marks help, hides competing next, closes without saving, and preserves existing answers and selected level', async () => {
  for (const lesson of JAPANESE_READING_LESSONS) {
    const flow = readingHarness(lesson); const before = JSON.stringify(flow.journey());
    await flow.click('표현을 조각으로 연습하기 · 선택'); assert.ok(flow.chunk());
    assert.equal(flow.chunk().key, lesson.id); assert.doesNotMatch(flow.html(), /확인 문제 시작/);
    (flow.chunk().props.onUse as () => void)();
    (flow.chunk().props.onClose as () => void)(); assert.equal(JSON.stringify(flow.journey()), before);
    assert.match(flow.html(), /확인 문제 시작/); assert.ok(flow.stops() >= 2);
    await flow.click('확인 문제 시작'); const q = lesson.questions[0]; await flow.click(q.choices[q.answer]);
    const saved = flow.journey().answers[q.id]; assert.ok(saved); assert.equal(saved.neededHelp, true);
    assert.equal(flow.journey().selectedLevel, 'beginner');
    assert.deepEqual(Object.keys(flow.journey()).sort(), ['answers', 'practicedUnits', 'selectedLevel', 'version']);
  }
});

test('partial due review keeps its frozen queue when reading help opens; it does not save supplemental answers or add full-unit records', async () => {
  const lesson = JAPANESE_READING_LESSONS[0], q = lesson.questions[1];
  const start = journeys.rememberUpperAnswer(journeys.emptyLevelJourney(), { lessonId: lesson.id, questionId: q.id, attemptId: 'old-chunk-fixture', correct: false, neededHelp: false }, new Date('2020-01-01T00:00:00Z'));
  const flow = readingHarness(lesson, true, start);
  await flow.click('본문 다시 읽기'); await flow.click('표현을 조각으로 연습하기 · 선택');
  (flow.chunk().props.onClose as () => void)(); await flow.click('확인 문제 시작');
  assert.match(flow.html(), /예정 복습 1\/1/); await flow.click(q.choices[q.answer]); await flow.click('복습 마치기');
  assert.equal(Object.keys(flow.journey().answers).length, 1); assert.deepEqual(flow.journey().practicedUnits, {}); assert.equal(flow.journey().selectedLevel, 'beginner');
});

test('supplemental source isolates persistence in its hook, excludes API/typing/audio recording, cancels audio, and parents key it', () => {
  const ui = read('../components/language/JapaneseChunkPractice.tsx'), reducer = read('../utils/japaneseChunkPractice.ts');
  assert.doesNotMatch(ui + reducer, /localStorage|sessionStorage|fetch\(|authenticatedFetch|supabase|rememberUpperAnswer|saveCurriculumProgress|MediaRecorder|getUserMedia|SpeechRecognition|<input|<textarea|contentEditable|draggable/);
  assert.match(ui, /useLearningAudio/); assert.match(ui, /audio\.stop\(\); onClose\(\)/);
  assert.match(ui, /audio\.stop\(\); onUse\?\.\(\)/); assert.match(ui, /dispatch\(action\)/); assert.equal(FREE_MODE, true);
  const audio = read('../components/language/useLearningAudio.ts'); assert.match(audio, /return \(\) => \{ controller\.current\?\.abort\(\)/);
  const focus = read('../components/language/FocusedLesson.tsx'), reading = read('../components/language/UpperReadingLesson.tsx');
  for (const parent of [focus, reading]) assert.match(parent, /key=\{chunkLesson\.lessonId\}/);
  assert.match(focus, /!finished && !chunkPracticeOpen && <><footer/);
  assert.match(focus, /setChunkPracticeOpen\(false\)/);
  assert.match(reading, /markReadingHelp\(\); setChunkPracticeOpen\(true\)/);
});


test('actual core parent preserves its 5-minute session and quiz indices across opt-in, close, reopen and next stage', () => {
  for (const extra of JAPANESE_CORE_CHUNK_LESSONS) {
    const lesson = curriculum.getLesson(extra.lessonId);
    const states: unknown[] = []; let hook = 0, stops = 0, writes = 0;
    const hooks = { ...React, useEffect() {}, useRef: (initial: unknown) => ({ current: initial }), useState(initial: unknown) {
      const index = hook++;
      if (!(index in states)) {
        states[index] = typeof initial === 'function' ? initial() : initial;
        if (index === 1) states[index] = { ...(states[index] as learningSessions.LearningSession), stage: 1, minutes: 5 };
        if (index === 2) states[index] = true;
      }
      return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } };
    const Chunk = () => React.createElement('div', { 'data-chunk-double': true });
    const Question = () => React.createElement('div', { 'data-question-double': true });
    const component = compile('../components/language/FocusedLesson.tsx', {
      react: hooks, 'next/link': ({ children, ...props }: { children: React.ReactNode }) => React.createElement('a', props, children),
      '@/components/useYeoniPreferences': { useYeoniPreferences: () => ({ visible: false }) },
      '@/data/curriculum': curriculum, '@/data/learningDataExpansion': { toKoreanPronunciation: (word: string) => word },
      '@/utils/curriculumProgress': { ...curriculumProgress, saveCurriculumProgress() { writes++; } },
      '@/utils/integratedLearningSettings': learningSettings, '@/utils/learningSession': learningSessions,
      '@/utils/dateKey': { getLocalDateKey: () => '2026-11-08' }, '@/data/japaneseLevels': levels,
      '@/data/japaneseChunkLessons': chunkData, './JapaneseChunkPractice': Chunk,
      './LearningCompanion': ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children),
      './LearningQuestion': Question,
      './useLearningAudio': { useLearningAudio: () => ({ playing: false, audioError: '', stop() { stops++; }, play() {} }) },
    }).default;
    const render = () => { hook = 0; return component({ lesson, studyLevel: 'beginner' }); };
    const click = (text: string) => {
      const button = elements(render()).find(node => node.type === 'button' && label(node.props.children as React.ReactNode) === text);
      assert.ok(button, text); assert.ok(!button.props.disabled); (button.props.onClick as () => void)();
    };
    render(); const before = JSON.stringify(states[1]);
    const originalIndices = learningSessions.getSessionQuizIndices(lesson, 5);
    click('표현을 조각으로 연습하기 · 선택');
    const child = elements(render()).find(node => node.type === Chunk)!;
    assert.equal(child.key, lesson.id); assert.doesNotMatch(renderToStaticMarkup(render()), /<footer|다음으로/);
    (child.props.onClose as () => void)(); assert.equal(JSON.stringify(states[1]), before);
    assert.match(renderToStaticMarkup(render()), /<footer/); assert.equal(writes, 0);
    click('표현을 조각으로 연습하기 · 선택');
    (elements(render()).find(node => node.type === Chunk)!.props.onClose as () => void)();
    click('다음으로'); assert.equal((states[1] as learningSessions.LearningSession).stage, 4);
    assert.deepEqual(learningSessions.getSessionQuizIndices(lesson, (states[1] as learningSessions.LearningSession).minutes), originalIndices);
    const question = elements(render()).find(node => node.type === Question)!;
    assert.equal(question.props.index, originalIndices[0]); assert.ok(stops >= 5); assert.equal(writes, 0);
  }
});


test('after closing supplemental practice, a failed original reading save still requires retry before next and preserves help attribution', async () => {
  const lesson = JAPANESE_READING_LESSONS[0], q = lesson.questions[0];
  const flow = readingHarness(lesson);
  await flow.click('표현을 조각으로 연습하기 · 선택'); (flow.chunk().props.onClose as () => void)();
  await flow.click('확인 문제 시작'); flow.failNext(); await flow.click(q.choices[q.answer]);
  assert.match(flow.html(), /합성 저장 실패/); assert.match(flow.html(), /아직 이 답의 저장을 확인하지 못했어요/);
  assert.match(flow.html(), /disabled="">다음 문제/); assert.equal(Object.keys(flow.journey().answers).length, 0);
  await flow.click('이 답 저장 다시 시도'); assert.match(flow.html(), /이 답을 복습 기록에 저장했어요/);
  assert.equal(flow.journey().answers[q.id].attempts, 1); assert.equal(flow.journey().answers[q.id].neededHelp, true);
  await flow.click('다음 문제'); assert.doesNotMatch(flow.html(), /합성 저장 실패|내 선택:/);
});

test('core grammar distinctions cover noun endings, na/i adjectives, polite verb past, conditional and permission without pretending they share one conjugation', () => {
  const find = (id: string) => getChunkLesson(id)!;
  assert.match(JSON.stringify(find('f01').chunks), /정중한 서술/);
  assert.match(JSON.stringify(find('f06').chunks), /ます|조사/);
  assert.match(JSON.stringify(find('f10')), /な형용사/); assert.match(JSON.stringify(find('f10')), /静かでした/);
  assert.match(JSON.stringify(find('f12')), /い형용사/); assert.match(JSON.stringify(find('f12')), /安かった/);
  assert.match(JSON.stringify(find('f08').variations), /부탁.*과거형으로 만들지 않아요/);
  assert.match(JSON.stringify(find('f13').variations), /허락.*혼동하지/);
  assert.match(JSON.stringify(find('f18').variations), /과거라고 판단하지/);
});


test('all meaning questions render their target once, including all 20 reading targets; blank/listening do not inherit it or leak feedback', async () => {
  let readingTargets = 0;
  for (const lesson of lessons) {
    const flow = chunkHarness(lesson);
    await flow.click('조각별 뜻과 역할 보기'); await flow.click('단어·시제 바꾼 예문 보기'); await flow.click('선택 문제 시작');
    for (const question of lesson.questions) {
      const html = flow.html();
      const paragraphs = elements(flow.tree()).filter(node => node.type === 'p').map(node => label(node.props.children as React.ReactNode));
      assert.doesNotMatch(html, /정답:|내 선택:|data-correct="true"/);
      assert.ok(!html.includes(question.explanation), `${question.id}: explanation hidden`);
      assert.ok(!paragraphs.includes(lesson.meaning), `${question.id}: translation must not be revealed outside choices`);
      if (question.kind === 'meaning') {
        assert.equal(paragraphs.filter(text => text.includes(lesson.sentence)).length, 1, `${lesson.lessonId}: target appears once`);
        if (JAPANESE_READING_CHUNK_LESSONS.includes(lesson)) {
          readingTargets++;
          assert.match(html, /lang="ja" aria-label="뜻을 고를 문장"/);
          assert.ok(paragraphs.includes(lesson.sentence), `${lesson.lessonId}: actual reading target`);
        }
      } else {
        assert.doesNotMatch(html, /aria-label="뜻을 고를 문장"/);
        assert.ok(!paragraphs.some(text => text.includes(lesson.sentence)), `${question.id}: no full source answer sentence`);
        if (question.kind === 'listening') assert.ok(!html.includes(question.audioText!), `${question.id}: text alternative remains opt-in`);
      }
      await flow.click(question.choices[question.answer]); await Promise.resolve();
      await flow.click(question.kind === 'listening' ? '이번 연습 확인' : '다음 문제');
    }
  }
  assert.equal(readingTargets, 20);
});


test('original reading uncertain save retries original observation once and refuses an intervening attempt', async () => {
  const lesson = JAPANESE_READING_LESSONS[0], question = lesson.questions[0];
  const flow = readingHarness(lesson);
  await flow.click('확인 문제 시작'); flow.uncertainNext(); await flow.click(question.choices[question.answer]);
  const original = flow.journey().answers[question.id];
  assert.match(flow.html(), /합성 저장 미확인/); assert.match(flow.html(), /아직 이 답의 저장을 확인하지 못했어요/);
  await flow.click('이 답 저장 다시 시도');
  assert.equal(flow.journey().answers[question.id].attempts, 1);
  assert.equal(flow.journey().answers[question.id].lastAttemptId, original.lastAttemptId);
  assert.equal(flow.journey().answers[question.id].lastAnsweredAt, original.lastAnsweredAt);
  const competing = readingHarness(lesson);
  await competing.click('확인 문제 시작'); competing.uncertainNext(); await competing.click(question.choices[question.answer]);
  competing.otherAttempt(question.id); const newer = JSON.stringify(competing.journey().answers[question.id]);
  await competing.click('이 답 저장 다시 시도');
  assert.match(competing.html(), /다른 답안 기록이 먼저 저장됐어요/);
  assert.equal(JSON.stringify(competing.journey().answers[question.id]), newer);
  assert.match(competing.html(), /disabled="">다음 문제/);
});
