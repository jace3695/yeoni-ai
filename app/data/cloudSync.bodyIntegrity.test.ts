import { isValidInbodyRecord } from './recordStorage.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import * as resets from './appRecordReset.ts';
import * as storageTransaction from './storageTransaction.ts';
import * as ownership from './storageOwnership.ts';
import { grantSyntheticStorageOwnership } from '../../tests/storageOwnershipFixture.ts';
import type { CloudState } from './cloudSync.ts';
grantSyntheticStorageOwnership();

const weightKey = 'ai-fitness-weight-records';
const inbodyKey = 'ai-fitness-inbody-records';
const day = '2026-11-10';
const healthy: CloudState = {
  [weightKey]: { [day]: { weight: 71.2, recordedAt: 'synthetic-time', source: { name: 'synthetic-import' } } },
  [inbodyKey]: { [day]: { bmi: 23.4, memo: 'synthetic memo', futureNumericMetric: 0 } },
  'ai-fitness-unrelated-text': 'opaque plain text',
};
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const code = ts.transpileModule(readFileSync(new URL('./cloudSync.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Actual cloud module and SDK; all persistence and fetch responses are synthetic.
// No network, credentials, browser storage or account data are used.
function fixture() {
  const values = new Map(Object.entries(healthy).map(([key, value]) => [key, JSON.stringify(value)]));
  values.set('fitness-cloud-sync-user', 'synthetic-owner');
  values.set('fitness-cloud-sync-base:synthetic-owner', JSON.stringify(healthy));
  values.set('unrelated-preference', 'keep');
  const mutations: string[] = [];
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { mutations.push(`set:${key}`); values.set(key, String(value)); },
    removeItem(key: string) { mutations.push(`remove:${key}`); values.delete(key); },
  };
  const methods: string[] = [];
  let remote = plain(healthy);
  const supabase = createClient('http://127.0.0.1:1', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_url, init) => {
      const method = init?.method ?? 'GET';
      methods.push(method);
      if (method !== 'GET') remote = JSON.parse(String(init?.body)).state;
      return new Response(JSON.stringify(method === 'GET' ? [{ state: remote, updated_at: '1' }] : { updated_at: '1' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  const exports = {};
  const requireFixture = (path: string) => {
    if (path === './recordStorage.ts') return { isValidInbodyRecord };
    if (path === '../lib/supabase.ts') return { supabase };
    if (path === './appRecordReset.ts') return resets;
    if (path === './storageTransaction.ts') return storageTransaction;
    if (path === './storageOwnership.ts') return ownership;
    throw new Error(`Unexpected dependency: ${path}`);
  };
  vm.runInNewContext(`(function(exports, require) { ${code}\n})`, {
    window: Object.assign(new EventTarget(), { localStorage: storage }), Event,
  })(exports, requireFixture);
  return {
    cloud: exports as typeof import('./cloudSync.ts'), values, mutations, methods,
    snapshot: () => Object.fromEntries(values),
    setRemote: (state: CloudState) => { remote = state; },
    remote: () => remote,
  };
}

const invalidByKey: [string, [string, unknown][]][] = [
  [weightKey, [
    ['null', null], ['array', []], ['text', 'invalid JSON text'], ['number', 1], ['boolean', false],
    ['bad date', { today: { weight: 71, recordedAt: 'synthetic' } }],
    ['null entry', { [day]: null }], ['array entry', { [day]: [] }],
    ['string weight', { [day]: { weight: '71', recordedAt: 'synthetic' } }],
    ['zero weight', { [day]: { weight: 0, recordedAt: 'synthetic' } }],
    ['negative weight', { [day]: { weight: -1, recordedAt: 'synthetic' } }],
    ['non-finite weight', { [day]: { weight: Infinity, recordedAt: 'synthetic' } }],
    ['missing timestamp', { [day]: { weight: 71 } }],
    ['invalid timestamp', { [day]: { weight: 71, recordedAt: 123 } }],
  ]],
  [inbodyKey, [
    ['null', null], ['array', []], ['text', 'invalid JSON text'], ['number', 1], ['boolean', false],
    ['bad date', { today: { bmi: 22 } }],
    ['null entry', { [day]: null }], ['array entry', { [day]: [] }],
    ['string metric', { [day]: { bmi: '22' } }],
    ['negative metric', { [day]: { bmi: -1 } }],
    ['non-finite metric', { [day]: { bmi: NaN } }],
    ['invalid memo', { [day]: { bmi: 22, memo: 123 } }],
  ]],
];

for (const [key, invalidValues] of invalidByKey) {
  const invalidRaw: [string, string][] = [
    ['malformed JSON', '{'], ['empty raw', ''],
    ...invalidValues.map(([name, value]): [string, string] => [name, JSON.stringify(value)]),
  ];
  for (const [name, raw] of invalidRaw) {
    test(`${key} ${name}: local sync/export fails before any request or storage change`, async () => {
      const f = fixture();
      f.values.set(key, raw);
      const before = f.snapshot();
      await assert.rejects(async () => {
        // The production sync starts with this read; exports use the same read.
        const local = f.cloud.readLocalCloudState();
        const remote = await f.cloud.getRemoteState('synthetic-owner');
        const merged = f.cloud.mergeCloudStateFromBase(healthy, remote!.state, local);
        await f.cloud.saveRemoteStateIfUnchanged('synthetic-owner', merged, '1');
      }, /체중·인바디/);
      // A healthy remote or backup must not silently overwrite the corrupt raw.
      assert.throws(() => f.cloud.applyCloudState(healthy), /체중·인바디/);
      assert.deepEqual(f.snapshot(), before);
      assert.deepEqual(f.mutations, []);
      assert.deepEqual(f.methods, []);
      assert.deepEqual(f.remote(), healthy);
    });
  }

  for (const [name, value] of invalidValues) {
    test(`${key} ${name}: corrupt merge, backup, remote and write inputs are rejected`, async () => {
      const f = fixture();
      const invalid = { ...healthy, [key]: value };
      const before = f.snapshot();
      assert.throws(() => f.cloud.mergeCloudState(healthy, invalid), /체중·인바디/);
      assert.throws(() => f.cloud.mergeCloudState(invalid, healthy), /체중·인바디/);
      assert.throws(() => f.cloud.mergeCloudStateFromBase(healthy, healthy, invalid), /체중·인바디/);
      assert.throws(() => f.cloud.mergeCloudStateFromBase(healthy, invalid, healthy), /체중·인바디/);
      assert.throws(() => f.cloud.mergeCloudStateFromBase(invalid, healthy, healthy), /체중·인바디/);
      assert.throws(() => f.cloud.mergeExplicitCloudBackup(healthy, invalid), /체중·인바디/);
      assert.throws(() => f.cloud.reconcileSyncResponse(healthy, invalid, healthy), /체중·인바디/);
      assert.throws(() => f.cloud.applyCloudState(invalid), /체중·인바디/);
      assert.throws(() => f.cloud.saveSyncBase('synthetic-owner', invalid), /체중·인바디/);
      await assert.rejects(f.cloud.saveRemoteState('synthetic-owner', invalid), /체중·인바디/);
      await assert.rejects(f.cloud.saveRemoteStateIfUnchanged('synthetic-owner', invalid, '1'), /체중·인바디/);
      assert.deepEqual(f.methods, [], 'Invalid writes must not reach SDK fetch');
      f.setRemote(invalid);
      await assert.rejects(f.cloud.getRemoteState('synthetic-owner'), /체중·인바디/);
      assert.deepEqual(f.methods, ['GET']);
      assert.deepEqual(f.snapshot(), before);
      assert.deepEqual(f.mutations, []);
    });
  }
}

test('valid body records preserve metadata through read, export, merge, apply and both server writes', async () => {
  const f = fixture();
  const initial = f.snapshot();
  const local = f.cloud.readLocalCloudState();
  assert.deepEqual(plain(local), healthy);
  assert.deepEqual(f.snapshot(), initial);
  const merged = f.cloud.mergeCloudStateFromBase({}, healthy, local);
  assert.deepEqual(plain(merged), healthy);
  assert.deepEqual(plain(f.cloud.mergeExplicitCloudBackup({}, healthy)), healthy);
  f.cloud.applyCloudState(merged);
  assert.deepEqual(plain(f.cloud.readLocalCloudState()), healthy);
  await f.cloud.saveRemoteState('synthetic-owner', merged);
  assert.equal(await f.cloud.saveRemoteStateIfUnchanged('synthetic-owner', merged, '1'), true);
  assert.deepEqual(f.methods, ['POST', 'GET', 'PATCH', 'GET']);
  assert.deepEqual(f.remote(), healthy);
  assert.equal(f.values.get('unrelated-preference'), 'keep');
});

test('absent and empty body stores remain valid and intentional deletion still merges', () => {
  const f = fixture();
  const withoutBody = { 'ai-fitness-unrelated-text': 'opaque plain text' };
  assert.deepEqual(plain(f.cloud.mergeCloudStateFromBase(healthy, healthy, withoutBody)), withoutBody);
  const empty = { ...withoutBody, [weightKey]: {}, [inbodyKey]: {} };
  f.cloud.applyCloudState(empty);
  assert.deepEqual(plain(f.cloud.readLocalCloudState()), empty);
  f.cloud.applyCloudState(withoutBody);
  assert.deepEqual(plain(f.cloud.readLocalCloudState()), withoutBody);
});

test('body validation never changes unrelated opaque storage serialization', () => {
  const f = fixture();
  f.values.set('ai-fitness-other-legacy', '{not-json');
  f.values.set('ai-fitness-other-array', '[1,2]');
  const before = f.snapshot();
  const local = f.cloud.readLocalCloudState();
  assert.equal(local['ai-fitness-other-legacy'], '{not-json');
  assert.deepEqual(plain(local['ai-fitness-other-array']), [1, 2]);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.mutations, []);
});
