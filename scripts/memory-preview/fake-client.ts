import { journalFailure } from './runtime';
type Row = Record<string, unknown>;
type Result = { data: unknown; error: Error | null; status?: number };
let owner = 'synthetic-memory-a';
let records: Row[] = [];
const markers: Record<string, string | null> = {};
const listeners = new Set<(event: string, session: unknown) => void>();
let writes = 0, commits = 0, reads = 0;
const requestIds: unknown[] = [];
let loseNext = false, rejectNext = false, holdWrite = false, holdAuth = false, failRead = 0;
const authQueue: Array<() => void> = [], writeQueue: Array<() => void> = [];
const changed = () => window.dispatchEvent(new Event('fixture-change'));
export function metrics() { const rows = records.filter(row => row.user_id === owner); return {
  owner, rows: rows.length, writes, commits, reads, ids: rows.map(row => row.id), requestIds: [...requestIds],
  waitingAuth: authQueue.length, waitingWrites: writeQueue.length, journalFailure: journalFailure(),
}; }
export function injectLoss() { loseNext = true; changed(); }
export function injectRejection() { rejectNext = true; changed(); }
export function injectReadFailure() { failRead++; changed(); }
export function holdNextAuthentication() { holdAuth = true; changed(); }
export function releaseAuthentication() { authQueue.splice(0).forEach(resolve => resolve()); changed(); }
export function holdNextWrite() { holdWrite = true; changed(); }
export function releaseWrites() { writeQueue.splice(0).forEach(resolve => resolve()); changed(); }
export function switchOwner() {
  owner = owner === 'synthetic-memory-a' ? 'synthetic-memory-b' : 'synthetic-memory-a';
  for (const fn of listeners) fn('SIGNED_IN', { user: { id: owner } }); changed();
}
export function resetOwner() { records = records.filter(row => row.user_id !== owner); markers[owner] = 'synthetic-reset-' + Date.now(); changed(); }
export function changeRemote() {
  const row = records.filter(row => row.user_id === owner).at(-1);
  if (row) { row.topic = '다른 화면에서 바꾼 주제'; row.content = '다른 화면에서 수정한 가상 기억'; } changed();
}
export const supabase = {
  auth: {
    getUser: () => { const result = { data: { user: { id: owner } }, error: null };
      if (!holdAuth) return Promise.resolve(result); holdAuth = false;
      return new Promise<typeof result>(resolve => { authQueue.push(() => resolve(result)); changed(); });
    },
    onAuthStateChange: (fn: (event: string, session: unknown) => void) => { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
  },
  from: (table: string) => {
    let op = 'read', payload: Row | null = null, single = false;
    let columns: string[] | null = null;
    const values: Record<string, unknown> = {};
    const filtered = () => records.filter(row => Object.entries(values).every(([key, value]) => row[key] === value));
    const commit = (): Result => {
      const rows = filtered();
      if (op === 'insert') {
        if (records.some(row => row.id === payload!.id)) return { data: null, error: Object.assign(new Error('Synthetic duplicate'), { code: '23505' }), status: 409 };
        records.push({ ...payload, created_at: new Date().toISOString() });
      } else if (op === 'update') rows.forEach(row => Object.assign(row, payload));
      else if (op === 'delete') records = records.filter(row => !rows.includes(row));
      commits++; changed();
      return { data: single ? rows[0] ?? payload : rows, error: null, status: 200 };
    };
    const execute = async (): Promise<Result> => {
      if (table === 'user_app_state') {
        if (op !== 'read' || values.user_id !== owner) throw new Error('Unexpected synthetic state access');
        return { data: { state: { 'ai-fitness-record-reset-assistant': markers[owner] ?? null } }, error: null };
      }
      if (table !== 'assistant_memories') throw new Error('Unexpected synthetic table ' + table);
      if ((op === 'insert' ? payload?.user_id : values.user_id) !== owner) throw new Error('Synthetic owner boundary rejected query');
      if (op !== 'read') {
        writes++; requestIds.push(payload?.id ?? values.id); changed();
        if (rejectNext) { rejectNext = false; return { data: null, error: new Error('Synthetic write not delivered') }; }
        if (holdWrite) { holdWrite = false; return new Promise<Result>(resolve => { writeQueue.push(() => resolve(commit())); changed(); }); }
        const result = commit();
        if (loseNext) { loseNext = false; failRead = 1; return { data: null, error: new Error('Synthetic response lost') }; }
        return result;
      }
      reads++; changed();
      if (single && failRead > 0) { failRead--; return { data: null, error: new Error('Synthetic lookup failure') }; }
      const rows = filtered().map(row => columns
        ? Object.fromEntries(columns.map(key => [key, row[key]]))
        : ({ ...row }));
      return { data: single ? rows[0] ?? null : rows, error: null };
    };
    const query = { select: (fields = '*') => { columns = fields === '*' ? null : fields.split(',').map(key => key.trim()); return query; }, eq: (key: string, value: unknown) => { values[key] = value; return query; },
      order: () => query, abortSignal: () => query,
      insert: (value: Row) => { op = 'insert'; payload = value; return query; },
      update: (value: Row) => { op = 'update'; payload = value; return query; },
      delete: () => { op = 'delete'; return query; },
      single: () => { single = true; return execute(); }, maybeSingle: () => { single = true; return execute(); },
      then: (resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject),
    };
    return query;
  },
};
