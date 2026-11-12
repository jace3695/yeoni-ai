import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const OWNER = 'fitness-cloud-sync-user', EPOCH = 'fitness-cloud-sync-epoch';
const WEIGHTS = 'ai-fitness-weight-records', INBODY = 'ai-fitness-inbody-records';
const JOURNAL = 'yeoni-storage-transaction-v1', DAY = '2026-11-03';
const source = readFileSync(new URL('../app/components/RecordCalendarView.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('RecordCalendarView.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name: string) {
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(found.length, 1, `Expected one actual ${name} handler`);
  return `const ${found[0]};`;
}

// Real calendar handlers and storage modules in independent VMs. The actual
// ownership manager acquires a synthetic Web Lock; no ownership/guard bypass.
function fixture() {
  const weightRaw = JSON.stringify({ [DAY]: { weight: 70, recordedAt: 'synthetic' } });
  const inbodyRaw = JSON.stringify({ [DAY]: { bmi: 23, memo: 'keep' } });
  const data = new Map([[OWNER, 'owner'], [EPOCH, 'epoch'], [WEIGHTS, weightRaw], [INBODY, inbodyRaw]]);
  const mutations: string[] = [];
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { mutations.push(key); data.set(key, value); },
    removeItem: (key: string) => { mutations.push(key); data.delete(key); },
  };
  const context = vm.createContext({ Error, Event, CustomEvent, queueMicrotask,
    window: { localStorage: storage, addEventListener: () => {}, dispatchEvent: () => true },
    navigator: { locks: { request: (_name: string, _options: unknown, callback: () => Promise<void>) => callback() } },
  });
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  function load(name: string): Record<string, unknown> {
    const existing = cache.get(name);
    if (existing) return existing.exports;
    const moduleBox = { exports: {} as Record<string, unknown> };
    cache.set(name, moduleBox);
    const raw = readFileSync(new URL(`../app/data/${name}.ts`, import.meta.url), 'utf8');
    const code = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireLocal = (request: string) => {
      const target = request.replace(/\.ts$/, '').replace(/^\.\//, '');
      if (['storageOwnership', 'storageTransaction', 'recordStorage', 'bodyRecordSave', 'workoutCompletion', 'dietPlans'].includes(target)) return load(target);
      if (request === '../../lib/diet-time.ts') return { fastingStartForDay: () => '' };
      throw new Error(`Unexpected dependency: ${request}`);
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(requireLocal, moduleBox, moduleBox.exports);
    return moduleBox.exports;
  }
  const ownership = load('storageOwnership') as typeof import('../app/data/storageOwnership');
  ownership.beginStorageAccess();
  assert.equal(ownership.getStorageAccessStatus(), 'ready');
  const body = load('bodyRecordSave') as typeof import('../app/data/bodyRecordSave');
  const record = load('recordStorage') as typeof import('../app/data/recordStorage');
  const state = { readError: false, sessionChanged: false, published: 0 };
  Object.assign(context, {
    calendarScope: { current: body.readBodySaveScope(storage) }, calendarInvalidated: { current: false },
    recordsLive: { current: true }, readBodySaveScope: body.readBodySaveScope,
    isBodySaveScopeCurrent: body.isBodySaveScopeCurrent, readBodySaveSnapshot: body.readBodySaveSnapshot,
    readRecordStores: record.readRecordStores,
    // Include the old guard's dependency so a regression fails on mutation,
    // rather than accidentally passing due to a missing-import ReferenceError.
    recoverStorageTransaction: load('storageTransaction').recoverStorageTransaction,
    setReadError: (value: boolean) => { state.readError = value; },
    setSessionChanged: (value: boolean) => { state.sessionChanged = value; },
    setStores: () => { state.published++; },
  });
  const code = ts.transpileModule(declaration('refresh') + declaration('canEditCalendar'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const handlers = vm.runInContext(`${code}\n({refresh, canEditCalendar})`, context) as { refresh: () => void; canEditCalendar: () => boolean };
  mutations.length = 0;
  return { data, mutations, state, handlers, weightRaw, inbodyRaw };
}

for (const action of ['refresh', 'canEditCalendar'] as const) {
  for (const key of [OWNER, EPOCH]) {
    test(`${action}: foreign ${key} before-image rejects before any recovery mutation`, () => {
      const f = fixture();
      f.data.set(JOURNAL, JSON.stringify({ [key]: 'previous-session', [WEIGHTS]: '{}' }));
      const before = Object.fromEntries(f.data);
      f.handlers[action]();
      assert.deepEqual(Object.fromEntries(f.data), before);
      assert.deepEqual(f.mutations, []);
      assert.equal(f.state.readError, true);
      assert.equal(f.state.published, 0);
    });
  }
  test(`${action}: same-scope journal still recovers before returning success`, () => {
    const f = fixture();
    f.data.set(WEIGHTS, '{}');
    f.data.set(JOURNAL, JSON.stringify({ [OWNER]: 'owner', [EPOCH]: 'epoch', [WEIGHTS]: f.weightRaw }));
    const result = f.handlers[action]();
    assert.equal(f.data.get(WEIGHTS), f.weightRaw);
    assert.equal(f.data.get(INBODY), f.inbodyRaw);
    assert.equal(f.data.has(JOURNAL), false);
    assert.equal(f.state.readError, false);
    assert.equal(f.state.sessionChanged, false);
    if (action === 'canEditCalendar') assert.equal(result, true);
    else assert.equal(f.state.published, 1);
  });
  test(`${action}: stale current owner rejects before journal could restore old owner`, () => {
    const f = fixture();
    f.data.set(OWNER, 'replacement');
    f.data.set(JOURNAL, JSON.stringify({ [OWNER]: 'owner', [WEIGHTS]: '{}' }));
    const before = Object.fromEntries(f.data);
    f.handlers[action]();
    assert.deepEqual(Object.fromEntries(f.data), before);
    assert.deepEqual(f.mutations, []);
    assert.equal(f.state.sessionChanged, true);
    assert.equal(f.state.published, 0);
  });
}
