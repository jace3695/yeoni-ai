import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createGrowthRoutineSafely, pendingGrowthRoutineKey, readPendingGrowthRoutine, type NewGrowthRoutine } from './growth-routine-create.ts';
import { resetMarkerKey } from '../app/data/appRecordReset.ts';

const owner = 'synthetic-growth-owner';
const input: NewGrowthRoutine = { title: '가상 독서', category: 'custom', targetMinutes: 5, preferredDays: [3, 1], targetSessionsPerWeek: 2 };
function fixture() {
  const store = new Map<string, string>();
  const rows: Record<string, unknown>[] = [];
  const state = { owner, marker: null as string | null, reads: 0, inserts: 0, failReads: 0, afterInsertReadFailure: false, commit: true, throwInsert: false, queryError: false };
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } };
  const client = { auth: { getUser: async () => ({ data: { user: { id: state.owner } }, error: null }) }, from: (table: string) => {
    let insert: Record<string, unknown> | null = null; const filters: [string, unknown][] = [];
    const execute = async () => {
      if (table === 'user_app_state') return { data: { state: { [resetMarkerKey('growth')]: state.marker } }, error: state.queryError ? Error('unavailable') : null };
      if (insert) {
        state.inserts++;
        assert.ok(store.get(pendingGrowthRoutineKey(owner)), 'journal must exist before insert');
        if (state.commit && !rows.some(row => row.id === insert!.id)) rows.push({ ...insert, created_at: insert.updated_at });
        if (state.afterInsertReadFailure) state.failReads++;
        if (state.throwInsert) throw Error('transport lost');
        return { data: null, error: Error('lost response') };
      }
      state.reads++;
      if (state.failReads > 0) { state.failReads--; return { data: null, error: Error('read failed') }; }
      return { data: rows.find(row => filters.every(([key, value]) => row[key] === value)) ?? null, error: null };
    };
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; }, abortSignal: () => query, insert: (value: Record<string, unknown>) => { insert = value; return query; }, single: execute, maybeSingle: execute };
    return query;
  } } as unknown as SupabaseClient;
  return { store, storage, rows, state, client, create: (value: NewGrowthRoutine | null = input, check?: () => void) => createGrowthRoutineSafely(client, owner, storage, value, 0, check) };
}

test('committed insert with lost response recovers exact owner/id and adds only one row', async () => {
  const f = fixture(); const row = await f.create();
  assert.equal(f.rows.length, 1); assert.equal(f.state.inserts, 1); assert.equal(row.id, f.rows[0].id);
  assert.deepEqual(row.preferred_days, [1, 3]); assert.equal(f.store.size, 0);
});
test('transport exception after commit also verifies without another insert', async () => {
  const f = fixture(); f.state.throwInsert = true; await f.create(); assert.equal(f.rows.length, 1); assert.equal(f.state.inserts, 1);
});
test('lost insert and read response retain the same request across a remount/reload', async () => {
  const f = fixture(); f.state.afterInsertReadFailure = true;
  await assert.rejects(f.create(), /저장 결과/);
  const pending = readPendingGrowthRoutine(f.storage, owner)!;
  assert.equal(pending.row.id, f.rows[0].id);
  await assert.rejects(f.create({ ...input, title: '다른 활동' }), /저장 결과/);
  f.state.afterInsertReadFailure = false;
  const row = await createGrowthRoutineSafely(f.client, owner, f.storage, null, 0);
  assert.equal(row.id, pending.row.id); assert.equal(f.state.inserts, 1); assert.equal(f.rows.length, 1); assert.equal(f.store.size, 0);
});
test('a failed noncommitted insert retries with the same ID, not a new routine', async () => {
  const f = fixture(); f.state.commit = false;
  await assert.rejects(f.create(), /저장 결과/); const id = readPendingGrowthRoutine(f.storage, owner)!.row.id;
  f.state.commit = true; await f.create(null);
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0].id, id); assert.equal(f.state.inserts, 2);
});
test('a later rename, weekday edit and archive are recovered without overwriting them', async () => {
  const f = fixture(); f.state.afterInsertReadFailure = true; await assert.rejects(f.create());
  Object.assign(f.rows[0], { title: '나중에 수정한 활동', enabled: false, preferred_days: [5] });
  f.state.afterInsertReadFailure = false; const row = await f.create(null);
  assert.equal(row.title, '나중에 수정한 활동'); assert.equal(row.enabled, false); assert.deepEqual(row.preferred_days, [5]); assert.equal(f.state.inserts, 1);
});
test('account mismatch cannot read, insert, or expose the other owner journal', async () => {
  const f = fixture(); f.state.owner = 'synthetic-other-owner'; await assert.rejects(f.create(), /계정/);
  assert.equal(f.state.inserts, 0); assert.equal(f.store.size, 0); assert.equal(f.state.reads, 0);
  f.store.set(pendingGrowthRoutineKey('other'), '{"title":"private"}'); assert.equal(readPendingGrowthRoutine(f.storage, owner), null);
});
test('storage quota and silent storage failure block before insert', async () => {
  const f = fixture(); f.storage.setItem = () => { throw Error('quota'); }; await assert.rejects(f.create(), /quota/); assert.equal(f.state.inserts, 0);
  f.storage.setItem = () => {}; await assert.rejects(f.create(), /보관하지/); assert.equal(f.state.inserts, 0);
});
test('malformed journal is never replaced or replayed', async () => {
  const f = fixture(); f.store.set(pendingGrowthRoutineKey(owner), '{bad');
  await assert.rejects(f.create(), /읽지 못/); assert.equal(f.state.inserts, 0); assert.equal(f.store.get(pendingGrowthRoutineKey(owner)), '{bad');
});
test('record reset after an uncertain request stops resurrection on retry', async () => {
  const f = fixture(); f.state.commit = false; await assert.rejects(f.create());
  f.state.marker = 'new-reset'; f.state.commit = true;
  await assert.rejects(f.create(null), /초기화/); assert.equal(f.state.inserts, 1); assert.equal(f.rows.length, 0); assert.equal(f.store.size, 1);
});
test('reset status failure never creates a request or sends an insert', async () => {
  const f = fixture(); f.state.queryError = true; await assert.rejects(f.create(), /초기화 상태/); assert.equal(f.state.inserts, 0); assert.equal(f.store.size, 0);
});
test('leaving while auth is pending prevents every query and journal write', async () => {
  const f = fixture(); let current = true; let release!: () => void;
  f.client.auth.getUser = (() => new Promise(resolve => { release = () => resolve({ data: { user: { id: owner, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-09T00:00:00Z' } }, error: null }); })) as typeof f.client.auth.getUser;
  const request = f.create(input, () => { if (!current) throw Error('stale'); });
  current = false; release(); await assert.rejects(request, /stale/); assert.equal(f.state.reads, 0); assert.equal(f.store.size, 0);
});
test('leaving after dispatch retains recovery and suppresses later reads', async () => {
  const f = fixture(); await assert.rejects(f.create(input, () => { if (f.state.inserts) throw Error('stale'); }), /stale/);
  assert.equal(f.state.reads, 1); assert.equal(f.store.size, 1); assert.equal(f.rows.length, 1);
});
test('journal cleanup failure keeps an idempotent recoverable request', async () => {
  const f = fixture(); f.storage.removeItem = () => {};
  await assert.rejects(f.create(), /정리하지/); assert.equal(f.rows.length, 1);
  f.storage.removeItem = key => { f.store.delete(key); }; await f.create(null); assert.equal(f.state.inserts, 1);
});
test('same titles are permitted for separate confirmed requests, not deduplicated by text', async () => {
  const f = fixture(); await f.create(); await f.create(); assert.equal(f.rows.length, 2); assert.notEqual(f.rows[0].id, f.rows[1].id);
});

test('growth reset preserves routines: recover the surviving row with no insert', async () => {
  const f = fixture(); f.state.afterInsertReadFailure = true; await assert.rejects(f.create());
  f.state.marker = 'new-reset'; f.state.afterInsertReadFailure = false;
  const row = await f.create(null); assert.equal(row.id, f.rows[0].id); assert.equal(f.state.inserts, 1); assert.equal(f.store.size, 0);
});

test('explicit post-reset retry retains the old ID even if the original commits late', async () => {
  const f = fixture(); f.state.commit = false; await assert.rejects(f.create());
  const old = readPendingGrowthRoutine(f.storage, owner)!;
  f.state.marker = 'new-reset'; await assert.rejects(f.create(null), /초기화/);
  await assert.rejects(f.create({ ...input, title: '새 번호를 만들면 안 됨' }), /저장 결과/);
  f.state.commit = true;
  const row = await createGrowthRoutineSafely(f.client, owner, f.storage, null, 0, () => {}, true);
  assert.equal(row.id, old.row.id);
  // Primary key enforcement for the eventual original insert.
  if (!f.rows.some(item => item.id === old.row.id)) f.rows.push(old.row);
  assert.equal(f.rows.length, 1); assert.equal(f.store.size, 0);
});
