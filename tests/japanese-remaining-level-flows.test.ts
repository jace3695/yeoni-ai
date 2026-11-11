import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as levels from '../data/japaneseLevels.ts';
import * as readings from '../data/japaneseReadingLessons.ts';
import * as supports from '../data/japaneseReadingSupport.ts';
import * as enhancements from '../data/japaneseReadingEnhancements.ts';
import * as chunks from '../data/japaneseChunkLessons.ts';
import * as highlights from '../utils/japaneseReadingHighlight.ts';
import * as journeys from '../utils/japaneseLevelJourney.ts';

type Element = React.ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => Element;
const require = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
const Link = ({ children, onNavigate: _onNavigate, ...props }: { children: React.ReactNode; onNavigate?: unknown }) => React.createElement('a', props, children);
function compile(file: string, dependencies: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: Record<string, Component> = {};
  vm.runInNewContext(source, { exports, crypto, Date, Error, Set, AbortController, require: (name: string) => name.endsWith('.module.css') ? css : dependencies[name] ?? require(name) });
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
/** Deterministic component-only hooks. Effects flush after render, rerun on
 * changed dependencies, and clean up on unmount. No DOM, browser, server or audio. */
function hooks() {
  const values: unknown[] = [], effects = new Map<number, { deps?: unknown[]; cleanup?: () => void }>();
  let cursor = 0, dirty = false, writes = 0, pendingEffects: (() => void)[] = [];
  const api = { ...React,
    useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], (value: unknown) => { const next = typeof value === 'function' ? value(values[index]) : value; if (!Object.is(next, values[index])) { dirty = true; writes++; values[index] = next; } }]; },
    useRef(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index]; },
    useEffect(effect: () => (() => void) | void, deps?: unknown[]) {
      const index = cursor++, previous = effects.get(index);
      if (!previous || !deps || !previous.deps || deps.some((value, i) => !Object.is(value, previous.deps![i]))) {
        pendingEffects.push(() => { previous?.cleanup?.(); const cleanup = effect(); effects.set(index, { deps, cleanup: cleanup || undefined }); });
      }
    },
  };
  function render(callback: () => Element) {
    let node: Element;
    for (let i = 0; i < 12; i++) {
      cursor = 0; dirty = false; pendingEffects = []; node = callback();
      for (const effect of pendingEffects) effect();
      if (!dirty) return node;
    }
    throw new Error('Synthetic component did not settle');
  }
  return { api, render, unmount: () => effects.forEach(effect => effect.cleanup?.()), writes: () => writes };
}
function actions(render: () => Element) {
  const button = (text: string) => { const found = elements(render()).find(node => node.type === 'button' && label(node.props.children as React.ReactNode) === text); assert.ok(found, `Button missing: ${text}`); return found; };
  const link = (text: string) => { const found = elements(render()).find(node => node.type === Link && label(node.props.children as React.ReactNode) === text); assert.ok(found, `Link missing: ${text}`); return found; };
  return { button, link, html: () => renderToStaticMarkup(render()), click: (text: string) => { const found = button(text); assert.ok(!found.props.disabled, `Button disabled: ${text}`); return (found.props.onClick as () => void | Promise<void>)(); } };
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const middle = readings.getJapaneseReadingLesson('middle-core-01')!;
const upper = readings.getJapaneseReadingLesson('upper-core-01')!;
function seed() {
  let state = journeys.emptyLevelJourney();
  for (const [lessonId, questionId] of [[middle.id, middle.questions[0].id], [middle.id, middle.questions[2].id], [upper.id, upper.questions[0].id], ['retired-unit', 'retired-q']]) {
    state = journeys.rememberUpperAnswer(state, { lessonId, questionId, attemptId: `seed:${questionId}`, correct: false, neededHelp: false }, new Date('2001-01-01T00:00:00Z'));
  }
  state = journeys.rememberUpperAnswer(state, { lessonId: middle.id, questionId: middle.questions[1].id, attemptId: 'future', correct: true, neededHelp: false }, new Date('2090-01-01T00:00:00Z'));
  state.practicedUnits['old-unit'] = '2001-01-01T00:00:00Z';
  return state;
}
function store(initial = seed(), deferred = false) {
  let value = initial, calls = 0, commits = 0, fail = false;
  const releases: (() => void)[] = [], proposals: journeys.LevelJourney[] = [];
  const update = async (change: (state: journeys.LevelJourney) => journeys.LevelJourney, signal?: AbortSignal) => {
    calls++; proposals.push(clone(change(value)));
    if (deferred) await new Promise<void>(resolve => releases.push(resolve));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (fail) { fail = false; throw new Error('Synthetic save failed'); }
    value = change(value); commits++; return value;
  };
  return { value: () => value, replace: (next: journeys.LevelJourney) => { value = next; }, update, calls: () => calls, commits: () => commits, proposals, failNext: () => { fail = true; }, release: () => { const next = releases.shift(); assert.ok(next, 'No pending synthetic save'); next(); } };
}
function workspace(storage = store(), requestedLevel?: string) {
  const runtime = hooks(); let props: Record<string, unknown> = { requestedLevel }, owner = 'synthetic-A:epoch1:reset1', readError = '', loading = false;
  let hookState = { owner, value: storage.value() };
  const readHook = () => { if (hookState.owner !== owner || hookState.value !== storage.value()) hookState = { owner, value: storage.value() }; return { state: loading ? undefined : hookState, readError, update: storage.update, reload() {} }; };
  const Reading = () => React.createElement('div', { 'data-reading-double': true });
  const component = compile('../components/language/LevelLearningWorkspace.tsx', {
    react: runtime.api, 'next/link': Link, '@/data/japaneseLevels': levels, '@/data/japaneseReadingLessons': readings,
    '@/utils/curriculumProgress': { loadCurriculumProgress: () => ({ completedLessonIds: ['f01', 'f12', 'f20'] }) },
    '@/utils/japaneseLevelJourney': journeys, './UpperReadingLesson': Reading,
    './useLevelJourney': { useLevelJourney: readHook },
  }).default;
  const render = () => runtime.render(() => component(props));
  return { ...actions(render), render, storage, unmount: runtime.unmount,
    navigate: (next: Record<string, unknown>) => { props = next; render(); },
    owner: (next: string) => { owner = next; render(); }, readError: (next: string) => { readError = next; render(); }, loading: () => { loading = true; render(); },
  };
}
function reading(storage = store(), reviewOnly = true) {
  const runtime = hooks(); let stops = 0;
  const component = compile('../components/language/UpperReadingLesson.tsx', {
    react: runtime.api, 'next/link': Link, '@/data/japaneseLevels': levels, '@/data/japaneseReadingSupport': supports, '@/data/japaneseReadingEnhancements': enhancements,
    '@/data/japaneseChunkLessons': chunks, './JapaneseChunkPractice': () => null, '@/utils/japaneseReadingHighlight': highlights, '@/utils/japaneseLevelJourney': journeys,
    './ReadingLessonEnhancements': compile('../components/language/ReadingLessonEnhancements.tsx', {}),
    './useLearningAudio': { useLearningAudio: () => ({ playing: false, audioError: '', stop() { stops++; }, async play() { return false; } }) },
  }).default;
  const render = () => runtime.render(() => component({ lesson: middle, level: 'intermediate', journey: storage.value(), reviewOnly, update: storage.update }));
  return { ...actions(render), render, storage, unmount: runtime.unmount, stateWrites: runtime.writes, stops: () => stops };
}

test('actual workspace separates previews from all explicit choices, restores selected state, and retains earlier learning IDs', async () => {
  const storage = store(), before = clone(storage.value()), flow = workspace(storage);
  for (const level of ['intermediate', 'advanced', 'beginner']) {
    const title = levels.JAPANESE_LEVELS[level as levels.JapaneseLevel].title;
    assert.equal(flow.link(`${title} 살펴보기`).props.href, `/language/levels?level=${level}`);
    flow.navigate({ requestedLevel: level });
  }
  assert.equal(storage.calls(), 0); assert.deepEqual(storage.value(), before);
  for (const level of ['intermediate', 'advanced', 'beginner'] as const) {
    flow.navigate({ requestedLevel: level }); await flow.click(`${levels.JAPANESE_LEVELS[level].title} 선택하기`);
    assert.equal(storage.value().selectedLevel, level); assert.deepEqual(storage.value().answers, before.answers); assert.deepEqual(storage.value().practicedUnits, before.practicedUnits);
    const restored = workspace(storage); assert.match(restored.html(), new RegExp(`내가 선택한 단계: <strong>${levels.JAPANESE_LEVELS[level].title}</strong>`)); restored.unmount();
  }
  assert.equal(storage.commits(), 3);
  const links = elements(flow.render()).filter(node => node.type === Link).map(node => node.props.href);
  assert.ok(links.includes('/language/learn?lesson=f01&level=beginner')); assert.ok(links.includes('/language/learn?lesson=f12&level=beginner')); assert.ok(!links.includes('/language/learn?lesson=f13&level=beginner'));
  assert.equal(journeys.readLevelJourney({ getItem: () => JSON.stringify(storage.value()), setItem: () => assert.fail('Read-only reopen') }).selectedLevel, 'beginner');
});

test('selection failure, pending duplicates and changed navigation context preserve records and avoid false success', async () => {
  const storage = store(seed(), true), before = clone(storage.value()), flow = workspace(storage, 'intermediate');
  const stale = flow.button('중급 선택하기').props.onClick as () => Promise<void>;
  storage.failNext(); const failed = stale(); await stale(); assert.equal(storage.calls(), 1); storage.release(); await failed;
  assert.match(flow.html(), /Synthetic save failed/); assert.doesNotMatch(flow.html(), /중급을 선택했어요/); assert.deepEqual(storage.value(), before);
  const pending = flow.click('중급 선택하기');
  (flow.link('고급 살펴보기').props.onNavigate as () => void)(); flow.navigate({ requestedLevel: 'advanced' });
  await stale(); assert.equal(storage.calls(), 2); storage.release(); await pending; assert.deepEqual(storage.value(), before);
  assert.doesNotMatch(flow.html(), /중급을 선택했어요|Synthetic save failed/);
  const current = flow.click('고급 선택하기'); storage.release(); await current; assert.equal(storage.value().selectedLevel, 'advanced'); assert.equal(storage.commits(), 1);
});

test('invalid level, unknown lesson, browsing review scope and owner remount keys do not write', () => {
  const storage = store(), before = clone(storage.value()), flow = workspace(storage, 'not-a-level');
  assert.match(flow.html(), /요청한 단계를 찾지 못해/); flow.navigate({ requestedLevel: 'intermediate' });
  assert.match(flow.html(), /전체 단계 예정 복습: 3문제 · 전체 3문제/); flow.click('살펴보는 중급만'); assert.match(flow.html(), /살펴보는 중급 예정 복습: 2문제 · 전체 3문제/);
  assert.equal(flow.link(`${middle.title} · 예정된 2문제 복습`).props.href, `/language/levels?lesson=${middle.id}&review=1`);
  flow.navigate({ requestedLevel: 'advanced' }); assert.match(flow.html(), /살펴보는 고급 예정 복습: 1문제 · 전체 3문제/);
  flow.navigate({ requestedLevel: 'advanced', lessonId: 'missing' }); assert.match(flow.html(), /단원을 찾지 못했어요/);
  flow.navigate({ lessonId: middle.id, reviewOnly: true }); const first = flow.render().key; flow.owner('synthetic-B:epoch2:reset1'); assert.notEqual(flow.render().key, first);
  flow.readError('Synthetic read failed'); assert.match(flow.html(), /Synthetic read failed/); assert.doesNotMatch(flow.html(), /선택하기|예정된.*문제 복습/);
  flow.readError(''); flow.loading(); assert.match(flow.html(), /불러오고 있어요/);
  assert.equal(storage.calls(), 0); assert.deepEqual(storage.value(), before);
});

test('reading due queue excludes future, foreign and unknown questions, freezes through saves, and recomputes on reopen', async () => {
  const storage = store(), before = clone(storage.value()), flow = reading(storage);
  assert.match(flow.html(), /예정 복습 1\/2/); assert.equal(storage.calls(), 0);
  await flow.click(middle.questions[0].choices[middle.questions[0].answer]); assert.match(flow.html(), /예정 복습 1\/2/); await flow.click('다음 문제');
  assert.match(flow.html(), new RegExp(middle.questions[2].prompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await flow.click(middle.questions[2].choices[middle.questions[2].answer]); await flow.click('복습 마치기');
  assert.match(flow.html(), /이번 복습을 마쳤어요/); assert.deepEqual(storage.value().practicedUnits, before.practicedUnits);
  for (const id of [middle.questions[1].id, upper.questions[0].id, 'retired-q']) assert.deepEqual(storage.value().answers[id], before.answers[id]);
  assert.equal(storage.value().selectedLevel, before.selectedLevel); assert.equal(storage.commits(), 2);
  flow.unmount(); const reopened = reading(storage); assert.match(reopened.html(), /지금 예정된 복습은 없어요/); assert.equal(storage.commits(), 2);
  assert.equal(reopened.link('단원 전체 보기').props.href, `/language/levels?lesson=${middle.id}`);
});

test('same reading questions repeated after feedback remain helped practice with a new attempt and a fixed due-only queue', async () => {
  const storage = store(), flow = reading(storage);
  const q0 = middle.questions[0], q2 = middle.questions[2];
  await flow.click(q0.choices[(q0.answer + 1) % q0.choices.length]); await flow.click('다음 문제');
  await flow.click(q2.choices[q2.answer]); await flow.click('복습 마치기');
  const firstId = storage.value().answers[q0.id].lastAttemptId;
  await flow.click('같은 문제 더 반복하기'); assert.match(flow.html(), /예정 복습 1\/2/); assert.doesNotMatch(flow.html(), /내 선택:|정답:/);
  await flow.click(q0.choices[q0.answer]);
  const repeated = storage.value().answers[q0.id];
  assert.notEqual(repeated.lastAttemptId, firstId); assert.equal(repeated.attempts, 3);
  assert.equal(repeated.neededHelp, true, 'The answer was just revealed in this same session; repeat must not claim independent recall');
  assert.deepEqual(repeated.successDates, []); assert.equal(repeated.intervalDays, 1); assert.equal(storage.value().selectedLevel, 'beginner');
});

test('a full-unit repeat after all feedback is helped practice, without extra completion records or promotion', async () => {
  const storage = store(journeys.emptyLevelJourney()), flow = reading(storage, false);
  await flow.click('확인 문제 시작');
  for (const [i, question] of middle.questions.entries()) { await flow.click(question.choices[question.answer]); await flow.click(i < middle.questions.length - 1 ? '다음 문제' : '표현을 비교하며 자기점검'); }
  assert.equal(flow.button('이번 단원 연습 기록 저장').props.disabled, true);
  const checkbox = elements(flow.render()).find(node => node.type === 'input' && node.props.type === 'checkbox')!;
  (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
  await flow.click('이번 단원 연습 기록 저장'); const beforeRepeat = clone(storage.value().practicedUnits);
  await flow.click('같은 문제 더 반복하기'); await flow.click(middle.questions[0].choices[middle.questions[0].answer]);
  assert.equal(storage.value().answers[middle.questions[0].id].neededHelp, true); assert.deepEqual(clone(storage.value().practicedUnits), beforeRepeat); assert.equal(storage.value().selectedLevel, 'beginner');
});

test('reading pending double clicks, retry after failure and late completion after unmount never claim unsaved work', async () => {
  const storage = store(seed(), true), before = clone(storage.value()), flow = reading(storage), q = middle.questions[0];
  storage.failNext(); const handler = flow.button(q.choices[q.answer]).props.onClick as () => Promise<void>;
  const failed = handler(); await handler(); assert.equal(storage.calls(), 1); assert.equal(flow.button('다음 문제').props.disabled, true);
  storage.release(); await failed; assert.match(flow.html(), /Synthetic save failed/); assert.deepEqual(storage.value(), before);
  const retry = flow.click('이 답 저장 다시 시도'); assert.deepEqual(storage.proposals[1], storage.proposals[0]);
  storage.release(); await retry; assert.equal(storage.commits(), 1); assert.equal(storage.value().answers[q.id].attempts, before.answers[q.id].attempts + 1);
  await flow.click('다음 문제'); const pending = flow.click(middle.questions[2].choices[middle.questions[2].answer]);
  (flow.link('← 중급 단원으로').props.onNavigate as () => void)(); flow.unmount(); const countAtUnmount = flow.stateWrites();
  storage.release(); await pending; assert.equal(flow.stateWrites(), countAtUnmount); assert.equal(storage.commits(), 1);
  const reopened = reading(storage); assert.doesNotMatch(reopened.html(), /내 선택:|정답:|Synthetic save failed/); assert.match(reopened.html(), /예정 복습 1\/1/);
});

test('opening, backing from and reopening a reading lesson without an answer makes no learning writes', async () => {
  const storage = store(), before = clone(storage.value()), flow = reading(storage, false);
  await flow.click('확인 문제 시작'); await flow.click('본문 다시 읽기');
  (flow.link('← 중급 단원으로').props.onNavigate as () => void)(); flow.unmount();
  const reopened = reading(storage, false); assert.match(reopened.html(), /무엇을 찾으며 읽을까요/); assert.doesNotMatch(reopened.html(), /내 선택:|정답:/);
  assert.deepEqual(storage.value(), before); assert.equal(storage.calls(), 0);
});
