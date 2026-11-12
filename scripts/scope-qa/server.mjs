import { build } from '../browser-qa/node_modules/esbuild/lib/main.js';
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const root=process.cwd(), output='/tmp/yeoni-scope-browser';
await build({ entryPoints:['scripts/scope-qa/browser.tsx'], bundle:true, outdir:output, jsx:'automatic', define:{'process.env':'{}','process.env.NODE_ENV':'"development"'}, plugins:[{name:'synthetic-only',setup(b){
 b.onResolve({filter:/^(next\/link|next\/image|next\/navigation)$/},args=>({path:args.path,namespace:'shim'}));
 b.onLoad({filter:/.*/,namespace:'shim'},args=>({contents:args.path==='next/navigation'?'export const useRouter = () => ({push:path=>location.assign(path)});':args.path==='next/link'?'export default function Link({children,...p}) { return <a {...p}>{children}</a> }':'export default function Image({fill,priority,unoptimized,...p}) { return <img {...p}/> }',loader:'jsx',resolveDir:root}));
 b.onResolve({filter:/(^|\/)supabase(\.ts)?$/},()=>({path:resolve(root,'scripts/scope-qa/synthetic-client.ts')}));
 }}] });
const styles=existsSync('.next/static/chunks')?readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/next-css/${f}">`).join(''):'';
createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 let file=pathname==='/browser.js'?`${output}/browser.js`:pathname==='/browser.css'?`${output}/browser.css`:pathname.startsWith('/next-css/')?resolve(root,'.next/static/chunks',pathname.slice(10)):resolve(root,'public',pathname.slice(1));
 if (existsSync(file)&&extname(file)) {res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.json')?'application/json':'image/svg+xml');res.end(readFileSync(file));return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic scope QA</title>${styles}<link rel="stylesheet" href="/browser.css"><body><div id="root"></div><script src="/browser.js"></script></body></html>`);
}).listen(8873,'127.0.0.1',()=>console.log('Synthetic UI lab http://127.0.0.1:8873'));
