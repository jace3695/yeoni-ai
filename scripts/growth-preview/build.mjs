import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function buildGrowthPreview(root = process.cwd()) {
  const own = name => resolve(root, 'scripts/growth-preview', name);
  const define = { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' };
  for (const [key, value] of Object.entries({ localStorage: 'qaLocalStorage', sessionStorage: 'qaSessionStorage', indexedDB: 'qaIndexedDB' })) {
    for (const prefix of ['', 'window.', 'globalThis.', 'self.']) define[prefix + key] = value;
  }
  for (const prefix of ['', 'window.', 'globalThis.', 'self.']) define[prefix + 'navigator.locks'] = 'qaLocks';
  const result = await build({ absWorkingDir: root, entryPoints: ['scripts/growth-preview/entry.tsx'], bundle: true,
    write: false, outdir: resolve(root, '.generated/growth-preview'), entryNames: 'fixture', platform: 'browser', format: 'iife', target: ['es2022'], jsx: 'automatic',
    charset: 'utf8', minifySyntax: true, minifyWhitespace: true, minifyIdentifiers: false, sourcemap: false, metafile: true, define,
    inject: [own('runtime.ts')],
    plugins: [{ name: 'growth-isolation', setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)(?:lib\/)?supabase(?:\.ts)?$/ }, () => ({ path: own('fake-client.ts') }));
      builder.onResolve({ filter: /^(next\/(?:link|image)|@\/components\/yeoni\/(CommonCharacterGuide|RecordReplyStatus))$/ }, args => ({ path: args.path, namespace: 'qa-stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'qa-stub' }, args => ({ contents: args.path === 'next/link'
        ? `export default function Link({children,href,...props}){return <a href={'#'+href} {...props}>{children}</a>}`
        : args.path === 'next/image' ? `export default function Image(){return null}` : args.path.includes('CommonCharacterGuide') ? `export default function Guide({children}){return <section>{children}</section>}`
        : `export default function Reply(){return null}`, loader: 'tsx', resolveDir: root }));
      builder.onResolve({ filter: /supabase|authenticatedHeaders|AuthGate|CloudSyncPanel|PwaManager|speech-participant|japaneseTts|speakJapanese|^next(?:\/|$)/i }, args => ({ errors: [{ text: `Forbidden growth QA dependency: ${args.path}` }] }));
    } }],
  });
  const inputs = Object.keys(result.metafile.inputs).sort();
  if (inputs.some(name => /(?:^|\/)(?:lib\/supabase|app\/(?:layout|lib\/supabase)|app\/components\/(?:AuthGate|CloudSyncPanel|PwaManager))/.test(name))) throw new Error('Live application dependency escaped QA aliases');
  const script = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
  const productStyles = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
  const styles = `body{font-family:system-ui;background:#faf8fd;margin:0}*{box-sizing:border-box}fieldset{border:0;padding:0}aside{padding:20px;background:#e9e2fa}aside button{margin:4px;min-height:44px}pre{white-space:pre-wrap;overflow-wrap:anywhere}ul{padding:0;list-style:none}` + productStyles;
  if (!script || !productStyles || result.outputFiles.length !== 2 || /<\/script/i.test(script) || /<\/style|@import\b|url\s*\(/i.test(styles)) throw new Error('Invalid standalone QA resources');
  if (/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|navigator\.locks|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|document\.cookie|SpeechRecognition|speechSynthesis|\bfetch\(/.test(script)) throw new Error('Native storage or service escaped isolated growth preview');
  const sha = value => createHash('sha256').update(value).digest('hex');
  const hashes = [];
  for (const path of [...inputs, 'scripts/growth-preview/build.mjs', 'package-lock.json']) {
    const source = path.startsWith('<define:') ? JSON.stringify(define) : path.startsWith('qa-stub:') ? path : await readFile(resolve(root, path));
    hashes.push({ path, sha256: sha(source) });
  }
  const payload = { version: 1, script, styles, sourceDigest: sha(JSON.stringify(hashes)) };
  const output = resolve(root, '.generated/growth-preview'); await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'payload.json'), JSON.stringify(payload));
  await writeFile(resolve(output, 'build-manifest.json'), JSON.stringify({ inputs: hashes, sourceDigest: payload.sourceDigest, payloadSha256: sha(JSON.stringify(payload)) }, null, 2));
  return payload;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log((await buildGrowthPreview()).sourceDigest);
