import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as data from '../data/japaneseChunkLessons.ts';
import * as practice from '../utils/japaneseChunkPractice.ts';
import * as review from '../utils/japaneseChunkReview.ts';
import * as catalog from '../utils/japaneseChunkCatalog.ts';

const require = createRequire(import.meta.url);
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
type Element = React.ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => Element;
const css = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : String(name) });
const Link = ({ children, ...props }: { children: React.ReactNode }) => React.createElement('a', props, children);
function compile(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: Record<string, Component> = {};
  vm.runInNewContext(source, { exports, crypto, Date, Error, Set, AbortController, ...globals, require: (name: string) => name.endsWith('.module.css') ? css : dependencies[name] ?? require(name) });
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
function hooks() {
  const values: unknown[] = [], cleanups: (() => void)[] = [];
  let cursor = 0, writes = 0;
  const api = { ...React,
    useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], (value: unknown) => { writes++; values[index] = typeof value === 'function' ? value(values[index]) : value; }]; },
    useRef(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index]; },
    useReducer(reducer: (state: unknown, action: unknown) => unknown, argument: unknown, init?: (arg: unknown) => unknown) { const index = cursor++; if (!(index in values)) values[index] = init ? init(argument) : argument; return [values[index], (action: unknown) => { writes++; values[index] = reducer(values[index], action); }]; },
    useEffect(effect: () => (() => void) | void) { const index = cursor++; if (!(index in values)) { values[index] = true; const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } },
    useCallback<T>(fn: T) { cursor++; return fn; },
  };
  return { api, begin: () => { cursor = 0; }, unmount: () => cleanups.forEach(fn => fn()), writes: () => writes };
}
function buttons(render: () => Element) {
  const button = (text: string) => { const node = elements(render()).find(item => item.type === 'button' && label(item.props.children as React.ReactNode) === text); assert.ok(node, `Button missing: ${text}`); return node; };
  return { button, click: (text: string) => { const node = button(text); assert.ok(!node.props.disabled, `Button disabled: ${text}`); return (node.props.onClick as () => unknown)(); } };
}
async function settle() { for (let i = 0; i < 5; i++) await Promise.resolve(); }
const first = data.JAPANESE_CHUNK_LESSONS[0];
const wrongChoice = (index = 0) => (first.questions[index].answer + 1) % first.questions[index].choices.length;
function seed(lessonId = first.lessonId, questionId = first.questions[0].id, attemptId = 'seed') {
  return review.rememberChunkAnswer(review.emptyChunkReview(), { lessonId, questionId, attemptId, correct: false, neededHelp: false, mode: 'choice' }, new Date('2020-01-01T00:00:00Z'));
}
/** Executes the actual TSX event handlers with deterministic hooks, a silent audio
 * double and the real immutable-record functions. This is not browser evidence. */
function session(options: { store?: { value: review.ChunkReviewState }; initial?: boolean; questionIds?: string[]; deferred?: boolean; audioCompleted?: boolean; returnToReview?: boolean } = {}) {
  const runtime = hooks(), store = options.store ?? { value: review.emptyChunkReview() };
  let closed = false, returned = false, stopped = 0, writes = 0, fail = false;
  const proposed: review.ChunkReviewState[] = [], releases: (() => void)[] = [];
  const component = compile('../components/language/JapaneseChunkPractice.tsx', {
    react: runtime.api, 'next/link': Link, '@/utils/japaneseChunkPractice': practice, '@/utils/japaneseChunkReview': review,
    './useChunkReview': { useChunkReview() { throw new Error('Session tests do not bypass owner hook in production'); } },
    './useLearningAudio': { useLearningAudio: () => ({ playing: false, audioError: '', stop() { stopped++; }, async play() { return options.audioCompleted === true; } }) },
  }).ChunkPracticeSession;
  const update = async (change: (state: review.ChunkReviewState) => review.ChunkReviewState) => {
    writes++;
    proposed.push(change(store.value));
    if (options.deferred) await new Promise<void>(resolve => releases.push(resolve));
    if (fail) { fail = false; throw new Error('합성 저장 공간 오류'); }
    store.value = change(store.value); return store.value;
  };
  const render = () => { runtime.begin(); return component({ lesson: first, startAtQuestions: !options.initial, questionIds: options.questionIds ?? [first.questions[0].id], update, onReturnToReview: options.returnToReview ? () => { returned = true; runtime.unmount(); } : undefined, onClose() { closed = true; runtime.unmount(); } }); };
  const actions = buttons(render);
  return { ...actions, render, html: () => renderToStaticMarkup(render()), store, proposed, writes: () => writes, stopped: () => stopped, closed: () => closed, returned: () => returned,
    release: () => { const resolve = releases.shift(); assert.ok(resolve, 'No pending write'); resolve(); }, fail: () => { fail = true; }, unmount: runtime.unmount, stateWrites: runtime.writes };
}

test('async answer saves once, freezes feedback while pending, preserves old wrong history, and gives intentional retry a new ID', async () => {
  const flow = session({ deferred: true });
  const click = flow.button(first.questions[0].choices[wrongChoice()]).props.onClick as () => void;
  click(); click();
  assert.equal(flow.writes(), 1); assert.equal(Object.keys(flow.store.value.events).length, 0);
  assert.match(flow.html(), /저장하고 있어요/); assert.doesNotMatch(flow.html(), /이 답을 이 기기의 보충복습 기록에 저장했어요/);
  for (const text of ['이번 연습 확인', '이 문제 지금 다시 풀기', '이 답 저장 다시 시도', '이전 단계']) assert.equal(flow.button(text).props.disabled, true);
  flow.release(); await settle(); assert.match(flow.html(), /이 답을 이 기기의 보충복습 기록에 저장했어요/);
  const firstId = Object.keys(flow.store.value.events)[0];
  flow.click('이 문제 지금 다시 풀기'); flow.click(first.questions[0].choices[first.questions[0].answer]);
  flow.release(); await settle();
  const events = Object.values(flow.store.value.events);
  assert.equal(events.length, 2); assert.ok(events.some(event => event.attemptId === firstId && !event.correct));
  const retry = events.find(event => event.attemptId !== firstId)!; assert.equal(retry.correct, true); assert.equal(retry.neededHelp, true);
  flow.click('이번 연습 확인'); flow.click('닫고 본수업으로'); assert.equal(flow.closed(), true); assert.ok(flow.stopped() >= 4);
  const reopened = session({ store: flow.store }); assert.doesNotMatch(reopened.html(), /내 선택:|정답:/);
  assert.equal(review.chunkReviewItems(reopened.store.value)[0].attempts, 2);
});

test('save failure retry keeps the identical attempt ID, timestamp and payload, and stale clicks cannot add writes', async () => {
  const flow = session({ deferred: true }); flow.fail();
  flow.click(first.questions[0].choices[wrongChoice()]); flow.release(); await settle();
  assert.match(flow.html(), /합성 저장 공간 오류/); assert.match(flow.html(), /지금 닫거나 이동하면 이 답은 나중복습에 남지 않을 수 있어요/);
  assert.equal(flow.button('이번 연습 확인').props.disabled, true);
  const retry = flow.button('이 답 저장 다시 시도').props.onClick as () => void;
  retry(); retry(); assert.equal(flow.writes(), 2);
  assert.deepEqual(flow.proposed[1], flow.proposed[0]);
  flow.release(); await settle(); retry(); assert.equal(flow.writes(), 2);
  assert.equal(Object.keys(flow.store.value.events).length, 1);
});

test('failed close discards only the unsaved local answer; late completions do not update an unmounted session', async () => {
  const store = { value: seed() }, before = JSON.stringify(store.value);
  const failed = session({ store, deferred: true }); failed.fail(); failed.click(first.questions[0].choices[wrongChoice()]); failed.release(); await settle();
  failed.click('닫고 본수업으로'); assert.equal(JSON.stringify(store.value), before);
  const reopened = session({ store }); assert.doesNotMatch(reopened.html(), /내 선택:|정답:/);
  const delayed = session({ deferred: true }); delayed.click(first.questions[0].choices[wrongChoice()]); delayed.click('닫고 본수업으로');
  const writesAtClose = delayed.stateWrites(); delayed.release(); await settle(); assert.equal(delayed.stateWrites(), writesAtClose);
});

test('fresh due question may be independent; examples, previous navigation, feedback and immediate retry are help', async () => {
  const fresh = session(); fresh.click(first.questions[0].choices[first.questions[0].answer]); await settle();
  assert.equal(Object.keys(fresh.store.value.events).length, 0); assert.match(fresh.html(), /새 보충복습 항목은 만들지 않았어요/);
  const learned = session({ initial: true }); learned.click('조각별 뜻과 역할 보기'); learned.click('단어·시제 바꾼 예문 보기'); learned.click('선택 문제 시작'); learned.click(first.questions[0].choices[first.questions[0].answer]); await settle();
  assert.equal(Object.values(learned.store.value.events)[0].neededHelp, true);
  const previous = session(); previous.click('이전 단계'); previous.click('선택 문제 시작'); previous.click(first.questions[0].choices[first.questions[0].answer]); await settle();
  assert.equal(Object.values(previous.store.value.events)[0].neededHelp, true);
  const multiple = session({ questionIds: first.questions.slice(0, 2).map(item => item.id) }); multiple.click(first.questions[0].choices[first.questions[0].answer]); await settle(); multiple.click('다음 문제'); multiple.click(first.questions[1].choices[first.questions[1].answer]); await settle();
  assert.equal(Object.values(multiple.store.value.events)[0].questionId, first.questions[1].id); assert.equal(Object.values(multiple.store.value.events)[0].neededHelp, true);
});

test('listening tracks playback attempts, failed/incomplete audio and text fallback without claiming actual listening', async () => {
  const question = first.questions[2];
  const none = session({ questionIds: [question.id] }); none.click(question.choices[question.answer]); await settle();
  assert.equal(Object.values(none.store.value.events)[0].mode, 'choice'); assert.equal(Object.values(none.store.value.events)[0].neededHelp, true);
  const failed = session({ questionIds: [question.id] }); failed.click('문제 소리 듣기'); await settle(); failed.click(question.choices[question.answer]); await settle();
  assert.equal(Object.values(failed.store.value.events)[0].mode, 'audio'); assert.equal(Object.values(failed.store.value.events)[0].neededHelp, true);
  const completed = session({ questionIds: [question.id], store: { value: seed(first.lessonId, question.id) }, audioCompleted: true }); completed.click('문제 소리 듣기'); await settle(); completed.click(question.choices[question.answer]); await settle();
  const latest = review.chunkReviewItems(completed.store.value)[0]; assert.equal(latest.mode, 'audio'); assert.equal(latest.neededHelp, false); assert.match(completed.html(), /실제 청취 여부는 확인하지 않아요/);
  const text = session({ questionIds: [question.id], audioCompleted: true }); text.click('문장 보기로 대신하기'); text.click(question.choices[question.answer]); await settle();
  const event = Object.values(text.store.value.events)[0]; assert.equal(event.mode, 'reading'); assert.equal(event.neededHelp, true);
  const interrupted = session({ questionIds: [question.id], audioCompleted: true }); interrupted.click('문제 소리 듣기'); interrupted.click(question.choices[question.answer]); await settle();
  assert.equal(Object.values(interrupted.store.value.events)[0].neededHelp, true);
});

test('requested review queues are fixed, unknown question IDs are harmless, and restart does not broaden the queue', () => {
  const subset = practice.createChunkPractice(first, { startAtQuestions: true, questionIds: [first.questions[2].id, 'removed'] });
  assert.deepEqual(subset.queue, [2]); assert.equal(subset.stage, 'questions');
  const restarted = practice.reduceChunkPractice(first, subset, { type: 'restart', revision: subset.revision }); assert.deepEqual(restarted.queue, [2]);
  const empty = practice.createChunkPractice(first, { questionIds: ['removed'] }); assert.deepEqual(empty.queue, []); assert.equal(empty.stage, 'done');
});

function workspace(initial = review.emptyChunkReview()) {
  const runtime = hooks(); let value = initial, reloads = 0;
  const Practice = () => React.createElement('div', { 'data-practice-double': true });
  const components = compile('../components/language/ChunkReviewWorkspace.tsx', {
    react: runtime.api, 'next/link': Link, '@/utils/japaneseChunkReview': review, '@/utils/japaneseChunkCatalog': catalog,
    '@/data/japaneseChunkLessons': data, './JapaneseChunkPractice': Practice, './useChunkReview': { useChunkReview() { throw new Error('List tests use explicit synthetic records'); } },
  });
  const render = () => { runtime.begin(); return components.ChunkReviewList({ value, reload() { reloads++; } }); };
  return { ...buttons(render), render, html: () => renderToStaticMarkup(render()), refresh: (next: review.ChunkReviewState) => { value = next; }, active: () => elements(render()).find(item => item.type === Practice), reloads: () => reloads };
}

test('workspace has separate due/all/free views, current lesson titles and purposes, empty states and non-destructive unknown content', () => {
  const empty = workspace(); assert.match(empty.html(), /아직 저장된 보충복습 문제가 없어요/); empty.click('자유 재연습'); assert.match(empty.html(), new RegExp(`선택한 범위 ${data.JAPANESE_CHUNK_LESSONS.length}단원`));
  for (const lesson of data.JAPANESE_CHUNK_LESSONS) assert.ok(catalog.chunkLessonInfo(lesson.lessonId).track);
  empty.click('여행 표현'); assert.match(empty.html(), /여행/);
  const unknown = review.rememberChunkAnswer(seed(), { lessonId: 'removed-unit', questionId: 'removed-question', attemptId: 'gone', correct: false, neededHelp: false, mode: 'choice' }, new Date('2020-01-01T00:00:00Z'));
  const saved = workspace(unknown); assert.match(saved.html(), /지금 예정 2문제/); assert.match(saved.html(), /저장된 이력은 삭제하지 않았어요/); assert.match(saved.html(), new RegExp(catalog.chunkLessonInfo(first.lessonId).title));
  assert.equal(elements(saved.render()).filter(item => item.type === 'button' && label(item.props.children as React.ReactNode) === '이 문제 다시 풀기').length, 1);
  assert.doesNotMatch(saved.html(), /삭제<\/button>|선택하기<\/button>|완전 숙달|청취 성공/);
  saved.click('저장한 전체 2문제'); assert.match(saved.html(), /저장한 모든 문제/);
});

test('active workspace review freezes its question IDs across remote refresh and closing returns to updated saved list', () => {
  const store = seed(), flow = workspace(store); flow.click('이 문제 다시 풀기');
  const active = flow.active()!; assert.deepEqual(Array.from(active.props.questionIds as string[]), [first.questions[0].id]); assert.equal(active.props.startAtQuestions, true);
  const updated = review.rememberChunkAnswer(store, { lessonId: first.lessonId, questionId: first.questions[0].id, attemptId: 'remote', correct: true, neededHelp: false, mode: 'choice' });
  flow.refresh(updated); assert.equal(flow.active()!.key, active.key); assert.deepEqual(flow.active()!.props.questionIds, active.props.questionIds);
  (flow.active()!.props.onReturnToReview as () => void)(); assert.equal(flow.active(), undefined); assert.equal(flow.reloads(), 1); assert.match(flow.html(), /지금 예정 0문제/); flow.click('저장한 전체 1문제'); assert.match(flow.html(), /저장된 응답 2회/);
});

test('account/reset owner changes remount both local answers and active workspace; read errors and loading expose no practice', () => {
  let hook: { state?: { owner: string; value: review.ChunkReviewState }; readError: string; reload: () => void; update: () => Promise<review.ChunkReviewState> } = { state: { owner: 'A:epoch1:reset1', value: seed() }, readError: '', reload() {}, async update() { return seed(); } };
  const deps = { react: React, 'next/link': Link, '@/utils/japaneseChunkReview': review, '@/utils/japaneseChunkPractice': practice, '@/utils/japaneseChunkCatalog': catalog, '@/data/japaneseChunkLessons': data,
    './useLearningAudio': { useLearningAudio() {} }, './useChunkReview': { useChunkReview: () => hook }, './JapaneseChunkPractice': () => null };
  const practiceOuter = compile('../components/language/JapaneseChunkPractice.tsx', deps).default;
  const workspaceOuter = compile('../components/language/ChunkReviewWorkspace.tsx', deps).default;
  const firstPracticeKey = practiceOuter({ lesson: first, onClose() {} }).key, firstWorkspaceKey = workspaceOuter({}).key;
  hook = { ...hook, state: { owner: 'B:epoch2:reset1', value: review.emptyChunkReview() } };
  assert.notEqual(practiceOuter({ lesson: first, onClose() {} }).key, firstPracticeKey); assert.notEqual(workspaceOuter({}).key, firstWorkspaceKey);
  hook = { ...hook, state: { owner: 'B:epoch2:reset2', value: review.emptyChunkReview() } };
  assert.notEqual(workspaceOuter({}).key, firstWorkspaceKey);
  for (const error of ['', '손상된 기록은 보존합니다.']) {
    hook = { ...hook, state: undefined, readError: error };
    const html = renderToStaticMarkup(practiceOuter({ lesson: first, onClose() {} }));
    assert.doesNotMatch(html, /문제 소리 듣기|조각별 뜻과 역할 보기|뜻을 고를 문장/);
    assert.match(html, error ? /손상된 기록은 보존합니다/ : /불러오고 있어요/);
    assert.doesNotMatch(renderToStaticMarkup(workspaceOuter({})), /저장한 전체|자유 재연습/);
  }
});


test('review-list action leaves the active session even on the same URL; pending/failure warnings remain and core links remain links', async () => {
  const normal = session();
  const link = elements(normal.render()).find(item => label(item.props.children as React.ReactNode) === '표현 조각 보충복습 목록' && item.props.href === '/language/chunk-review');
  assert.ok(link, 'Core lesson keeps its route link');
  for (const failed of [false, true]) {
    const flow = session({ returnToReview: true, deferred: true });
    if (failed) flow.fail();
    flow.click(first.questions[0].choices[wrongChoice()]);
    if (failed) { flow.release(); await settle(); assert.match(flow.html(), /지금 닫거나 이동하면 이 답은 나중복습에 남지 않을 수 있어요/); }
    else assert.match(flow.html(), /완료 전에 닫으면 이 답이 남지 않을 수 있어요/);
    const stops = flow.stopped(); flow.click('표현 조각 보충복습 목록');
    assert.equal(flow.returned(), true); assert.equal(flow.stopped(), stops + 1);
    const stateWrites = flow.stateWrites();
    if (!failed) { flow.release(); await settle(); assert.equal(flow.stateWrites(), stateWrites); }
  }
});

test('useLearningAudio returns true only for onEnd while still current, false for cancellation, preemption, errors, or unmount', async () => {
  const runtime = hooks();
  const jobs: { resolve: () => void; reject: (error: Error) => void; options: { signal: AbortSignal; onEnd: () => void } }[] = [];
  const document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const compiled = compile('../components/language/useLearningAudio.ts', { react: runtime.api, '@/utils/speakJapanese': {
    japaneseAudioErrorMessage: () => '합성 오디오 오류', speakJapaneseWithPreferredTts: (_: string, options: { signal: AbortSignal; onEnd: () => void }) => new Promise<void>((resolve, reject) => jobs.push({ resolve, reject, options })),
  } }, { document });
  runtime.begin(); const audio = (compiled.useLearningAudio as unknown as () => { play: (text: string) => Promise<boolean>; stop: () => void })();
  const done = audio.play('가상'); jobs[0].options.onEnd(); jobs[0].resolve(); assert.equal(await done, true);
  const early = audio.play('가상'); jobs[1].resolve(); assert.equal(await early, false);
  const stopped = audio.play('가상'); audio.stop(); jobs[2].options.onEnd(); jobs[2].resolve(); assert.equal(await stopped, false);
  const old = audio.play('가상'), newer = audio.play('가상'); jobs[3].options.onEnd(); jobs[3].resolve(); assert.equal(await old, false); jobs[4].reject(new Error('failed')); assert.equal(await newer, false);
  const closed = audio.play('가상'); runtime.unmount(); jobs[5].options.onEnd(); jobs[5].resolve(); assert.equal(await closed, false);
});
