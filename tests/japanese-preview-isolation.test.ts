import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import { build } from 'esbuild';
import { buildJapanesePreview, forbiddenPreviewInput } from '../scripts/japanese-preview/build.mjs';
import { japanesePreviewEnabled, japanesePreviewResponse } from '../lib/japanese-preview-response.ts';
import { PreviewMemoryStorage } from '../scripts/japanese-preview/memory-storage.ts';
import { previewHash, readPreviewLocation } from '../scripts/japanese-preview/navigation.ts';
import { japaneseAudioErrorMessage, speakJapaneseWithPreferredTts } from '../scripts/japanese-preview/audio.ts';
import { assertOpaquePreviewOrigin, qaIndexedDB, qaLocalStorage, seedSyntheticOwner } from '../scripts/japanese-preview/runtime.ts';
import { learningOwner } from '../utils/japaneseLevelJourney.ts';
import { writeLevelJourneySafely } from '../utils/japaneseLevelJourneyStorage.ts';
import { rememberChunkAnswer, writeChunkReview } from '../utils/japaneseChunkReview.ts';

const allowed = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'agent/fitness-record-priority' };
const payload = { version: 1 as const, script: 'document.title="가상 검사";', styles: 'body{color:#123}', sourceDigest: 'a'.repeat(64) };

test('only the exact existing Preview branch enables the standalone handler', async () => {
  assert.equal(japanesePreviewEnabled(allowed), true);
  for (const env of [{}, { ...allowed, VERCEL_ENV: 'production' }, { ...allowed, VERCEL_ENV: 'development' },
    { ...allowed, VERCEL_ENV: 'Preview' }, { VERCEL_ENV: 'preview' }, { ...allowed, VERCEL_GIT_COMMIT_REF: 'main' },
    { ...allowed, VERCEL_GIT_COMMIT_REF: `${allowed.VERCEL_GIT_COMMIT_REF}-copy` }]) {
    const response = await japanesePreviewResponse(env, () => { throw new Error('Denied gate must not read files'); });
    assert.equal(response.status, 404); assert.equal(await response.text(), 'Not found');
  }
});

test('inline hashes cover exact response bytes and the opaque sandbox has no escape grants', async () => {
  const response = await japanesePreviewResponse(allowed, async () => payload);
  assert.equal(response.status, 200);
  const csp = response.headers.get('content-security-policy')!;
  const hash = (text: string) => createHash('sha256').update(text).digest('base64');
  assert.ok(csp.includes(`script-src 'sha256-${hash(payload.script)}'`));
  assert.ok(csp.includes(`style-src 'sha256-${hash(payload.styles)}'`));
  assert.ok(csp.includes('sandbox allow-scripts'));
  assert.doesNotMatch(csp, /allow-same-origin|allow-popups|allow-top-navigation|unsafe-inline|unsafe-eval/);
  for (const directive of ['default-src', 'connect-src', 'img-src', 'font-src', 'media-src', 'worker-src', 'frame-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) {
    assert.ok(csp.includes(`${directive} 'none'`), directive);
  }
  const html = await response.text();
  assert.ok(html.includes(`<script>${payload.script}</script>`));
  assert.ok(html.includes(`<style>${payload.styles}</style>`));
  assert.doesNotMatch(html, /<script[^>]+src=|<link|<iframe|<img|__next|self\.__next_f/);
  assert.match(response.headers.get('cache-control')!, /private.*no-store/);
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('permissions-policy')!, /microphone=\(\)/);
  assert.equal(response.headers.get('x-yeoni-qa-source'), payload.sourceDigest);
});

test('missing, oversized and HTML-closing payloads fail without redirects or layout fallbacks', async () => {
  const malformed = [null, {}, { ...payload, version: 2 }, { ...payload, sourceDigest: 'unknown' },
    { ...payload, script: '</script><script>bad()</script>' }, { ...payload, styles: '</STYLE>' },
    { ...payload, script: 'x'.repeat(4_000_001) }, { ...payload, styles: 'x'.repeat(500_001) }];
  for (const value of malformed) {
    const response = await japanesePreviewResponse(allowed, async () => value);
    assert.equal(response.status, 503); assert.equal(response.headers.get('location'), null);
    assert.doesNotMatch(await response.text(), /<html|<script/);
  }
  assert.equal((await japanesePreviewResponse(allowed, async () => { throw new Error('No artifact'); })).status, 503);
});

test('all component hrefs remain hash-only including unsupported, hostile and new-tab destinations', () => {
  assert.equal(previewHash('/language'), '#/language/levels');
  assert.equal(previewHash('/language/levels?level=advanced'), '#/language/levels?level=advanced');
  assert.equal(previewHash('/language/levels?lesson=middle-01&review=1'), '#/language/levels?lesson=middle-01&review=1');
  assert.equal(previewHash('/language/chunk-review'), '#/language/chunk-review');
  for (const href of ['https://example.com', '//example.com', 'javascript:alert(1)', '/language/learn?lesson=f01',
    '/language/kana', '/language/settings', '/language/levels#outside', '/language/levels\\evil', '/language/levels\n']) {
    assert.equal(previewHash(href), '#/unsupported');
  }
  assert.equal(readPreviewLocation('').pathname, '/language/levels');
  assert.equal(readPreviewLocation('#/language/levels?level=intermediate').query.get('level'), 'intermediate');
  assert.equal(readPreviewLocation('#//example.com').pathname, '/unsupported');
});

test('the real compiled Link shim preserves cancellation and keeps modified clicks inside the fixture', async () => {
  const built = await build({ entryPoints: ['scripts/japanese-preview/link.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] });
  const cjsModule = { exports: {} as { default: (props: object) => { props: { href: string; target?: string; onClick: (event: object) => void } } } };
  new Script(built.outputFiles[0].text).runInNewContext({ module: cjsModule, exports: cjsModule.exports, require: createRequire(import.meta.url), URLSearchParams });
  const calls: string[] = [];
  const link = cjsModule.exports.default({ href: '/language/levels?level=advanced', children: '고급', target: '_blank',
    onClick: () => calls.push('click'), onNavigate: (event: { preventDefault(): void }) => { calls.push('navigate'); event.preventDefault(); } });
  const event = { defaultPrevented: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
    preventDefault() { this.defaultPrevented = true; } };
  link.props.onClick(event);
  assert.deepEqual(calls, ['click', 'navigate']); assert.equal(event.defaultPrevented, true);
  assert.equal(link.props.href, '#/language/levels?level=advanced'); assert.equal(link.props.target, undefined);
  calls.length = 0;
  link.props.onClick({ ...event, defaultPrevented: false, ctrlKey: true });
  assert.deepEqual(calls, ['click']);
  const cancelled = cjsModule.exports.default({ href: '/language/learn?lesson=f01', children: '기존 수업',
    onClick: (e: typeof event) => e.preventDefault(), onNavigate: () => { throw new Error('Cancelled click navigated'); } });
  cancelled.props.onClick({ ...event, defaultPrevented: false });
  assert.equal(cancelled.props.href, '#/unsupported');
});

test('memory records have no browser backing, support explicit failure, and do not survive a new instance', () => {
  const store = new PreviewMemoryStorage();
  store.setItem('japaneseLevelJourneyV1', 'synthetic');
  assert.equal(store.getItem('japaneseLevelJourneyV1'), 'synthetic');
  assert.equal(store.length, 1); assert.equal(store.key(0), 'japaneseLevelJourneyV1');
  store.failNextWrite(); assert.throws(() => store.setItem('japaneseLevelJourneyV1', 'other'), /가상 저장 실패/);
  assert.equal(store.getItem('japaneseLevelJourneyV1'), 'synthetic');
  store.setItem('japaneseLevelJourneyV1', 'retry'); assert.equal(store.getItem('japaneseLevelJourneyV1'), 'retry');
  assert.equal(new PreviewMemoryStorage().getItem('japaneseLevelJourneyV1'), null);
  store.clear(); assert.equal(store.length, 0);
});

test('audio adapter never claims listening success or invokes an external/native backend', async () => {
  let ended = 0;
  await assert.rejects(speakJapaneseWithPreferredTts('仮の文です。', { onEnd: () => ended++ }), /가상 화면 검사/);
  assert.equal(ended, 0); assert.match(japaneseAudioErrorMessage(), /실제 음성 검증은 별도/);
  const controller = new AbortController(); controller.abort();
  await speakJapaneseWithPreferredTts('仮の文です。', { signal: controller.signal, onEnd: () => ended++ });
  assert.equal(ended, 0);
});

test('origin verification refuses normal same-origin documents before mounting the fixture', () => {
  assert.doesNotThrow(() => assertOpaquePreviewOrigin('null'));
  for (const origin of ['', 'https://example.vercel.app', 'http://localhost:3000']) assert.throws(() => assertOpaquePreviewOrigin(origin), /격리 경계/);
});

test('a queued old answer cannot enter a reseeded scenario with the same synthetic user ID', async () => {
  const descriptors = new Map(['navigator', 'indexedDB'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let release!: () => void;
  let entered = 0;
  const pending = new Promise<void>(resolve => { release = resolve; });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: qaIndexedDB });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request: async (_name: string, _options: unknown, run: () => unknown) => { entered++; await pending; return run(); },
  } } });
  try {
    qaLocalStorage.clear(); seedSyntheticOwner();
    const previousOwner = learningOwner(qaLocalStorage);
    const levelWrite = writeLevelJourneySafely(qaLocalStorage, previousOwner, latest => ({ ...latest, selectedLevel: 'advanced' }));
    const chunkWrite = writeChunkReview(qaLocalStorage, previousOwner, latest => rememberChunkAnswer(latest, {
      lessonId: 'f01', questionId: 'f01-meaning', attemptId: 'queued-old', correct: false, neededHelp: false, mode: 'choice',
    }));
    assert.equal(entered, 2);
    qaLocalStorage.clear(); seedSyntheticOwner();
    assert.notEqual(learningOwner(qaLocalStorage), previousOwner);
    release();
    const results = await Promise.allSettled([levelWrite, chunkWrite]);
    assert.ok(results.every(result => result.status === 'rejected'));
    assert.equal(qaLocalStorage.getItem('japaneseLevelJourneyV1'), null);
    assert.equal(qaLocalStorage.getItem('japaneseChunkReviewV1'), null);
  } finally {
    release();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('built artifact contains actual latest components but no actual services, storage APIs or external resources', async () => {
  const built = await buildJapanesePreview();
  for (const name of ['LevelLearningWorkspace', 'UpperReadingLesson', 'JapaneseChunkPractice', 'ChunkReviewWorkspace', 'useLevelJourney', 'useChunkReview']) {
    assert.ok(built.inputs.some(path => path.endsWith(`/${name}.tsx`) || path.endsWith(`/${name}.ts`)), name);
  }
  assert.ok(built.inputs.includes('app/data/languageStorageLock.ts'));
  assert.ok(built.inputs.some(path => path.startsWith('node_modules/fake-indexeddb/')));
  assert.ok(built.inputs.every(path => !forbiddenPreviewInput.test(path)));
  for (const forbidden of ['lib/supabase.ts', 'app/layout.tsx', 'app/language/layout.tsx', 'app/data/languageCloudSync.ts',
    'app/components/AuthGate.tsx', 'app/components/CloudSyncPanel.tsx', 'components/LanguageCloudSync.tsx', 'utils/speakJapanese.ts', 'utils/japaneseTts.ts']) {
    assert.equal(forbiddenPreviewInput.test(forbidden), true, forbidden);
  }
  // Deliberately strict: new native-storage aliases or service code must fail
  // this fixture review instead of silently expanding its permissions.
  assert.doesNotMatch(built.payload.script, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|navigator\.locks|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|document\.cookie|speechSynthesis|SpeechRecognition|\.getUser\(|\bfetch\(/);
  assert.doesNotMatch(built.payload.script, /levelFixture|applyLanguageState|prepareLanguageLocalState|NEXT_PUBLIC_SUPABASE/);
  assert.doesNotMatch(built.payload.styles, /@import\b|url\s*\(/i);
  assert.doesNotMatch(built.payload.script, /sourceMappingURL|<\/script/i);
  const response = await japanesePreviewResponse(allowed, async () => built.payload);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /새로고침하면 사라져요/);
});

test('route, worker and link source retain the isolation and navigation-cancellation contract', async () => {
  const route = await readFile(new URL('../app/api/qa/japanese/route.ts', import.meta.url), 'utf8');
  assert.match(route, /japanesePreviewResponse\(\{ VERCEL_ENV: process\.env\.VERCEL_ENV, VERCEL_GIT_COMMIT_REF: process\.env\.VERCEL_GIT_COMMIT_REF \}/);
  assert.doesNotMatch(route, /searchParams|headers\(|cookies\(|redirect\(|AuthGate|layout.*import/);
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.ok(worker.indexOf('url.pathname.startsWith("/api/")') < worker.indexOf('request.mode === "navigate"'));
  const link = await readFile(new URL('../scripts/japanese-preview/link.tsx', import.meta.url), 'utf8');
  assert.match(link, /href=\{previewHash\(href\)\}/);
  assert.match(link, /onClick\?\.\(event\)/); assert.match(link, /onNavigate\?\.\(/);
  assert.match(link, /event\.defaultPrevented/); assert.match(link, /event\.ctrlKey.*event\.metaKey/);
  assert.match(link, /target=\{undefined\} download=\{undefined\}/);
});
