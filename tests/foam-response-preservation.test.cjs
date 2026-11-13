const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),ts=require('typescript');
const read=(p)=>fs.readFileSync(p,'utf8');
const day=read('app/components/DayView.tsx'),calendar=read('app/components/RecordCalendarView.tsx'),parent=read('app/fitness/page.tsx','baseline');
const parse=(s,name)=>ts.createSourceFile(name,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const ast=parse(day,'DayView.tsx'), ca=parse(calendar,'RecordCalendarView.tsx'),pa=parse(parent,'page.tsx');
let callback,saveParent,saveEdit,foamDisplay,foamEffect;const initializers={};
function walk(ast,fn){function visit(n){fn(n);ts.forEachChild(n,visit)}visit(ast)}
walk(ast,n=>{if(ts.isJsxAttribute(n)&&n.name.text==='onClick'&&n.initializer?.expression?.getText(ast).includes('onSaveFoamRoller({'))callback=n.initializer.expression.getText(ast);if(ts.isVariableDeclaration(n)&&/selectedFoamTiming|foamPain/.test(n.name.getText(ast)))initializers[n.name.elements[0].name.text]=n.initializer.arguments[0].getText(ast);if(ts.isFunctionDeclaration(n)&&n.name?.text==='DayView'){for(const e of n.parameters[0].name.elements)if(['foamRollerTiming','foamRollerPain'].includes(e.name.text))assert.equal(e.initializer,undefined);}});
walk(pa,n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(pa)==='saveFoamRoller')saveParent=n.initializer.getText(pa)});
walk(ca,n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ca)==='saveSecondaryEdit')saveEdit=n.initializer.getText(ca);if(ts.isConditionalExpression(n)&&n.getText(ca).startsWith('selectedWorkoutRecord.foamRollerPain === true'))foamDisplay=n.getText(ca);if(ts.isCallExpression(n)&&n.expression.getText(ca)==='useEffect'&&n.arguments[0].getText(ca).includes('setFoamTimingDraft'))foamEffect=n.arguments[0].getText(ca);});
const run=(c,ctx)=>vm.runInNewContext(ts.transpileModule(c,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
let scenarios=0;
for(const timing of [undefined,'before','after','both','recovery'])for(const pain of [undefined,false,true]){
 const init={foamRollerTiming:timing,foamRollerPain:pain};const selectedFoamTiming=run(initializers.selectedFoamTiming,init),foamPain=run(initializers.foamPain,init);assert.equal(selectedFoamTiming,timing);assert.equal(foamPain,pain);
 let payload,saved;run('('+callback+')()',{selectedFoamTiming,foamPain,selectedFoamAreas:[],foamMemoDraft:'QA_SYNTHETIC',onSaveFoamRoller:p=>payload=p});run('const save='+saveParent+';save(payload)',{payload,getLocalDateKey:()=> 'SYNTHETIC',commitCompletedStore:f=>Boolean(f({KEEP:{memo:'preserve'}})),getWorkoutRecord:r=>r||{},writeWorkoutCompletionStore:s=>saved=s,notifyRecordsChanged:()=>{}});assert.equal(saved.SYNTHETIC.foamRollerTiming,timing);assert.equal(saved.SYNTHETIC.foamRollerPain,pain);assert.equal(saved.KEEP.memo,'preserve');
 let edited;run('const edit='+saveEdit+';edit("foam")',{selectedWorkoutRecord:{},foamTimingDraft:timing,foamPainDraft:pain,foamAreasDraft:[],foamMemoDraft:'QA_SYNTHETIC',writeWorkoutStore:f=>{edited=f({future:'keep'});return true},setEditingSecondary:()=>{},setWorkoutNotice:()=>{}});assert.equal(edited.foamRollerTiming,timing);assert.equal(edited.foamRollerPain,pain);assert.equal(edited.future,'keep');
 assert.equal(run(foamDisplay,{selectedWorkoutRecord:{foamRollerPain:pain}}),pain===true?'있음':pain===false?'없음':'미응답');scenarios++;
}
assert.ok(calendar.includes('setFoamTimingDraft(selectedWorkoutRecord?.foamRollerTiming)'));assert.ok(calendar.includes('setFoamPainDraft(selectedWorkoutRecord?.foamRollerPain)'));assert.ok(!calendar.includes('setFoamPainDraft(Boolean('));
for(const s of [day,calendar]){const diagnostics=ts.transpileModule(s,{reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).diagnostics||[];assert.equal(diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);}
console.log(JSON.stringify({syntheticScenarios:scenarios,result:'PASS',coverage:['all 5 timing values × 3 pain states','new input defaults and save handler','calendar edit preserves undefined/false/true','calendar pain labels including undefined','unrelated synthetic record fields retained','TS transpile diagnostics zero'],realDataAccess:false},null,2));


// Exercise the real commit wrapper, storage writer and sync event listener with
// synthetic in-memory storage. No network or production data is involved.
const writerSource=read('app/data/workoutCompletion.ts');
const syncSource=read('app/components/CloudSyncPanel.tsx');
const noticeSource=read('app/data/storageTransaction.ts');
function initializer(source,name){const a=parse(source,'extract.tsx');let found;walk(a,n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(a)===name)found=n.initializer.getText(a)});assert.ok(found,name);return found;}
const commitHandler=initializer(parent,'commitCompletedStore');
const recordsHandler=initializer(syncSource,'onRecordsChanged');
assert.match(syncSource,/window\.setInterval\(\(\) => \{\s*if \(document\.visibilityState === "visible"\) void sync\(\);\s*\}, 30000\)/);
assert.ok(syncSource.includes('window.addEventListener(RECORDS_CHANGED_EVENT, onRecordsChanged)'));
function exerciseFoamSave({oldWithoutNotice=false,corrupt=false,quota=false}={}){
 const key='ai-fitness-workout-completed-days',date='2026-11-13';
 const raw=corrupt?'broken-json':JSON.stringify({'2001-01-02':{workoutMemo:'keep',unknown:{keep:true}}});
 const storage=new Map([[key,raw]]),microtasks=[],timers=[];let writes=0,events=0,error='',published;
 const window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(quota)throw Error('synthetic quota');storage.set(k,v);writes++;}},clearTimeout:()=>{},setTimeout:(fn,ms)=>{timers.push(ms);return 1;},dispatchEvent:e=>{events++;listener();}};
 const exports={};const common={exports,require:()=>({getLocalDateKey:()=>date}),window,Date,console};
 vm.runInNewContext(ts.transpileModule(writerSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,common);
 const context={...exports,window,Event,queueMicrotask:f=>microtasks.push(f),getLocalDateKey:()=>date,
   setCompletedStore:v=>published=v,setCompletionError:v=>error=v,active:true,syncing:false,
   userId:'synthetic',epoch:'synthetic',isCurrentCloudSession:()=>true,stop:()=>{},setStatus:()=>{},setMessage:()=>{},sync:()=>{},
   stableState:JSON.stringify,readLocalCloudState:()=>({[key]:JSON.parse(storage.get(key))}),lastSynced:{current:JSON.stringify({[key]:corrupt?{}:JSON.parse(raw)})},
   payload:{foamRollerMemo:'CI synthetic foam'}};
 vm.createContext(context);
 const js=ts.transpileModule(noticeSource.slice(noticeSource.indexOf('export const RECORDS_CHANGED_EVENT')).replaceAll('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInContext(ts.transpileModule(js+'\nlet followUpTimer; const onRecordsChanged='+recordsHandler+'; const commitCompletedStore='+commitHandler+';', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const listener=()=>vm.runInContext('onRecordsChanged();',context);
 const handler=oldWithoutNotice?saveParent.replace(/\s*notifyRecordsChanged\(\);/,''):saveParent;
 vm.runInContext(ts.transpileModule('const saveFoamRoller='+handler+';saveFoamRoller(payload);',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 while(microtasks.length)microtasks.shift()();
 return {raw,stored:storage.get(key),writes,events,timers,error,published};
}
const oldSave=exerciseFoamSave({oldWithoutNotice:true});assert.equal(oldSave.writes,1);assert.equal(oldSave.events,0);assert.deepEqual(oldSave.timers,[]);
const successful=exerciseFoamSave();assert.equal(successful.writes,1);assert.equal(successful.events,1);assert.deepEqual(successful.timers,[500]);assert.equal(successful.stored,oldSave.stored);assert.equal(successful.error,'');
assert.deepEqual(JSON.parse(successful.stored)['2001-01-02'],JSON.parse(successful.raw)['2001-01-02']);
for(const options of [{corrupt:true},{quota:true}]){const failed=exerciseFoamSave(options);assert.equal(failed.stored,failed.raw);assert.equal(failed.writes,0);assert.equal(failed.events,0);assert.deepEqual(failed.timers,[]);assert.equal(failed.published,undefined);assert.notEqual(failed.error,'');}
console.log(JSON.stringify({foamSyncSyntheticCases:4,result:'PASS',realDataAccess:false,network:false}));
