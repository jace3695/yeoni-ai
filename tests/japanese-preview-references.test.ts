import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { build } from 'esbuild';
import postcss from 'postcss';
import React, { type ReactElement, type ReactNode } from 'react';
import { previewDefines, assertPreviewKanaAsset, kanaStrokeAssetPath, reviewedKanaStrokeAssetHash } from '../scripts/japanese-preview/build.mjs';
import { authenticatedJsonHeaders } from '../scripts/japanese-preview/authenticated-headers.ts';
import { GRAMMAR_LESSONS, GRAMMAR_PROGRESS_KEY } from '../data/grammar.ts';
import type { PreviewMemoryStorage } from '../scripts/japanese-preview/memory-storage.ts';

type Element = ReactElement<Record<string, unknown>>;
const require = createRequire(import.meta.url);
const own = (file: string) => resolve('scripts/japanese-preview', file);
async function compile(source: string, globals: Record<string, unknown> = {}, react: unknown = React) {
  const built = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, loader: { '.css': 'empty', '.module.css': 'empty' }, platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic',
    jsxImportSource: 'qa-preview-jsx', define: previewDefines(), inject: [own('runtime.ts'), own('asset-request.ts'), own('location-query.ts')],
    external: ['react', 'react/jsx-runtime'], plugins: [{ name: 'reference-test-ports', setup(builder) {
      builder.onResolve({ filter: /^qa-preview-jsx\/jsx-runtime$/ }, () => ({ path: own('jsx-runtime.ts') }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: own('next-navigation.ts') }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: own('link.tsx') }));
      builder.onResolve({ filter: /^@\/app\/lib\/authenticatedHeaders$/ }, () => ({ path: own('authenticated-headers.ts') }));
      builder.onResolve({ filter: /(?:^|\/)speakJapanese$/ }, () => ({ path: own('audio.ts') }));
    } }],
  });
  const cjsModule = { exports: {} as Record<string, unknown> };
  new Script(built.outputFiles[0].text).runInNewContext({ module: cjsModule, exports: cjsModule.exports,
    DOMException, AbortController, URLSearchParams, setTimeout, clearTimeout, setImmediate, clearImmediate, structuredClone,
    require: (name: string) => name === 'react' ? react : require(name), ...globals });
  return cjsModule.exports;
}

// These are component-handler tests in a synthetic VM, not real-browser QA.
function hooks() {
  const slots: { value?: unknown; initialized?: boolean; deps?: unknown[]; cleanup?: () => void }[] = [];
  let cursor = 0;
  const effects: (() => void)[] = [];
  const slot = () => slots[cursor++] ||= {};
  const api = { ...React,
    useState(initial: unknown) {
      const state = slot();
      if (!state.initialized) { state.initialized = true; state.value = typeof initial === 'function' ? initial() : initial; }
      return [state.value, (value: unknown) => { state.value = typeof value === 'function' ? value(state.value) : value; }];
    },
    useRef(initial: unknown) { const state = slot(); state.value ??= { current: initial }; return state.value; },
    useMemo(factory: () => unknown) { slot(); return factory(); },
    useCallback(callback: unknown) { slot(); return callback; },
    useSyncExternalStore(_subscribe: unknown, snapshot: () => unknown) { slot(); return snapshot(); },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const state = slot();
      if (!state.initialized || deps.some((value, index) => !Object.is(value, state.deps?.[index]))) {
        state.initialized = true; state.deps = deps;
        effects.push(() => { state.cleanup?.(); state.cleanup = effect() || undefined; });
      }
    },
  };
  return { api, render(component: () => Element) { cursor = 0; let tree = component();
    // Resolve the actual Suspense/query wrappers before exercising page controls.
    while (tree.type === React.Suspense || typeof tree.type === 'function') {
      tree = tree.type === React.Suspense ? tree.props.children as Element : (tree.type as (props: Record<string, unknown>) => Element)(tree.props);
    }
    while (effects.length) effects.shift()!(); return tree; } };
}
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children as ReactNode)];
}
function label(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(label).join('');
  if (React.isValidElement<Record<string, unknown>>(node)) return node.type === 'rt' ? '' : label(node.props.children as ReactNode);
  return typeof node === 'string' ? node : '';
}

test('only the exact public glyph path returns a minimal fresh JSON response; all request options and path variations fail', async () => {
  const compiled = await compile('export { qaAssetRequest } from "./scripts/japanese-preview/asset-request";');
  const request = compiled.qaAssetRequest as (input: unknown, options?: unknown) => Promise<{ ok: boolean; json(): Promise<Record<string, string>> }>;
  const original = JSON.parse(await readFile(kanaStrokeAssetPath, 'utf8'));
  const response = await request('/kana-strokes.json');
  assert.equal(response.ok, true);
  assert.deepEqual(Object.keys(response).sort(), ['json', 'ok']);
  const received = await response.json();
  assert.deepEqual(JSON.parse(JSON.stringify(received)), original);
  assert.equal(Object.keys(received).length, 160);
  received[Object.keys(received)[0]] = 'mutated';
  assert.deepEqual(JSON.parse(JSON.stringify(await (await request('/kana-strokes.json')).json())), original);
  for (const input of ['/kana-strokes.json?x=1', '/kana-strokes.json#x', 'kana-strokes.json', './kana-strokes.json', '//example.com/kana-strokes.json',
    'https://example.com/kana-strokes.json', '/KANA-strokes.json', '/%6bana-strokes.json', '/other/../kana-strokes.json', '/api/language/handwriting-feedback',
    new URL('https://example.com/kana-strokes.json'), new Request('https://example.com/kana-strokes.json'), { toString: () => '/kana-strokes.json' }, null]) {
    await assert.rejects(request(input), /외부 요청을 허용하지/);
  }
  for (const options of [null, {}, { method: 'GET' }, { method: 'POST' }, { method: 'HEAD' }, { headers: {} }, { body: 'synthetic' }, { signal: new AbortController().signal }]) {
    await assert.rejects(request('/kana-strokes.json', options), /외부 요청을 허용하지/);
  }
});

test('all four direct request spellings resolve to the asset-only port without reading any native request function', async () => {
  const native = new Proxy({}, { get() { throw new Error('Native object must not be accessed'); } });
  const compiled = await compile(`export const readers = [fetch, window.fetch, globalThis.fetch, self.fetch];
    export const requests = [() => fetch('/kana-strokes.json'), () => window.fetch('/kana-strokes.json'),
      () => globalThis.fetch('/kana-strokes.json'), () => self.fetch('/kana-strokes.json')];`,
  { window: native, globalThis: native, self: native, fetch: () => { throw new Error('Native request must not be called'); } });
  const readers = compiled.readers as ((input: unknown) => Promise<unknown>)[];
  assert.equal(readers.length, 4); assert.ok(readers.every(read => read === readers[0]));
  for (const request of compiled.requests as (() => Promise<{ ok: boolean }>)[]) assert.equal((await request()).ok, true);
  for (const read of readers) await assert.rejects(read('/api/anything'), /외부 요청/);
});

test('the reviewed glyph asset is hash-pinned and contains only local vector references, with no active or external resources', async () => {
  const source = await readFile(kanaStrokeAssetPath, 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), reviewedKanaStrokeAssetHash);
  const entry = { path: kanaStrokeAssetPath, source };
  assert.doesNotThrow(() => assertPreviewKanaAsset([entry]));
  for (const entries of [[], [entry, entry], [{ ...entry, source: source + '\n' }], [{ ...entry, path: 'public/other.json' }]]) {
    assert.throws(() => assertPreviewKanaAsset(entries), /independent review required/);
  }
  const asset = JSON.parse(source) as Record<string, string>;
  for (const [path, svg] of Object.entries(asset)) {
    assert.match(path, /^\/kana-stroke\/(?:hiragana|katakana)\/(?:%[A-F0-9]{2})+\.svg$/);
    assert.doesNotMatch(svg, /<!|<\?|<\/?(?:script|foreignObject|image|iframe|audio|video)\b|\bon\w+\s*=|@import/i);
    for (const match of svg.matchAll(/<\/?([\w:-]+)/g)) assert.ok(['svg', 'defs', 'clipPath', 'use', 'g', 'path'].includes(match[1]), match[1]);
    for (const match of svg.matchAll(/\bhref="([^"]*)"/g)) assert.match(match[1], /^#[a-zA-Z0-9]+$/);
    for (const match of svg.matchAll(/url\(([^)]*)\)/g)) assert.match(match[1], /^#[a-zA-Z0-9]+$/);
  }
});

test('authentication adapter is throw-only and exposes no session or credential fallback', async () => {
  await assert.rejects(authenticatedJsonHeaders(), /인증 정보와 외부 요청/);
  const source = await readFile(own('authenticated-headers.ts'), 'utf8');
  assert.doesNotMatch(source, /import\s|supabase|fetch\s*\(|getSession|Authorization|Bearer/);
});

test('plain anchors retain handlers but normalize every DOM destination and remove popup/download/ping grants', async () => {
  const compiled = await compile('export { jsx, jsxs } from "./scripts/japanese-preview/jsx-runtime";');
  const create = compiled.jsx as (type: string, props: object) => Element;
  let clicks = 0;
  const onClick = () => clicks++;
  for (const href of ['https://example.com', '//example.com', 'javascript:alert(1)', '/language/profile?word=水', '/settings', '/language/grammar#outside']) {
    const link = create('a', { href, target: '_blank', download: 'file', ping: 'https://example.com', onClick, children: 'source' });
    assert.equal(link.props.href, '#/unsupported');
    assert.equal(link.props.target, undefined); assert.equal(link.props.download, undefined); assert.equal(link.props.ping, undefined);
    assert.equal(link.props.onClick, onClick);
  }
  for (const href of ['/language/kana', '#/language/words', '/language/grammar', '/language/sentences?word=水', '/language/review']) {
    const link = create('a', { href, onClick });
    assert.equal(decodeURIComponent(String(link.props.href)), href.startsWith('#') ? href : `#${href}`);
  }
  (create('a', { href: '/language/grammar', onClick }).props.onClick as () => void)();
  assert.equal(clicks, 1);
  assert.equal(create('button', { onClick }).props.onClick, onClick);
});

test('Words router only changes a hash and keeps unsupported destinations inside the fixture', async () => {
  const location = { hash: '' };
  const compiled = await compile('export { useRouter } from "./scripts/japanese-preview/next-navigation";', { location });
  const router = (compiled.useRouter as () => { push(href: string): void })();
  assert.deepEqual(Object.keys(router), ['push']);
  for (const href of ['/language/kana', '/language/words', '/language/grammar', '/language/sentences?word=水', '/language/review']) { router.push(href); assert.equal(decodeURIComponent(location.hash), `#${href}`); }
  for (const href of ['/language/profile?word=水', '/language/conversation', 'https://example.com', '//example.com']) { router.push(href); assert.equal(location.hash, '#/unsupported'); }
});

test('product query readers use validated hash queries without accessing outer document or window search', async () => {
  const location = { hash: '#/language/sentences?word=水&pattern=masu', get search(): string { throw new Error('Outer query must not be read'); } };
  const native = new Proxy({}, { get() { throw new Error('Native window must not be accessed'); } });
  const compiled = await compile('export const queries = [() => location.search, () => window.location.search, () => globalThis.location.search, () => self.location.search];', { location, window: native, globalThis: native, self: native });
  const queries = compiled.queries as (() => string)[];
  for (const read of queries) {
    const params = new URLSearchParams(read());
    assert.equal(params.get('word'), '水'); assert.equal(params.get('pattern'), 'masu');
  }
  location.hash = '#https://example.com?word=unsafe';
  for (const read of queries) assert.equal(read(), '');
});

test('actual grammar component can fail one memory write, show an error, retry the same answer and prevent double counting', async () => {
  const state = hooks();
  const window = { addEventListener() {}, removeEventListener() {} };
  const document = { documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
  const compiled = await compile(`export { default as Component } from './app/language/grammar/page';
    export { qaLocalStorage as store, seedSyntheticOwner } from './scripts/japanese-preview/runtime';`, { window, document, location: { hash: '#/language/grammar' } }, state.api);
  const Component = compiled.Component as () => Element;
  const store = compiled.store as PreviewMemoryStorage;
  (compiled.seedSyntheticOwner as () => void)();
  const render = () => state.render(Component);
  const button = (text: string) => nodes(render()).find(node => node.type === 'button' && label(node.props.children as ReactNode).startsWith(text))!;
  const click = (node: Element) => (node.props.onClick as () => void)();
  render();
  for (const anchor of nodes(render()).filter(node => node.type === 'a')) { assert.ok(String(anchor.props.href).startsWith('#/')); assert.equal(anchor.props.target, undefined); }
  click(button('3. 연습'));
  const lesson = GRAMMAR_LESSONS.find(item => item.id === 'desu')!;
  const choose = button(lesson.quiz.answer);
  assert.ok(choose, 'Actual grammar answer is present');
  store.failNextWrite(); click(choose);
  assert.equal(store.getItem(GRAMMAR_PROGRESS_KEY), null);
  assert.equal(store.getItem('dailyRoutineProgress'), null);
  assert.match(label(render()), /같은 답을 다시 눌러/);
  assert.equal(button(lesson.quiz.answer).props.disabled, false);
  const retry = button(lesson.quiz.answer);
  click(retry); click(retry);
  const saved = JSON.parse(store.getItem(GRAMMAR_PROGRESS_KEY)!);
  assert.equal(saved.length, 1); assert.equal(saved[0].correctCount, 1);
  for (let attempt = 0; attempt < 100 && !store.getItem('dailyRoutineProgress'); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(JSON.parse(store.getItem('dailyRoutineProgress')!).completedIds.includes('grammar'));
  assert.ok(store.getItem('dailyLearningHistory'));
  assert.equal(store.getItem('language-storage-transaction-v1'), null);
  assert.doesNotMatch(label(render()), /같은 답을 다시 눌러/);
  assert.equal(button(lesson.quiz.answer).props.disabled, true);
});

test('actual grammar answer survives history-only failure while both daily keys roll back and same-intent retry does not regrade', async () => {
  const state = hooks();
  const window = { addEventListener() {}, removeEventListener() {} };
  const document = { documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
  const compiled = await compile(`export { default as Component } from './app/language/grammar/page';
    export { default as Notice } from './components/language/DailyRoutineSaveNotice';
    export { qaLocalStorage as store, seedSyntheticOwner } from './scripts/japanese-preview/runtime';`, { window, document, location: { hash: '#/language/grammar' } }, state.api);
  const Component = compiled.Component as () => Element;
  const Notice = compiled.Notice as (props: Record<string, unknown>) => Element;
  const store = compiled.store as PreviewMemoryStorage;
  (compiled.seedSyntheticOwner as () => void)();
  const render = () => state.render(Component);
  const notice = () => nodes(render()).find(node => node.type === Notice)!;
  const click = (node: Element) => (node.props.onClick as () => void)();
  const button = (text: string) => nodes(render()).find(node => node.type === 'button' && label(node.props.children as ReactNode).startsWith(text))!;
  const waitFor = async (condition: () => boolean) => {
    for (let attempt = 0; attempt < 200 && !condition(); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(condition(), 'asynchronous component state settled');
  };
  render(); click(button('3. 연습'));
  const answer = GRAMMAR_LESSONS.find(item => item.id === 'desu')!.quiz.answer;
  store.failNextHistoryWrite(); click(button(answer));
  assert.equal(JSON.parse(store.getItem(GRAMMAR_PROGRESS_KEY)!)[0].correctCount, 1);
  await waitFor(() => Boolean(notice().props.error));
  assert.equal(store.getItem('dailyRoutineProgress'), null);
  assert.equal(store.getItem('dailyLearningHistory'), null);
  assert.equal(store.getItem('language-storage-transaction-v1'), null);
  const errorView = Notice(notice().props);
  assert.match(label(errorView), /답안(?:을|은) 다시 풀 필요는 없어요/);
  const retry = nodes(errorView).find(node => node.type === 'button' && label(node.props.children as ReactNode) === '일일 학습 기록 다시 저장')!;
  click(retry); click(retry);
  await waitFor(() => Boolean(store.getItem('dailyLearningHistory')) && !notice().props.pending && !notice().props.error);
  const daily = JSON.parse(store.getItem('dailyRoutineProgress')!);
  const history = JSON.parse(store.getItem('dailyLearningHistory')!);
  assert.deepEqual(daily.completedIds, ['grammar']);
  assert.deepEqual(history[daily.date].completedIds, ['grammar']);
  assert.equal(history[daily.date].completedCount, 1);
  assert.equal(JSON.parse(store.getItem(GRAMMAR_PROGRESS_KEY)!)[0].correctCount, 1);
  assert.equal(store.getItem('language-storage-transaction-v1'), null);
});

test('actual kana and word reference pages expose their real writing and glyph components while AI remains disabled', async () => {
  const document = { documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
  const requestAnimationFrame = (callback: () => void) => { callback(); return 1; };
  const window = { addEventListener() {}, removeEventListener() {}, requestAnimationFrame, cancelAnimationFrame() {} };
  for (const name of ['kana', 'words']) {
    const state = hooks();
    const compiled = await compile(`export { default as Component } from './app/language/${name}/page';`,
      { window, document, location: { hash: `#/language/${name}` }, requestAnimationFrame, cancelAnimationFrame() {} }, state.api);
    const Component = compiled.Component as () => Element;
    const render = () => state.render(Component);
    render();
    const writing = nodes(render()).find(node => node.type === 'button' && label(node.props.children as ReactNode).includes('쓰기 연습'));
    assert.ok(writing, `${name} writing control`);
    (writing.props.onClick as () => void)();
    const tree = render();
    if (name === 'kana') {
      assert.ok(nodes(tree).some(node => node.type === 'canvas' && node.props['aria-label'] === '가나 쓰기 연습장'));
      assert.ok(nodes(tree).some(node => typeof node.type === 'function' && node.type.name === 'KanaStrokeAnimation'));
      const quiz = nodes(tree).find(node => node.type === 'button' && label(node.props.children as ReactNode) === '쓰기 퀴즈')!;
      (quiz.props.onClick as () => void)();
      const ai = nodes(render()).find(node => node.type === 'button' && label(node.props.children as ReactNode).includes('자동 필기 평가'));
      assert.ok(ai); assert.equal(ai.props.disabled, true);
    } else {
      const pad = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'WritingPracticePad');
      assert.ok(pad);
      const padState = hooks();
      const padCompiled = await compile("export { default as Component } from './components/WritingPracticePad';", { window }, padState.api);
      const Pad = padCompiled.Component as (props: object) => Element;
      assert.ok(nodes(padState.render(() => Pad(pad.props))).some(node => node.type === 'canvas'));
    }
  }
});


test('hash-authorized QA CSS exactly supplies every public glyph group style without inline-style or URL grants', async () => {
  const assets = JSON.parse(await readFile(kanaStrokeAssetPath, 'utf8')) as Record<string, string>;
  const css = await readFile(own('preview.css'), 'utf8');
  const parsed = postcss.parse(css);
  const values = (rule: postcss.Rule) => Object.fromEntries(rule.nodes.map(node => {
    assert.equal(node.type, 'decl');
    const declaration = node as postcss.Declaration;
    assert.equal(declaration.important, undefined);
    return [declaration.prop, declaration.value.replace(/\s+/g, '')];
  }));
  const rules: postcss.Rule[] = [];
  parsed.walkRules(rule => { if (rule.selector.includes('data-strokesvg')) rules.push(rule); });
  assert.deepEqual(rules.map(rule => rule.selector), [
    '.language-app-shell svg > g[data-strokesvg="shadows"]',
    '.language-app-shell svg > g[data-strokesvg="strokes"]',
  ]);
  const declarations = new Map(rules.map(rule => [rule.selector.includes('"shadows"') ? 'shadows' : 'strokes', values(rule)]));
  const seen = { shadows: 0, strokes: 0, indices: 0 };
  for (const svg of Object.values(assets)) {
    const parents: string[] = [];
    for (const [, closing, tagName, attributes] of svg.matchAll(/<(\/?)([a-zA-Z]+)\b([^>]*)>/g)) {
      if (closing) { assert.equal(parents.pop(), tagName); continue; }
      if (/data-strokesvg="(?:shadows|strokes)"/.test(attributes)) assert.deepEqual(parents, ['svg']);
      if (!attributes.trimEnd().endsWith('/')) parents.push(tagName);
    }
    assert.deepEqual(parents, []);
    for (const [, tagName, attributes] of svg.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)) {
      const style = attributes.match(/\bstyle="([^"]*)"/)?.[1];
      if (style === undefined) continue;
      const group = attributes.match(/\bdata-strokesvg="(shadows|strokes)"/)?.[1];
      if (group) {
        assert.equal(tagName, 'g');
        const original = postcss.parse(`source { ${style} }`).first as postcss.Rule;
        assert.deepEqual(declarations.get(group), values(original), `${group} presentation must match product asset`);
        seen[group as 'shadows' | 'strokes']++;
      } else {
        // Legacy per-stroke metadata is not read by the product JS timeline.
        assert.match(style, /^--i:[0-5]$/);
        assert.ok(tagName === 'path' || tagName === 'g');
        seen.indices++;
      }
    }
  }
  assert.deepEqual(seen, { shadows: 160, strokes: 160, indices: 464 });
  assert.doesNotMatch(css, /url\s*\(|@import|!important|animation\s*:|transition\s*:/i);
  const component = await readFile('components/language/KanaStrokeAnimation.tsx', 'utf8');
  assert.doesNotMatch(component, /--i/);
  assert.match(component, /timeline\.characters\[characterIndex\]\.starts\[strokeIndex\]/);
  const response = await readFile('lib/japanese-preview-response.ts', 'utf8');
  assert.doesNotMatch(response, /unsafe-inline|unsafe-hashes|style-src-attr/);
});

test('original home, curriculum and first-letter pages preserve product journeys in the memory-only preview', async () => {
  const window = { addEventListener() {}, removeEventListener() {} };
  const document = { documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
  for (const [page, pathname, heading] of [
    ['', '/language', '글자부터 문장까지'],
    ['/learn', '/language/learn', '한 번에 하나씩, 내 속도로'],
    ['/start', '/language/start', '가나 첫걸음'],
  ]) {
    const state = hooks();
    const compiled = await compile(`export { default as Component } from './app/language${page}/page';
      export { qaLocalStorage as store, seedSyntheticOwner } from './scripts/japanese-preview/runtime';`,
    { window, document, location: { hash: `#${pathname}` } }, state.api);
    (compiled.seedSyntheticOwner as () => void)();
    const Component = compiled.Component as () => Element;
    state.render(Component);
    const tree = state.render(Component);
    assert.ok(label(tree).includes(heading), `${pathname}: original heading`);
    const hrefs = nodes(tree).flatMap(node => typeof node.props.href === 'string' ? [node.props.href] : []);
    if (page === '') assert.ok(hrefs.includes('/language/learn'));
    if (page === '/learn') {
      assert.ok(hrefs.includes('/language/start'));
      assert.ok(hrefs.includes('/language/learn?lesson=f01'));
    }
    if (page === '/start') assert.ok(hrefs.includes('/language/learn?lesson=f01'));
    assert.doesNotMatch(label(tree), /계정으로 로그인|로그인 설정이 필요/);
  }
});
