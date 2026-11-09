import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildMemoryPreview(root = process.cwd()) {
  const own = name => resolve(root, 'scripts/memory-preview', name);
  const define = { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' };
  for (const [key, value] of Object.entries({ localStorage: 'qaLocalStorage', sessionStorage: 'qaSessionStorage', indexedDB: 'qaIndexedDB' })) {
    for (const prefix of ['', 'window.', 'globalThis.', 'self.']) define[prefix + key] = value;
  }
  for (const prefix of ['', 'window.', 'globalThis.', 'self.']) define[prefix + 'navigator.locks'] = 'qaLocks';
  const result = await build({ absWorkingDir: root, entryPoints: ['scripts/memory-preview/entry.tsx'], bundle: true,
    write: false, outdir: resolve(root, '.generated/memory-preview'), entryNames: 'fixture', platform: 'browser', format: 'iife', target: ['es2022'], jsx: 'automatic',
    charset: 'utf8', minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: false, sourcemap: false, metafile: true, define,
    inject: [own('runtime.ts')],
    plugins: [{ name: 'memory-isolation', setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)(?:lib\/)?supabase(?:\.ts)?$/ }, () => ({ path: own('fake-client.ts') }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'next/link', namespace: 'qa-stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'qa-stub' }, () => ({ contents:
        `export default function Link({children,href,...props}){return <a href={'#'+href} {...props}>{children}</a>}`,
        loader: 'tsx', resolveDir: root }));
      builder.onResolve({ filter: /supabase|authenticatedHeaders|AuthGate|CloudSyncPanel|PwaManager|speech-participant|japaneseTts|speakJapanese|^next(?:\/|$)/i }, args => ({ errors: [{ text: `Forbidden memory QA dependency: ${args.path}` }] }));
    } }],
  });
  const inputs = Object.keys(result.metafile.inputs).sort();
  if (inputs.some(name => /(?:^|\/)(?:lib\/supabase|app\/(?:layout|lib\/supabase)|app\/components\/(?:AuthGate|CloudSyncPanel|PwaManager))/.test(name))) throw new Error('Live application dependency escaped memory QA aliases');
  const script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
  const css = await readFile(resolve(root, 'app/globals.css'), 'utf8');
  const compiled = await postcss([tailwindcss({ content: [resolve(root, 'app/assistant/memories/page.tsx'), own('entry.tsx')], theme: { extend: {} }, plugins: [] })]).process(css, { from: resolve(root, 'app/globals.css') });
  const styles = compiled.css + '\naside{padding:20px;background:#e9e2fa}aside button{margin:4px;min-height:44px;padding:8px;border:1px solid #6554b8;border-radius:8px}aside h1{font-size:24px;font-weight:bold}pre{white-space:pre-wrap;overflow-wrap:anywhere}';
  if (!script || result.outputFiles.length !== 1 || /<\/script/i.test(script) || /<\/style|@import\b|url\s*\(/i.test(styles)) throw new Error('Invalid standalone QA resources');
  if (/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|navigator\.locks|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|document\.cookie|SpeechRecognition|speechSynthesis|\bfetch\(/.test(script)) throw new Error('Native storage or service escaped isolated memory preview');
  const sha = value => createHash('sha256').update(value).digest('hex');
  const hashes = [];
  for (const path of [...inputs, 'scripts/memory-preview/build.mjs', 'app/globals.css', 'package-lock.json']) {
    const source = path.startsWith('<define:') ? JSON.stringify(define) : path.startsWith('qa-stub:') ? path : await readFile(resolve(root, path));
    hashes.push({ path, sha256: sha(source) });
  }
  const payload = { version: 1, script, styles, sourceDigest: sha(JSON.stringify(hashes)) };
  const output = resolve(root, '.generated/memory-preview'); await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'payload.json'), JSON.stringify(payload));
  await writeFile(resolve(output, 'build-manifest.json'), JSON.stringify({ inputs: hashes, sourceDigest: payload.sourceDigest, payloadSha256: sha(JSON.stringify(payload)) }, null, 2));
  return payload;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log((await buildMemoryPreview()).sourceDigest);
