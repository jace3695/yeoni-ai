import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {readJson,writeJson,readRecordStores} from '../app/data/recordStorage.ts';
import {initializeWorkoutDirection} from '../app/data/workoutDirectionMigration.ts';
import {CURRENT_WORKOUT_DIRECTION_VERSION, CURRENT_WORKOUT_DIRECTION_VERSION_KEY} from '../app/data/currentWorkoutDirection.ts';
import {readUserWorkoutSettings, saveUserWorkoutSettings, USER_WORKOUT_SETTINGS_KEY} from '../app/data/userWorkoutSettings.ts';
import {grantSyntheticStorageOwnership} from './storageOwnershipFixture.ts';
import {readWorkoutCompletionStore,writeWorkoutCompletionStore,WORKOUT_COMPLETED_DAYS_KEY as key,WORKOUT_STORAGE_ERROR} from '../app/data/workoutCompletion.ts';
grantSyntheticStorageOwnership();
function fixture(raw,fail=false){let writes=0;const data=new Map([[key,raw],[CURRENT_WORKOUT_DIRECTION_VERSION_KEY,CURRENT_WORKOUT_DIRECTION_VERSION],[USER_WORKOUT_SETTINGS_KEY,'{}']]);const mutations=[];globalThis.window=Object.assign(new EventTarget(),{localStorage:{getItem:k=>data.get(k)??null,setItem:(k,n)=>{if(fail)throw Error('synthetic');mutations.push(['set',k,n]);if(k===key)writes++;data.set(k,n)},removeItem:k=>{mutations.push(['remove',k]);data.delete(k)}}});return {data,mutations,get value(){return data.get(key)},get writes(){return writes}}}
for(const raw of ['{broken','null','[]'])test('shared read/write helper rejects fallback for '+raw,()=>{const f=fixture(raw);assert.throws(()=>readJson(key,{}),/운동 기록/);assert.throws(()=>writeJson(key,{}),/운동 기록/);assert.equal(f.value,raw);assert.equal(f.writes,0)});
const source=fs.readFileSync(new URL('../app/fitness/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='commitCompletedStore')declaration=n;ts.forEachChild(n,visit)}visit(ast);assert.ok(declaration);
const js=ts.transpileModule('const '+declaration.getText(ast)+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function commit(){const states=[],errors=[];const context={workoutMounted:{current:true},workoutAccess:{current:'ready'},readWorkoutCompletionStore,WORKOUT_STORAGE_ERROR,setCompletedStore:x=>states.push(x),setCompletionError:x=>errors.push(x)};const run=vm.runInNewContext(js+'\ncommitCompletedStore',context);return {run,states,errors}}
test('actual page commit stops updater on unreadable source',()=>{const f=fixture('{broken');const c=commit();let called=false;assert.equal(c.run(()=>{called=true;return {}}),false);assert.equal(called,false);assert.equal(c.states.length,0);assert.equal(f.value,'{broken');assert.deepEqual(c.errors,[WORKOUT_STORAGE_ERROR])});
test('actual page commit does not publish failed write',()=>{const raw='{"2026-11-12":true}';const f=fixture(raw,true);const c=commit();assert.equal(c.run(prev=>{writeWorkoutCompletionStore({...prev,'2026-11-11':true});return prev}),false);assert.equal(c.states.length,0);assert.equal(f.value,raw)});
test('actual page commit uses latest storage before setter',()=>{const f=fixture('{"2026-11-12":true}');const c=commit();assert.equal(c.run(prev=>{const next={...prev,'2026-11-11':true};writeWorkoutCompletionStore(next);return next}),true);assert.equal(c.states.length,1);assert.equal(JSON.parse(f.value)['2026-11-12'],true)});
test('all seven page completion mutations use early-return commit guard',()=>{assert.equal((source.match(/if \(!commitCompletedStore\(\(prev\) => \{/g)||[]).length,7);assert.equal((source.match(/\}\)\) return;/g)||[]).length,7);assert.equal(source.includes('WORKOUT_COMPLETED_DAYS_KEY'),false);const readAt=source.indexOf('const initialCompletions = readWorkoutCompletionStore()'),migrationAt=source.indexOf('const initialized = initializeWorkoutDirection(window.localStorage)');assert.ok(readAt>=0&&migrationAt>readAt);});

// Initial-render regression: actual child render expression must not run before
// the actual parent startup effect has validated potentially damaged storage.
const childSource=fs.readFileSync(new URL('../app/components/FitnessAiCoachPanel.tsx',import.meta.url),'utf8');
const childAst=ts.createSourceFile('coach.tsx',childSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let childWorkouts, startup, errorGate, readyGate;
function inspectChild(n){if(ts.isJsxAttribute(n)&&n.name.getText(childAst)==='workouts')childWorkouts=n.initializer.expression;ts.forEachChild(n,inspectChild)}inspectChild(childAst);
function inspectParent(n){
 if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('const initialCompletions = readWorkoutCompletionStore()'))startup=n.arguments[0];
 if(ts.isIfStatement(n)&&n.expression.getText(ast)==='completionError')errorGate=n;
 if(ts.isIfStatement(n)&&n.expression.getText(ast)==='!completionReady')readyGate=n;
 ts.forEachChild(n,inspectParent);
}inspectParent(ast);
assert.ok(childWorkouts);assert.ok(startup);
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
function renderGate(error,ready){
 assert.ok(errorGate);assert.ok(readyGate);
 const code=transpile('function gate(){'+errorGate.getText(ast)+readyGate.getText(ast)+'; return "children";}');
 return vm.runInNewContext(code+';gate()', {completionError:error,completionReady:ready,React:{createElement:(type,props,...children)=>({type,props,children})}});
}
test('actual coach render expression throws on damaged completion before parent effects',()=>{
 const f=fixture('{broken');
 const expression=transpile('const result = '+childWorkouts.getText(childAst)+';');
 assert.throws(()=>vm.runInNewContext(expression,{stores:undefined,window:globalThis.window,readRecordStores}),/운동 기록/);
 assert.equal(f.value,'{broken');assert.equal(f.writes,0);
});
test('initial parent render waits before mounting record-reading children',()=>{
 assert.match(source,/\[completionReady, setCompletionReady\] = useState\(false\)/);
 const rendered=renderGate('',false);assert.equal(rendered.props.role,'status');
 assert.ok(readyGate.end<source.indexOf('<WorkoutNotificationManager />'));
});
test('actual startup catch completes readiness with fixed error and no writes on corrupted source',()=>{
 const f=fixture('{broken');const events=[];
 const run=vm.runInNewContext(transpile('const run = '+startup.getText(ast)+';')+';run',{
  workoutMounted:{current:true},workoutAccess:{current:'pending'},window:globalThis.window,readWorkoutCompletionStore,WORKOUT_STORAGE_ERROR,
  setCompletionError:value=>events.push(['error',value]),setCompletionReady:value=>events.push(['ready',value]),
 });
 assert.doesNotThrow(run);assert.deepEqual(events,[['error',WORKOUT_STORAGE_ERROR],['ready',true]]);
 assert.equal(renderGate(events[0][1],true).props.role,'alert');assert.equal(f.value,'{broken');assert.equal(f.writes,0);
});
test('error guard dominates ready guard and valid initialization permits children',()=>{
 assert.ok(errorGate.pos<readyGate.pos);
 assert.equal(renderGate(WORKOUT_STORAGE_ERROR,false).props.role,'alert');
 assert.equal(renderGate('',true),'children');
});

function startupFixture(failLate=false){
 const events=[];const next={ready:false,error:''};
 const context={workoutMounted:{current:true},workoutAccess:{current:'pending'},window:globalThis.window,initializeWorkoutDirection:storage=>{events.push('direction');return initializeWorkoutDirection(storage)},readWorkoutCompletionStore,readRecordStores:()=>{events.push('records');return readRecordStores()},WORKOUT_STORAGE_ERROR,
  SELECTED_WEEKLY_WORKOUT_PLAN_KEY:'synthetic-selected',LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY:'synthetic-legacy',DEFAULT_WEEKLY_WORKOUT_PLAN_ID:'synthetic-plan',CURRENT_WORKOUT_DIRECTION_VERSION_KEY:'synthetic-version',CURRENT_WORKOUT_DIRECTION_VERSION:null,
  readUserWorkoutSettings:()=>{events.push('settings');return {}},WEEKLY_WORKOUT_PLANS:[{id:'synthetic-plan'}],
  setSelectedWeeklyWorkoutPlanId:()=>events.push('plan'),setCompletedStore:()=>events.push('completed'),setUserWorkoutSettings:()=>events.push('settings-state'),setWeightRecords:()=>events.push('weights'),setConditionRecords:()=>events.push('conditions'),setConditionToday:()=>events.push('today'),
  readDailyCondition:()=>{events.push('daily-read');if(failLate)throw Error('synthetic late read');return undefined},getLocalDateKey:()=> '2026-11-12',activeTab:'ov',assessRecoveryMode:()=>{events.push('recovery-read');return null},setRecoveryToday:()=>events.push('recovery-state'),
  setCompletionError:value=>{next.error=value;events.push('error')},setCompletionReady:value=>{next.ready=value;events.push('ready')},
 };
 return {events,next,context,run:vm.runInNewContext(transpile('const run = '+startup.getText(ast)+';')+';run',context)};
}
test('normal mount reaches ready only after records and last protected recovery read',()=>{
 fixture('{}');globalThis.window.localStorage.removeItem=()=>{};
 const f=startupFixture();assert.equal(renderGate(f.next.error,f.next.ready).props.role,'status');f.run();
 assert.equal(f.next.error,'');assert.equal(f.next.ready,true);assert.equal(f.events.at(-1),'ready');
 assert.ok(f.events.indexOf('records')<f.events.indexOf('recovery-read'));assert.ok(f.events.indexOf('recovery-read')<f.events.indexOf('ready'));
 assert.equal(renderGate(f.next.error,f.next.ready),'children');
});
test('late initialization read failure never opens children despite earlier state setters',()=>{
 fixture('{}');globalThis.window.localStorage.removeItem=()=>{};
 const f=startupFixture(true);assert.doesNotThrow(f.run);assert.equal(f.next.ready,true);assert.equal(f.next.error,WORKOUT_STORAGE_ERROR);
 assert.equal(renderGate(f.next.error,f.next.ready).props.role,'alert');assert.deepEqual(f.events.slice(-2),['error','ready']);
});
test('restored synthetic record permits fresh remount while damaged first mount stays closed',()=>{
 const damaged=fixture('{broken');const first=startupFixture();first.run();assert.equal(renderGate(first.next.error,first.next.ready).props.role,'alert');assert.equal(damaged.value,'{broken');assert.equal(damaged.writes,0);
 fixture('{}');globalThis.window.localStorage.removeItem=()=>{};const fresh=startupFixture();assert.equal(renderGate(fresh.next.error,fresh.next.ready).props.role,'status');fresh.run();assert.equal(renderGate(fresh.next.error,fresh.next.ready),'children');
});

// The failure latch is synchronous: retained page callbacks and native refresh
// events cannot clear an initialization error or mutate raw settings afterward.
const pageDeclarations=new Map();
function collectPageDeclarations(n){if(ts.isVariableDeclaration(n))pageDeclarations.set(n.name.getText(ast),n);ts.forEachChild(n,collectPageDeclarations)}collectPageDeclarations(ast);
function pageAction(name,context){const node=pageDeclarations.get(name);assert.ok(node,name);return vm.runInNewContext(transpile('const '+node.getText(ast)+';')+';'+name,{useCallback:fn=>fn,...context});}
const pageWriteCallbacks=['handleWeeklyWorkoutPlanChange','handleUserWorkoutSettingsChange','handleConditionSave','handleConditionClear','saveDayWorkout','cancelDayWorkout','saveDayCardio','cancelDayCardio','saveFoamRoller','cancelFoamRoller','recordRecoveryPriority','cancelRecoveryPriority','handleTabChange','openDailyEditor'];
for(const state of ['pending','failed','unmounted'])test(`every retained page write callback stops before dependency access when ${state}`,()=>{
 const context={workoutMounted:{current:state!=='unmounted'},workoutAccess:{current:state==='unmounted'?'ready':state}};
 for(const name of pageWriteCallbacks)assert.doesNotThrow(()=>pageAction(name,context)());
 assert.equal(pageAction('commitCompletedStore',context)(()=>assert.fail('updater cannot run')),false);
 assert.doesNotThrow(()=>pageAction('refreshWorkoutReview',context)());
});

for(const reason of ['malformed-settings','backup-quota'])test(`initialization failure remains closed through refresh and retained writes: ${reason}`,()=>{
 const local=fixture('{}');
 if(reason==='malformed-settings')local.data.set(USER_WORKOUT_SETTINGS_KEY,'{broken');
 else{
  local.data.delete(CURRENT_WORKOUT_DIRECTION_VERSION_KEY);const set=window.localStorage.setItem;
  window.localStorage.setItem=(k,v)=>{if(k.startsWith('ai-fitness-workout-direction-raw-backup-v1:'))throw Error('synthetic backup quota');set(k,v)};
 }
 const f=startupFixture();f.run();assert.equal(f.context.workoutAccess.current,'failed');assert.equal(f.next.error,WORKOUT_STORAGE_ERROR);
 const after=JSON.stringify([...local.data]);const changes=local.mutations.length;
 pageAction('refreshWorkoutReview',f.context)();assert.equal(f.next.error,WORKOUT_STORAGE_ERROR);
 for(const name of pageWriteCallbacks)pageAction(name,f.context)();
 assert.equal(pageAction('commitCompletedStore',f.context)(()=>assert.fail('blocked updater')),false);
 assert.equal(JSON.stringify([...local.data]),after);assert.equal(local.mutations.length,changes);
 // Even fixing the backing data cannot revive the failed mounted instance.
 local.data.set(USER_WORKOUT_SETTINGS_KEY,'{}');local.data.set(CURRENT_WORKOUT_DIRECTION_VERSION_KEY,CURRENT_WORKOUT_DIRECTION_VERSION);
 const beforeRetry=local.mutations.length;f.run();pageAction('refreshWorkoutReview',f.context)();
 assert.equal(f.context.workoutAccess.current,'failed');assert.equal(f.next.error,WORKOUT_STORAGE_ERROR);assert.equal(local.mutations.length,beforeRetry);
 const fresh=startupFixture();fresh.run();assert.equal(fresh.context.workoutAccess.current,'ready');assert.equal(fresh.next.error,'');
});

test('successful initialization admits the actual settings writer without bypassing the latch',()=>{
 const local=fixture('{}');const f=startupFixture();f.run();assert.equal(f.context.workoutAccess.current,'ready');
 const write=pageAction('handleUserWorkoutSettingsChange',{...f.context,saveUserWorkoutSettings});
 const next=readUserWorkoutSettings();next.exerciseTargets={synthetic:{reps:9}};write(next);
 assert.equal(JSON.parse(local.data.get(USER_WORKOUT_SETTINGS_KEY)).exerciseTargets.synthetic.reps,9);
 f.context.workoutMounted.current=false;write({...next,exerciseTargets:{synthetic:{reps:99}}});
 assert.equal(JSON.parse(local.data.get(USER_WORKOUT_SETTINGS_KEY)).exerciseTargets.synthetic.reps,9);
});

let mountEffect;
function findMount(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('workoutMounted.current = true'))mountEffect=n.arguments[0];ts.forEachChild(n,findMount)}findMount(ast);assert.ok(mountEffect);
for(const fail of [false,true])test(`mount cleanup/replay does not revive failed initialization (${fail ? 'failed' : 'ready'})`,()=>{
 const local=fixture('{}');if(fail)local.data.set(USER_WORKOUT_SETTINGS_KEY,'{broken');
 const f=startupFixture();f.context.workoutMounted.current=false;
 const mount=vm.runInNewContext(transpile('const mount = '+mountEffect.getText(ast)+';')+';mount',f.context);
 const cleanup=mount();f.run();assert.equal(f.context.workoutAccess.current,fail?'failed':'ready');
 cleanup();assert.equal(f.context.workoutMounted.current,false);pageAction('handleUserWorkoutSettingsChange',f.context)();
 mount();f.run();assert.equal(f.context.workoutMounted.current,true);assert.equal(f.context.workoutAccess.current,fail?'failed':'ready');
});
