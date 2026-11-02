import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/growth/handwriting/page.tsx',import.meta.url),'utf8');
function fixture(stage:'blob'|'upload'|'session'|'none') {
  const events:string[]=[];let resume=()=>{};
  const deferred=(name:string)=>stage===name?new Promise<void>(r=>{resume=r;}):Promise.resolve();
  const lifetime={current:{active:true,epoch:0,owner:'A',saving:false,restoring:false}};
  const pending={current:null};
  const context={canSave:true,owner:'A',mode:'screen',routine:null,paperMinutes:5,lesson:{id:'lesson-01',number:1,title:'합성',pdfPage:2},reflection:'',checks:[true,true],trace:true,HANDWRITING_COURSE_ID:'synthetic',evidence:{current:{strokes:1,activeMs:1000}},setNotice:()=>events.push('notice'),setCompleted:()=>events.push('completed'),lifetime,pending,canvasRef:{current:{toBlob:(cb:(x:unknown)=>void)=>{void deferred('blob').then(()=>cb({size:8}));}}},growth:{user:{id:'A'},dataReady:true,saveSession:async()=>{events.push('session');await deferred('session');return {error:null};},setNotice:()=>events.push('notice')},supabase:{storage:{from:()=>({upload:async()=>{events.push('upload');await deferred('upload');return {error:null};}})},from:()=>({insert:async()=>{events.push('resource');return {error:null};}})},saving:false,saved:false,restoring:false,evidenceRef:{current:{strokes:1}},setSaving:(x:boolean)=>events.push('saving:'+x),setLocked:()=>{},setSaved:()=>events.push('saved'),getLocalDateKey:()=> '2026-11-02',crypto:{randomUUID:()=> 'synthetic-id'},handwritingMetrics:()=>({activeSeconds:10}),handwritingRoutine:null,GUIDE_TEXTS:['합성 문장'],guideIndex:0};
  const start=source.indexOf('  async function save() {'),end=source.indexOf('\n  return <main',start);
  const code=ts.transpileModule(source.slice(start,end)+'\nsave',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const save=vm.runInNewContext(code,context) as()=>Promise<void>;
  return {events,save,lifetime,release:()=>resume(),invalidate:()=>{lifetime.current.epoch++;lifetime.current.owner='B';lifetime.current.saving=true;}};
}
for(const stage of ['blob','upload','session'] as const) test(`actual course save ignores stale ${stage} continuation and preserves newer busy`,async()=>{
  const f=fixture(stage);const task=f.save();await new Promise(r=>setImmediate(r));const before=[...f.events];f.invalidate();f.release();await task;
  assert.deepEqual(f.events,before);assert.equal(f.lifetime.current.saving,true);
});
test('actual course save success follows upload, resource, session once',async()=>{
 const f=fixture('none');await f.save();assert.deepEqual(f.events,['saving:true','notice','upload','resource','session','completed','saved','notice','saving:false']);
});
test('actual course save synchronously blocks duplicate click during image conversion',async()=>{
 const f=fixture('blob');const first=f.save();await f.save();f.release();await first;assert.equal(f.events.filter(x=>x==='upload').length,1);
});

for (const change of ['attempt', 'owner'] as const) test(`actual progress load survives only ${change === 'attempt' ? 'attempt reset' : 'unchanged owner'} scope`, async () => {
 let resolve!: (value: unknown) => void;
 const query=new Proxy({}, {get:(_target,key)=>key==='then'?(done:(value:unknown)=>void)=>new Promise(r=>{resolve=r;}).then(done):()=>query});
 const scope={active:true,epoch:0,ownerEpoch:0,owner:'A'};const ready:boolean[]=[];
 const context={owner:'A',reload:0,lifetime:{current:scope},supabase:{from:()=>query},useEffect:(callback:()=>unknown)=>callback(),setProgressReady:(value:boolean)=>ready.push(value),setProgressError:()=>{},setCompleted:()=>{},setLesson:()=>{},completedHandwritingLessons:()=>new Set(),nextHandwritingLesson:()=>({id:'lesson-01'}),HANDWRITING_COURSE_ID:'synthetic',AbortSignal};
 const start=source.indexOf("  useEffect(() => {\n    if (!owner"),end=source.indexOf('  useEffect(() => {',start+20);
 vm.runInNewContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 await new Promise(r=>setImmediate(r));scope.epoch++;if(change==='owner')scope.ownerEpoch++;
 resolve({data:[],error:null});await new Promise(r=>setImmediate(r));assert.deepEqual(ready,change==='attempt'?[false,true]:[false]);
});
