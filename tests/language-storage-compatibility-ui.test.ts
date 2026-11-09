import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { LanguageStorageUnavailableError } from '../app/data/languageStorageLock.ts';
import { memoryStorage } from './fixtures/chunkReviewStorage.ts';
const require = createRequire(import.meta.url);
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
type Element = React.ReactElement<Record<string, unknown>>;
const elements = (node: React.ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements) : React.isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as React.ReactNode)] : [];

/** Actual TSX effects/handlers with deterministic hooks and synthetic server.
 * This verifies control flow, not React scheduling or browser presentation. */
function fixture(options: { prepareFailure?: boolean; initialReadFailure?: boolean; applyFailure?: boolean } = {}) {
  let cursor = 0, reads = 0, applies = 0, updates = 0, failure: Error | undefined, held = false;
  let release: (() => void) | undefined;
  const values: unknown[] = [], effects: Array<{ deps?: unknown[]; cleanup?: () => void }> = [], pending: Array<() => void> = [];
  const runtime = { ...React,
    useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value: unknown) => { values[index] = typeof value === 'function' ? value(values[index]) : value; }]; },
    useEffect(run: () => void | (() => void), deps: unknown[]) {
      const index = cursor++; const previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps?.[i])) {
        effects[index] = { deps };
        pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (cleanup) effects[index].cleanup = cleanup; });
      }
    },
  };
  const storage = memoryStorage({ 'language-cloud-sync-user': 'A', 'fitness-cloud-sync-user': 'A' }).api;
  const intervals = new Map<number, { delay: number; run: () => void }>();
  const events = new Map<string, Set<() => void>>();
  const eventTarget = { addEventListener: (name: string, fn: () => void) => { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(fn); }, removeEventListener: (name: string, fn: () => void) => events.get(name)?.delete(fn) };
  const state = { savedWords: '[]' };
  const authClient = {
    auth: { getUser: async () => ({ data: { user: { id: 'A' } } }) },
    from: () => {
      let operation = 'select';
      const query = new Proxy({}, { get: (_, key) => key === 'then' ? (resolve: (value: unknown) => unknown) => {
        if (operation !== 'select') updates++;
        const result = { data: { state, updated_at: 'stamp' }, error: null };
        return held ? new Promise(done => { release = () => { held = false; done(result); }; }).then(resolve) : Promise.resolve(result).then(resolve);
      } : () => { if (key === 'update' || key === 'insert') operation = String(key); return query; } });
      return query;
    },
  };
  const dependencies: Record<string, unknown> = {
    react: runtime, '@/app/lib/supabase': { supabase: authClient }, '@/app/data/cloudSync': { stableState: JSON.stringify },
    '@/app/data/languageStorageLock': { LanguageStorageUnavailableError },
    '@/app/lib/unsavedChanges': { requestSafeReload() {} },
    '@/app/data/appRecordReset': { isRecordResetRunning: () => false, RECORD_RESET_EVENT: 'reset' },
    '@/components/yeoni/LocalRecordGuidance': { LanguageRecordReadiness: React.createContext('loading') },
    '@/app/data/languageCloudSync': {
      prepareLanguageLocalState: async () => { if (options.prepareFailure) throw new LanguageStorageUnavailableError(); },
      readLanguageStateSafely: async (check?: () => void) => { check?.(); reads++; if (failure) throw failure; if (options.initialReadFailure && reads === 1) throw new LanguageStorageUnavailableError(); return state; },
      applyLanguageState: async (_state: unknown, _base: unknown, check?: () => void) => { check?.(); applies++; if (options.applyFailure) throw new LanguageStorageUnavailableError('기기 기록이 반영됐을 수 있어요.', true); },
      readLanguageSyncBase: () => null, saveLanguageSyncBase: async (_id: string, _state: unknown, check?: () => void) => check?.(),
      mergeLanguageState: (_remote: unknown, local: unknown) => local, mergeLanguageStateFromBase: (_base: unknown, _remote: unknown, local: unknown) => local,
      readLanguageCacheOverview: () => ({ completedLessons: 1, studyDays: 1, savedWords: 0, selectedLevel: '초급' }),
    },
  };
  const exports: { default?: (props: { children: React.ReactNode }) => Element } = {};
  const source = readFileSync(new URL('../components/LanguageCloudSync.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name: string) => dependencies[name] ?? require(name), Error,
    window: { localStorage: storage, ...eventTarget }, localStorage: storage, document: { visibilityState: 'visible', ...eventTarget },
    setInterval: (run: () => void, delay: number) => { const id = intervals.size + 1; intervals.set(id, { run, delay }); return id; },
    clearInterval: (id: number) => intervals.delete(id), setTimeout: () => 1, clearTimeout() {},
  });
  const child = React.createElement('span', { 'data-test-writer': true }, 'legacy writer page');
  const render = () => { cursor = 0; return exports.default!({ children: child }); };
  const flush = () => { pending.splice(0).forEach(fn => fn()); };
  const tree = () => { const result = render(); flush(); return result; };
  tree();
  return {
    render, tree, flush,
    writerVisible: () => elements(render()).some(node => node.props['data-test-writer']),
    readonlyVisible: () => elements(render()).some(node => typeof node.type === 'function' && node.type.name === 'ReadOnlyLanguageCache'),
    fireInterval: (delay: number) => { const found = [...intervals.values()].find(item => item.delay === delay); assert.ok(found); found.run(); },
    failReads: (error: Error) => { failure = error; }, holdRemote: () => { held = true; }, releaseRemote: () => { assert.ok(release); release(); },
    applies: () => applies, updates: () => updates, reads: () => reads,
    retry: () => { const button = elements(render()).find(node => node.type === 'button' && typeof node.props.onClick === 'function'); assert.ok(button); (button.props.onClick as () => void)(); },
    cleanup: () => effects.forEach(effect => effect?.cleanup?.()),
  };
}

for (const option of ['prepareFailure', 'initialReadFailure', 'applyFailure'] as const) {
  test(`${option} presents read-only cache instead of mounting legacy writers`, async () => {
    const f = fixture({ [option]: true }); await tick();
    assert.equal(f.writerVisible(), false); assert.equal(f.readonlyVisible(), true);
    assert.equal(f.updates(), 0); f.cleanup();
  });
}

test('storage failure after initialization removes legacy writers and stops future sync starts', async () => {
  const f = fixture(); await tick(); assert.equal(f.writerVisible(), true);
  f.failReads(new LanguageStorageUnavailableError('uncertain saved result', true));
  f.fireInterval(500); await tick();
  assert.equal(f.writerVisible(), false); assert.equal(f.readonlyVisible(), true);
  const reads = f.reads(); f.fireInterval(30_000); await tick(); assert.equal(f.reads(), reads); f.cleanup();
});

test('local-watch failure cancels continuation of an already pending remote response', async () => {
  const f = fixture(); await tick(); assert.equal(f.writerVisible(), true);
  f.holdRemote(); f.fireInterval(30_000); await tick();
  const applies = f.applies(), updates = f.updates();
  f.failReads(new LanguageStorageUnavailableError()); f.fireInterval(500); await tick();
  assert.equal(f.readonlyVisible(), true);
  f.releaseRemote(); await tick();
  assert.equal(f.applies(), applies); assert.equal(f.updates(), updates);
  assert.equal(f.readonlyVisible(), true); assert.equal(f.writerVisible(), false); f.cleanup();
});

test('explicit retry removes initialized writers immediately before new auth and storage checks', async () => {
  const f = fixture(); await tick();
  f.failReads(new Error('synthetic network-style failure')); f.fireInterval(30_000); await tick();
  assert.equal(f.writerVisible(), true);
  f.retry(); assert.equal(f.writerVisible(), false);
  f.flush(); await tick(); f.cleanup();
});
