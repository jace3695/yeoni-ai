import test from 'node:test';
import assert from 'node:assert/strict';
import {getPreviousWeightRecord, type WeightRecordStore} from '../app/data/recordStorage.ts';
const row=(weight:number)=>({weight,recordedAt:'synthetic'});
test('zero or negative stored weight cannot replace prior positive measurement',()=>{
 for(const invalid of [0,-1])assert.equal(getPreviousWeightRecord({'2026-10-28':row(71),'2026-10-29':row(invalid),'2026-10-30':row(69)},'2026-10-30')?.[0],'2026-10-28');
});
test('only same-date, future or invalid values gives no prior measurement',()=>{
 const records={'2026-10-26':row(NaN),'2026-10-27':row(Infinity),'2026-10-28':row(-2),'2026-10-29':row(0),'2026-10-30':row(69),'2026-10-31':row(70)};
 assert.equal(getPreviousWeightRecord(records,'2026-10-30'),undefined);
});
test('latest positive earlier date wins irrespective of insertion order',()=>{
 const records={'2026-10-29':row(70.5),'2026-10-27':row(72),'2026-10-28':row(71)};
 assert.deepEqual(getPreviousWeightRecord(records,'2026-10-30'),['2026-10-29',row(70.5)]);
});
test('comparison is read-only and retains all stored rows and metadata',()=>{
 const records:WeightRecordStore={'2026-10-28':row(71),'2026-10-29':row(0)};const before=JSON.stringify(records);
 Object.values(records).forEach(Object.freeze);Object.freeze(records);getPreviousWeightRecord(records,'2026-10-30');assert.equal(JSON.stringify(records),before);
});
