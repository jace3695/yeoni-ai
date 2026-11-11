import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { bodyImportOwner, mergeBodyImport } from '../app/lib/bodyImport.ts';

import { bodyManualBaseline } from '../app/lib/bodyManualEdit.ts';
const W = bodyRecordStorage.WEIGHT_RECORDS_KEY, I = bodyRecordStorage.INBODY_RECORDS_KEY;

// Execute the shipped confirmation/save handler, never browser or user storage.
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


function fixture() {
  const storage = new Map<string, string>([
    ['fitness-cloud-sync-user', 'synthetic-A'], ['fitness-cloud-sync-epoch', '1'],
    [W, JSON.stringify({ '2026-09-30': { weight: 80, recordedAt: 'synthetic-old' }, '2026-10-22': { weight: 81, recordedAt: 'synthetic-other' } })],
    [I, JSON.stringify({ '2026-09-30': { bmi: 24, memo: 'keep', futureMetric: 7 } })],
  ]);
  const localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
  const body = bodySaveFixture(localStorage, () => { state.writes++; });
  const scope = body.readBodySaveScope(localStorage);
  const draft = { format: 'oa-long', sourceReviewed: false, scope, owner: bodyImportOwner(localStorage), date: '2026-09-30', patch: { weight: '79.2', bmi: '23' } };
  const state = { writes: 0, changed: 0, cleared: false, date: '', message: '', confirm: () => true };
  const context = {
    ...body, bodyManualBaseline, formScope: { current: scope }, invalidatedScope: { current: false },
    draft, window: { localStorage, confirm: () => state.confirm() }, bodyImportOwner, mergeBodyImport,
    WEIGHT_RECORDS_KEY: W, INBODY_RECORDS_KEY: I, getLocalDateKey: () => '2026-10-22',
    readJson: (key: string) => JSON.parse(storage.get(key) ?? '{}'),
    manualEdit: { current: { dirty: true } }, setManualDirty: () => {}, notifyRecordsChanged: () => {},
    onChange: () => { state.changed++; }, onDateChange: (date: string) => { state.date = date; },
    setDraft: () => { state.cleared = true; }, setRecordMessage: (value: string) => { state.message = value; },
    Error,
  };
  const source = readFileSync(new URL('../app/components/BodyRecordCard.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const saveImport =');
  const end = source.indexOf('  const save =', start);
  assert.ok(start >= 0 && end > start);
  const scopeCode = source.slice(source.indexOf('  const isCurrentBodyScope ='), source.indexOf('  const editField ='));
  const code = ts.transpileModule(scopeCode + source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const save = vm.runInNewContext(code + '\nsaveImport', context) as () => void;
  return { state, storage, draft, save };
}

test('confirmed measurement date is saved and selected; unrelated fields and dates survive', () => {
  const f = fixture(); f.save();
  assert.equal(f.state.writes, 1); assert.equal(f.state.changed, 1);
  assert.equal(f.state.date, '2026-09-30'); assert.equal(f.state.cleared, true);
  const weights = JSON.parse(f.storage.get(W)!);
  assert.equal(weights['2026-09-30'].weight, 79.2); assert.equal(weights['2026-10-22'].weight, 81);
  assert.deepEqual(JSON.parse(f.storage.get(I)!)['2026-09-30'], { bmi: 23, memo: 'keep', futureMetric: 7 });
});
test('declining an existing-date conflict keeps the draft and does not navigate or write', () => {
  const f = fixture(); f.state.confirm = () => false; f.save();
  assert.equal(f.state.writes, 0); assert.equal(f.state.cleared, false); assert.equal(f.state.date, '');
});
test('account switch while confirming cannot write the previous account draft', () => {
  const f = fixture(); f.state.confirm = () => { f.storage.set('fitness-cloud-sync-user', 'synthetic-B'); return true; }; f.save();
  assert.equal(f.state.writes, 0); assert.equal(f.state.changed, 0); assert.match(f.state.message, /계정/);
});
test('same-account new session rejects an old draft before confirmation', () => {
  const f = fixture(); f.storage.set('fitness-cloud-sync-epoch', '2');
  f.state.confirm = () => { assert.fail('stale session must not confirm'); }; f.save();
  assert.equal(f.state.writes, 0); assert.equal(f.state.cleared, false);
});
test('concurrent record change during confirmation is preserved, then explicit retry merges it', () => {
  const f = fixture(); f.state.confirm = () => {
    f.storage.set(I, JSON.stringify({ '2026-09-30': { bmi: 24, memo: 'newer' } })); return true;
  }; f.save();
  assert.equal(f.state.writes, 0); assert.match(f.state.message, /기록.*바뀌|기록이 변경/);
  f.state.confirm = () => true; f.save();
  assert.equal(f.state.writes, 1); assert.equal(JSON.parse(f.storage.get(I)!)['2026-09-30'].memo, 'newer');
});
test('invalid or future edited dates preserve draft without saving or navigating', () => {
  for (const date of ['', '2026-02-30', '2026-10-23']) {
    const f = fixture(); f.draft.date = date; f.save();
    assert.equal(f.state.writes, 0); assert.equal(f.state.cleared, false); assert.equal(f.state.date, '');
    assert.match(f.state.message, /날짜/);
  }
});


test('blank OCR date requires manual correction and explicit confirmation before synthetic save', () => {
  const f = fixture(); f.draft.date = ''; const before = [...f.storage]; f.save();
  assert.deepEqual([...f.storage], before); assert.equal(f.state.cleared, false);
  f.draft.date = '2026-09-30'; f.state.confirm = () => false; f.save();
  assert.deepEqual([...f.storage], before);
  f.state.confirm = () => true; f.save();
  assert.equal(f.state.writes, 1); assert.equal(f.state.date, '2026-09-30');
  assert.equal(JSON.parse(f.storage.get(I)!)['2026-09-30'].memo, 'keep');
});

test('actual import save handler distinguishes a manually corrected missing weight from its prior OCR source', () => {
  const f = fixture();
  const source = { device: 'OA long report', originalLabel: '체중', originalUnit: 'kg', originalText: '80.0kg', method: 'ocr', mappingVersion: 'oa-pro-v1' };
  f.storage.set(I, JSON.stringify({ '2026-09-30': { bmi: 24, memo: 'keep', metricSources: { weight: source } } }));
  const before = [...f.storage];
  f.state.confirm = () => false; f.save();
  assert.deepEqual([...f.storage], before);
  f.state.confirm = () => true; f.save();
  assert.equal(f.state.writes, 1);
  assert.equal(JSON.parse(f.storage.get(W)!)['2026-09-30'].weight, 79.2);
  const record = JSON.parse(f.storage.get(I)!)['2026-09-30'];
  assert.deepEqual(record.metricSources.weight, { ...source, method: 'ocr-edited' });
  assert.equal(record.memo, 'keep');
});


test('InBody save is blocked until source labels, units, values and date have been explicitly reviewed', () => {
  const f = fixture(); f.draft.format = 'inbody-270s-en'; const before = [...f.storage];
  f.save(); assert.equal(f.state.writes, 0); assert.deepEqual([...f.storage], before); assert.match(f.state.message, /항목명·단위·숫자/);
  f.draft.sourceReviewed = true; f.state.confirm = () => false; f.save(); assert.equal(f.state.writes, 0);
  f.state.confirm = () => true; f.save(); assert.equal(f.state.writes, 1);
});
