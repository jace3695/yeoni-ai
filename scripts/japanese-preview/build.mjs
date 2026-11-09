import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const previewBuildDirectory = '.generated/japanese-preview';
export const forbiddenPreviewInput = /(?:^|\/)(?:lib\/supabase(?:\.ts)?|app\/(?:layout|language\/layout)|app\/components\/(?:AuthGate|CloudSyncPanel|RecordResetListener|AiBudgetNotifier|PwaManager)|components\/(?:language\/)?LanguageCloudSync|app\/data\/languageCloudSync|utils\/(?:speakJapanese|japaneseTts)|lib\/yeoni\/speech-participant|scripts\/scope-qa\/synthetic-client)(?:\.|\/|$)/i;

export async function buildJapanesePreview(root = process.cwd()) {
  const own = (name) => resolve(root, 'scripts/japanese-preview', name);
  const define = { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' };
  for (const [name, replacement] of Object.entries({ localStorage: 'qaLocalStorage', sessionStorage: 'qaSessionStorage', indexedDB: 'qaIndexedDB' })) {
    for (const prefix of ['', 'window.', 'globalThis.', 'self.']) define[`${prefix}${name}`] = replacement;
  }
  for (const prefix of ['', 'window.', 'globalThis.', 'self.']) define[`${prefix}navigator.locks`] = 'qaLocks';
  const result = await build({
    absWorkingDir: root, entryPoints: ['scripts/japanese-preview/entry.tsx'],
    bundle: true, write: false, outdir: resolve(root, previewBuildDirectory), entryNames: 'fixture',
    platform: 'browser', format: 'iife', target: ['es2022'], jsx: 'automatic', charset: 'utf8',
    minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: false, legalComments: 'inline',
    sourcemap: false, metafile: true, define, inject: [own('runtime.ts')],
    plugins: [{ name: 'japanese-preview-isolation', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: own('link.tsx') }));
      builder.onResolve({ filter: /(?:^|\/)speakJapanese(?:\.ts)?$/ }, () => ({ path: own('audio.ts') }));
      // Fail the build rather than allowing a newly imported service/layout.
      builder.onResolve({ filter: /(?:supabase|languageCloudSync|AuthGate|CloudSyncPanel|PwaManager|speech-participant|japaneseTts)/i }, args => ({ errors: [{ text: `Forbidden preview dependency: ${args.path}` }] }));
    } }],
  });
  const inputs = Object.keys(result.metafile.inputs).sort();
  const forbidden = inputs.filter(name => forbiddenPreviewInput.test(name));
  if (forbidden.length) throw new Error(`Forbidden preview input: ${forbidden.join(', ')}`);
  const script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
  const styles = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
  if (!script || !styles || result.outputFiles.length !== 2) throw new Error('Preview must be a self-contained script/style pair');
  if (/<\/script/i.test(script) || /<\/style/i.test(styles) || /sourceMappingURL/.test(script)
    || /@import\b|url\s*\(/i.test(styles)) throw new Error('Unsafe inline or external preview resource');
  if (/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|navigator\.locks|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|document\.cookie|speechSynthesis|SpeechRecognition|\.getUser\(|\bfetch\(/.test(script)) {
    throw new Error('Native storage or service access escaped preview aliases');
  }
  const sourceHashes = [];
  for (const name of inputs) sourceHashes.push({ path: name, sha256: createHash('sha256').update(name.startsWith('<define:') ? JSON.stringify(define) : await readFile(resolve(root, name))).digest('hex') });
  for (const name of ['scripts/japanese-preview/build.mjs', 'package-lock.json']) sourceHashes.push({ path: name, sha256: createHash('sha256').update(await readFile(resolve(root, name))).digest('hex') });
  const sourceDigest = createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex');
  const payload = { version: 1, script, styles, sourceDigest };
  const output = resolve(root, previewBuildDirectory);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'payload.json'), JSON.stringify(payload));
  await writeFile(resolve(output, 'build-manifest.json'), JSON.stringify({
    sourceDigest, inputs: sourceHashes, payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    outputs: result.outputFiles.map(file => ({ path: relative(output, file.path), bytes: file.contents.length })),
  }, null, 2));
  return { payload, inputs, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await buildJapanesePreview();
  console.log(`Synthetic Japanese preview prepared: ${result.inputs.length} source inputs; ${result.payload.sourceDigest}`);
}
