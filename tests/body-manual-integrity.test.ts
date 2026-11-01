import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getLocalDateKey } from '../app/data/dietPlans.ts';
import ts from 'typescript';
import { bodyForm, bodyImportOwner, mergeBodyFields, validMeasurementDate } from '../app/lib/bodyImport.ts';
import { bodyManualBaseline, mergeBodyManualEdit, readBodyManualStore } from '../app/lib/bodyManualEdit.ts';
import { recoverStorageTransaction, writeStorageBatch } from '../app/data/storageTransaction.ts';

function fixture(dateKey = '2026-11-01') {
  const weights = { [dateKey]: { weight: 70, recordedAt: 'old', futureWeightMetadata: 'keep' }, '2026-10-30': { weight: 72, recordedAt: 'keep' } };
  const inbody = { [dateKey]: { weight: 70, bodyFatPercent: 20, memo: 'keep', futureMetric: 7, metricSources: { bodyFatPercent: { device: 'synthetic', method: 'ocr', originalText: '20' } } }, '2026-10-30': { memo: 'other date' } };
  const data = new Map([['weights', JSON.stringify(weights)], ['inbody', JSON.stringify(inbody)], ['fitness-cloud-sync-user', 'synthetic-owner'], ['fitness-cloud-sync-epoch', '1']]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const form = { weight: '69', bodyFatPercent: '20', memo: 'keep' };
  const state = { dirty: true, message: '', published: 0, notifications: 0 };
  const manualEdit = { current: { date: dateKey, dirty: true, owner: bodyImportOwner(storage), baseline: { weight: structuredClone(weights[dateKey]), inbody: structuredClone(inbody[dateKey]) }, dirtyFields: ['weight'] } };
  const context = { Error, window: { localStorage: storage }, dateKey, form, weights, inbody, currentWeight: weights[dateKey], currentInbody: inbody[dateKey], hasRecord: true,
    setForm: () => {}, bodyForm, bodyManualBaseline, mergeBodyManualEdit, readBodyManualStore, inbodyFields: [{ key: 'bodyFatPercent', label: '체지방률' }], mergeBodyFields, bodyImportOwner, validMeasurementDate, getLocalDateKey: () => '2026-11-01', recoverStorageTransaction, writeStorageBatch,
    WEIGHT_RECORDS_KEY: 'weights', INBODY_RECORDS_KEY: 'inbody', manualEdit,
    notifyRecordsChanged: () => { state.notifications++; }, setManualDirty: (dirty: boolean) => { state.dirty = dirty; },
    onChange: () => { state.published++; }, setRecordMessage: (message: string) => { state.message = message; },
  };
  const source = readFileSync(new URL('../app/components/BodyRecordCard.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source.slice(source.indexOf('  const save ='), source.indexOf('  const remove =')), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const save = vm.runInNewContext(code + '\n save;', context) as () => void;
  return { data, storage, form, state, manualEdit, save, weights, inbody, dateKey };
}

test('manual save preserves a concurrent different-field correction and other metadata', () => {
  const f = fixture();
  f.storage.setItem('inbody', JSON.stringify({ ...f.inbody, [f.dateKey]: { ...f.inbody[f.dateKey], bodyFatPercent: 21, memo: 'external memo' } }));
  f.save();
  const latest = JSON.parse(f.data.get('inbody')!);
  assert.equal(latest[f.dateKey].bodyFatPercent, 21);
  assert.equal(latest[f.dateKey].memo, 'external memo');
  assert.equal(latest[f.dateKey].futureMetric, 7);
  assert.deepEqual(latest['2026-10-30'], f.inbody['2026-10-30']);
});

test('explicit weight clearing cannot resurrect legacy weight after reload', () => {
  const f = fixture(); f.form.weight = ''; f.save();
  assert.equal(JSON.parse(f.data.get('weights')!)[f.dateKey], undefined);
  assert.equal(JSON.parse(f.data.get('inbody')!)[f.dateKey].weight, undefined);
  assert.equal(JSON.parse(f.data.get('inbody')!)[f.dateKey].bodyFatPercent, 20);
});

test('future manual date fails without changing stores or losing draft', () => {
  const f = fixture('2026-11-02'); const before = Object.fromEntries(f.data); f.save();
  assert.deepEqual(Object.fromEntries(f.data), before);
  assert.equal(f.state.published, 0); assert.equal(f.state.dirty, true);
  assert.equal(f.form.weight, '69'); assert.match(f.state.message, /날짜/);
});

test('same-field concurrent change blocks save and keeps draft', () => {
  const f = fixture();
  f.storage.setItem('weights', JSON.stringify({ ...f.weights, [f.dateKey]: { weight: 71, recordedAt: 'external' } }));
  const before = Object.fromEntries(f.data); f.save();
  assert.deepEqual(Object.fromEntries(f.data), before);
  assert.equal(f.state.dirty, true); assert.equal(f.form.weight, '69');
  assert.equal(f.state.published, 0); assert.match(f.state.message, /변경|충돌/);
});

test('external deletion is not silently resurrected by an old draft', () => {
  const f = fixture();
  f.storage.setItem('weights', JSON.stringify({ '2026-10-30': f.weights['2026-10-30'] }));
  f.storage.setItem('inbody', JSON.stringify({ '2026-10-30': f.inbody['2026-10-30'] }));
  const before = Object.fromEntries(f.data); f.save();
  assert.deepEqual(Object.fromEntries(f.data), before);
  assert.equal(f.state.dirty, true); assert.equal(f.state.published, 0);
});

test('owner epoch change blocks stale manual save', () => {
  const f = fixture(); f.storage.setItem('fitness-cloud-sync-epoch', '2');
  const before = Object.fromEntries(f.data); f.save();
  assert.deepEqual(Object.fromEntries(f.data), before);
  assert.equal(f.state.published, 0);
});

test('changing weight retains latest unknown weight metadata', () => {
  const f = fixture(); f.save();
  assert.equal(JSON.parse(f.data.get('weights')!)[f.dateKey].futureWeightMetadata, 'keep');
});

for (const date of ['2026-11-01', '2026-10-31']) test(`manual date ${date} accepts today/past`, () => {
  const f = fixture(date); f.save(); assert.equal(f.state.published, 1);
});
for (const date of ['2026-02-30', 'invalid']) test(`invalid date ${date} keeps draft`, () => {
  const f = fixture(date); const before = Object.fromEntries(f.data); f.save();
  assert.deepEqual(Object.fromEntries(f.data), before); assert.equal(f.state.dirty, true);
});
test('malformed storage fails closed without overwriting or cleaning draft', () => {
  const f = fixture(); f.storage.setItem('inbody', '{broken'); const before = Object.fromEntries(f.data); f.save();
  assert.deepEqual(Object.fromEntries(f.data), before); assert.equal(f.state.dirty, true); assert.equal(f.state.published, 0);
});
test('same desired concurrent value is idempotent and retains source timestamp', () => {
  const f = fixture(); f.storage.setItem('weights', JSON.stringify({ ...f.weights, [f.dateKey]: { weight: 69, recordedAt: 'external' } })); f.save();
  assert.equal(f.state.published, 1); assert.equal(JSON.parse(f.data.get('weights')!)[f.dateKey].recordedAt, 'external');
});
test('reverted field does not overwrite later external correction', () => {
  const f = fixture(); f.form.weight = '70'; f.storage.setItem('weights', JSON.stringify({ ...f.weights, [f.dateKey]: { weight: 71, recordedAt: 'external' } })); f.save();
  assert.equal(JSON.parse(f.data.get('weights')!)[f.dateKey].weight, 71);
});
test('editing another field normalizes legacy-only weight on explicit save', () => {
  const f = fixture(); Reflect.deleteProperty(f.manualEdit.current.baseline, 'weight');
  f.storage.setItem('weights', JSON.stringify({ '2026-10-30': f.weights['2026-10-30'] }));
  f.manualEdit.current.dirtyFields = ['memo']; f.form.memo = 'new memo'; f.save();
  assert.equal(JSON.parse(f.data.get('weights')!)[f.dateKey].weight, 70);
  assert.equal(JSON.parse(f.data.get('inbody')!)[f.dateKey].weight, undefined);
  assert.equal(JSON.parse(f.data.get('inbody')!)[f.dateKey].memo, 'new memo');
});


test('concurrent newly added other date survives manual save', () => {
  const f = fixture();
  f.storage.setItem('weights', JSON.stringify({ ...f.weights, '2026-10-29': { weight: 73, recordedAt: 'new elsewhere' } }));
  f.storage.setItem('inbody', JSON.stringify({ ...f.inbody, '2026-10-29': { memo: 'new elsewhere', futureMetric: 8 } }));
  f.save();
  assert.deepEqual(JSON.parse(f.data.get('weights')!)['2026-10-29'], { weight: 73, recordedAt: 'new elsewhere' });
  assert.deepEqual(JSON.parse(f.data.get('inbody')!)['2026-10-29'], { memo: 'new elsewhere', futureMetric: 8 });
});

test('measurement date follows local midnight rather than UTC day', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Seoul';
    const before = getLocalDateKey(new Date('2026-11-01T14:59:59Z'));
    const after = getLocalDateKey(new Date('2026-11-01T15:00:00Z'));
    assert.equal(before, '2026-11-01'); assert.equal(after, '2026-11-02');
    assert.equal(validMeasurementDate('2026-11-02', before), false);
    assert.equal(validMeasurementDate('2026-11-02', after), true);
    process.env.TZ = 'America/Los_Angeles';
    const localDay = getLocalDateKey(new Date('2026-11-02T00:30:00Z'));
    assert.equal(localDay, '2026-11-01'); assert.equal(validMeasurementDate('2026-11-02', localDay), false);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});


test('untouched invalid stale form field cannot block a save after external correction', () => {
  const f = fixture(); f.form.bodyFatPercent = 'bad';
  f.storage.setItem('inbody', JSON.stringify({ ...f.inbody, [f.dateKey]: { ...f.inbody[f.dateKey], bodyFatPercent: 21 } }));
  f.save(); assert.equal(f.state.published, 1);
  assert.equal(JSON.parse(f.data.get('inbody')!)[f.dateKey].bodyFatPercent, 21);
});


test('unrelated edit does not resurrect externally deleted modern weight from legacy fallback', () => {
  const f = fixture(); f.manualEdit.current.dirtyFields = ['memo']; f.form.memo = 'edited';
  f.storage.setItem('weights', JSON.stringify({ '2026-10-30': f.weights['2026-10-30'] }));
  const before = Object.fromEntries(f.data); f.save();
  assert.deepEqual(Object.fromEntries(f.data), before); assert.equal(f.state.dirty, true);
  assert.match(f.state.message, /삭제/);
});
