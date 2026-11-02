import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/growth/handwriting/free/page.tsx',import.meta.url),'utf8');
function fixture(stage:'blob'|'upload'|'session'|'none') {
  const events:string[]=[];let resume=()=>{};
  const deferred=(name:string)=>stage===name?new Promise<void>(r=>{resume=r;}):Promise.resolve();
  const lifetime={current:{active:true,epoch:0,owner:'A',saving:false,restoring:false}};
  const pending={current:null};
  const context={lifetime,pending,canvasRef:{current:{toBlob:(cb:(x:unknown)=>void)=>{void deferred('blob').then(()=>cb({size:8}));}}},growth:{user:{id:'A'},dataReady:true,saveSession:async()=>{events.push('session');await deferred('session');return {error:null};},setNotice:()=>events.push('notice')},supabase:{storage:{from:()=>({upload:async()=>{events.push('upload');await deferred('upload');return {error:null};}})},from:()=>({insert:async()=>{events.push('resource');return {error:null};}})},saving:false,saved:false,restoring:false,evidenceRef:{current:{strokes:1}},setSaving:(x:boolean)=>events.push('saving:'+x),setLocked:()=>{},setSaved:()=>events.push('saved'),getLocalDateKey:()=> '2026-11-02',crypto:{randomUUID:()=> 'synthetic-id'},handwritingMetrics:()=>({activeSeconds:10}),handwritingRoutine:null,GUIDE_TEXTS:['합성 문장'],guideIndex:0};
  const start=source.indexOf('  const save = async () => {'),end=source.indexOf('\n  return <main',start);
  const code=ts.transpileModule(source.slice(start,end)+'\nsave',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const save=vm.runInNewContext(code,context) as()=>Promise<void>;
  return {events,save,lifetime,release:()=>resume(),invalidate:()=>{lifetime.current.epoch++;lifetime.current.owner='B';lifetime.current.saving=true;}};
}
for(const stage of ['blob','upload','session'] as const) test(`actual handwriting save ignores stale ${stage} continuation and preserves newer busy`,async()=>{
  const f=fixture(stage);const task=f.save();await new Promise(r=>setImmediate(r));const before=[...f.events];f.invalidate();f.release();await task;
  assert.deepEqual(f.events,before);assert.equal(f.lifetime.current.saving,true);
});
test('actual handwriting save success follows upload, resource, session once',async()=>{
 const f=fixture('none');await f.save();assert.deepEqual(f.events,['saving:true','upload','resource','session','saved','notice','saving:false']);
});
test('actual handwriting save synchronously blocks duplicate click during image conversion',async()=>{
 const f=fixture('blob');const first=f.save();await f.save();f.release();await first;assert.equal(f.events.filter(x=>x==='upload').length,1);
});
