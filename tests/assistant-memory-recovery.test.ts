import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recoverMemory, readMemoryJournal, rememberMemoryChange, completeMemoryChange, memoryJournalKey, memoryResetMarker,
  MemoryJournalError, type AssistantMemory, type MemoryChange, type MemoryJournalStorage, type MemoryTransport,
} from '../lib/assistant-memory-recovery.ts';
const after = { topic: '가상 주제', content: '가상 내용' };
const create = (): MemoryChange => ({ owner: 'A', id: 'same-id', before: null, after, reset: 'null', originalReset: 'null', attempted: false });
const storedRow = (): AssistantMemory => ({ id: 'same-id', user_id: 'A', ...after });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function storage(): MemoryJournalStorage { const map = new Map<string, string>(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } }; }
function fixture() {
  const journal = storage(), controller = new AbortController();
  const f = { row: null as AssistantMemory | null, owner: 'A', reset: 'null', alive: true, writes: [] as MemoryChange[], reads: 0, checkpoints: 0 };
  const transport: MemoryTransport = {
    auth: async () => f.owner, reset: async () => f.reset,
    find: async () => { f.reads++; return f.row; },
    write: async change => { f.writes.push(change); f.row = change.after ? { id: change.id, user_id: change.owner, ...change.after } : null; }, timeoutMs: 10,
  };
  const persist = (change: MemoryChange) => { rememberMemoryChange(journal, change); f.checkpoints++; };
  const run = (change = create(), mode: 'send' | 'check' | 'retry' | 'renew' = 'send') => recoverMemory(change, mode, transport, persist, () => f.alive, controller.signal);
  return { f, journal, controller, transport, run };
}
test('authentication deadline never starts a late write', async () => {
  const x = fixture(), gate = deferred<string>(); x.transport.auth = () => gate.promise;
  await assert.rejects(x.run()); gate.resolve('A'); await new Promise(r => setImmediate(r));
  assert.equal(x.f.writes.length, 0); assert.equal(x.f.checkpoints, 0);
});
test('leaving while auth waits blocks a new write and lookup', async () => {
  const x = fixture(), gate = deferred<string>(); x.transport.auth = () => gate.promise;
  const task = x.run(); x.f.alive = false; gate.resolve('A');
  assert.equal((await task).state, 'stale'); assert.equal(x.f.writes.length, 0); assert.equal(x.f.reads, 0);
});
test('account mismatch stops before journal checkpoint or write', async () => {
  const x = fixture(); x.f.owner = 'B'; await assert.rejects(x.run(), /계정/); assert.equal(x.f.writes.length, 0);
});
test('write timeout retains exact attempted ID and later check is read-only', async () => {
  const x = fixture(); x.transport.write = async change => { x.f.writes.push(change); return new Promise(() => {}); };
  const first = await x.run(); assert.equal(first.state, 'missing');
  const restored = readMemoryJournal(x.journal, 'A')[0]; assert.equal(restored.id, 'same-id'); assert.equal(restored.attempted, true);
  x.f.row = storedRow(); const result = await x.run(restored, 'check');
  assert.equal(result.state, 'saved'); assert.equal(x.f.writes.length, 1);
});
test('leaving after dispatch ignores a late callback but preserves journal', async () => {
  const x = fixture(), gate = deferred<void>(); x.transport.write = change => { x.f.writes.push(change); return gate.promise; };
  const task = x.run(); await new Promise(r => setImmediate(r)); x.f.alive = false; gate.resolve();
  assert.equal((await task).state, 'stale'); assert.equal(readMemoryJournal(x.journal, 'A')[0].attempted, true);
});
test('storage rejection or read-back mismatch cannot start any write', async () => {
  for (const broken of [{ getItem: () => null, setItem: () => { throw Error('quota'); } }, { getItem: () => null, setItem: () => {} }]) {
    const x = fixture(); await assert.rejects(recoverMemory(create(), 'send', x.transport, change => { rememberMemoryChange(broken, change); }, () => true, x.controller.signal), MemoryJournalError);
    assert.equal(x.f.writes.length, 0);
  }
});
test('same-ID explicit retry after absence is idempotent with a delayed original insert', async () => {
  const x = fixture(), entry = { ...create(), attempted: true }; rememberMemoryChange(x.journal, entry);
  assert.equal((await x.run(entry, 'check')).state, 'missing'); assert.equal(x.f.writes.length, 0);
  x.transport.write = async change => { x.f.writes.push(change); x.f.row = storedRow(); throw Error('duplicate or lost response'); };
  assert.equal((await x.run(entry, 'retry')).state, 'saved'); assert.equal(x.f.writes[0].id, entry.id);
});
test('restored attempted send cannot silently retransmit', async () => {
  const x = fixture(); assert.equal((await x.run({ ...create(), attempted: true }, 'send')).state, 'missing'); assert.equal(x.f.writes.length, 0);
});
test('update/delete retries preserve original before and refuse changed remote row', async () => {
  for (const afterValue of [after, null]) {
    const x = fixture(), before = { ...storedRow(), content: '원래 내용' }, entry = { ...create(), before, after: afterValue, attempted: true };
    x.f.row = { ...before, content: '다른 창의 새 내용' };
    assert.equal((await x.run(entry, 'retry')).state, 'conflict'); assert.equal(x.f.writes.length, 0);
    x.f.row = before; assert.equal((await x.run(entry, 'retry')).state, 'saved'); assert.deepEqual(x.f.writes[0].before, before);
  }
});
test('missing update is never recreated as an insert', async () => {
  const x = fixture(); assert.equal((await x.run({ ...create(), before: { ...storedRow(), content: 'before' }, attempted: true }, 'retry')).state, 'missing'); assert.equal(x.f.writes.length, 0);
});
test('reset invalidates absent delete and preserves journal rather than falsely confirming', async () => {
  const x = fixture(), entry = { ...create(), before: storedRow(), after: null, attempted: true }; rememberMemoryChange(x.journal, entry); x.f.reset = '"reset-2"';
  assert.equal((await x.run(entry, 'check')).state, 'reset'); assert.equal(readMemoryJournal(x.journal, 'A').length, 1); assert.equal(x.f.writes.length, 0);
});
test('reset changed during lookup cannot confirm a deletion', async () => {
  const x = fixture(); x.transport.find = async () => { x.f.reset = '"reset-2"'; return null; };
  assert.equal((await x.run({ ...create(), before: storedRow(), after: null, attempted: true }, 'check')).state, 'reset');
});
test('explicit post-reset intent keeps ID and original before; no new ID is allowed by absence', async () => {
  const x = fixture(), entry = { ...create(), attempted: true }; rememberMemoryChange(x.journal, entry); x.f.reset = '"reset-2"';
  assert.equal((await x.run(entry, 'retry')).state, 'reset'); assert.equal(x.f.writes.length, 0);
  const result = await x.run(entry, 'renew'); assert.equal(result.state, 'saved');
  assert.equal(x.f.writes[0].id, entry.id); assert.equal(x.f.writes[0].reset, '"reset-2"'); assert.equal(x.f.writes[0].originalReset, 'null');
});
test('reset change immediately before dispatch prevents write', async () => {
  const x = fixture(); let calls = 0; x.transport.reset = async () => ++calls >= 3 ? '"changed"' : 'null';
  assert.equal((await x.run()).state, 'reset'); assert.equal(x.f.writes.length, 0);
});
test('post-write reset change is unresolved, not success', async () => {
  const x = fixture(); x.transport.write = async change => { x.f.writes.push(change); x.f.row = storedRow(); x.f.reset = '"changed"'; };
  assert.equal((await x.run()).state, 'reset'); assert.equal(readMemoryJournal(x.journal, 'A').length, 1);
});
test('lookup and reset waits are bounded even if abort is ignored', async () => {
  for (const stage of ['find', 'reset'] as const) { const x = fixture(); if (stage === 'find') x.transport.find = () => new Promise(() => {}); else x.transport.reset = () => new Promise(() => {}); await assert.rejects(x.run()); assert.equal(x.f.writes.length, 0); }
});
test('journal parsing fails closed, remains owner-isolated and preserves independent pending requests', () => {
  const s = storage(); rememberMemoryChange(s, create()); rememberMemoryChange(s, { ...create(), id: 'other', after: { ...after, content: 'other' } });
  assert.equal(readMemoryJournal(s, 'B').length, 0); assert.equal(readMemoryJournal(s, 'A').length, 2);
  completeMemoryChange(s, create()); assert.equal(readMemoryJournal(s, 'A')[0].id, 'other');
  s.setItem(memoryJournalKey('A'), '{broken'); assert.throws(() => readMemoryJournal(s, 'A'), MemoryJournalError);
  s.setItem(memoryJournalKey('A'), JSON.stringify({ version: 1, owner: 'A', entries: [{ ...create(), before: { ...storedRow(), user_id: 'B' } }] }));
  assert.throws(() => readMemoryJournal(s, 'A'), MemoryJournalError);
});
test('marker is extracted from the actual assistant reset field', () => {
  assert.equal(memoryResetMarker({ 'ai-fitness-record-reset-assistant': 'reset-now' }), '"reset-now"'); assert.equal(memoryResetMarker(null), 'null');
});

test('journal rejects hidden write fields rather than forwarding owner/id overrides', () => {
  const s = storage();
  for (const extra of [{ user_id: 'B' }, { id: 'other-id' }, { created_at: 'unexpected' }]) {
    s.setItem(memoryJournalKey('A'), JSON.stringify({ version: 1, owner: 'A', entries: [{ ...create(), after: { ...after, ...extra } }] }));
    assert.throws(() => readMemoryJournal(s, 'A'), MemoryJournalError);
  }
});

test('legacy before snapshots allow long content and empty topics for correction or deletion', async () => {
  for (const afterValue of [after, null]) {
    const x = fixture(), before = { id: 'same-id', user_id: 'A', topic: '', content: 'x'.repeat(2001) };
    x.f.row = before;
    const result = await x.run({ ...create(), before, after: afterValue });
    assert.equal(result.state, 'saved'); assert.deepEqual(x.f.writes[0].before, before);
    assert.deepEqual(readMemoryJournal(x.journal, 'A')[0].before, before);
  }
});
