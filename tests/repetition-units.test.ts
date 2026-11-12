import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../app/components/DailyWorkoutEditor.tsx',import.meta.url),'utf8');
const start=source.indexOf('function readFirstNumber('),end=source.indexOf('function matchesExercise(',start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const convert=vm.runInNewContext(code+'\ntoCustomExercise');
test('seconds before repetition count do not become repetitions',()=>{
 for(const sets of ['5초 버티기 × 3회','5초 × 3회'])assert.equal(convert({exerciseId:'ab-slider-ready-position',name:'가상 준비 자세',sets}).reps,3);
});
test('set count before repetitions is not copied as repetitions',()=>{
 const value=convert({exerciseId:'synthetic',name:'가상 운동',sets:'2세트 × 8회'});assert.equal(value.reps,8);assert.equal(value.sets,2);
});
test('existing repetition and step ranges retain their lower bound',()=>{
 for(const [sets,reps] of [['좌우 6~8회',6],['10회 × 2세트',10],['좌우 8~10걸음',8],['8–10회',8]])assert.equal(convert({exerciseId:'synthetic',name:'가상 운동',sets}).reps,reps);
});
test('seconds-only guidance invents no repetitions and other fields stay unchanged',()=>{
 const value=convert({exerciseId:'synthetic',name:'가상 운동',sets:'좌우 10~15초 × 2세트',duration:'3~5분'});assert.equal(value.reps,undefined);assert.equal(value.sets,2);assert.equal(value.durationMinutes,3);assert.equal(value.sourceExerciseId,'synthetic');assert.equal(value.name,'가상 운동');
});
