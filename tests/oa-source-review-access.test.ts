import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { bodyImportOwner } from '../app/lib/bodyImport.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'app/components/OaSourceCorrection.tsx'), 'utf8');
const ast = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name: string) {
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(found.length, 1); return found[0];
}
const OWNER = 'fitness-cloud-sync-user', EPOCH = 'fitness-cloud-sync-epoch';
const INBODY = 'ai-fitness-inbody-records', WEIGHTS = 'ai-fitness-weight-records';
const JOURNAL = 'yeoni-storage-transaction-v1', DAY = '2026-11-03';
type Failure = 'getter' | 'read' | 'owner' | 'epoch' | 'journal' | 'record' | 'unmounted' | 'invalidated' | 'missing-scope' | null;
function run(failure: Failure) {
  const record = Object.freeze({ muscleMass: 50, memo: 'synthetic memo' });
  const original = JSON.stringify(record);
  const data = new Map([[OWNER, 'synthetic-owner'], [EPOCH, '1'], [INBODY, JSON.stringify({ [DAY]: record })], [WEIGHTS, '{}']]);
  let activeFailure: Failure = null, writes = 0;
  const storage = {
    getItem(key: string) { if (activeFailure === 'read') throw new Error('synthetic sensitive diagnostic'); return data.get(key) ?? null; },
    setItem(key: string, value: string) { writes++; data.set(key, value); },
    removeItem(key: string) { writes++; data.delete(key); },
  };
  const window = Object.assign(new EventTarget(), { get localStorage() { return storage; } });
  Object.defineProperty(window, 'localStorage', { get() { if (activeFailure === 'getter') throw new Error('synthetic sensitive diagnostic'); return storage; } });
  const context = vm.createContext({ window, Event, CustomEvent, queueMicrotask,
    navigator: { locks: { request: (_name: string, _options: unknown, callback: () => Promise<void>) => callback() } },
  });
  const allowed = new Set(['app/data/storageOwnership.ts', 'app/data/storageTransaction.ts', 'app/data/bodyRecordSave.ts',
    'app/data/recordStorage.ts', 'app/data/dietPlans.ts', 'app/data/workoutCompletion.ts', 'lib/diet-time.ts']);
  const modules = new Map<string, Record<string, unknown>>();
  function load(path: string): Record<string, unknown> {
    if (modules.has(path)) return modules.get(path)!;
    assert.ok(allowed.has(path), `Unexpected module ${path}`);
    const exports = {}; modules.set(path, exports);
    const code = ts.transpileModule(readFileSync(resolve(root, path), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const requireLocal = (specifier: string) => {
      assert.ok(specifier.startsWith('.'), `Unexpected dependency ${specifier}`);
      const target = relative(root, resolve(root, dirname(path), specifier));
      return load(target.endsWith('.ts') ? target : `${target}.ts`);
    };
    vm.runInContext(`(function(exports,require){${code}\n})`, context)(exports, requireLocal);
    return exports;
  }
  const ownership = load('app/data/storageOwnership.ts') as typeof import('../app/data/storageOwnership');
  ownership.beginStorageAccess(); assert.equal(ownership.getStorageAccessStatus(), 'ready');
  const body = load('app/data/bodyRecordSave.ts') as typeof import('../app/data/bodyRecordSave');
  const scope = body.readBodySaveScope(storage);
  if (failure === 'owner') data.set(OWNER, 'different-owner');
  if (failure === 'epoch') data.set(EPOCH, 'different-epoch');
  if (failure === 'journal') data.set(JOURNAL, '{broken synthetic journal');
  if (failure === 'record') data.set(INBODY, JSON.stringify({ [DAY]: { ...record, memo: 'newer' } }));
  activeFailure = failure;
  let review: unknown = 'previous', confirmed = true, message = 'previous';
  const before = JSON.stringify([...data]);
  Object.assign(context, {
    record, dateKey: DAY, bodyImportOwner, scope: failure === 'missing-scope' ? null : scope,
    mounted: { current: failure !== 'unmounted' }, invalidated: { current: failure === 'invalidated' },
    isBodySaveScopeCurrent: body.isBodySaveScopeCurrent, readBodySaveSnapshot: body.readBodySaveSnapshot,
    setReview: (value: unknown) => { review = value; }, setConfirmed: (value: boolean) => { confirmed = value; }, setMessage: (value: string) => { message = value; },
  });
  vm.runInContext(`${declaration('currentScope')}\n${declaration('openReview')}\nopenReview()`, context);
  assert.equal(JSON.stringify(record), original); assert.equal(JSON.stringify([...data]), before); assert.equal(writes, 0);
  return { review, confirmed, message, scope };
}

test('actual review-entry catches storage denial without raw diagnostics or retained consent', () => {
  for (const failure of ['getter', 'read'] as const) {
    const result = run(failure); assert.equal(result.review, null); assert.equal(result.confirmed, false);
    assert.ok(result.message); assert.equal(result.message.includes('synthetic sensitive diagnostic'), false);
  }
});
test('actual owned review-entry snapshots the unchanged record only after safe read, without consent', () => {
  const result = run(null); assert.equal(result.confirmed, false); assert.equal(result.message, '');
  const review = result.review as { scope: unknown; snapshot: string };
  assert.equal(JSON.stringify(review.scope), JSON.stringify({ owner: 'synthetic-owner', epoch: '1' }));
  assert.equal(review.snapshot, JSON.stringify({ muscleMass: 50, memo: 'synthetic memo' }));
});
for (const failure of ['owner', 'epoch', 'journal', 'record', 'unmounted', 'invalidated', 'missing-scope'] as const) {
  test(`actual review-entry rejects ${failure} without mutation or retained consent`, () => {
    const result = run(failure); assert.equal(result.review, null); assert.equal(result.confirmed, false); assert.ok(result.message);
  });
}
