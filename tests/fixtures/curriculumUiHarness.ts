/** Actual curriculum TSX and utilities; synthetic hooks/storage/audio/child UI.
 * Not a browser, hydration, layout, cloud-service or physical-device test. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import ts from 'typescript';

type Node = { type: unknown; props: Record<string, any> };
type Slot = { initialized?: boolean; value?: any; deps?: unknown[] };
export const nodeText = (value: any): string => value == null || typeof value === 'boolean' ? '' : Array.isArray(value) ? value.map(nodeText).join('') : typeof value === 'object' ? nodeText(value.props?.children) : String(value);
const nodes = (value: any): Node[] => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];

export function mountCurriculumUi(file: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, props: Record<string, unknown> = {}) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const slots: Slot[] = []; let cursor = 0, dirty = true, tree: unknown;
  const effects: (() => void)[] = [];
  const slot = () => slots[cursor++] ||= {};
  const changed = (state: Slot, deps: unknown[]) => !state.initialized || deps.length !== state.deps?.length || deps.some((value, index) => !Object.is(value, state.deps?.[index]));
  const hooks = {
    useState(initial: any) { const state = slot(); if (!state.initialized) { state.initialized = true; state.value = typeof initial === 'function' ? initial() : initial; } return [state.value, (next: any) => { const value = typeof next === 'function' ? next(state.value) : next; if (!Object.is(value, state.value)) { state.value = value; dirty = true; } }]; },
    useRef(initial: any) { const state = slot(); if (!state.initialized) { state.initialized = true; state.value = { current: initial }; } return state.value; },
    useEffect(effect: () => void, deps: unknown[]) { const state = slot(); if (changed(state, deps)) { state.initialized = true; state.deps = deps; effects.push(effect); } },
    useMemo(fn: () => unknown, deps: unknown[]) { const state = slot(); if (changed(state, deps)) { state.initialized = true; state.deps = deps; state.value = fn(); } return state.value; },
    useCallback(fn: unknown, deps: unknown[]) { return hooks.useMemo(() => fn, deps); },
    Suspense: 'suspense',
  };
  const journey = { owner: 'synthetic-owner', value: { version: 1, selectedLevel: 'beginner', answers: {}, practicedUnits: {} } };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const defaults = (value: unknown) => ({ __esModule: true, default: value });
  const stubs: Record<string, unknown> = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/link': defaults('a'), 'next/navigation': { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {} }) },
    '@/components/useYeoniPreferences': { useYeoniPreferences: () => ({ visible: false }) },
    '@/data/learningDataExpansion': { toKoreanPronunciation: (text: string) => text },
    '@/data/words': { WORDS: [] }, '@/data/sentences': { SENTENCES: [] }, '@/data/grammar': { GRAMMAR_LESSONS: [], GRAMMAR_PROGRESS_KEY: 'grammarProgress' },
    './LearningCompanion': defaults('companion-double'), './LearningQuestion': defaults('question-double'),
    './JapaneseChunkPractice': defaults('chunk-double'), './UpperReadingLesson': defaults('reading-double'),
    './useLevelJourney': { useLevelJourney: () => ({ state: journey, readError: '', reload() {}, update() { throw Error('Unexpected journey write'); } }) },
    './useLearningAudio': { useLearningAudio: () => ({ stop() {}, play() {}, playing: false, audioError: '' }) },
  };
  const cache = new Map<string, { exports: Record<string, any> }>();
  function load(filename: string): Record<string, any> {
    if (!extname(filename)) filename += existsSync(filename + '.ts') ? '.ts' : '.tsx';
    assert.ok(filename.startsWith(root), filename);
    const previous = cache.get(filename); if (previous) return previous.exports;
    const compiled = { exports: {} }; cache.set(filename, compiled);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Script(code, { filename }).runInNewContext({ module: compiled, exports: compiled.exports, crypto, Date, Error, URLSearchParams, AbortController, window: { localStorage: storage }, localStorage: storage,
      require: (name: string) => {
        if (name in stubs) return stubs[name];
        if (name.endsWith('.module.css')) return defaults({});
        if (name.startsWith('@/')) return load(resolve(root, name.slice(2)));
        if (name.startsWith('.')) return load(resolve(dirname(filename), name));
        throw Error(`Unreviewed dependency: ${name}`);
      },
    });
    return compiled.exports;
  }
  const exported = load(resolve(root, file));
  const render = () => {
    for (let count = 0; count < 30; count++) {
      cursor = 0; dirty = false; tree = exported.default(props);
      // LearnPage's two routing wrappers contain no independent stateful child
      // fixtures. Execute them to reach the real CurriculumContent hooks.
      if (file === 'app/language/learn/page.tsx') {
        tree = (tree as Node).props.children;
        while (typeof (tree as Node)?.type === 'function') tree = ((tree as Node).type as (props: unknown) => unknown)((tree as Node).props);
      }
      while (effects.length) effects.shift()!();
      if (!dirty) return tree;
    }
    throw Error('Synthetic hook settle bound exceeded');
  };
  render();
  return {
    render, text: () => nodeText(render()), nodes: () => nodes(render()),
    click(text: string) { const item = nodes(render()).find(node => node.type === 'button' && nodeText(node) === text); assert.ok(item, text); assert.ok(!item.props.disabled, `${text} is disabled`); item.props.onClick(); render(); },
    invoke(node: Node, name: string, ...args: unknown[]) { node.props[name](...args); render(); },
  };
}

import * as language from '../../app/data/languageCloudSync.ts';
import { stableState } from '../../app/data/cloudSync.ts';
import { LanguageStorageUnavailableError } from '../../app/data/languageStorageLock.ts';
import { CurriculumProgressError } from '../../utils/curriculumProgress.ts';

/** Executes the actual provider initializer, with only auth, remote and timers
 * doubled. Callers own the synthetic window/IndexedDB/lock globals. */
export async function initializeCurriculumSync(options: {
  remote: Record<string, unknown> | null;
  authenticated?: boolean;
  onRemoteRead?: () => void;
  providerSource?: string;
}) {
  const source = options.providerSource ?? readFileSync(new URL('../../components/LanguageCloudSync.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('sync.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'initialize') declaration = 'const ' + node.getText(ast) + ';';
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(declaration, 'Actual provider initializer not found');
  const prefix = "let active=true,storageUnavailable=false,verifiedUserId,observedLocal='',lastSnapshot='',syncing=false,resetVersion=0,followUpTimer,interval,localWatch,localWatching=false,syncVisibleChanges;";
  const code = ts.transpileModule(prefix + declaration + '\ninitialize()', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let remote = options.remote, remoteReads = 0, reloads = 0;
  const statuses: string[] = [], messages: string[] = [], writes: Record<string, unknown>[] = [];
  const authClient = {
    auth: { getUser: async () => ({ data: { user: options.authenticated === false ? null : { id: 'synthetic-a' } } }) },
    from(table: string) {
      assert.equal(table, 'language_user_state');
      let operation = 'select', payload: { state: Record<string, unknown> } | undefined;
      const result = async () => {
        if (operation === 'select') {
          remoteReads++; options.onRemoteRead?.();
          return { data: remote === null ? null : { state: remote, updated_at: 'synthetic-time' }, error: null };
        }
        assert.ok(payload); remote = payload.state; writes.push(remote);
        return { data: { updated_at: 'synthetic-time' }, error: null };
      };
      const query = {
        select() { return query; },
        eq(key: string, value: string) { if (key === 'user_id') assert.equal(value, 'synthetic-a'); return query; },
        maybeSingle: result,
        update(value: { state: Record<string, unknown> }) { operation = 'update'; payload = value; return query; },
        insert(value: { state: Record<string, unknown> }) { operation = 'insert'; payload = value; return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return result().then(resolve, reject); },
      };
      return query;
    },
  };
  let thrown: unknown;
  try {
    await new Script(code).runInNewContext({ ...language, authClient, stableState, LanguageStorageUnavailableError, CurriculumProgressError, Error,
      window: { localStorage: window.localStorage, addEventListener() {}, removeEventListener() {} },
      document: { visibilityState: 'visible', addEventListener() {} },
      isRecordResetRunning: () => false, requestSafeReload: () => { reloads++; },
      setInitialized() {}, setReadOnlyUser() {}, setStatus: (value: string) => statuses.push(value), setMessage: (value: string) => messages.push(value),
      setInterval: () => 1, setTimeout: () => 1, clearTimeout() {},
    });
  } catch (error) { thrown = error; }
  return { remoteReads, reloads, writes, statuses, messages, thrown, remote };
}
