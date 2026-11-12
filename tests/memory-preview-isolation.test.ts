import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildMemoryPreview } from '../scripts/memory-preview/build.mjs';
import { memoryPreviewEnabled, memoryPreviewResponse } from '../lib/memory-preview-response.ts';
const allowed = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'agent/fitness-record-priority' };
const payload = { version: 1 as const, script: 'document.title="가상 검사";', styles: 'body{color:#123}', sourceDigest: 'a'.repeat(64) };
test('only the exact existing Preview branch enables the standalone handler', async () => {
  assert.equal(memoryPreviewEnabled(allowed), true);
  for (const env of [{}, { ...allowed, VERCEL_ENV: 'production' }, { ...allowed, VERCEL_ENV: 'development' },
    { ...allowed, VERCEL_ENV: 'Preview' }, { VERCEL_ENV: 'preview' }, { ...allowed, VERCEL_GIT_COMMIT_REF: 'main' },
    { ...allowed, VERCEL_GIT_COMMIT_REF: `${allowed.VERCEL_GIT_COMMIT_REF}-copy` }]) {
    const response = await memoryPreviewResponse(env, () => { throw new Error('Denied gate must not read files'); });
    assert.equal(response.status, 404); assert.equal(await response.text(), 'Not found');
  }
});

test('inline hashes cover exact response bytes and the opaque sandbox has no escape grants', async () => {
  const response = await memoryPreviewResponse(allowed, async () => payload);
  assert.equal(response.status, 200);
  const csp = response.headers.get('content-security-policy')!;
  const hash = (text: string) => createHash('sha256').update(text).digest('base64');
  assert.ok(csp.includes(`script-src 'sha256-${hash(payload.script)}'`));
  assert.ok(csp.includes(`style-src 'sha256-${hash(payload.styles)}'`));
  assert.ok(csp.includes('sandbox allow-scripts'));
  assert.doesNotMatch(csp, /allow-forms|allow-same-origin|allow-popups|allow-top-navigation|unsafe-inline|unsafe-eval/);
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
    const response = await memoryPreviewResponse(allowed, async () => value);
    assert.equal(response.status, 503); assert.equal(response.headers.get('location'), null);
    assert.doesNotMatch(await response.text(), /<html|<script/);
  }
  assert.equal((await memoryPreviewResponse(allowed, async () => { throw new Error('No artifact'); })).status, 503);
});


test('memory preview bundles actual memory page and unsaved-work guard with no real storage or services', async () => {
 const result = await buildMemoryPreview();
 const manifest = JSON.parse(await readFile('.generated/memory-preview/build-manifest.json','utf8'));
 for(const name of ['app/assistant/memories/page.tsx','lib/assistant-memory-recovery.ts','components/useUnsavedChanges.ts']) assert.ok(manifest.inputs.some((item:{path:string})=>item.path===name));
 assert.ok(manifest.inputs.every((item:{path:string})=>!/(?:^|\/)(?:lib\/supabase|app\/(?:layout|lib\/supabase))/.test(item.path)));
 assert.doesNotMatch(result.script,/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|document\.cookie|speechSynthesis|\bfetch\(/);
 assert.doesNotMatch(result.styles,/@import\b|url\s*\(/i);
 assert.match(result.script,/실제 새로고침은 가상 자료와 복구 정보를 모두 지웁니다/);
 const response=await memoryPreviewResponse(allowed,async()=>result);assert.equal(response.status,200);
});
