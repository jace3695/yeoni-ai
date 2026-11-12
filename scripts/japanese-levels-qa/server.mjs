import { build } from '../browser-qa/node_modules/esbuild/lib/main.js';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const root = process.cwd();
const output = '/tmp/yeoni-japanese-levels-ui';
await build({ entryPoints: ['scripts/japanese-levels-qa/browser.tsx'], bundle: true, outdir: output, jsx: 'automatic', define: { 'process.env': '{}', 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'synthetic-browser-boundary', setup(builder) {
  builder.onResolve({ filter: /^(next\/link|next\/image|next\/navigation)$/ }, args => ({ path: args.path, namespace: 'synthetic-next' }));
  builder.onLoad({ filter: /.*/, namespace: 'synthetic-next' }, args => ({ contents: args.path === 'next/navigation' ? 'export const useRouter=()=>({push:path=>location.assign(path)}); export const useSearchParams=()=>new URLSearchParams(location.search); export const usePathname=()=>location.pathname;' : args.path === 'next/link' ? 'export default function Link({children,...props}) {return <a {...props}>{children}</a>}' : 'export default function Image({fill,priority,unoptimized,...props}) {return <img {...props}/>}', loader: 'jsx', resolveDir: root }));
  builder.onResolve({ filter: /(^|\/)supabase(\.ts)?$/ }, () => ({ path: resolve(root, 'scripts/scope-qa/synthetic-client.ts') }));
} }] });
createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const publicRoot = resolve(root, 'public');
  const asset = resolve(publicRoot, '.' + pathname);
  const file = pathname === '/browser.js' ? `${output}/browser.js` : pathname === '/browser.css' ? `${output}/browser.css` : asset.startsWith(publicRoot + sep) ? asset : '';
  if (file && existsSync(file) && extname(file)) {
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.png') ? 'image/png' : 'image/svg+xml');
    response.end(readFileSync(file)); return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Japanese levels synthetic UI QA</title><link rel="stylesheet" href="/browser.css"></head><body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc"><div id="root"></div><script src="/browser.js"></script></body></html>');
}).listen(8886, '127.0.0.1', () => console.log('Japanese levels synthetic UI ready on http://127.0.0.1:8886'));
