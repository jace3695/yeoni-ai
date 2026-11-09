import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import React, { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as audio from '../scripts/japanese-preview/local-audio-probe.ts';
import type { LocalSpeechPort, ProbeUtterance, ProbeVoice } from '../scripts/japanese-preview/local-audio-probe.ts';
import * as navigation from '../scripts/japanese-preview/navigation.ts';

type Element = ReactElement<Record<string, unknown>>;
const require = createRequire(import.meta.url);
function compile(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, (props: Record<string, unknown>) => Element> = {};
  new Script(code).runInNewContext({ exports, ...globals, require: (name: string) => {
    if (name.endsWith('.css')) return {};
    if (name in dependencies) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unreviewed panel dependency: ${name}`);
  } });
  return exports;
}
function hooks() {
  const slots: { value?: unknown; initialized?: boolean; deps?: unknown[]; cleanup?: () => void }[] = [];
  const effects: (() => void)[] = []; let cursor = 0;
  const slot = () => slots[cursor++] ||= {};
  const api = { ...React,
    useState(initial: unknown) {
      const state = slot();
      if (!state.initialized) { state.initialized = true; state.value = typeof initial === 'function' ? initial() : initial; }
      return [state.value, (value: unknown) => { state.value = typeof value === 'function' ? value(state.value) : value; }];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const state = slot();
      if (!state.initialized || deps.length !== state.deps?.length || deps.some((value, index) => !Object.is(value, state.deps?.[index]))) {
        state.initialized = true; state.deps = deps;
        effects.push(() => { state.cleanup?.(); state.cleanup = effect() || undefined; });
      }
    },
  };
  return { api, render: (component: () => Element) => { cursor = 0; const result = component(); while (effects.length) effects.shift()!(); return result; },
    unmount: () => slots.forEach(state => state.cleanup?.()) };
}
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children as ReactNode)];
}
function label(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(label).join('');
  if (React.isValidElement<Record<string, unknown>>(node)) return label(node.props.children as ReactNode);
  return typeof node === 'string' ? node : '';
}

/** Real entry + panel TSX handlers and effects; native synthesis is replaced by
 * an explicit fake port. This is silent VM evidence, not browser/audio QA. */
function panel() {
  const parentHooks = hooks(), childHooks = hooks();
  const local: ProbeVoice = { name: 'Synthetic Japanese', voiceURI: 'urn:qa:ja', lang: 'ja-JP', localService: true, default: true };
  const submitted: ProbeUtterance[] = [], voiceListeners = new Set<() => void>();
  const pageListeners = new Map<string, Set<() => void>>();
  let cancels = 0, speaking = false, pending = false;
  const port: LocalSpeechPort = {
    getVoices: () => [local], createUtterance: text => ({ text, voice: null, lang: '', rate: 0, pitch: 0, volume: 0, onstart: null, onend: null, onerror: null }),
    speak: utterance => { submitted.push(utterance); pending = true; },
    cancel: () => { cancels++; speaking = false; pending = false; },
    state: () => ({ speaking, pending, paused: false }), userActivation: () => true,
    onVoicesChanged: listener => { voiceListeners.add(listener); return () => { voiceListeners.delete(listener); }; },
  };
  const window = { origin: 'null', addEventListener(name: string, listener: () => void) {
    if (!pageListeners.has(name)) pageListeners.set(name, new Set()); pageListeners.get(name)!.add(listener);
  }, removeEventListener(name: string, listener: () => void) { pageListeners.get(name)?.delete(listener); } };
  const ProbeMarker = () => null;
  let root: Element | undefined;
  const imports: Record<string, unknown> = {
    react: parentHooks.api, 'react-dom/client': { createRoot: () => ({ render: (element: Element) => { root = element; } }) },
    '../../data/curriculum': { CURRICULUM: [] }, '../../data/japaneseLevels': { isJapaneseLevel: () => false },
    './LocalAudioProbe': ProbeMarker, './catalog': { PREVIEW_CURRICULUM_CATALOG: [], PREVIEW_READING_CATALOG: [], PREVIEW_CHUNK_CATALOG: [] },
    '../../data/japaneseReadingLessons': {}, '../../data/japaneseChunkLessons': { JAPANESE_CHUNK_LESSONS: [] },
    '../../utils/japaneseLevelJourney': {}, '../../utils/japaneseChunkReview': {}, './navigation': navigation,
    './runtime': { assertOpaquePreviewOrigin: (origin: string) => assert.equal(origin, 'null'), seedSyntheticOwner() {} },
  };
  for (const name of ['../../components/language/LevelLearningWorkspace', '../../components/language/FocusedLesson', '../../components/language/JapaneseChunkPractice', '../../components/language/ChunkReviewWorkspace', './PreviewCatalog', './SessionOptions', '../../app/language/kana/page', '../../app/language/words/page', '../../app/language/grammar/page', '../../app/language/sentences/page', '../../app/language/review/page', './DailyRecordProbe']) imports[name] = () => null;
  compile('../scripts/japanese-preview/entry.tsx', imports, { window, location: { hash: '#/language/qa-catalog' }, document: { getElementById: () => ({}) } });
  assert.ok(root);
  const Parent = root.type as () => Element;
  const Child = compile('../scripts/japanese-preview/LocalAudioProbe.tsx', {
    react: childHooks.api, './local-audio-probe': audio, './native-local-audio': { browserLocalSpeechPort: () => port },
  }, { window }).default;
  let child: Element;
  const render = () => {
    const parent = parentHooks.render(Parent);
    const props = nodes(parent).find(node => node.type === ProbeMarker)!.props;
    child = childHooks.render(() => Child(props));
    return { parent, child };
  };
  const toggle = (open: boolean) => {
    const disclosure = nodes(render().parent).find(node => node.type === 'details' && node.props.className === 'qa-audio-probe')!;
    (disclosure.props.onToggle as (event: { currentTarget: { open: boolean } }) => void)({ currentTarget: { open } });
    return render();
  };
  const button = () => nodes(render().child).find(node => node.type === 'button' && label(node.props.children as ReactNode) === '선택한 로컬 음성으로 1회 검사')!;
  return {
    render, toggle, button, submitted, get cancels() { return cancels; },
    select() { const select = nodes(render().child).find(node => node.type === 'select')!; (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: audio.strictLocalJapaneseVoices([local])[0].key } }); render(); },
    run: () => (button().props.onClick as () => Promise<void>)(),
    start() { pending = false; speaking = true; submitted.at(-1)?.onstart?.(); },
    end() { pending = false; speaking = false; submitted.at(-1)?.onend?.(); },
    html: () => renderToStaticMarkup(render().child),
    unmount: () => { childHooks.unmount(); parentHooks.unmount(); },
  };
}

test('actual disclosure starts closed, propagates open state and never starts audio automatically', async () => {
  const flow = panel();
  assert.equal(nodes(flow.render().parent).find(node => node.props.className === 'qa-audio-probe')!.props.open, false);
  flow.select(); assert.equal(flow.button().props.disabled, true);
  await flow.run(); assert.equal(flow.submitted.length, 0);
  flow.toggle(true); assert.equal(flow.button().props.disabled, false); assert.equal(flow.submitted.length, 0);
  flow.toggle(false); assert.equal(flow.cancels, 0); flow.unmount();
});

test('actual collapse cancels a queued or started request once and reopening does not replay', async () => {
  for (const started of [false, true]) {
    const flow = panel(); flow.toggle(true); flow.select();
    const pending = flow.run(); assert.equal(flow.submitted.length, 1);
    if (started) flow.start();
    const oldEnd = flow.submitted[0].onend;
    flow.toggle(false); await pending;
    assert.equal(flow.cancels, 1); assert.equal(flow.button().props.disabled, true);
    assert.match(flow.html(), /cancelled/); assert.match(flow.html(), /실제 청취: 미검증/);
    const after = flow.html(); oldEnd?.(); assert.equal(flow.html(), after);
    flow.toggle(false); assert.equal(flow.cancels, 1);
    flow.toggle(true); assert.equal(flow.submitted.length, 1); assert.equal(flow.button().props.disabled, false);
    const next = flow.run(); assert.equal(flow.submitted.length, 2);
    flow.start(); flow.end(); await next;
    assert.match(flow.html(), /ended/); flow.toggle(false); assert.equal(flow.cancels, 1);
    flow.unmount();
  }
});
