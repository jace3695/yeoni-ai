import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as recovery from '../lib/assistant-memory-recovery.ts';
const source = fs.readFileSync(new URL('../app/assistant/memories/page.tsx', import.meta.url), 'utf8');
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const values = { topic: '가상 주제', content: '가상 기억' };
const entry = (): recovery.MemoryChange => ({ owner: 'A', id: 'original-id', before: null, after: values, reset: 'null', originalReset: 'null', attempted: false });
function fixture(existingStorage?: Map<string, string>) {
  const store = existingStorage ?? new Map<string, string>();
  const state = { changes: 0, writes: [] as Record<string, unknown>[], writeFilters: [] as [string, unknown][][], reads: 0, loads: 0, busy: false, notice: '', change: entry() as recovery.MemoryChange | null, journal: [] as recovery.MemoryChange[], row: null as recovery.AssistantMemory | null, reset: null as string | null, owner: 'A', topic: '일반', content: '', ready: true };
  const api = { auth: async () => ({ data: { user: { id: state.owner } }, error: null }), write: async (value: Record<string, unknown>) => { state.row = { id: String(value.id), user_id: String(value.user_id), topic: String(value.topic), content: String(value.content) }; return { error: null }; } };
  const supabase = { auth: { getUser: () => api.auth(), onAuthStateChange: (fn: (event: string, session: { user: { id: string } } | null) => void) => { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; } }, from: (table: string) => {
    let mode = 'select', payload: Record<string, unknown> = {}, single = false; const filters: [string, unknown][] = [];
    const query = {
      select: () => query, order: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; }, abortSignal: () => query,
      insert: (value: Record<string, unknown>) => { mode = 'insert'; payload = value; return query; }, update: (value: Record<string, unknown>) => { mode = 'update'; payload = value; return query; }, delete: () => { mode = 'delete'; return query; },
      maybeSingle: () => { single = true; return query; },
      then: (done: (value: unknown) => unknown, fail: (reason: unknown) => unknown) => {
        const execute = async () => {
          if (mode !== 'select') { state.writes.push(payload); state.writeFilters.push(filters); return api.write(payload); }
          state.reads++;
          if (table === 'user_app_state') return { data: { state: { 'ai-fitness-record-reset-assistant': state.reset } }, error: null };
          return { data: single ? state.row : state.row ? [state.row] : [], error: null };
        };
        return execute().then(done, fail);
      },
    }; return query;
  } };
  let listener: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
  let cleanup = () => {};
  const context: Record<string, unknown> = {
    ...recovery, recoverMemory: (...args: Parameters<typeof recovery.recoverMemory>) => recovery.recoverMemory(args[0], args[1], { ...args[2], timeoutMs: 8 }, args[3], args[4], args[5]),
    supabase, window: { sessionStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } } },
    change: state.change, journal: state.journal, journalReady: true, busy: false, ready: true, topic: state.topic, content: state.content, owner: 'A',
    mounted: { current: true }, generation: { current: 1 }, ownerRef: { current: 'A' }, resetRef: { current: 'null' },
    readEpoch: { current: 0 }, readController: { current: null }, operation: { current: null },
    AbortController, setTimeout, clearTimeout, crypto, resultNotice: { saved: 'saved', missing: 'missing', before: 'before', reset: 'reset', conflict: 'conflict', unknown: 'unknown', stale: '' },
    useCallback: (fn: unknown) => fn, useEffect: (fn: () => () => void) => { cleanup = fn(); },
    setBusy: (value: boolean) => { state.busy = value; context.busy = value; state.changes++; }, setNotice: (value: string) => { state.notice = value; state.changes++; },
    setChange: (value: recovery.MemoryChange | null) => { state.change = value; context.change = value; state.changes++; },
    setJournal: (value: recovery.MemoryChange[]) => { state.journal = value; context.journal = value; state.changes++; },
    setTopic: (value: string) => { state.topic = value; context.topic = value; }, setContent: (value: string) => { state.content = value; context.content = value; }, setEditing: () => {},
    setOutcome: () => { state.changes++; }, setRows: () => {}, setOwner: () => {}, setLoading: () => {}, setReady: (value: boolean) => { state.ready = value; }, setJournalReady: () => {},
  };
  const blocks = source.slice(source.indexOf('  const clearForm ='), source.indexOf('\n  const review =')) + source.slice(source.indexOf('  const review ='), source.indexOf('\n  const disabled ='));
  const code = ts.transpileModule(blocks + '\nglobalThis.api = {confirm, load, review, closeReview};', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = vm.createContext(context); vm.runInContext(code, sandbox);
  const handlers = context.api as { confirm: (mode: 'send' | 'check' | 'retry' | 'renew') => Promise<void>; load: () => Promise<void>; review: (before: recovery.AssistantMemory | null, remove?: boolean) => void; closeReview: () => void };
  // The actual mount effect starts a list read. Finish it before each scenario.
  const flush = async () => { await new Promise(r => setImmediate(r)); };
  return { state, store, context, api, handlers, flush, unmount: () => cleanup(), authChange: (owner: string | null) => listener?.('SIGNED_IN', owner ? { user: { id: owner } } : null), select: (value = entry()) => { state.change = value; context.change = value; } };
}
test('actual page confirm cannot dispatch after leaving during auth', async () => {
  const x = fixture(); await x.flush(); x.select(); const gate = deferred<Awaited<ReturnType<typeof x.api.auth>>>(); x.api.auth = () => gate.promise;
  const task = x.handlers.confirm('send'); x.unmount(); const changes = x.state.changes;
  gate.resolve({ data: { user: { id: 'A' } }, error: null }); await task;
  assert.equal(x.state.writes.length, 0); assert.equal(x.state.changes, changes);
});
test('actual page auth deadline releases lock without late dispatch', async () => {
  const x = fixture(); await x.flush(); x.select(); const gate = deferred<Awaited<ReturnType<typeof x.api.auth>>>(); x.api.auth = () => gate.promise;
  await x.handlers.confirm('send'); assert.equal(x.state.busy, false); gate.resolve({ data: { user: { id: 'A' } }, error: null }); await x.flush(); assert.equal(x.state.writes.length, 0); x.unmount();
});
test('actual page duplicate confirm starts one write and ignores a late unmounted response', async () => {
  const x = fixture(); await x.flush(); x.select(); const gate = deferred<{ error: null }>(); x.api.write = () => gate.promise;
  const task = x.handlers.confirm('send'); const duplicate = x.handlers.confirm('send'); await x.flush(); assert.equal(x.state.writes.length, 1);
  x.unmount(); const changes = x.state.changes; gate.resolve({ error: null }); await Promise.all([task, duplicate]); assert.equal(x.state.changes, changes);
  const raw = x.store.get(recovery.memoryJournalKey('A'))!; assert.equal(JSON.parse(raw).entries[0].attempted, true);
});
test('actual remount restores same journal and never writes until explicit recovery action', async () => {
  const x = fixture(); await x.flush(); x.select(); x.api.write = async () => { throw Error('response lost'); }; await x.handlers.confirm('send'); x.unmount();
  const y = fixture(x.store); await y.flush(); assert.equal(y.state.change?.id, 'original-id'); assert.equal(y.state.change?.attempted, true); assert.equal(y.state.writes.length, 0);
  y.state.row = { id: 'original-id', user_id: 'A', ...values }; await y.handlers.confirm('check'); await y.flush();
  assert.equal(y.state.writes.length, 0); assert.equal(JSON.parse(y.store.get(recovery.memoryJournalKey('A'))!).entries.length, 0); y.unmount();
});
test('actual retry preserves same ID; conditional update retains before filters', async () => {
  const x = fixture(); await x.flush(); x.select({ ...entry(), attempted: true }); await x.handlers.confirm('retry'); assert.equal(x.state.writes[0].id, 'original-id'); x.unmount();
  const y = fixture(); await y.flush(); const before = { id: 'original-id', user_id: 'A', topic: '이전 주제', content: '이전 내용' }; y.state.row = before; y.select({ ...entry(), before, attempted: true });
  await y.handlers.confirm('retry'); assert.deepEqual(JSON.parse(JSON.stringify(y.state.writeFilters[0])), [['id', 'original-id'], ['user_id', 'A'], ['topic', '이전 주제'], ['content', '이전 내용']]); y.unmount();
});
test('actual auth A-B-A boundary invalidates old work and hides prior account journal', async () => {
  const x = fixture(); await x.flush(); x.select(); const gate = deferred<Awaited<ReturnType<typeof x.api.auth>>>(); x.api.auth = () => gate.promise;
  const task = x.handlers.confirm('send'); x.authChange('B'); x.authChange('A'); assert.equal(x.state.change, null); gate.resolve({ data: { user: { id: 'A' } }, error: null }); await task; assert.equal(x.state.writes.length, 0); x.unmount();
});
test('actual storage failure prevents insert and preserves review', async () => {
  const x = fixture(); await x.flush(); x.select(); const browser = x.context.window as { sessionStorage: { setItem: () => void } }; browser.sessionStorage.setItem = () => { throw Error('blocked'); };
  await x.handlers.confirm('send'); assert.equal(x.state.writes.length, 0); assert.equal(x.state.change?.id, 'original-id'); assert.equal(x.state.busy, false); x.unmount();
});
test('parking unresolved request retains journal and new identical review reuses original ID', async () => {
  const x = fixture(); await x.flush(); x.select(); x.api.write = async () => { throw Error('lost'); }; await x.handlers.confirm('send'); x.handlers.closeReview();
  assert.equal(x.state.change, null); assert.equal(x.state.journal[0].id, 'original-id'); assert.equal(JSON.parse(x.store.get(recovery.memoryJournalKey('A'))!).entries[0].id, 'original-id'); assert.equal(x.state.notice, '확인 화면을 닫았습니다. 이미 보낸 요청은 취소되지 않습니다.'); x.context.topic = values.topic; x.context.content = values.content; x.handlers.review(null);
  assert.equal((x.state.change as recovery.MemoryChange | null)?.id, 'original-id'); assert.equal(x.state.writes.length, 1); x.unmount();
});

test('actual legacy-row correction and deletion preserve unlimited server before values', async () => {
  for (const afterValue of [values, null]) {
    const x = fixture(); await x.flush();
    const before = { id: 'original-id', user_id: 'A', topic: '', content: 'x'.repeat(2001) };
    x.state.row = before; x.select({ ...entry(), before, after: afterValue });
    x.api.write = async () => { x.state.row = afterValue ? { ...before, ...afterValue } : null; return { error: null }; };
    await x.handlers.confirm('send'); await x.flush();
    assert.equal(x.state.writes.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(x.state.writeFilters[0])), [['id', 'original-id'], ['user_id', 'A'], ['topic', ''], ['content', before.content]]);
    assert.equal(x.state.change, null); x.unmount();
  }
});

test('closing a fresh unsent review does not claim persistence or create a journal/write', async () => {
  const x = fixture(); await x.flush(); x.select(); x.handlers.closeReview();
  assert.equal(x.state.change, null); assert.equal(x.state.writes.length, 0);
  assert.equal(x.store.get(recovery.memoryJournalKey('A')), undefined);
  assert.equal(x.state.journal.length, 0);
  assert.equal(x.state.notice, '확인 화면을 닫았습니다. 이미 보낸 요청은 취소되지 않습니다.');
  x.unmount();
});
