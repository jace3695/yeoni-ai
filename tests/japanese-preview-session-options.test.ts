import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import ts from 'typescript';
import { isValidElement, type ReactNode, type ReactElement } from 'react';
import { PreviewMemoryStorage } from '../scripts/japanese-preview/memory-storage.ts';
import { applyPreviewSessionOptions, readPreviewSessionOptions } from '../scripts/japanese-preview/session-options.ts';
import * as curriculum from '../data/curriculum.ts';
import * as progress from '../utils/curriculumProgress.ts';
import * as settings from '../utils/integratedLearningSettings.ts';
import * as sessions from '../utils/learningSession.ts';
import * as levels from '../data/japaneseLevels.ts';
import * as chunks from '../data/japaneseChunkLessons.ts';
import * as expansion from '../data/learningDataExpansion.ts';
import * as dates from '../utils/dateKey.ts';

const snapshot = (store: PreviewMemoryStorage) => Object.fromEntries(Array.from({ length: store.length }, (_, index) => store.key(index)!).sort().map(key => [key, store.getItem(key)]));

/** Executes the actual FocusedLesson initialization/persistence effects with
 * synthetic hooks and memory, not a browser or a visual/layout test. */
function mountFocusedLesson(store: PreviewMemoryStorage, lesson: curriculum.CurriculumLesson) {
  type Slot = { value?: unknown; initialized?: boolean; deps?: unknown[] };
  const slots: Slot[] = []; let cursor = 0; const effects: (() => void)[] = [];
  const slot = () => slots[cursor++] ||= {};
  const hooks = {
    useState(initial: unknown) {
      const state = slot();
      if (!state.initialized) { state.initialized = true; state.value = typeof initial === 'function' ? (initial as () => unknown)() : initial; }
      return [state.value, (value: unknown) => { state.value = typeof value === 'function' ? (value as (previous: unknown) => unknown)(state.value) : value; }];
    },
    useRef(initial: unknown) { const state = slot(); if (!state.initialized) { state.initialized = true; state.value = { current: initial }; } return state.value; },
    useEffect(effect: () => void, deps: unknown[]) {
      const state = slot();
      if (!state.initialized || deps.some((value, index) => !Object.is(value, state.deps?.[index]))) { state.initialized = true; state.deps = deps; effects.push(effect); }
    },
  };
  const cjsModule = { exports: {} as { default: (props: { lesson: curriculum.CurriculumLesson }) => ReactNode } };
  const require = createRequire(import.meta.url);
  const imports: Record<string, unknown> = {
    react: hooks, 'next/link': { default: 'a' },
    '@/components/useYeoniPreferences': { useYeoniPreferences: () => ({ visible: false }) },
    '@/data/curriculum': curriculum, '@/data/learningDataExpansion': expansion,
    '@/utils/curriculumProgress': progress, '@/utils/integratedLearningSettings': settings,
    '@/utils/learningSession': sessions, '@/utils/dateKey': dates, '@/data/japaneseLevels': levels,
    '@/data/japaneseChunkLessons': chunks,
    './JapaneseChunkPractice': { default: 'chunk-practice' }, './LearningCompanion': { default: 'learning-companion' },
    './LearningQuestion': { default: 'learning-question' },
    './useLearningAudio': { useLearningAudio: () => ({ play: async () => false, stop: () => {}, playing: false, audioError: '' }) },
    './learning-focus.module.css': { default: {} },
  };
  const code = ts.transpileModule(readFileSync(new URL('../components/language/FocusedLesson.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Script(code).runInNewContext({ module: cjsModule, exports: cjsModule.exports, localStorage: store, window: { localStorage: store },
    require: (name: string) => { if (name in imports) return imports[name]; if (name === 'react/jsx-runtime') return require(name); throw new Error(`Unreviewed fixture dependency: ${name}`); } });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: store } });
  try {
    for (let render = 0; render < 3; render++) { cursor = 0; cjsModule.exports.default({ lesson }); while (effects.length) effects.shift()!(); }
    return progress.loadCurriculumProgress();
  } finally { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window'); }
}

test('all 5/10/20 and starter/reader options become actual new FocusedLesson sessions without changing older records', () => {
  const freshLesson = curriculum.CURRICULUM.find(lesson => lesson.id === 'w22')!;
  const otherLesson = curriculum.CURRICULUM[0];
  for (const minutes of [5, 10, 20] as const) for (const mode of ['starter', 'reader'] as const) {
    const store = new PreviewMemoryStorage();
    const otherDraft = { ...sessions.createLearningSession(otherLesson.id, 5, 'starter'), wordIndex: 1, answers: { 0: false }, responses: { 0: 'previous' } };
    const originalProgress = { ...progress.DEFAULT_CURRICULUM_PROGRESS, selectedTrack: 'travel', completedLessonIds: ['t01'], quizScores: { t01: 75 }, lessonAttempts: { t01: [{ score: 75, completedAt: '2026-11-01' }] }, lessonDrafts: { [otherLesson.id]: otherDraft }, activeSession: otherDraft };
    store.setItem(progress.CURRICULUM_PROGRESS_KEY, JSON.stringify(originalProgress));
    store.setItem(progress.CURRICULUM_REVIEW_KEY, '[{"id":"f01:0","wrongCount":2}]');
    store.setItem('japaneseLevelJourneyV1', '{"selectedLevel":"advanced"}');
    store.setItem('japaneseChunkReviewV1', '{"synthetic":"preserve"}');
    store.setItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY, JSON.stringify({ dailyMinutes: 10, learnerMode: 'starter', showMeaning: false, customSyntheticSetting: 'keep' }));
    const before = snapshot(store);
    applyPreviewSessionOptions(store, { minutes, mode });
    for (const [key, value] of Object.entries(before)) if (key !== settings.INTEGRATED_LEARNING_SETTINGS_KEY) assert.equal(store.getItem(key), value, key);
    assert.deepEqual(JSON.parse(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY)!), { dailyMinutes: minutes, learnerMode: mode, showMeaning: false, customSyntheticSetting: 'keep' });
    const opened = mountFocusedLesson(store, freshLesson);
    assert.equal(opened.activeSession?.minutes, minutes); assert.equal(opened.activeSession?.mode, mode);
    assert.deepEqual(opened.lessonDrafts?.[otherLesson.id], otherDraft);
    assert.deepEqual(opened.completedLessonIds, originalProgress.completedLessonIds);
    assert.deepEqual(opened.quizScores, originalProgress.quizScores);
    assert.deepEqual(opened.lessonAttempts, originalProgress.lessonAttempts);
    assert.equal(opened.selectedTrack, 'travel');
    for (const key of [progress.CURRICULUM_REVIEW_KEY, 'japaneseLevelJourneyV1', 'japaneseChunkReviewV1']) assert.equal(store.getItem(key), before[key]);
    const indices = sessions.getSessionQuizIndices(freshLesson, opened.activeSession!.minutes);
    assert.equal(indices.length, minutes === 20 ? freshLesson.quiz.length : minutes === 5 ? 3 : 5);
  }
});

test('actual FocusedLesson keeps existing draft options, typed history and answers after new defaults change', () => {
  const lesson = curriculum.CURRICULUM.find(item => item.id === 'f02')!;
  for (const minutes of [5, 10, 20] as const) for (const mode of ['starter', 'reader'] as const) {
    const store = new PreviewMemoryStorage();
    const previous = { ...sessions.createLearningSession(lesson.id, minutes, mode), wordIndex: 1, answers: { 0: false }, firstAnswers: { 0: false }, responses: { 0: '以前の入力' }, observations: { 0: { modality: 'typing' as const, neededHelp: true, responseMs: 1234 } } };
    store.setItem(progress.CURRICULUM_PROGRESS_KEY, JSON.stringify({ ...progress.DEFAULT_CURRICULUM_PROGRESS, lessonDrafts: { [lesson.id]: previous }, activeSession: previous }));
    const before = store.getItem(progress.CURRICULUM_PROGRESS_KEY);
    applyPreviewSessionOptions(store, { minutes: minutes === 20 ? 5 : 20, mode: mode === 'reader' ? 'starter' : 'reader' });
    assert.equal(store.getItem(progress.CURRICULUM_PROGRESS_KEY), before);
    const restored = mountFocusedLesson(store, lesson);
    assert.deepEqual(restored.activeSession, previous);
    assert.deepEqual(restored.lessonDrafts?.[lesson.id], previous);
  }
});

test('failed writes, invalid options and malformed prior settings preserve bytes, with same-choice retry', () => {
  const store = new PreviewMemoryStorage();
  assert.deepEqual(readPreviewSessionOptions(store), { minutes: 10, mode: 'starter' });
  applyPreviewSessionOptions(store, { minutes: 5, mode: 'reader' });
  const before = snapshot(store);
  store.failNextWrite();
  assert.throws(() => applyPreviewSessionOptions(store, { minutes: 20, mode: 'reader' }), /가상 저장 실패/);
  assert.deepEqual(snapshot(store), before);
  applyPreviewSessionOptions(store, { minutes: 20, mode: 'reader' });
  assert.deepEqual(readPreviewSessionOptions(store), { minutes: 20, mode: 'reader' });
  for (const raw of ['invalid', 'null', '[]', 'false']) {
    store.setItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY, raw);
    assert.throws(() => applyPreviewSessionOptions(store, { minutes: 20, mode: 'starter' }));
    assert.equal(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY), raw);
  }
  assert.throws(() => applyPreviewSessionOptions(store, { minutes: 30, mode: 'typing' } as unknown as Parameters<typeof applyPreviewSessionOptions>[1]));
  assert.throws(() => applyPreviewSessionOptions({ getItem: () => null, setItem: () => { throw new Error('Must not be called'); } } as unknown as PreviewMemoryStorage, { minutes: 20, mode: 'reader' }), /가상 메모리/);
  store.clear(); assert.deepEqual(readPreviewSessionOptions(store), { minutes: 10, mode: 'starter' });
});

test('20-minute mode exposes every question including all 210 former input questions, all as choices', () => {
  let formerInputs = 0;
  for (const lesson of curriculum.CURRICULUM) {
    const indices = sessions.getSessionQuizIndices(lesson, 20);
    assert.deepEqual(indices, lesson.quiz.map((_, index) => index));
    for (const index of indices) {
      if (lesson.quiz[index].kind === 'input') formerInputs++;
      for (const mode of ['starter', 'reader'] as const) {
        const choices = sessions.getQuestionChoices(lesson, index, mode);
        assert.ok(choices.length >= 2); assert.equal(choices.filter(choice => choice.correct).length, 1);
      }
    }
  }
  assert.equal(formerInputs, 210);
  const source = readFileSync(new URL('../components/language/LearningQuestion.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<input|<textarea|contentEditable/);
  const ui = readFileSync(new URL('../scripts/japanese-preview/SessionOptions.tsx', import.meta.url), 'utf8');
  assert.match(ui, /이미 열린 수업과 이어하기는 기존 분량·모드·답을 유지/);
  assert.match(ui, /onClick=\{apply\}/); assert.doesNotMatch(ui, /\.clear\(|\.removeItem\(|setRevision|location\./);
});


test('actual QA selectors wait for Apply and a failed apply can retry without clearing history', () => {
  const store = new PreviewMemoryStorage();
  store.setItem(progress.CURRICULUM_PROGRESS_KEY, '{"lessonDrafts":{"f01":{"synthetic":"keep"}}}');
  const previous = store.getItem(progress.CURRICULUM_PROGRESS_KEY);
  const slots: { value?: unknown; initialized?: boolean }[] = []; let cursor = 0;
  const effects: (() => void)[] = [];
  const hooks = {
    useState(initial: unknown) {
      const slot = slots[cursor++] ||= {};
      if (!slot.initialized) { slot.initialized = true; slot.value = initial; }
      return [slot.value, (value: unknown) => { slot.value = typeof value === 'function' ? (value as (previous: unknown) => unknown)(slot.value) : value; }];
    },
    useEffect(effect: () => void) { const slot = slots[cursor++] ||= {}; if (!slot.initialized) { slot.initialized = true; effects.push(effect); } },
  };
  const cjsModule = { exports: {} as { default: () => ReactNode } };
  const require = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync(new URL('../scripts/japanese-preview/SessionOptions.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Script(code).runInNewContext({ module: cjsModule, exports: cjsModule.exports, require: (name: string) => {
    if (name === 'react') return hooks;
    if (name === './runtime') return { qaLocalStorage: store };
    if (name === './session-options') return { readPreviewSessionOptions, applyPreviewSessionOptions };
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unreviewed selector dependency: ${name}`);
  } });
  const render = () => { cursor = 0; const tree = cjsModule.exports.default(); while (effects.length) effects.shift()!(); return tree; };
  const nodes = (tree: ReactNode): ReactElement<Record<string, unknown>>[] => {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (!isValidElement(tree)) return [];
    const node = tree as ReactElement<Record<string, unknown>>;
    return [node, ...nodes(node.props.children as ReactNode)];
  };
  render();
  for (const minutes of [5, 10, 20] as const) for (const mode of ['starter', 'reader'] as const) {
    const before = store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY);
    let tree = render();
    const fields = nodes(tree).filter(node => node.type === 'select');
    (fields[0].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: String(minutes) } });
    (fields[1].props.onChange as (event: { target: { value: string } }) => void)({ target: { value: mode } });
    tree = render();
    assert.equal(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY), before, 'Selecting alone is not Apply');
    const apply = nodes(tree).find(node => node.type === 'button')!;
    store.failNextWrite(); (apply.props.onClick as () => void)();
    assert.equal(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY), before);
    tree = render(); assert.equal(nodes(tree).filter(node => node.props.role === 'alert').length, 1);
    (nodes(tree).find(node => node.type === 'button')!.props.onClick as () => void)();
    tree = render(); assert.equal(nodes(tree).filter(node => node.props.role === 'alert').length, 0);
    assert.equal(nodes(tree).filter(node => node.props.role === 'status').length, 1);
    assert.deepEqual(readPreviewSessionOptions(store), { minutes, mode });
    assert.equal(store.getItem(progress.CURRICULUM_PROGRESS_KEY), previous);
  }
});
