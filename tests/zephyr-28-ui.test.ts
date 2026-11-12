import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const page=readFileSync('app/tts-connection-check/page.tsx','utf8');
const branch='agent/fitness-record-priority';
const origin='https://yeoni-ai-git-agent-fitness-record-priority-jace3695s-projects.vercel.app';
function render(env:Record<string,string>){
 const exports:Record<string,()=>unknown>={};
 const code=ts.transpileModule(page,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,process:{env},require:(id:string)=>{
  if(id==='next/navigation')return {notFound:()=>{throw Error('404')}};
  if(id==='react/jsx-runtime')return {jsx:(type:unknown,props:unknown)=>({type,props})};
  if(id.includes('zephyr-28-wrappers'))return {ZEPHYR_PREVIEW_BRANCH:branch,ZEPHYR_PREVIEW_ORIGIN:origin};
  return {default:id};
 }});return exports.default();
}
test('connection page refuses production, missing gates, wrong branch/origin before rendering auth UI',()=>{
 const enabled={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:branch,YEONI_ZEPHYR_28_ONCE_ENABLED:'1',YEONI_ZEPHYR_28_TRUSTED_ORIGIN:origin};
 assert.ok(render(enabled));
 for(const env of [{}, {...enabled,VERCEL_ENV:'production'},{...enabled,VERCEL_GIT_COMMIT_REF:'main'},{...enabled,YEONI_ZEPHYR_28_ONCE_ENABLED:'0'},{...enabled,YEONI_ZEPHYR_28_TRUSTED_ORIGIN:'https://other.invalid'}])assert.throws(()=>render(env),/404/);
});
test('connection parent uses existing auth gate and its own fetch is authentication preflight only',()=>{
 assert.match(page,/<AuthGate><ConnectionCheck/);
 const client=readFileSync('app/tts-connection-check/ConnectionCheck.tsx','utf8');
 assert.deepEqual([...client.matchAll(/fetch\('([^']+)'/g)].map(m=>m[1]),['/api/tts/once-28/preflight']);
 assert.doesNotMatch(client,/console\.|localStorage|sessionStorage|\.rpc\(|\.from\(/);
 assert.match(client,/redirect: 'error'/);
});

test('one-off child sends only fixed request ID and never exposes a generic provider request',()=>{
 const source=readFileSync('app/tts-connection-check/OnceAudio.tsx','utf8');
 assert.deepEqual([...source.matchAll(/fetch\('([^']+)'/g)].map(m=>m[1]),['/api/tts/once-28']);
 assert.match(source,/body: JSON.stringify\(\{ requestId: ZEPHYR_ONCE.requestId \}\)/);
 assert.ok(source.indexOf("sessionStorage.setItem(attemptKey, '1')")<source.indexOf("fetch('/api/tts/once-28'"));
 assert.doesNotMatch(source,/console\.|localStorage|\.rpc\(|supabase[^;]*\.from\(/);
 assert.match(source,/URL.revokeObjectURL/);
 assert.match(source,/download="yeoni-zephyr-28.mp3"/);
});
