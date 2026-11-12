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

// Active /language/settings regression coverage. Actual TSX and persistence
// modules run with synthetic hooks and Storage; not a browser/React scheduler.
function mountActiveSettings(store: ReturnType<typeof activeSettingsStore>, initialReady = 'ready') {
  type Slot = { value?: any; initialized?: boolean; deps?: unknown[]; cleanup?: () => void };
  type UiNode = { type: unknown; props: Record<string, any> };
  const slots: Slot[] = []; let cursor = 0, dirty = true, tree: unknown, ready = initialReady;
  const effects: (() => void)[] = [], listeners = new Map<string, Set<() => void>>();
  const slot = () => slots[cursor++] ||= {};
  const hooks = {
    useState(initial: any) { const state = slot(); if (!state.initialized) { state.initialized = true; state.value = typeof initial === 'function' ? initial() : initial; } return [state.value, (next: any) => { const value = typeof next === 'function' ? next(state.value) : next; if (!Object.is(value, state.value)) { state.value = value; dirty = true; } }]; },
    useRef(initial: any) { const state = slot(); if (!state.initialized) { state.initialized = true; state.value = { current: initial }; } return state.value; },
    useContext() { return ready; },
    useCallback(fn: unknown, deps: unknown[]) { const state = slot(); if (!state.initialized || deps.length !== state.deps?.length || deps.some((value, index) => !Object.is(value, state.deps?.[index]))) { state.initialized = true; state.deps = deps; state.value = fn; } return state.value; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) { const state = slot(); if (!state.initialized || deps.length !== state.deps?.length || deps.some((value, index) => !Object.is(value, state.deps?.[index]))) { state.initialized = true; state.deps = deps; effects.push(() => { state.cleanup?.(); state.cleanup = effect() || undefined; }); } },
  };
  let confirmed = true, resetting = false;
  const windowDouble = {
    localStorage: store, confirm: () => confirmed,
    addEventListener(event: string, listener: () => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); },
    removeEventListener(event: string, listener: () => void) { listeners.get(event)?.delete(listener); },
    dispatchEvent(event: { type: string }) { for (const listener of listeners.get(event.type) || []) listener(); },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const stub = (value: unknown) => ({ __esModule: true, default: value });
  const doubles: Record<string, unknown> = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@/components/YeoniPreferencesPanel': stub('preferences-double'), '@/app/components/RecordResetPanel': stub('record-reset-double'),
    '@/components/yeoni/LocalRecordGuidance': { LanguageRecordReadiness: {} },
    '@/app/data/appRecordReset': { isRecordResetRunning: () => resetting, RECORD_RESET_EVENT: 'ai-yeoni-record-reset' },
  };
  const cache = new Map<string, { exports: Record<string, any> }>();
  const load = (file: URL): Record<string, any> => {
    const filename = file.href;
    const previous = cache.get(filename); if (previous) return previous.exports;
    const compiled = { exports: {} }; cache.set(filename, compiled);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Script(code, { filename }).runInNewContext({ module: compiled, exports: compiled.exports, Error, Event, window: windowDouble, localStorage: store,
      require(name: string) {
        if (name in doubles) return doubles[name];
        if (name.startsWith('@/')) return load(new URL('../' + name.slice(2) + '.ts', import.meta.url));
        if (name.startsWith('.')) return load(new URL(name.endsWith('.ts') ? name : name + '.ts', file));
        throw Error(`Unreviewed active settings dependency: ${name}`);
      },
    });
    return compiled.exports;
  };
  const component = load(new URL('../app/language/settings/page.tsx', import.meta.url)).default;
  const allNodes = (value: any): UiNode[] => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(allNodes) : [value, ...allNodes(value.props?.children)];
  const text = (value: any): string => value == null || typeof value === 'boolean' ? '' : Array.isArray(value) ? value.map(text).join('') : typeof value === 'object' ? text(value.props?.children) : String(value);
  const render = () => { for (let count = 0; count < 30; count++) { cursor = 0; dirty = false; tree = component(); while (effects.length) effects.shift()!(); if (!dirty) return; } throw Error('Synthetic hook settle bound exceeded'); };
  const nodes = () => { render(); return allNodes(tree); };
  const button = (label: string) => { const found = nodes().find(node => node.type === 'button' && text(node) === label); assert.ok(found, label); return found; };
  const field = (label: string) => { const found = nodes().find(node => node.props.id === label) || allNodes(nodes().find(node => node.type === 'label' && text(node).trim().startsWith(label))).find(node => node.type === 'select' || node.type === 'input'); assert.ok(found, label); return found; };
  render();
  return {
    nodes, text: () => { render(); return text(tree); }, button, field,
    click(label: string) { const node = button(label); assert.ok(!node.props.disabled, label + ' is disabled'); node.props.onClick(); render(); },
    change(label: string, value: string | boolean) { const node = field(label); node.props.onChange({ target: { value: String(value), checked: value } }); render(); },
    confirm(value: boolean) { confirmed = value; },
    replaceStorage(value: ReturnType<typeof activeSettingsStore>) { windowDouble.localStorage = value; },
    readiness(value: string) { ready = value; render(); },
    reset(value: boolean) { resetting = value; },
    event(type: string) { windowDouble.dispatchEvent({ type }); render(); },
    unmount() { for (const state of slots) state.cleanup?.(); },
  };
}
function activeSettingsStore() {
  const values = new Map<string, string>([
    ['language-cloud-sync-user', 'synthetic-owner'], ['fitness-cloud-sync-user', 'synthetic-owner'],
    ['language-cloud-sync-epoch', 'synthetic-language-epoch'], ['fitness-cloud-sync-epoch', 'synthetic-fitness-epoch'],
  ]);
  const writes: { key: string; value: string }[] = [];
  let failRead = '', failWrite = '', dropWrite = '', afterWrite: ((key: string) => void) | undefined;
  return {
    values, writes,
    getItem(key: string) { if (failRead === key) throw Error('synthetic read failure'); return values.get(key) ?? null; },
    setItem(key: string, value: string) { if (failWrite === key) throw Error('synthetic write failure'); writes.push({ key, value }); if (dropWrite !== key) values.set(key, value); afterWrite?.(key); },
    removeItem(key: string) { values.delete(key); },
    failure(options: { read?: string; write?: string; drop?: string; after?: (key: string) => void }) { failRead = options.read || ''; failWrite = options.write || ''; dropWrite = options.drop || ''; afterWrite = options.after; },
  };
}
const settingsKeys = ['japaneseAppSettings', 'learningSettings', settings.INTEGRATED_LEARNING_SETTINGS_KEY] as const;
const rawSettings = (store: ReturnType<typeof activeSettingsStore>) => Object.fromEntries(settingsKeys.map(key => [key, store.getItem(key)]));

test('active Settings mount preserves absent, legacy and malformed bytes without writes', () => {
  for (const raw of [null, '{"ttsRate":0.8,"future":{"preserve":true}}', 'broken', '[]', 'null']) {
    const store = activeSettingsStore(); if (raw !== null) store.values.set('japaneseAppSettings', raw);
    const before = rawSettings(store); const ui = mountActiveSettings(store);
    assert.deepEqual(rawSettings(store), before); assert.equal(store.writes.length, 0);
    if (raw === 'broken' || raw === '[]' || raw === 'null') assert.match(ui.text(), /형식|읽지/);
    ui.unmount();
  }
});

test('active Settings saves preserve learning and integrated extension fields', () => {
  const store = activeSettingsStore();
  store.values.set('learningSettings', '{"dailyGoalCount":3,"future":{"keep":1},"__proto__":{"keep":2}}');
  store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, '{"dailyMinutes":5,"customSyntheticSetting":"keep","__proto__":{"safe":true}}');
  const ui = mountActiveSettings(store); ui.change('daily-goal-count', '2'); ui.change('하루 학습 시간', '20'); ui.click('설정 저장');
  assert.deepEqual(JSON.parse(store.getItem('learningSettings')!), JSON.parse('{"dailyGoalCount":2,"future":{"keep":1},"__proto__":{"keep":2}}'));
  const integrated = JSON.parse(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY)!);
  assert.equal(integrated.dailyMinutes, 20); assert.equal(integrated.customSyntheticSetting, 'keep'); assert.deepEqual(integrated.__proto__, { safe: true });
  assert.match(ui.text(), /학습 목표와 통합 과정 설정이 저장됐어요/); assert.match(ui.text(), /기기 저장 확인이며/); ui.unmount();
});

test('active Settings stale save cannot replace another screen newer selection', () => {
  const store = activeSettingsStore(); store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, '{"dailyMinutes":5}');
  const ui = mountActiveSettings(store); ui.change('하루 학습 시간', '20');
  store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, '{"dailyMinutes":10,"showReading":false}');
  const before = rawSettings(store); store.writes.length = 0; ui.click('학습 설정 저장');
  assert.deepEqual(rawSettings(store), before); assert.equal(store.writes.length, 0); assert.match(ui.text(), /바뀌|달라/); ui.unmount();
});

test('active Settings silent dropped write cannot report success', () => {
  const store = activeSettingsStore(); store.values.set('learningSettings', '{"dailyGoalCount":3}');
  const ui = mountActiveSettings(store); ui.change('daily-goal-count', '2');
  store.failure({ drop: 'learningSettings' }); ui.click('설정 저장');
  assert.doesNotMatch(ui.text(), /저장됐어요/); assert.match(ui.text(), /확인하지 못|확인할 수 없/);
  const writes = store.writes.length; store.failure({}); ui.click('설정 저장'); assert.equal(store.writes.length, writes, 'Uncertain write requires explicit reread');
  ui.click('저장된 설정 다시 읽기'); assert.equal(ui.field('daily-goal-count').props.value, 3); ui.change('daily-goal-count', '2'); ui.click('설정 저장'); assert.equal(JSON.parse(store.getItem('learningSettings')!).dailyGoalCount, 2); ui.unmount();
});

test('active recovery blocks malformed known fields, roots and non-finite extensions without any write', () => {
  const invalid = {
    japaneseAppSettings: ['broken', '', 'false', '[]', 'null', '{"sections":[]}', '{"sections":{"kana":null}}', '{"sections":{"words":{"showReading":0}}}', '{"ttsRate":9}', '{"repeatCount":0}', '{"repeatDelayMs":-1}', '{"future":{"nested":1e999}}'],
    learningSettings: ['broken', '', 'false', '[]', 'null', '{"dailyGoalCount":0}', '{"dailyGoalCount":"3"}', '{"future":[1e999]}'],
    integratedLearningSettingsV1: ['broken', '', 'false', '[]', 'null', '{"dailyMinutes":7}', '{"learnerMode":"unknown"}', '{"showReading":0}', '{"includeSpeaking":null}', '{"future":{"bad":1e999}}'],
  };
  for (const [key, cases] of Object.entries(invalid)) for (const raw of cases) {
    const store = activeSettingsStore(); store.values.set(key, raw); const before = rawSettings(store);
    const ui = mountActiveSettings(store); assert.match(ui.text(), /형식/); assert.equal(store.writes.length, 0); assert.deepEqual(rawSettings(store), before);
    assert.ok(!ui.nodes().some(node => node.type === 'select')); ui.click('설정 다시 읽기'); assert.equal(store.writes.length, 0); assert.deepEqual(rawSettings(store), before); ui.unmount();
  }
});

test('active recovery read failure retains raw bytes and can retry without a default write', () => {
  for (const key of settingsKeys) {
    const store = activeSettingsStore(); store.values.set('learningSettings', '{"dailyGoalCount":2}'); store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, '{"dailyMinutes":20}');
    const before = rawSettings(store); store.failure({ read: key }); const ui = mountActiveSettings(store);
    assert.match(ui.text(), /읽지 못/); assert.equal(store.writes.length, 0);
    store.failure({}); ui.click('설정 다시 읽기'); assert.equal(ui.field('daily-goal-count').props.value, 2); assert.equal(ui.field('하루 학습 시간').props.value, 20);
    assert.deepEqual(rawSettings(store), before); assert.equal(store.writes.length, 0); ui.unmount();
  }
});

test('active recovery details keep immediate autosave, nested extensions and same-choice retry', () => {
  const store = activeSettingsStore();
  const original = '{"ttsRate":0.8,"repeatCount":2,"showReading":false,"future":{"preserve":1},"__proto__":{"top":true},"sections":{"futureSection":{"keep":2},"words":{"showKoreanPronunciation":false,"nested":[1,2],"__proto__":{"section":true}}}}';
  store.values.set('japaneseAppSettings', original); store.values.set('dailyLearningHistory', '{"synthetic-history":"keep"}');
  const ui = mountActiveSettings(store); assert.equal(ui.field('words-tts-rate').props.value, 0.8); assert.equal(ui.field('words-show-reading').props.checked, false);
  store.failure({ write: 'japaneseAppSettings' }); ui.change('words-tts-rate', '0.6');
  assert.equal(store.getItem('japaneseAppSettings'), original); assert.equal(ui.field('words-tts-rate').props.value, 0.6); assert.match(ui.text(), /모두 저장하지 못/);
  store.failure({}); ui.click('상세 설정 다시 저장');
  const saved = JSON.parse(store.getItem('japaneseAppSettings')!); assert.equal(saved.sections.words.ttsRate, 0.6); assert.equal(saved.sections.words.repeatCount, 2); assert.equal(saved.sections.words.showReading, false); assert.equal(saved.sections.words.showKoreanPronunciation, false);
  assert.deepEqual(saved.future, { preserve: 1 }); assert.deepEqual(saved.__proto__, { top: true }); assert.deepEqual(saved.sections.futureSection, { keep: 2 }); assert.deepEqual(saved.sections.words.nested, [1, 2]); assert.deepEqual(saved.sections.words.__proto__, { section: true });
  assert.equal(store.getItem('dailyLearningHistory'), '{"synthetic-history":"keep"}'); assert.doesNotMatch(ui.text(), /모두 저장하지 못/);
  const writes = store.writes.length; ui.change('words-show-reading', true); assert.equal(store.writes.length, writes + 1); assert.equal(JSON.parse(store.getItem('japaneseAppSettings')!).sections.words.showReading, true);
  ui.unmount(); const reopened = mountActiveSettings(store); assert.equal(reopened.field('words-tts-rate').props.value, 0.6); assert.equal(reopened.field('words-show-reading').props.checked, true); assert.equal(store.writes.length, writes + 1); reopened.unmount();
});

test('active recovery partial learning save keeps the draft and retries only unconfirmed writes', () => {
  const store = activeSettingsStore(); store.values.set('learningSettings', '{"dailyGoalCount":3,"keep":1}'); store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, '{"dailyMinutes":5,"keep":2}');
  const ui = mountActiveSettings(store); ui.change('daily-goal-count', '2'); ui.change('하루 학습 시간', '20'); store.failure({ write: settings.INTEGRATED_LEARNING_SETTINGS_KEY }); ui.click('설정 저장');
  assert.deepEqual(JSON.parse(store.getItem('learningSettings')!), { dailyGoalCount: 2, keep: 1 }); assert.equal(JSON.parse(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY)!).dailyMinutes, 5);
  assert.match(ui.text(), /일부는 기기에 반영됐을 수/); assert.equal(ui.field('하루 학습 시간').props.value, 20); assert.doesNotMatch(ui.text(), /저장했어요|저장됐어요/);
  store.failure({}); ui.click('학습 설정 저장'); assert.equal(store.writes.filter(write => write.key === 'learningSettings').length, 1); assert.equal(JSON.parse(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY)!).dailyMinutes, 20); assert.match(ui.text(), /학습 목표와 통합 과정 설정이 저장됐어요/);
  const count = store.writes.length; ui.click('설정 저장'); assert.equal(store.writes.length, count, 'Repeated save is idempotent');
  ui.change('읽는 법 표시', false); assert.doesNotMatch(ui.text(), /저장했어요|저장됐어요/, 'Changed draft clears old success'); ui.unmount();
  const reopened = mountActiveSettings(store); assert.equal(reopened.field('daily-goal-count').props.value, 2); assert.equal(reopened.field('하루 학습 시간').props.value, 20); assert.equal(reopened.field('읽는 법 표시').props.checked, true, 'Unsaved edits are not claimed persisted'); reopened.unmount();
});

test('active recovery external change after a partial write is preserved without rollback', () => {
  const store = activeSettingsStore(); const newer = '{"dailyMinutes":10,"preferredTrack":"travel","newer":true}';
  const ui = mountActiveSettings(store); ui.change('하루 학습 시간', '20');
  store.failure({ after(key) { if (key === 'learningSettings') store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, newer); } });
  ui.click('설정 저장'); assert.equal(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY), newer); assert.equal(store.writes.length, 1); assert.equal(store.writes[0].key, 'learningSettings'); assert.match(ui.text(), /바뀌/);
  store.failure({}); ui.click('설정 저장'); assert.equal(store.writes.length, 1); assert.equal(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY), newer); ui.unmount();
});

test('active recovery reread cancellation keeps drafts and confirmed reread adopts saved settings', () => {
  const store = activeSettingsStore(); const ui = mountActiveSettings(store); ui.change('하루 학습 시간', '20');
  store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, '{"dailyMinutes":5,"showMeaning":false}'); ui.click('설정 저장');
  ui.confirm(false); ui.click('저장된 설정 다시 읽기'); assert.equal(ui.field('하루 학습 시간').props.value, 20); assert.equal(store.writes.length, 0);
  ui.confirm(true); ui.click('저장된 설정 다시 읽기'); assert.equal(ui.field('하루 학습 시간').props.value, 5); assert.equal(ui.field('한국어 뜻 표시').props.checked, false); assert.equal(store.writes.length, 0);
  ui.change('하루 학습 시간', '10'); ui.click('설정 저장'); assert.equal(JSON.parse(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY)!).dailyMinutes, 10); ui.unmount();
});

test('active recovery owner epochs reset and pending journals block stale callbacks without writes', () => {
  for (const key of ['language-cloud-sync-user', 'fitness-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-epoch', 'languageRecordResetV1', 'language-storage-transaction-v1', 'yeoni-storage-transaction-v1']) {
    const store = activeSettingsStore(); const ui = mountActiveSettings(store); ui.change('하루 학습 시간', '20');
    store.values.set(key, 'synthetic-new-generation'); const before = rawSettings(store); ui.click('설정 저장');
    assert.deepEqual(rawSettings(store), before); assert.equal(store.writes.length, 0); assert.doesNotMatch(ui.text(), /저장했어요|저장됐어요/);
    if (key.includes('cloud-sync')) { ui.click('저장된 설정 다시 읽기'); assert.match(ui.text(), /계정 연결/); assert.equal(ui.field('하루 학습 시간').props.value, 20); }
    ui.unmount();
  }
});

test('active recovery session invalidation unmount and reset activity fence captured callbacks', () => {
  for (const condition of ['session', 'unmount', 'reset']) {
    const store = activeSettingsStore(); const ui = mountActiveSettings(store); ui.change('하루 학습 시간', '20'); const callback = ui.button('설정 저장').props.onClick;
    if (condition === 'session') ui.event('yeoni-cloud-session-changed'); else if (condition === 'unmount') ui.unmount(); else if (condition === 'reset') ui.reset(true); else ui.readiness(condition);
    callback(); assert.equal(store.writes.length, 0, condition); assert.equal(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY), null); ui.unmount();
  }
});

test('active recovery write readback failure reports uncertainty and preserves visible choices', () => {
  const store = activeSettingsStore(); const ui = mountActiveSettings(store); ui.change('daily-goal-count', '2');
  store.failure({ after(key) { if (key === 'learningSettings') store.failure({ read: 'learningSettings' }); } });
  ui.click('설정 저장'); assert.match(ui.text(), /저장 결과를 확인하지 못/); assert.doesNotMatch(ui.text(), /저장했어요|저장됐어요/); assert.equal(ui.field('daily-goal-count').props.value, 2);
  assert.equal(store.values.get('learningSettings'), '{"dailyGoalCount":2}'); assert.equal(store.values.get(settings.INTEGRATED_LEARNING_SETTINGS_KEY), undefined);
  store.failure({}); ui.click('저장된 설정 다시 읽기'); assert.equal(ui.field('daily-goal-count').props.value, 2); assert.equal(store.writes.length, 1); ui.unmount();
  for (const condition of ['mutate-then-throw', 'replace-storage']) {
    const source = activeSettingsStore(), replacement = activeSettingsStore(); const editor = mountActiveSettings(source);
    editor.change('daily-goal-count', '2');
    source.failure({ after(key) {
      if (key !== 'learningSettings') return;
      if (condition === 'replace-storage') editor.replaceStorage(replacement);
      throw Error('Synthetic failure after the write');
    } });
    editor.click('설정 저장'); assert.match(editor.text(), /저장 결과를 확인하지 못/); assert.doesNotMatch(editor.text(), /저장했어요|저장됐어요/);
    assert.equal(source.values.get('learningSettings'), '{"dailyGoalCount":2}'); assert.equal(source.writes.length, 1); assert.equal(replacement.writes.length, 0);
    source.failure({}); editor.change('words-tts-rate', '0.6'); assert.equal(source.writes.length, 1, 'Uncertain outcome blocks another part too'); assert.equal(replacement.writes.length, 0);
    editor.click('저장된 설정 다시 읽기');
    if (condition === 'replace-storage') { assert.match(editor.text(), /계정 연결/); assert.equal(replacement.writes.length, 0); }
    else { assert.equal(editor.field('daily-goal-count').props.value, 2); editor.change('words-tts-rate', '0.6'); assert.equal(source.writes.length, 2); }
    editor.unmount();
  }
});

test('active recovery reset cancellation and partial failure preserve extensions and goal count', () => {
  const store = activeSettingsStore(); store.values.set('learningSettings', '{"dailyGoalCount":2,"keep":true}');
  store.values.set('japaneseAppSettings', '{"sections":{"words":{"ttsRate":0.5,"custom":"keep"}},"custom":"keep"}');
  store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, '{"dailyMinutes":20,"showMeaning":false,"custom":"keep"}');
  const ui = mountActiveSettings(store); const before = rawSettings(store); ui.confirm(false); ui.click('학습 설정만 기본값으로'); assert.deepEqual(rawSettings(store), before); assert.equal(store.writes.length, 0);
  ui.confirm(true); store.failure({ write: settings.INTEGRATED_LEARNING_SETTINGS_KEY }); ui.click('학습 설정만 기본값으로'); assert.match(ui.text(), /일부는 기기에 반영됐을 수/); assert.doesNotMatch(ui.text(), /기본값을 기기에 저장했어요/);
  store.failure({}); ui.click('학습 설정만 기본값으로'); const japanese = JSON.parse(store.getItem('japaneseAppSettings')!); const integrated = JSON.parse(store.getItem(settings.INTEGRATED_LEARNING_SETTINGS_KEY)!);
  assert.equal(japanese.sections.words.ttsRate, 1); assert.equal(japanese.sections.words.custom, 'keep'); assert.equal(japanese.custom, 'keep'); assert.equal(integrated.dailyMinutes, 10); assert.equal(integrated.showMeaning, true); assert.equal(integrated.custom, 'keep'); assert.equal(store.getItem('learningSettings'), before.learningSettings); assert.match(ui.text(), /기본값을 기기에 저장했어요/); ui.unmount();
});

test('active recovery initialized editor preserves the existing save-during-cloud-PATCH contract', () => {
  for (const readiness of ['loading', 'error']) {
    const store = activeSettingsStore(); const ui = mountActiveSettings(store);
    ui.change('daily-goal-count', '4'); ui.click('설정 저장');
    assert.ok(ui.nodes().some(node => node.type === 'p' && node.props.children === '학습 목표와 통합 과정 설정이 저장됐어요.'), 'Existing exact E2E message selector remains available');
    assert.match(ui.text(), /기기 저장 확인이며, 서버 반영 상태/);
    // Synthetic context transition only, not a real PATCH or server ack.
    ui.readiness(readiness); ui.change('daily-goal-count', '3'); ui.click('설정 저장');
    assert.equal(JSON.parse(store.getItem('learningSettings')!).dailyGoalCount, 3);
    assert.equal(ui.button('설정 저장').props.disabled, false);
    ui.change('words-tts-rate', '0.6'); assert.equal(JSON.parse(store.getItem('japaneseAppSettings')!).sections.words.ttsRate, 0.6);
    store.values.set(settings.INTEGRATED_LEARNING_SETTINGS_KEY, '{"dailyMinutes":20,"newer":true}');
    const count = store.writes.length; ui.click('설정 저장'); assert.equal(store.writes.length, count); assert.match(ui.text(), /바뀌/); ui.unmount();
  }
});

test('active recovery initial loading waits for readiness without writing or presenting defaults', () => {
  const store = activeSettingsStore(); store.values.set('learningSettings', '{"dailyGoalCount":2}');
  const ui = mountActiveSettings(store, 'loading'); assert.match(ui.text(), /준비/); assert.equal(ui.nodes().filter(node => node.type === 'select').length, 0); assert.equal(store.writes.length, 0);
  ui.readiness('error'); assert.equal(store.writes.length, 0); ui.readiness('ready'); assert.equal(ui.field('daily-goal-count').props.value, 2); assert.equal(store.writes.length, 0); ui.unmount();
});
