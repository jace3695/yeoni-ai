import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as languageSource from '../lib/yeoni/language-reply-source.ts';
import * as source from '../lib/yeoni/record-reply-sources.ts';
import * as generated from '../lib/yeoni/generated-record-reply.ts';
import * as guidance from '../lib/yeoni/record-guidance.ts';
import { LEVEL_JOURNEY_EVENT } from '../utils/japaneseLevelJourney.ts';
import { CHUNK_REVIEW_EVENT } from '../utils/japaneseChunkReview.ts';

const require = createRequire(import.meta.url);
type Element = React.ReactElement<Record<string, unknown>>;
function load(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(output, { exports, Date, Error, AbortController, ...globals, require: (name: string) => dependencies[name] ?? require(name) });
  return exports;
}

/** Executes actual TSX effects and source props with controlled scheduling.
 * This is component contract evidence, not a browser or remote-storage test. */
function harness(app = 'language') {
  const data = new Map<string, string>([['fitness-cloud-sync-user', 'fixture-A'], ['language-cloud-sync-user', 'fixture-A']]);
  const storage = { getItem: (key: string) => data.get(key) ?? null };
  const slots: unknown[] = []; let cursor = 0, writes = 0, readiness = 'ready', resetRunning = false;
  const effectJobs: (() => void)[] = []; let cleanup: (() => void) | undefined;
  const events = new Map<string, Set<() => void>>(); let interval: (() => void) | undefined;
  const pending: { signal?: AbortSignal; snapshot: languageSource.LanguageReplySnapshot; resolve(value: languageSource.LanguageReplySnapshot): void }[] = [];
  const hooks = { ...React, useContext: () => readiness,
    useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (next: unknown) => { writes++; slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useEffect(effect: () => (() => void) | void, dependencies: unknown[]) { const index = cursor++; const previous = slots[index] as unknown[] | undefined; if (!previous || dependencies.some((x, i) => !Object.is(x, previous[i]))) { slots[index] = dependencies; effectJobs.push(() => { cleanup?.(); cleanup = effect() || undefined; }); } },
  };
  const status = load('components/yeoni/RecordReplyStatus.tsx', { '@/lib/yeoni/generated-record-reply': generated }).default;
  const Component = load('components/yeoni/LocalRecordGuidance.tsx', {
    react: hooks, './RecordReplyStatus': status, '@/lib/yeoni/record-reply-sources': { ...source,
      // VM literals belong to another realm. Bridge valid fixture data through
      // JSON as browser persistence does; do not weaken the product validator.
      replySource(...args: Parameters<typeof source.replySource>) { args[2] = JSON.parse(JSON.stringify(args[2])); return source.replySource(...args); },
    },
    '@/lib/yeoni/record-guidance': guidance, '@/lib/yeoni/language-reply-source': { ...languageSource,
      readLanguageReplySnapshot(_storage: unknown, owner: string, ready: boolean, signal?: AbortSignal) {
        const snapshot = languageSource.captureLanguageReplySnapshot(storage, owner, ready);
        return new Promise(resolve => pending.push({ signal, snapshot, resolve }));
      } },
    '@/utils/japaneseLevelJourney': { LEVEL_JOURNEY_EVENT }, '@/utils/japaneseChunkReview': { CHUNK_REVIEW_EVENT },
    '@/app/data/appRecordReset': { isRecordResetRunning: () => resetRunning, RECORD_RESET_EVENT: 'ai-yeoni-record-reset' },
  }, { localStorage: storage, clearInterval: () => { interval = undefined; }, window: {
    setInterval(callback: () => void) { interval = callback; return 1; },
    addEventListener(name: string, callback: () => void) { const listeners = events.get(name) ?? new Set(); listeners.add(callback); events.set(name, listeners); },
    removeEventListener(name: string, callback: () => void) { events.get(name)?.delete(callback); },
  } }).default as (props: { app: string; languagePath: string }) => Element;
  return { data, pending, render() { cursor = 0; return renderToStaticMarkup(Component({ app, languagePath: '/language/chunk-review' })); },
    effects() { while (effectJobs.length) effectJobs.shift()!(); },
    emit(name: string) { for (const listener of events.get(name) ?? []) listener(); },
    tick() { interval?.(); }, readiness(value: string) { readiness = value; }, reset(value: boolean) { resetRunning = value; }, unmount() { cleanup?.(); },
    writes: () => writes, listeners: () => [...events.values()].reduce((sum, value) => sum + value.size, 0),
    async resolve(index = 0) { const request = pending[index]; request.resolve(request.snapshot); await Promise.resolve(); await Promise.resolve(); },
  };
}
const ready = (html: string) => html.includes('data-source-ready="true"');

test('actual component clears old source while a new locked read is pending and keeps Listen disabled', async () => {
  const h = harness(); assert.equal(ready(h.render()), false); h.effects(); await h.resolve();
  assert.equal(ready(h.render()), true); assert.match(h.render(), /disabled=""/);
  h.tick(); assert.equal(ready(h.render()), false); await h.resolve(1); assert.equal(ready(h.render()), true); h.unmount();
});
test('readiness downgrade suppresses the source in render before the next effect runs', async () => {
  const h = harness(); h.render(); h.effects(); await h.resolve(); assert.equal(ready(h.render()), true);
  h.readiness('loading'); assert.equal(ready(h.render()), false); h.effects(); assert.equal(h.pending[0].signal?.aborted, true); h.unmount();
});
test('changing both owners hides the previous local summary while the replacement read waits', async () => {
  const h = harness(); h.render(); h.effects(); await h.resolve(); assert.equal(ready(h.render()), true);
  h.data.set('fitness-cloud-sync-user', 'fixture-B'); h.data.set('language-cloud-sync-user', 'fixture-B');
  h.emit('yeoni-records-changed'); const pending = h.render();
  assert.equal(ready(pending), false); assert.match(pending, /학습 기록을 확인하고 있어요/);
  h.unmount(); await h.resolve(1);
});
test('new-key events supersede old reads and session invalidation hides pending owner A', async () => {
  const h = harness(); h.render(); h.effects();
  h.data.set('japaneseLevelJourneyV1', JSON.stringify({ version: 1, selectedLevel: 'advanced', answers: {}, practicedUnits: {} }));
  h.emit(LEVEL_JOURNEY_EVENT); assert.equal(h.pending[0].signal?.aborted, true);
  await h.resolve(0); assert.equal(ready(h.render()), false); await h.resolve(1); assert.equal(ready(h.render()), true);
  h.emit(CHUNK_REVIEW_EVENT); h.data.set('language-cloud-sync-user', 'fixture-B'); h.emit('yeoni-cloud-session-changed');
  await h.resolve(2); assert.equal(ready(h.render()), false); assert.equal(h.pending[2].signal?.aborted, true); h.unmount();
});
test('malformed new-key content gives an error state without previous source reuse or storage edits', async () => {
  const h = harness(); h.render(); h.effects(); await h.resolve(); h.render();
  h.data.set('japaneseChunkReviewV1', '{damaged'); const before = new Map(h.data);
  h.emit(CHUNK_REVIEW_EVENT); await h.resolve(1); const html = h.render();
  assert.equal(ready(html), false); assert.match(html, /학습 기록을 확인하지 못했어요/); assert.deepEqual(h.data, before); h.unmount();
});
test('unmount removes new and old listeners, cancels polling and ignores a late result', async () => {
  const h = harness(); h.render(); h.effects(); assert.equal(h.listeners(), 8); h.unmount();
  assert.equal(h.listeners(), 0); const writes = h.writes(); h.tick(); await h.resolve(); assert.equal(h.writes(), writes); assert.equal(h.pending[0].signal?.aborted, true);
});
test('fitness and diet stay on their original synchronous local guidance path', () => {
  for (const app of ['fitness', 'diet']) { const h = harness(app); h.render(); h.effects(); assert.equal(ready(h.render()), true); assert.equal(h.pending.length, 0); assert.match(h.render(), /생성형 답변과 음성 연결 전/); h.unmount(); }
});
test('reset start immediately hides source and summary; polls and late reads cannot restore them', async () => {
  const h = harness(); h.render(); h.effects(); await h.resolve(); assert.equal(ready(h.render()), true);
  h.tick(); h.reset(true); assert.equal(ready(h.render()), false); h.emit('ai-yeoni-record-reset');
  assert.match(h.render(), /학습 기록을 확인하고 있어요/); const requests = h.pending.length;
  h.tick(); h.emit('focus'); assert.equal(h.pending.length, requests);
  await h.resolve(1); assert.equal(ready(h.render()), false);
  h.reset(false); h.emit('ai-yeoni-record-reset'); assert.equal(ready(h.render()), false);
  await h.resolve(2); assert.equal(ready(h.render()), true); h.unmount();
});
test('reset end cannot bypass downgraded readiness', async () => {
  const h = harness(); h.render(); h.effects(); await h.resolve(); h.readiness('error'); h.render(); h.effects();
  const requests = h.pending.length; h.reset(true); h.emit('ai-yeoni-record-reset'); h.reset(false); h.emit('ai-yeoni-record-reset');
  assert.equal(h.pending.length, requests); assert.equal(ready(h.render()), false); h.unmount();
});
test('session invalidation stays latched across polls, focus, reset end and readiness changes', async () => {
  const h = harness(); h.render(); h.effects(); await h.resolve(); assert.equal(ready(h.render()), true);
  h.emit('yeoni-cloud-session-changed'); assert.equal(ready(h.render()), false); const requests = h.pending.length;
  h.tick(); h.emit('focus'); h.emit('ai-yeoni-record-reset');
  h.readiness('loading'); h.render(); h.effects(); h.readiness('ready'); h.render(); h.effects();
  assert.equal(h.pending.length, requests); assert.equal(ready(h.render()), false); h.unmount();
  const fresh = harness(); fresh.render(); fresh.effects(); await fresh.resolve(); assert.equal(ready(fresh.render()), true); fresh.unmount();
});

test('journey hook notifies observers after failed or uncertain saves and preserves the original outcome', async () => {
  for (const outcome of ['success', 'before-write', 'after-write']) {
    const slots: unknown[] = []; let cursor = 0, cleanup: (() => void) | undefined, calls = 0;
    const effects: (() => void)[] = [], notifications: string[] = [];
    const listeners = new Map<string, Set<() => void>>();
    let value = { version: 1, selectedLevel: 'beginner', answers: {}, practicedUnits: {} };
    const originalError = new Error('synthetic ' + outcome);
    const hooks = { ...React,
      useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (next: unknown) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
      useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
      useCallback(callback: unknown) { return callback; },
      useEffect(effect: () => (() => void) | void, dependencies: unknown[]) { const index = cursor++; const previous = slots[index] as unknown[] | undefined; if (!previous || dependencies.some((x, i) => !Object.is(x, previous[i]))) { slots[index] = dependencies; effects.push(() => { cleanup?.(); cleanup = effect() || undefined; }); } },
    };
    const runJourneyHook = load('components/language/useLevelJourney.ts', {
      react: hooks,
      '@/utils/japaneseLevelJourney': { LEVEL_JOURNEY_EVENT, LEVEL_JOURNEY_KEY: 'japaneseLevelJourneyV1', learningOwner: () => 'synthetic-scope' },
      '@/utils/japaneseLevelJourneyStorage': {
        assertLevelJourneyOwner() {}, readLevelJourneySafely: async () => value,
        async writeLevelJourneySafely(_storage: unknown, _owner: string, change: (latest: typeof value) => typeof value) {
          calls++; if (outcome === 'before-write') throw originalError;
          value = change(value); if (outcome === 'after-write') throw originalError;
          return value;
        },
      },
    }, { Event, localStorage: {}, document: { documentElement: { dataset: {} } }, window: {
      addEventListener(name: string, fn: () => void) { const set = listeners.get(name) ?? new Set(); set.add(fn); listeners.set(name, set); },
      removeEventListener(name: string, fn: () => void) { listeners.get(name)?.delete(fn); },
      dispatchEvent(event: Event) { notifications.push(event.type); for (const fn of listeners.get(event.type) ?? []) fn(); },
    } }).useLevelJourney as () => { update(change: (latest: typeof value) => typeof value): Promise<typeof value> };
    const render = () => { cursor = 0; return runJourneyHook(); };
    render(); while (effects.length) effects.shift()!(); await new Promise<void>(resolve => setImmediate(resolve));
    const hook = render(); assert.ok((hook as unknown as { state?: unknown }).state, outcome + ': ' + JSON.stringify(slots)); const operation = hook.update(latest => ({ ...latest, selectedLevel: 'advanced' }));
    if (outcome === 'success') assert.equal((await operation).selectedLevel, 'advanced');
    else await assert.rejects(operation, error => error === originalError);
    assert.equal(calls, 1); assert.deepEqual(notifications, [LEVEL_JOURNEY_EVENT]);
    assert.equal(value.selectedLevel, outcome === 'before-write' ? 'beginner' : 'advanced');
    cleanup?.();
  }
});


for (const app of ['fitness', 'diet']) {
  test(app + ' source stays hidden after session invalidation until a fresh mount', () => {
    const h = harness(app); h.render(); h.effects(); assert.equal(ready(h.render()), true);
    h.emit('yeoni-cloud-session-changed'); assert.equal(ready(h.render()), false);
    h.tick(); assert.equal(ready(h.render()), false, app + ': old owner bytes must not re-adopt');
    h.emit('focus'); h.emit('yeoni-preference-owner-changed');
    h.reset(true); h.emit('ai-yeoni-record-reset'); h.reset(false); h.emit('ai-yeoni-record-reset');
    assert.equal(ready(h.render()), false); h.unmount();
    const fresh = harness(app); fresh.render(); fresh.effects(); assert.equal(ready(fresh.render()), true); fresh.unmount();
  });
  test(app + ' source hides immediately during reset and cannot republish on polls', () => {
    const h = harness(app); h.render(); h.effects(); assert.equal(ready(h.render()), true);
    h.reset(true); assert.equal(ready(h.render()), false, app + ': render must stop before an effect');
    h.emit('ai-yeoni-record-reset'); h.tick(); h.emit('focus'); assert.equal(ready(h.render()), false);
    h.reset(false); h.emit('ai-yeoni-record-reset'); assert.equal(ready(h.render()), true); h.unmount();
  });
}
