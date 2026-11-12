import { isValidInbodyRecord } from './recordStorage.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

type Manager = typeof import('./storageOwnership.ts');
type Transactions = typeof import('./storageTransaction.ts');
type Cloud = typeof import('./cloudSync.ts');
type Request = { client: string; name: string; callback: () => Promise<void> };

// Model a browser's exclusive ownership, not a localStorage lease. destroy()
// represents document destruction: it is intentionally not an app release API.
class OriginLocks {
  requests: Request[] = [];
  waiting: Request[] = [];
  owner: Request | null = null;
  settledCallbacks = 0;
  manager(client: string) {
    return { request: (name: string, options: { mode: string }, callback: () => Promise<void>) => {
      assert.equal(options.mode, 'exclusive');
      const request = { client, name, callback };
      this.requests.push(request); this.waiting.push(request); this.grant();
      return new Promise<void>(() => {});
    } };
  }
  grant() {
    if (this.owner || !this.waiting.length) return;
    const request = this.waiting.shift()!;
    this.owner = request;
    void request.callback().then(() => {
      this.settledCallbacks += 1;
      if (this.owner === request) { this.owner = null; this.grant(); }
    }, () => {
      this.settledCallbacks += 1;
      if (this.owner === request) { this.owner = null; this.grant(); }
    });
  }
  destroy(client: string) {
    this.waiting = this.waiting.filter(request => request.client !== client);
    if (this.owner?.client === client) this.owner = null;
    this.grant();
  }
}

const journalKey = 'yeoni-storage-transaction-v1';
const w = 'ai-fitness-weight-records';
const i = 'ai-fitness-inbody-records';
const old = { [w]: '{"2030-01-01":{"weight":71,"recordedAt":"synthetic"}}', [i]: '{"2030-01-01":{"bmi":22}}' };
const next = { [w]: '{"2030-01-01":{"weight":72,"recordedAt":"synthetic-new"}}', [i]: '{"2030-01-01":{"bmi":23}}' };
const compiled = new Map<string, string>();
function source(name: string) {
  if (!compiled.has(name)) compiled.set(name, ts.transpileModule(readFileSync(new URL(name, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  return compiled.get(name)!;
}
const recordSource = readFileSync(new URL('./recordStorage.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('recordStorage.ts', recordSource, ts.ScriptTarget.Latest, true);
const readJson = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'readJson');
assert.ok(readJson);
const readJsonCode = ts.transpileModule(`(${readJson.getText(ast).replace(/^export\s+/, '')})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function context(client: string, locks: OriginLocks, values: Map<string, string>, supported = true) {
  const operations: string[] = [];
  let hook: (operation: string, key: string) => void = () => {};
  const storage = {
    get length() { operations.push('length'); return values.size; },
    key(index: number) { operations.push('key'); return [...values.keys()][index] ?? null; },
    getItem(key: string) { operations.push(`get:${key}`); hook('get', key); return values.get(key) ?? null; },
    setItem(key: string, value: string) { operations.push(`set:${key}`); hook('set', key); values.set(key, String(value)); },
    removeItem(key: string) { operations.push(`remove:${key}`); hook('remove', key); values.delete(key); },
  };
  let reloads = 0;
  const window = Object.assign(new EventTarget(), { localStorage: storage, location: { reload: () => { reloads += 1; } } });
  const sandbox = vm.createContext({ window, navigator: supported ? { locks: locks.manager(client) } : {}, Event, queueMicrotask });
  const modules = new Map<string, Record<string, unknown>>();
  function load(name: string): Record<string, unknown> {
    if (modules.has(name)) return modules.get(name)!;
    const exports = {};
    modules.set(name, exports);
    const requireFixture = (specifier: string) => {
      if (specifier === './recordStorage.ts') return { isValidInbodyRecord };
      if (specifier === '../lib/supabase.ts') return { supabase: null };
      assert.ok(['./storageOwnership.ts', './storageTransaction.ts', './appRecordReset.ts', './workoutCompletion.ts', './dietPlans.ts'].includes(specifier), specifier);
      return load(specifier);
    };
    vm.runInContext(`(function(exports, require) { ${source(name)}\n})`, sandbox)(exports, requireFixture);
    return exports;
  }
  const manager = load('./storageOwnership.ts') as Manager;
  const tx = load('./storageTransaction.ts') as Transactions;
  const cloud = load('./cloudSync.ts') as Cloud;
  const workout = load('./workoutCompletion.ts');
  Object.assign(sandbox, { recoverStorageTransaction: tx.recoverStorageTransaction, WORKOUT_COMPLETED_DAYS_KEY: workout.WORKOUT_COMPLETED_DAYS_KEY, readWorkoutCompletionStore: workout.readWorkoutCompletionStore });
  const genericRead = vm.runInContext(readJsonCode, sandbox) as (key: string, fallback: object) => object;
  return {
    manager, tx, cloud, storage, operations, window, genericRead,
    setHook: (value: typeof hook) => { hook = value; },
    get reloads() { return reloads; },
  };
}
const snapshot = (values: Map<string, string>) => Object.fromEntries(values);
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('waiting contexts cannot read, recover or write; repeated begin calls request one lock', () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries(old));
  const a = context('a', locks, values); const b = context('b', locks, values);
  assert.throws(() => a.tx.recoverStorageTransaction(a.storage), /기록 접근/);
  assert.deepEqual(a.operations, []);
  a.manager.beginStorageAccess(); b.manager.beginStorageAccess(); b.manager.beginStorageAccess();
  assert.equal(a.manager.getStorageAccessStatus(), 'ready');
  assert.equal(b.manager.getStorageAccessStatus(), 'waiting');
  assert.equal(locks.requests.length, 2);
  assert.throws(() => b.genericRead(w, {}), /기록 접근/);
  assert.throws(() => b.cloud.readLocalCloudState(), /기록 접근/);
  assert.throws(() => b.tx.writeStorageBatch(b.storage, next), /기록 접근/);
  assert.deepEqual(b.operations, []);
  assert.deepEqual(snapshot(values), old);
});

test('C1: foreign generic read during a live batch cannot recover it or create mixed stores', () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries(old));
  const a = context('a', locks, values); const b = context('b', locks, values);
  a.manager.beginStorageAccess(); b.manager.beginStorageAccess();
  let interleaved = false;
  a.setHook((operation, key) => {
    if (!interleaved && operation === 'set' && key === i) {
      interleaved = true;
      assert.equal(values.get(w), next[w]);
      assert.equal(values.get(i), old[i]);
      assert.ok(values.has(journalKey));
      const before = snapshot(values);
      assert.throws(() => b.genericRead(w, {}), /기록 접근/);
      assert.throws(() => b.tx.writeStorageBatch(b.storage, old), /기록 접근/);
      assert.deepEqual(snapshot(values), before);
    }
  });
  a.tx.writeStorageBatch(a.storage, next);
  assert.equal(interleaved, true);
  assert.deepEqual(snapshot(values), next);
  assert.deepEqual(b.operations, []);
});

test('same-context reentrant recovery/read/write are also blocked until the batch finishes', () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries(old));
  const a = context('a', locks, values); a.manager.beginStorageAccess();
  let interleaved = false;
  a.setHook((operation, key) => {
    if (!interleaved && operation === 'set' && key === i) {
      interleaved = true;
      assert.throws(() => a.genericRead(w, {}), /저장이 진행 중/);
      assert.throws(() => a.tx.writeStorageBatch(a.storage, old), /저장이 진행 중/);
    }
  });
  a.tx.writeStorageBatch(a.storage, next);
  assert.deepEqual(snapshot(values), next);
  assert.deepEqual(JSON.parse(JSON.stringify(a.genericRead(w, {}))), JSON.parse(next[w]));
});

test('a waiting successor recovers a genuine abandoned journal only after the browser destroys its owner', () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries(old));
  const a = context('a', locks, values); const b = context('b', locks, values);
  a.manager.beginStorageAccess(); b.manager.beginStorageAccess();
  let stage = 'write';
  a.setHook((operation, key) => {
    if (stage === 'write' && operation === 'set' && key === i) { stage = 'rollback'; throw new Error('synthetic write interruption'); }
    if (stage === 'rollback' && operation === 'remove' && key === w) { stage = 'stopped'; throw new Error('synthetic rollback interruption'); }
  });
  assert.throws(() => a.tx.writeStorageBatch(a.storage, next), /rollback interruption/);
  assert.ok(values.has(journalKey));
  assert.deepEqual(b.operations, []);
  assert.equal(b.manager.getStorageAccessStatus(), 'waiting');
  const states: object[] = [];
  b.manager.subscribeStorageAccess(() => { if (b.manager.getStorageAccessStatus() === 'ready') states.push(snapshot(values)); });
  locks.destroy('a');
  assert.equal(b.manager.getStorageAccessStatus(), 'ready');
  assert.deepEqual(states, [old]);
  assert.deepEqual(snapshot(values), old);
  b.tx.writeStorageBatch(b.storage, next);
  assert.deepEqual(snapshot(values), next);
});

test('gate unsubscribe/StrictMode, hidden visibility and pagehide never release the document lock', async () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries(old));
  const a = context('a', locks, values); const b = context('b', locks, values);
  const unsubscribe = a.manager.subscribeStorageAccess(() => {});
  a.manager.beginStorageAccess(); unsubscribe(); a.manager.beginStorageAccess(); b.manager.beginStorageAccess();
  a.window.dispatchEvent(new Event('blur')); a.window.dispatchEvent(new Event('visibilitychange'));
  assert.equal(a.manager.getStorageAccessStatus(), 'ready');
  a.window.dispatchEvent(new Event('pagehide'));
  assert.equal(a.manager.getStorageAccessStatus(), 'revoked');
  assert.equal(a.manager.getStorageOwnershipToken(), null);
  assert.throws(() => a.tx.writeStorageBatch(a.storage, next), /기록 접근/);
  assert.equal(a.cloud.isCurrentCloudSession('synthetic-owner', null), false);
  // An already-launched unguarded legacy callback can still run, so keeping
  // ownership (rather than claiming every callback was cancelled) is essential.
  a.storage.setItem('synthetic-late-callback', 'retained-document-only');
  await flush();
  assert.equal(locks.owner?.client, 'a');
  assert.equal(locks.settledCallbacks, 0);
  assert.equal(b.manager.getStorageAccessStatus(), 'waiting');
  assert.deepEqual(b.operations, []);
  a.manager.beginStorageAccess();
  assert.equal(a.manager.getStorageAccessStatus(), 'revoked');
  const pageshow = new Event('pageshow'); Object.defineProperty(pageshow, 'persisted', { value: true });
  a.window.dispatchEvent(pageshow);
  assert.equal(a.reloads, 1);
  assert.equal(a.manager.getStorageAccessStatus(), 'revoked');
  assert.equal(locks.owner?.client, 'a');
});

test('a page hidden while waiting does not recover or become ready after a late grant', () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries(old));
  const a = context('a', locks, values); const b = context('b', locks, values);
  a.manager.beginStorageAccess(); b.manager.beginStorageAccess();
  b.window.dispatchEvent(new Event('pagehide'));
  locks.destroy('a');
  assert.equal(b.manager.getStorageAccessStatus(), 'revoked');
  assert.deepEqual(b.operations, []);
  assert.deepEqual(snapshot(values), old);
});

test('unsupported Web Locks fail closed without inspecting storage or using a lease fallback', () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries(old));
  const a = context('unsupported', locks, values, false);
  a.manager.beginStorageAccess();
  assert.equal(a.manager.getStorageAccessStatus(), 'unsupported');
  assert.throws(() => a.genericRead(w, {}), /기록 접근/);
  assert.throws(() => a.tx.writeStorageBatch(a.storage, next), /기록 접근/);
  assert.deepEqual(a.operations, []);
  assert.equal(locks.requests.length, 0);
});

test('bad startup journal preserves raw evidence and retains ownership without mounting consumers', async () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries({ ...old, [journalKey]: '{' }));
  const a = context('a', locks, values); const b = context('b', locks, values);
  a.manager.beginStorageAccess(); b.manager.beginStorageAccess();
  await flush();
  assert.equal(a.manager.getStorageAccessStatus(), 'error');
  assert.equal(a.manager.getStorageOwnershipToken(), null);
  assert.deepEqual(snapshot(values), { ...old, [journalKey]: '{' });
  assert.equal(locks.owner?.client, 'a');
  assert.equal(locks.settledCallbacks, 0);
  assert.deepEqual(b.operations, []);
});

test('throwing UI subscribers cannot reject the lock callback or transfer ownership', async () => {
  const locks = new OriginLocks(); const values = new Map(Object.entries(old));
  const a = context('a', locks, values); const b = context('b', locks, values);
  a.manager.subscribeStorageAccess(() => { throw new Error('synthetic observer failure'); });
  a.manager.beginStorageAccess(); b.manager.beginStorageAccess();
  await flush();
  assert.equal(a.manager.getStorageAccessStatus(), 'ready');
  assert.equal(locks.owner?.client, 'a');
  assert.equal(locks.settledCallbacks, 0);
  assert.equal(b.manager.getStorageAccessStatus(), 'waiting');
  a.window.dispatchEvent(new Event('pagehide'));
  await flush();
  assert.equal(locks.owner?.client, 'a');
  assert.equal(locks.settledCallbacks, 0);
});

test('actual completion reader in owner VM rejects corrupted raw without writes', () => {
  const key = 'ai-fitness-workout-completed-days', raw = '{synthetic-broken';
  const values = new Map([[key, raw]]), locks = new OriginLocks();
  const a = context('completion-owner', locks, values); a.manager.beginStorageAccess();
  assert.equal(a.manager.getStorageAccessStatus(), 'ready');
  assert.throws(() => a.genericRead(key, {}), /운동 기록/);
  assert.throws(() => a.cloud.readLocalCloudState(), /운동 기록/);
  assert.equal(values.get(key), raw);
  assert.equal(a.operations.some(operation => operation.startsWith('set:') || operation.startsWith('remove:')), false);
});

test('actual completion reader uses each VM storage and preserves dated records', () => {
  const key = 'ai-fitness-workout-completed-days', raw = '{"2026-11-12":{"workoutDone":true,"cardioMinutes":12}}';
  const values = new Map([[key, raw]]), locks = new OriginLocks();
  const a = context('completion-owner', locks, values), waiting = context('completion-waiting', locks, values);
  a.manager.beginStorageAccess(); waiting.manager.beginStorageAccess();
  assert.equal(JSON.stringify(a.genericRead(key, {})), raw);
  assert.throws(() => waiting.genericRead(key, {}), /기록 접근/);
  assert.deepEqual(waiting.operations, []);
  assert.equal(values.get(key), raw);
});
