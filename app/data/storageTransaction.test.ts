import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverStorageTransaction, writeStorageBatch } from './storageTransaction.ts';
import { grantSyntheticStorageOwnership } from '../../tests/storageOwnershipFixture.ts';
grantSyntheticStorageOwnership();

function storage(values: Record<string,string>, reject?: (key:string,value:string) => boolean) {
  const data = new Map(Object.entries(values));
  const mutations: string[] = [];
  return { data, mutations, getItem: (key:string) => data.get(key) ?? null,
    removeItem: (key:string) => { mutations.push(`remove:${key}`); data.delete(key); },
    setItem: (key:string,value:string) => { mutations.push(`set:${key}`); if (reject?.(key,value)) throw new Error('quota'); data.set(key,String(value)); } };
}
test('a later local save failure preserves the entire previous snapshot', () => {
  const local=storage({a:'old-a',b:'old-b'},(key,value)=>key==='b'&&value==='new-b');
  assert.throws(()=>writeStorageBatch(local,{a:'new-a',b:'new-b',c:'new-c'}));
  assert.deepEqual(Object.fromEntries(local.data),{a:'old-a',b:'old-b'});
});
test('a full device that cannot reserve a journal does not change any record', () => {
  const local=storage({a:'old'},()=>true);
  assert.throws(()=>writeStorageBatch(local,{a:'new'}));
  assert.deepEqual(Object.fromEntries(local.data),{a:'old'});
});
test('an interrupted save is recovered before another operation', () => {
  const local=storage({a:'partial',c:'new','yeoni-storage-transaction-v1':JSON.stringify({a:'old',b:'restore',c:null})});
  recoverStorageTransaction(local);
  assert.deepEqual(Object.fromEntries(local.data),{a:'old',b:'restore'});
  writeStorageBatch(local,{a:'saved',b:null});
  assert.deepEqual(Object.fromEntries(local.data),{a:'saved'});
});

const journalKey = 'yeoni-storage-transaction-v1';
const invalidJournals = [
  '', ' ', '{', 'null', '[]', '["old-a"]', '"old-a"', '1', 'true',
  JSON.stringify({ a: 'old-a', b: { unexpected: 'object' } }),
  JSON.stringify({ a: 'old-a', b: ['old-b'] }),
  JSON.stringify({ a: 'old-a', b: 1 }),
  JSON.stringify({ a: 'old-a', b: false }),
  JSON.stringify({ a: 'old-a', [journalKey]: null }),
  JSON.stringify({ a: 'old-a', [journalKey]: 'another journal' }),
];
for (const raw of invalidJournals) {
  test(`invalid journal ${JSON.stringify(raw)} blocks recovery and another write without mutations`, () => {
    const initial = { a: 'current-a', b: 'current-b', unrelated: 'keep', [journalKey]: raw };
    const local = storage(initial);
    assert.throws(() => recoverStorageTransaction(local), /복구/);
    assert.deepEqual(Object.fromEntries(local.data), initial);
    assert.deepEqual(local.mutations, []);
    assert.throws(() => writeStorageBatch(local, { a: 'replacement', c: 'new' }), /복구/);
    assert.deepEqual(Object.fromEntries(local.data), initial);
    assert.deepEqual(local.mutations, []);
  });
}

test('v1 recovery retains opaque strings, empty values and ordinary special-looking keys', () => {
  const before = Object.fromEntries([
    ['a', 'not JSON'], ['b', ''], ['c', null], ['__proto__', 'raw prototype-named key'], ['constructor', 'raw constructor-named key'],
  ]);
  const local = storage({ a: 'partial', c: 'created', unrelated: 'keep', [journalKey]: JSON.stringify(before) });
  recoverStorageTransaction(local);
  assert.deepEqual(Object.fromEntries(local.data), Object.fromEntries([
    ['unrelated', 'keep'], ['a', 'not JSON'], ['b', ''], ['__proto__', 'raw prototype-named key'], ['constructor', 'raw constructor-named key'],
  ]));
});

test('an empty v1 journal remains a valid no-op recovery', () => {
  const local = storage({ a: 'keep', [journalKey]: '{}' });
  recoverStorageTransaction(local);
  assert.deepEqual(Object.fromEntries(local.data), { a: 'keep' });
});

test('a failed recovery keeps its original journal for a later retry', () => {
  let reject = true;
  const raw = JSON.stringify({ a: 'old-a', b: 'old-b', c: null });
  const local = storage({ a: 'partial', c: 'new', unrelated: 'keep', [journalKey]: raw },
    (key) => key === 'b' && reject);
  assert.throws(() => recoverStorageTransaction(local), /quota/);
  assert.equal(local.data.get(journalKey), raw);
  assert.equal(local.data.get('unrelated'), 'keep');
  reject = false;
  recoverStorageTransaction(local);
  assert.deepEqual(Object.fromEntries(local.data), { a: 'old-a', b: 'old-b', unrelated: 'keep' });
});
