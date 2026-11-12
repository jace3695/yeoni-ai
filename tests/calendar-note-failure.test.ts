import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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


// Execute the real component's note handlers with synthetic storage/state only.
function fixture(fail: boolean) {
  const source = readFileSync(new URL('../app/components/RecordCalendarView.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const saveNote =');
  const end = source.indexOf('  const selectedDiet =', start);
  const state = { fail, draft: ' edited note ', edited: true, notice: '', notes: { today: 'old', other: 'keep' } as Record<string, string>, published: 0 };
  const data = new Map([['fitness-cloud-sync-user', 'synthetic-owner'], ['fitness-cloud-sync-epoch', '1']]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const body = bodySaveFixture(storage);
  const context = {
    window: { localStorage: storage }, calendarScope: { current: body.readBodySaveScope(storage) }, calendarInvalidated: { current: false },
    isBodySaveScopeCurrent: body.isBodySaveScopeCurrent, readBodySaveSnapshot: body.readBodySaveSnapshot, recoverStorageTransaction: body.recoverStorageTransaction, setSessionChanged: () => {}, setReadError: () => {},
    selected: 'today', noteDraft: state.draft, DAILY_NOTES_KEY: 'synthetic-notes', stores: {},
    recordsLive: { current: true },
    noteEdited: { get current() { return state.edited; }, set current(v: boolean) { state.edited = v; } },
    readJson: () => ({ ...state.notes }),
    writeJson: (_key: string, value: typeof state.notes) => { if (state.fail) throw Error('synthetic quota'); state.notes = value; },
    setNoteDraft: (v: string) => { state.draft = v; },
    setNoteNotice: (v: string) => { state.notice = v; },
    setStores: () => { state.published++; },
  };
  const guard = source.slice(source.indexOf('  const canEditCalendar ='), start);
  const code = ts.transpileModule(guard + source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const handlers = vm.runInNewContext(code + '\n({saveNote, deleteNote: typeof deleteNote === "function" ? deleteNote : null})', context);
  return { state, data, ...handlers };
}
test('failed note save preserves draft and existing dates, and reports failure', () => {
  const f = fixture(true); assert.doesNotThrow(() => f.saveNote());
  assert.equal(f.state.draft, ' edited note '); assert.equal(f.state.edited, true);
  assert.deepEqual(f.state.notes, { today: 'old', other: 'keep' }); assert.equal(f.state.published, 0);
  assert.match(f.state.notice, /못했/);
});
test('failed delete preserves unsaved draft and stored memo, then explicit retry succeeds', () => {
  const f = fixture(true); assert.doesNotThrow(() => f.deleteNote());
  assert.equal(f.state.draft, ' edited note '); assert.equal(f.state.edited, true);
  assert.deepEqual(f.state.notes, { today: 'old', other: 'keep' }); assert.equal(f.state.published, 0);
  assert.match(f.state.notice, /삭제하지 못했/);
  f.state.fail = false; f.deleteNote();
  assert.deepEqual(f.state.notes, { other: 'keep' }); assert.equal(f.state.draft, '');
  assert.equal(f.state.edited, false); assert.equal(f.state.published, 1);
});
test('save retry retains later changes on other dates and normalizes saved draft', () => {
  const f = fixture(true); f.saveNote(); f.state.notes.other = 'newer'; f.state.fail = false; f.saveNote();
  assert.deepEqual(f.state.notes, { today: 'edited note', other: 'newer' });
  assert.equal(f.state.draft, 'edited note'); assert.equal(f.state.edited, false); assert.equal(f.state.published, 1);
  assert.match(f.state.notice, /저장했습니다/);
});
test('UI uses guarded delete and announces note result', () => {
  const source = readFileSync(new URL('../app/components/RecordCalendarView.tsx', import.meta.url), 'utf8');
  assert.match(source, /onClick=\{deleteNote\}/); assert.match(source, /noteNotice && <p role="status"/);
});
