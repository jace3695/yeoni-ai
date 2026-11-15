import assert from "node:assert/strict";
import test from "node:test";
import { buildCurrentWorkoutSettings, CURRENT_WEEKLY_GROUPS, CURRENT_WEEKLY_METHODS } from "./currentWorkoutDirection.ts";

test("현재 운동 방향으로 이전하면 개인 기록 목표는 보존하고 주간 루틴만 정확히 갱신한다", () => {
  const result = buildCurrentWorkoutSettings({
    weeklyGroups: { mon: "cardio-back-basic" },
    weeklyMethods: { mon: { method: "standard", rounds: 1, restSeconds: 10, workSeconds: 20 } },
    weeklyEdits: { mon: { customExercises: [{ id: "old", name: "이전 운동" }] } },
    dateOverrides: { "2026-09-08": { groupId: "cardio-back-basic" } },
    exerciseTargets: { "밴드 로우": { reps: 12 } },
  });

  assert.deepEqual(result.weeklyGroups, CURRENT_WEEKLY_GROUPS);
  assert.deepEqual(result.weeklyMethods, CURRENT_WEEKLY_METHODS);
  assert.deepEqual(result.weeklyEdits, {});
  assert.deepEqual(result.dateOverrides, {});
  assert.deepEqual(result.exerciseTargets, { "밴드 로우": { reps: 12 } });
});

import { initializeWorkoutDirection, WORKOUT_DIRECTION_RAW_BACKUP_PREFIX, WORKOUT_DIRECTION_SOURCE_KEYS } from './workoutDirectionMigration.ts';
import { CURRENT_WORKOUT_DIRECTION_BACKUP_KEY, CURRENT_WORKOUT_DIRECTION_VERSION_KEY, CURRENT_WORKOUT_DIRECTION_VERSION } from './currentWorkoutDirection.ts';
import { USER_WORKOUT_SETTINGS_KEY } from './userWorkoutSettings.ts';
import { SELECTED_WEEKLY_WORKOUT_PLAN_KEY, LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY } from './workoutPlans.ts';
import { grantSyntheticStorageOwnership } from '../../tests/storageOwnershipFixture.ts';
grantSyntheticStorageOwnership();

const oldRaw = '{ "weeklyGroups":{"mon":"old"}, "weeklyMethods":{"mon":{"method":"standard"}}, "weeklyEdits":{"mon":{"removed":["old"],"customExercises":[{"id":"custom","name":"synthetic"}]}}, "dateOverrides":{"2026-01-02":{"groupId":"old"}}, "weeklyExerciseTargets":{"mon":{"synthetic":{"reps":8}}}, "exerciseTargets":{"synthetic":{"reps":7}}, "futureField":{"verbatim":" 한글  "}, "dayRoutineEdits":{"legacy":"keep"} }';
const journal = 'yeoni-storage-transaction-v1';
function migrationStorage(extra: Record<string,string> = {}, reject?: (key:string,value:string)=>boolean) {
  const initial = { [USER_WORKOUT_SETTINGS_KEY]:oldRaw, [SELECTED_WEEKLY_WORKOUT_PLAN_KEY]:'week1-cardio-back', [LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY]:'legacy-plan', [CURRENT_WORKOUT_DIRECTION_VERSION_KEY]:'old-version', 'fitness-cloud-sync-user':'synthetic-owner', 'fitness-cloud-sync-epoch':'synthetic-epoch', unrelated:'keep', ...extra };
  const data = new Map(Object.entries(initial)); const writes:string[]=[];
  return { initial, data, writes, getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>{writes.push(key);if(reject?.(key,value))throw Error('synthetic quota');data.set(key,value);},
    removeItem:(key:string)=>{writes.push('remove:'+key);data.delete(key);},
  };
}
const snapshots = (s:ReturnType<typeof migrationStorage>) => [...s.data].filter(([key])=>key.startsWith(WORKOUT_DIRECTION_RAW_BACKUP_PREFIX)).map(([key,value])=>({key,value:JSON.parse(value)}));

for (const existing of [undefined, '{ "marker":"existing unrelated backup", "settings":{"other":"keep"} }']) {
  test(`direction migration retains every exact raw source and never overwrites legacy backup (${existing ? 'existing' : 'absent'})`,()=>{
    const s=migrationStorage(existing ? {[CURRENT_WORKOUT_DIRECTION_BACKUP_KEY]:existing}:{});
    const result=initializeWorkoutDirection(s);assert.equal(result.migrated,true);
    const [backup]=snapshots(s);assert.ok(backup);assert.equal(snapshots(s).length,1);
    for(const key of WORKOUT_DIRECTION_SOURCE_KEYS)assert.equal(backup.value.raw[key],s.initial[key as keyof typeof s.initial]??null);
    assert.equal(backup.value.owner,'synthetic-owner');assert.equal(backup.value.epoch,'synthetic-epoch');
    assert.equal(backup.value.targetVersion,CURRENT_WORKOUT_DIRECTION_VERSION);
    if(existing)assert.equal(s.getItem(CURRENT_WORKOUT_DIRECTION_BACKUP_KEY),existing);
    assert.equal(s.getItem('unrelated'),'keep');assert.equal(s.getItem(journal),null);
    assert.deepEqual(result.settings.weeklyEdits,{});assert.deepEqual(result.settings.exerciseTargets,{synthetic:{reps:7}});
    const count=s.writes.length;initializeWorkoutDirection(s);assert.equal(s.writes.length,count);assert.equal(snapshots(s).length,1);
  });
}

test('missing original settings and selected plan remain explicit null in raw backup',()=>{
  const s=migrationStorage();s.data.delete(USER_WORKOUT_SETTINGS_KEY);s.data.delete(SELECTED_WEEKLY_WORKOUT_PLAN_KEY);s.data.delete(LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY);
  initializeWorkoutDirection(s);const raw=snapshots(s)[0].value.raw;
  for(const key of [USER_WORKOUT_SETTINGS_KEY,SELECTED_WEEKLY_WORKOUT_PLAN_KEY,LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY])assert.equal(raw[key],null);
});

for (const raw of ['', ' ', '{', 'null', '[]', '1', 'true', '"text"', '{"weeklyEdits":[]}', '{"weeklyGroups":{"mon":3}}', '{"dateOverrides":{"2026-01-01":false}}', '{"exerciseTargets":{"row":[]}}', '{"weeklyExerciseTargets":{"mon":{"row":null}}}', '{"adaptiveReviewDecisions":[null]}']) {
  test(`malformed settings block migration without losing raw: ${raw}`,()=>{
    const s=migrationStorage({[USER_WORKOUT_SETTINGS_KEY]:raw});assert.throws(()=>initializeWorkoutDirection(s));
    assert.deepEqual(Object.fromEntries(s.data),s.initial);assert.deepEqual(s.writes,[]);
  });
}
for (const raw of ['', '{', 'null', '[]', 'false']) test(`malformed existing backup is not overwritten: ${raw}`,()=>{
  const s=migrationStorage({[CURRENT_WORKOUT_DIRECTION_BACKUP_KEY]:raw});assert.throws(()=>initializeWorkoutDirection(s));assert.deepEqual(Object.fromEntries(s.data),s.initial);assert.deepEqual(s.writes,[]);
});

for(const point of ['journal','raw-backup','settings','plan','version','legacy-backup'])test(`write failure at ${point} restores exact source and allows a fresh safe retry`,()=>{
  let reject=true;
  const s=migrationStorage({},(key)=>{
    if(!reject)return false;
    const hit=point==='journal'?key===journal:point==='raw-backup'?key.startsWith(WORKOUT_DIRECTION_RAW_BACKUP_PREFIX):point==='settings'?key===USER_WORKOUT_SETTINGS_KEY:point==='plan'?key===SELECTED_WEEKLY_WORKOUT_PLAN_KEY:point==='version'?key===CURRENT_WORKOUT_DIRECTION_VERSION_KEY:key===CURRENT_WORKOUT_DIRECTION_BACKUP_KEY;
    if(hit){reject=false;return true;}return false;
  });
  assert.throws(()=>initializeWorkoutDirection(s));assert.deepEqual(Object.fromEntries(s.data),s.initial);assert.equal(snapshots(s).length,0);
  initializeWorkoutDirection(s);assert.equal(snapshots(s).length,1);assert.equal(snapshots(s)[0].value.raw[USER_WORKOUT_SETTINGS_KEY],oldRaw);
});

test('unresolved or foreign journal is preserved without page-level recovery',()=>{
  for(const raw of ['{',JSON.stringify({'fitness-cloud-sync-user':'other', [USER_WORKOUT_SETTINGS_KEY]:'{}'})]){
    const s=migrationStorage({[journal]:raw});assert.throws(()=>initializeWorkoutDirection(s));assert.deepEqual(Object.fromEntries(s.data),s.initial);assert.deepEqual(s.writes,[]);
  }
});

test('owner or source change during snapshot capture fails before any write',()=>{
  for(const field of ['fitness-cloud-sync-user','fitness-cloud-sync-epoch',USER_WORKOUT_SETTINGS_KEY]){
    const s=migrationStorage();const read=s.getItem;let changed=false;
    s.getItem=key=>{const value=read(key);if(key===CURRENT_WORKOUT_DIRECTION_BACKUP_KEY&&!changed){changed=true;s.data.set(field,field===USER_WORKOUT_SETTINGS_KEY?'{}':'changed');}return value;};
    assert.throws(()=>initializeWorkoutDirection(s));assert.deepEqual(s.writes,[]);assert.equal(s.getItem(field),field===USER_WORKOUT_SETTINGS_KEY?'{}':'changed');
  }
});

test('UUID error or collision never changes original keys or an existing backup',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  try{
    for(const mode of ['throw','invalid','collision']){
      const id='00000000-0000-4000-8000-000000000001';
      Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>{if(mode==='throw')throw Error('synthetic uuid error');return mode==='invalid'?'bad':id;}}});
      const s=migrationStorage(mode==='collision'?{[WORKOUT_DIRECTION_RAW_BACKUP_PREFIX+id]:'existing raw snapshot'}:{});
      assert.throws(()=>initializeWorkoutDirection(s));assert.deepEqual(Object.fromEntries(s.data),s.initial);assert.deepEqual(s.writes,[]);
    }
  }finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else Reflect.deleteProperty(globalThis,'crypto');}
});

import { mergeCloudState, mergeCloudStateFromBase } from './cloudSync.ts';
import { recoverStorageTransaction } from './storageTransaction.ts';

test('two independent UUID snapshots keep both exact originals through actual cloud merges',()=>{
  const a=migrationStorage(),b=migrationStorage({[USER_WORKOUT_SETTINGS_KEY]:'{ "future":"second device", "weeklyEdits":{"tue":{"removed":["other"]}} }'});
  initializeWorkoutDirection(a);initializeWorkoutDirection(b);
  const first=snapshots(a)[0],second=snapshots(b)[0];assert.notEqual(first.key,second.key);
  const left={[first.key]:first.value},right={[second.key]:second.value};
  for(const merged of [mergeCloudState(left,right),mergeCloudStateFromBase({},left,right),mergeCloudStateFromBase(left,left,{...left,...right})]){
    assert.deepEqual(merged[first.key],first.value);assert.deepEqual(merged[second.key],second.value);
    assert.equal((merged[first.key] as typeof first.value).raw[USER_WORKOUT_SETTINGS_KEY],oldRaw);
    assert.equal((merged[second.key] as typeof second.value).raw[USER_WORKOUT_SETTINGS_KEY],b.initial[USER_WORKOUT_SETTINGS_KEY]);
  }
});

test('rollback failure keeps original-raw journal and requires recovery before another migration',()=>{
  let rejecting=true;const s=migrationStorage({},key=>rejecting&&key===USER_WORKOUT_SETTINGS_KEY);
  assert.throws(()=>initializeWorkoutDirection(s));const raw=s.getItem(journal);assert.ok(raw);
  assert.equal(JSON.parse(raw)[USER_WORKOUT_SETTINGS_KEY],oldRaw);
  const count=s.writes.length;assert.throws(()=>initializeWorkoutDirection(s));assert.equal(s.writes.length,count);
  rejecting=false;recoverStorageTransaction(s);assert.deepEqual(Object.fromEntries(s.data),s.initial);
  initializeWorkoutDirection(s);assert.equal(snapshots(s)[0].value.raw[USER_WORKOUT_SETTINGS_KEY],oldRaw);
});

test('silent backup write failure cannot permit destructive settings migration',()=>{
  const s=migrationStorage();const write=s.setItem;s.setItem=(key,value)=>{if(key.startsWith(WORKOUT_DIRECTION_RAW_BACKUP_PREFIX))return;write(key,value);};
  assert.throws(()=>initializeWorkoutDirection(s));assert.deepEqual(Object.fromEntries(s.data),s.initial);
});

test('an already-current version preserves raw settings and legacy selection without writes',()=>{
  const s=migrationStorage({[CURRENT_WORKOUT_DIRECTION_VERSION_KEY]:CURRENT_WORKOUT_DIRECTION_VERSION});
  s.data.delete(SELECTED_WEEKLY_WORKOUT_PLAN_KEY);const before=Object.fromEntries(s.data);
  const result=initializeWorkoutDirection(s);assert.equal(result.migrated,false);
  assert.deepEqual(Object.fromEntries(s.data),before);assert.deepEqual(s.writes,[]);assert.equal(snapshots(s).length,0);
});

test('a failed migration never changes an existing unrelated backup',()=>{
  const oldBackup='{ "raw": "previous backup stays exact" }';let reject=true;
  const s=migrationStorage({[CURRENT_WORKOUT_DIRECTION_BACKUP_KEY]:oldBackup},key=>{if(reject&&key===USER_WORKOUT_SETTINGS_KEY){reject=false;return true;}return false;});
  assert.throws(()=>initializeWorkoutDirection(s));assert.deepEqual(Object.fromEntries(s.data),s.initial);assert.equal(s.getItem(CURRENT_WORKOUT_DIRECTION_BACKUP_KEY),oldBackup);
});

test('postcommit notification failure is distinguished from persistence failure',()=>{
  const windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window');const queue=globalThis.queueMicrotask;
  try{
    Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>{}}});
    globalThis.queueMicrotask=()=>{throw Error('synthetic notification scheduling error');};
    const s=migrationStorage();const result=initializeWorkoutDirection(s);
    assert.equal(result.migrated,true);assert.equal(result.notified,false);assert.equal(s.getItem(journal),null);
    assert.equal(snapshots(s)[0].value.raw[USER_WORKOUT_SETTINGS_KEY],oldRaw);assert.equal(s.getItem(CURRENT_WORKOUT_DIRECTION_VERSION_KEY),CURRENT_WORKOUT_DIRECTION_VERSION);
  }finally{
    globalThis.queueMicrotask=queue;if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else Reflect.deleteProperty(globalThis,'window');
  }
});
