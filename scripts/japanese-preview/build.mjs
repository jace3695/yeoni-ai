import { build } from 'esbuild';
import postcss from 'postcss';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const previewBuildDirectory = '.generated/japanese-preview';
export const forbiddenPreviewInput = /(?:^|\/)(?:lib\/supabase(?:\.ts)?|app\/(?:layout|language\/layout|lib\/(?:supabase|authenticatedHeaders))|app\/components\/(?:AuthGate|CloudSyncPanel|RecordResetListener|AiBudgetNotifier|PwaManager)|components\/(?:language\/)?LanguageCloudSync|app\/data\/languageCloudSync|utils\/(?:speakJapanese|japaneseTts)|lib\/yeoni\/speech-participant|scripts\/scope-qa\/synthetic-client)(?:\.|\/|$)/i;

export const nativeAudioBridgePath = 'scripts/japanese-preview/native-local-audio.ts';
export const reviewedNativeAudioBridgeHash = '26349084056f12dc53c84b1259fcd5203d57ad077ac45079ec1fba9fe60c25fe';

// Only this reviewed, opaque-origin, explicitly selected local-voice bridge may
// reference native synthesis. The product lesson adapter remains disabled.
export function assertPreviewNativeAudioSources(entries) {
  const bridges = entries.filter(entry => entry.path === nativeAudioBridgePath);
  if (bridges.length !== 1 || createHash('sha256').update(bridges[0].source).digest('hex') !== reviewedNativeAudioBridgeHash) {
    throw new Error('Native audio bridge changed or missing: independent review required');
  }
  for (const entry of entries) {
    if (entry.path !== nativeAudioBridgePath && /\bspeechSynthesis\b|\bSpeechSynthesisUtterance\b/.test(entry.source)) {
      throw new Error(`Native audio outside reviewed bridge: ${entry.path}`);
    }
  }
}

export const kanaStrokeAssetPath = 'public/kana-strokes.json';
export const reviewedKanaStrokeAssetHash = '32ba7a804d8ba53958f18c7a9a00db59d24f14df16a5501683deffce152e211c';

export function assertPreviewKanaAsset(entries) {
  const assets = entries.filter(entry => entry.path === kanaStrokeAssetPath);
  if (assets.length !== 1 || createHash('sha256').update(assets[0].source).digest('hex') !== reviewedKanaStrokeAssetHash) {
    throw new Error('Public kana stroke asset changed or missing: independent review required');
  }
}

export function previewDefines() {
  const define = { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' };
  for (const [name, replacement] of Object.entries({ localStorage: 'qaLocalStorage', sessionStorage: 'qaSessionStorage', indexedDB: 'qaIndexedDB', fetch: 'qaAssetRequest' })) {
    for (const prefix of ['', 'window.', 'globalThis.', 'self.']) define[`${prefix}${name}`] = replacement;
  }
  for (const prefix of ['', 'window.', 'globalThis.', 'self.']) define[`${prefix}navigator.locks`] = 'qaLocks';
  return define;
}

export async function buildJapanesePreview(root = process.cwd()) {
  const own = (name) => resolve(root, 'scripts/japanese-preview', name);
  const define = previewDefines();
  const result = await build({
    absWorkingDir: root, entryPoints: ['scripts/japanese-preview/entry.tsx'],
    bundle: true, write: false, outdir: resolve(root, previewBuildDirectory), entryNames: 'fixture',
    platform: 'browser', format: 'iife', target: ['es2022'], jsx: 'automatic', jsxImportSource: 'qa-preview-jsx', charset: 'utf8',
    minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: false, legalComments: 'inline',
    sourcemap: false, metafile: true, define, inject: [own('runtime.ts'), own('asset-request.ts')],
    plugins: [{ name: 'japanese-preview-isolation', setup(builder) {
      // Use the exact product tokens without importing Tailwind directives or
      // unrelated global application chrome. The full file is source-hashed.
      builder.onLoad({ filter: /[\\/]app[\\/]globals\.css$/ }, async args => {
        const parsed = postcss.parse(await readFile(args.path, 'utf8'));
        const themes = parsed.nodes.filter(node => node.type === 'rule' && node.selector === ':root');
        if (themes.length !== 1) throw new Error('Expected exactly one product theme root');
        return { contents: themes[0].toString(), loader: 'css' };
      });
      builder.onResolve({ filter: /^qa-preview-jsx\/jsx-runtime$/ }, () => ({ path: own('jsx-runtime.ts') }));
      builder.onResolve({ filter: /^@\/app\/lib\/authenticatedHeaders$/ }, () => ({ path: own('authenticated-headers.ts') }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: own('link.tsx') }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: own('next-navigation.ts') }));
      builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: own('image.tsx') }));
      builder.onResolve({ filter: /(?:^|\/)speakJapanese(?:\.ts)?$/ }, () => ({ path: own('audio.ts') }));
      builder.onResolve({ filter: /^next(?:\/|$)/ }, args => ({ errors: [{ text: `Unsupported Next preview dependency: ${args.path}` }] }));
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
  if (/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|navigator\.locks|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|document\.cookie|SpeechRecognition|\.getUser\(|\bfetch\(/.test(script)) {
    throw new Error('Native storage or service access escaped preview aliases');
  }
  if ((script.match(/\bwindow\.speechSynthesis\b/g) ?? []).length !== 1
    || (script.match(/\bnew SpeechSynthesisUtterance\s*\(/g) ?? []).length !== 1
    || (script.match(/\bspeechSynthesis\b/g) ?? []).length !== 1
    || (script.match(/\bSpeechSynthesisUtterance\b/g) ?? []).length !== 2) {
    throw new Error('Unexpected native synthesis references in isolated bundle');
  }
  const sourceHashes = [];
  const sourceEntries = [];
  for (const name of inputs) {
    const source = name.startsWith('<define:') ? JSON.stringify(define) : await readFile(resolve(root, name), 'utf8');
    sourceEntries.push({ path: name, source });
    sourceHashes.push({ path: name, sha256: createHash('sha256').update(source).digest('hex') });
  }
  assertPreviewNativeAudioSources(sourceEntries);
  assertPreviewKanaAsset(sourceEntries);
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
