import test from 'node:test';
import assert from 'node:assert/strict';
import { grantSyntheticStorageOwnership } from '../../tests/storageOwnershipFixture.ts';
grantSyntheticStorageOwnership();
import {
  applyCloudState, clearLocalCloudState, isCurrentCloudSession, mergeCloudState, mergeCloudStateFromBase,
  prepareLocalCloudState, readCloudSyncEpoch, readLocalCloudState, readSyncBase, saveSyncBase,
} from './cloudSync.ts';

const original = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [
  `ai-fitness-fixture-${index}`, { value: index },
]));

function device(seed = original) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  let rejectRemovals: string[] = [];
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, String(value)); },
    removeItem(key: string) {
      if (key === rejectRemovals[0]) { rejectRemovals.shift(); throw new Error('fixture storage failure'); }
      values.delete(key);
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { localStorage: storage }) });
  return {
    storage, snapshot: () => Object.fromEntries(values),
    failRemoval: (...keys: string[]) => { rejectRemovals = keys; },
    restore: () => {
      if (previous) Object.defineProperty(globalThis, 'window', previous);
      else Reflect.deleteProperty(globalThis, 'window');
    },
  };
}

test('logout removes records and every baseline together; login preserves all 17 remote keys', () => {
  const local = device();
  try {
    prepareLocalCloudState('a'); saveSyncBase('a', original); saveSyncBase('b', original);
    local.storage.setItem('unrelated-preference', 'keep');
    const epoch = readCloudSyncEpoch();
    clearLocalCloudState();
    assert.equal(isCurrentCloudSession('a', epoch), false);
    assert.deepEqual(readLocalCloudState(), {});
    assert.equal(readSyncBase('a'), null); assert.equal(readSyncBase('b'), null);
    assert.equal(local.storage.getItem('unrelated-preference'), 'keep');
    prepareLocalCloudState('a');
    assert.deepEqual(mergeCloudState(original, readLocalCloudState()), original);
  } finally { local.restore(); }
});

test('an already logged-out legacy cache cannot delete the remote state on upgrade', () => {
  const local = device({});
  try {
    saveSyncBase('a', original); // Previous version's logout left this behind.
    prepareLocalCloudState('a');
    const base = readSyncBase('a');
    const merged = base ? mergeCloudStateFromBase(base, original, readLocalCloudState()) : mergeCloudState(original, readLocalCloudState());
    assert.deepEqual(merged, original);
  } finally { local.restore(); }
});

test('an owned cache keeps intentional deletion of its last key across reload', () => {
  const local = device({ 'ai-fitness-fixture-0': { value: 0 } });
  try {
    prepareLocalCloudState('a'); const before = readLocalCloudState(); saveSyncBase('a', before);
    local.storage.removeItem('ai-fitness-fixture-0');
    prepareLocalCloudState('a');
    assert.deepEqual(mergeCloudStateFromBase(readSyncBase('a')!, before, readLocalCloudState()), {});
  } finally { local.restore(); }
});

test('switching accounts invalidates the previous scope and does not import its records', () => {
  const local = device();
  try {
    prepareLocalCloudState('a'); saveSyncBase('a', original); const epoch = readCloudSyncEpoch();
    prepareLocalCloudState('b');
    assert.equal(isCurrentCloudSession('a', epoch), false);
    assert.deepEqual(readLocalCloudState(), {}); assert.equal(readSyncBase('a'), null);
    assert.equal(isCurrentCloudSession('b', readCloudSyncEpoch()), true);
  } finally { local.restore(); }
});

test('logout recovers an interrupted write before cleanup so its journal cannot resurrect records', () => {
  const local = device();
  try {
    saveSyncBase('a', original);
    local.storage.setItem('yeoni-storage-transaction-v1', JSON.stringify({ 'ai-fitness-fixture-0': JSON.stringify({ value: 99 }) }));
    clearLocalCloudState();
    assert.deepEqual(readLocalCloudState(), {}); assert.equal(readSyncBase('a'), null);
    assert.equal(local.storage.getItem('yeoni-storage-transaction-v1'), null);
  } finally { local.restore(); }
});

test('failed cleanup restores records with their baseline but invalidates pending requests', () => {
  const local = device();
  try {
    prepareLocalCloudState('a'); saveSyncBase('a', original); const epoch = readCloudSyncEpoch();
    local.failRemoval('ai-fitness-fixture-8');
    assert.throws(() => clearLocalCloudState(), /fixture storage failure/);
    assert.deepEqual(readLocalCloudState(), original); assert.deepEqual(readSyncBase('a'), original);
    assert.equal(isCurrentCloudSession('a', epoch), false);
  } finally { local.restore(); }
});

for (const nextOwner of ['a', 'b']) {
  test(`login as ${nextOwner} decides ownership after recovering a genuinely interrupted logout`, () => {
    const local = device();
    try {
      prepareLocalCloudState('a'); saveSyncBase('a', original);
      local.storage.setItem('unrelated-preference', 'keep');
      const epoch = readCloudSyncEpoch();
      // Fail the last logout removal and the first rollback removal. This leaves
      // an actual writeStorageBatch journal with the ownership marker absent.
      local.failRemoval('fitness-cloud-sync-base:a', 'ai-fitness-fixture-0');
      assert.throws(() => clearLocalCloudState(), /fixture storage failure/);
      assert.equal(local.storage.getItem('fitness-cloud-sync-user'), null);
      assert.equal(local.storage.getItem('ai-fitness-fixture-0'), null);
      assert.notEqual(local.storage.getItem('yeoni-storage-transaction-v1'), null);

      prepareLocalCloudState(nextOwner);
      assert.equal(local.storage.getItem('fitness-cloud-sync-user'), nextOwner);
      assert.deepEqual(readLocalCloudState(), nextOwner === 'a' ? original : {});
      assert.deepEqual(readSyncBase('a'), nextOwner === 'a' ? original : null);
      assert.equal(local.storage.getItem('yeoni-storage-transaction-v1'), null);
      assert.equal(local.storage.getItem('unrelated-preference'), 'keep');
      assert.equal(isCurrentCloudSession('a', epoch), false);
      assert.equal(isCurrentCloudSession(nextOwner, readCloudSyncEpoch()), true);
    } finally { local.restore(); }
  });
}

test('failed logout recovery cannot assign another owner and a later login retries safely', () => {
  const local = device();
  try {
    prepareLocalCloudState('a'); saveSyncBase('a', original);
    local.failRemoval('fitness-cloud-sync-base:a', 'ai-fitness-fixture-0');
    assert.throws(() => clearLocalCloudState(), /fixture storage failure/);
    const interrupted = local.snapshot();
    local.failRemoval('ai-fitness-fixture-0');
    assert.throws(() => prepareLocalCloudState('b'), /fixture storage failure/);
    assert.deepEqual(local.snapshot(), interrupted);
    prepareLocalCloudState('b');
    assert.deepEqual(readLocalCloudState(), {});
    assert.equal(readSyncBase('a'), null);
    assert.equal(local.storage.getItem('fitness-cloud-sync-user'), 'b');
  } finally { local.restore(); }
});

for (const owner of [null, 'a', 'b']) {
  test(`invalid journal preserves raw data and blocks owner preparation with current owner ${owner}`, () => {
    const local = device();
    try {
      if (owner !== null) local.storage.setItem('fitness-cloud-sync-user', owner);
      saveSyncBase('a', original);
      local.storage.setItem('yeoni-storage-transaction-v1', JSON.stringify({
        'ai-fitness-fixture-0': JSON.stringify({ value: 99 }),
        'ai-fitness-fixture-1': { unexpected: 'object' },
      }));
      const before = local.snapshot();
      assert.throws(() => prepareLocalCloudState('b'), /복구/);
      assert.deepEqual(local.snapshot(), before);
    } finally { local.restore(); }
  });
}

const cloudOperations = {
  read: () => readLocalCloudState(),
  clear: () => clearLocalCloudState(),
  apply: () => applyCloudState({ 'ai-fitness-fixture-0': { value: 42 } }),
};
for (const [name, operation] of Object.entries(cloudOperations)) {
  test(`cloud ${name} preserves current records, owner, baseline and invalid recovery evidence`, () => {
    const local = device();
    try {
      prepareLocalCloudState('a'); saveSyncBase('a', original);
      local.storage.setItem('yeoni-storage-transaction-v1', JSON.stringify({
        'ai-fitness-fixture-0': { unexpected: 'object' },
      }));
      const before = local.snapshot();
      assert.throws(operation, /복구/);
      assert.deepEqual(local.snapshot(), before);
    } finally { local.restore(); }
  });
}
