import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { bodyForm, bodyImportOwner, validMeasurementDate, mergeBodyFields } from '../app/lib/bodyImport.ts';
import { bodyManualBaseline, deleteBodyManualRecord, mergeBodyManualEdit, readBodyManualStore } from '../app/lib/bodyManualEdit.ts';

import * as bodyRecordStorage from '../app/data/recordStorage.ts';
import * as storageOwnership from '../app/data/storageOwnership.ts';
import { grantSyntheticStorageOwnership } from './storageOwnershipFixture.ts';

// Execute actual snapshot/journal modules in this fixture's synthetic window.
// The real ownership manager is acquired with synthetic Web Locks, never bypassed.
function bodySaveFixture(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, onNotify = () => {}) {
  grantSyntheticStorageOwnership();
  const txModule = { exports: {} };
  const bodyModule = { exports: {} };
  const context = vm.createContext({ Error, Event, CustomEvent, window: {
    localStorage: storage, dispatchEvent: () => { onNotify(); return true; },
  }, queueMicrotask: (run: () => void) => run() });
  const load = (name: string, module: { exports: object }, dependencies: Record<string, object>) => {
    const source = readFileSync(new URL(`../app/data/${name}.ts`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)((name: string) => {
      const dependency = dependencies[name.replace(/\.ts$/, '')];
      if (!dependency) throw new Error(`Unexpected dependency: ${name}`);
      return dependency;
    }, module, module.exports);
  };
  load('storageTransaction', txModule, { './storageOwnership': storageOwnership });
  load('bodyRecordSave', bodyModule, { './recordStorage': bodyRecordStorage, './storageTransaction': txModule.exports, './storageOwnership': storageOwnership });
  return { ...bodyModule.exports, ...txModule.exports } as typeof import('../app/data/bodyRecordSave') & typeof import('../app/data/storageTransaction');
}


const W = bodyRecordStorage.WEIGHT_RECORDS_KEY, I = bodyRecordStorage.INBODY_RECORDS_KEY;

function fixture() {
  const weights = { '2026-11-01': { weight: 80, recordedAt: 'old' }, '2026-10-31': { weight: 79, recordedAt: 'keep' } };
  const inbody = { '2026-11-01': { bmi: 24, memo: 'old', futureMetric: 7 }, '2026-10-31': { memo: 'keep' } };
  const initial = { [W]: JSON.stringify(weights), [I]: JSON.stringify(inbody) };
  const data = new Map(Object.entries(initial));
  const state = { failSecond: false, failRollback: false, published: 0, notified: 0, dirty: true, message: '', cleared: false };
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => { data.delete(key); },
    setItem: (key: string, value: string) => {
      if (state.failSecond && key === I && value !== initial[I]) throw Error('synthetic second write');
      if (state.failRollback && key === W && value === initial[W]) throw Error('synthetic rollback');
      data.set(key, value);
    },
  };
  const body = bodySaveFixture(storage, () => { state.notified++; });
  const scope = body.readBodySaveScope(storage);
  const form = { weight: '78.2', bmi: '23', memo: 'edited' };
  const context = {
    ...body, Error, formScope: { current: scope }, invalidatedScope: { current: false },
    window: { localStorage: storage, confirm: () => true }, form, weights, inbody, dateKey: '2026-11-01',
    currentWeight: weights['2026-11-01'], currentInbody: inbody['2026-11-01'], hasRecord: true,
    getLocalDateKey: () => '2026-11-01', bodyForm, bodyImportOwner, validMeasurementDate, bodyManualBaseline, deleteBodyManualRecord, mergeBodyManualEdit, readBodyManualStore, inbodyFields: [{ key: 'bmi', label: 'BMI' }], mergeBodyFields,
    activeDate: { current: '2026-11-01' }, WEIGHT_RECORDS_KEY: W, INBODY_RECORDS_KEY: I,
    writeJson: (key: string, value: unknown) => storage.setItem(key, JSON.stringify(value)),
    notifyRecordsChanged: () => { state.notified++; },
    manualEdit: { current: { date: '2026-11-01', dirty: true, owner: bodyImportOwner(storage), baseline: bodyManualBaseline(weights['2026-11-01'], inbody['2026-11-01']), dirtyFields: ['weight', 'bmi', 'memo'] } }, setManualDirty: (value: boolean) => { state.dirty = value; },
    onChange: () => { state.published++; }, setRecordMessage: (value: string) => { state.message = value; },
    setForm: () => { state.cleared = true; },
  };
  const source = readFileSync(new URL('../app/components/BodyRecordCard.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const save ='); const end = source.indexOf('  const importOaReport', start);
  assert.ok(start >= 0 && end > start);
  const scopeCode = source.slice(source.indexOf('  const isCurrentBodyScope ='), source.indexOf('  const editField ='));
  const code = ts.transpileModule(scopeCode + source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const handlers = vm.runInNewContext(code + '\n({save, remove})', context) as { save: () => void; remove: () => void };
  return { state, storage, data, initial, form, recoverStorageTransaction: body.recoverStorageTransaction, ...handlers };
}

for (const action of ['save', 'remove'] as const) {
  test(`${action}: second write failure restores both existing stores and preserves draft`, () => {
    const f = fixture(); f.state.failSecond = true;
    let thrown: unknown;
    try { f[action](); } catch (error) { thrown = error; }
    assert.deepEqual(Object.fromEntries(f.data), f.initial);
    assert.equal(thrown, undefined);
    assert.equal(f.state.published, 0); assert.equal(f.state.notified, 0);
    assert.equal(f.state.dirty, true); assert.equal(f.state.cleared, false);
    assert.equal(f.form.memo, 'edited'); assert.match(f.state.message, /못했/);
  });
  test(`${action}: rollback failure retains recovery journal and explicit retry recovers before commit`, () => {
    const f = fixture(); f.state.failSecond = true; f.state.failRollback = true;
    assert.doesNotThrow(() => f[action]());
    assert.deepEqual(JSON.parse(f.data.get('yeoni-storage-transaction-v1')!), f.initial);
    assert.equal(f.state.published, 0); assert.equal(f.state.dirty, true);
    assert.doesNotThrow(() => f[action]()); assert.equal(f.state.published, 0);
    f.state.failSecond = false; f.state.failRollback = false;
    f.recoverStorageTransaction(f.storage); assert.deepEqual(Object.fromEntries(f.data), f.initial);
    f[action](); assert.equal(f.data.has('yeoni-storage-transaction-v1'), false);
    assert.equal(f.state.published, 1); assert.equal(f.state.notified, 1); assert.equal(f.state.dirty, false);
    const weights = JSON.parse(f.data.get(W)!); const inbody = JSON.parse(f.data.get(I)!);
    assert.equal(weights['2026-10-31'].weight, 79); assert.equal(inbody['2026-10-31'].memo, 'keep');
    if (action === 'save') {
      assert.equal(weights['2026-11-01'].weight, 78.2); assert.equal(inbody['2026-11-01'].memo, 'edited'); assert.equal(inbody['2026-11-01'].futureMetric, 7);
    } else { assert.equal(weights['2026-11-01'], undefined); assert.equal(inbody['2026-11-01'], undefined); }
  });
  test(`${action}: handler retry alone recovers an interrupted rollback before writing`, () => {
    const f = fixture(); f.state.failSecond = true; f.state.failRollback = true;
    f[action](); assert.equal(f.data.has('yeoni-storage-transaction-v1'), true);
    f.state.failSecond = false; f.state.failRollback = false;
    f[action]();
    assert.equal(f.data.has('yeoni-storage-transaction-v1'), false);
    assert.equal(f.state.published, 1); assert.equal(f.state.notified, 1);
    assert.equal(JSON.parse(f.data.get(I)!)['2026-10-31'].memo, 'keep');
    assert.equal(JSON.parse(f.data.get(W)!)['2026-10-31'].weight, 79);
  });
}
