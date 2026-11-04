import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { customExerciseSource } from '../app/data/userWorkoutSettings.ts';
const source=readFileSync(new URL('../app/components/DailyWorkoutEditor.tsx',import.meta.url),'utf8');
const start=source.indexOf('function matchesExercise('),end=source.indexOf('export default function DailyWorkoutEditor',start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const matches=vm.runInNewContext(code+'\nmatchesExercise',{customExerciseSource});
test('catalog identity recognizes differently named base movement',()=>{
 assert.equal(matches({exerciseId:'band-row',name:'가벼운 밴드 로우'},'밴드 로우','band-row',[]),true);
});
test('renamed saved and legacy custom movements keep exact source identity',()=>{
 for(const row of [{id:'saved',sourceExerciseId:'band-row',name:'나의 운동'},{id:'custom-band-row-123',name:'이전 이름'}])
  assert.equal(matches({exerciseId:row.id,name:row.name},'밴드 로우','band-row',[row]),true);
});
test('unknown sources and unrelated movements are not falsely merged',()=>{
 assert.equal(matches({exerciseId:'wall-pushup',name:'벽 푸시업'},'밴드 로우','band-row',[]),false);
 assert.equal(matches({exerciseId:'manual',name:'다른 운동'},'밴드 로우','band-row',[{id:'manual',name:'다른 운동'}]),false);
});
test('manual same-name duplicate behavior is retained without guessing identity',()=>{
 assert.equal(matches({exerciseId:'manual',name:'직접 운동'},'직접 운동',undefined,[]),true);
 assert.equal(matches({exerciseId:'band-row',name:'다른 이름'},'직접 운동',undefined,[]),false);
});
