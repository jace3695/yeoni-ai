/** Client-side recovery only. The existing table has no atomic reset/version fence. */
export type AssistantMemory = { id: string; user_id: string; topic: string; content: string };
export type MemoryValues = Pick<AssistantMemory, 'topic' | 'content'>;
export type MemoryChange = {
  owner: string; id: string; before: AssistantMemory | null; after: MemoryValues | null;
  originalReset: string; reset: string; attempted: boolean;
};
export type MemoryRecoveryState = 'saved' | 'missing' | 'before' | 'conflict' | 'reset' | 'unknown' | 'stale';
export type MemoryRecoveryResult = { state: MemoryRecoveryState; change: MemoryChange };
export type MemoryTransport = {
  auth(): Promise<string | null>;
  reset(signal: AbortSignal): Promise<string>;
  find(change: MemoryChange, signal: AbortSignal): Promise<AssistantMemory | null>;
  write(change: MemoryChange, signal: AbortSignal): Promise<unknown>;
  timeoutMs?: number;
};
export class MemoryDeadlineError extends Error { constructor() { super('기다리는 시간이 길어 요청을 멈췄습니다. 이미 보낸 요청은 서버에서 계속 처리될 수 있습니다.'); } }
export class MemoryJournalError extends Error { constructor() { super('이 탭에 확인 정보를 안전하게 보관하지 못했습니다. 추가 쓰기는 중단합니다. 브라우저 저장공간을 확인해 주세요. 이미 보낸 요청은 취소된 것으로 판단하지 않습니다.'); } }
export class MemoryOwnerError extends Error { constructor() { super('로그인 계정이 변경됐습니다. 다시 불러와 주세요.'); } }
export function memoryResetMarker(state: unknown): string {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'null';
  return JSON.stringify((state as Record<string, unknown>)['ai-fitness-record-reset-assistant'] ?? null);
}
/** A deadline is enforced even if the underlying SDK ignores AbortSignal. */
export function waitForMemory<T>(work: PromiseLike<T>, signal: AbortSignal, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => finish(() => reject(new Error('memory-stale')));
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', aborted); done();
    };
    timer = setTimeout(() => finish(() => reject(new MemoryDeadlineError())), timeoutMs);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    Promise.resolve(work).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}
export function memoryMatches(row: AssistantMemory | null, change: MemoryChange, values: MemoryValues | null) {
  return values === null ? row === null : row?.id === change.id && row.user_id === change.owner && row.topic === values.topic && row.content === values.content;
}
/** Auth, reset and row reads are checked at every await boundary. No automatic retry. */
export async function recoverMemory(
  initial: MemoryChange, mode: 'send' | 'check' | 'retry' | 'renew', transport: MemoryTransport,
  persist: (change: MemoryChange) => void, current: () => boolean, signal: AbortSignal,
): Promise<MemoryRecoveryResult> {
  let change = initial;
  const result = (state: MemoryRecoveryState) => ({ state, change });
  const alive = () => current() && !signal.aborted;
  const bounded = <T>(operation: PromiseLike<T>) => waitForMemory(operation, signal, transport.timeoutMs);
  if (!alive()) return result('stale');
  const owner = await bounded(transport.auth());
  if (!alive()) return result('stale');
  if (owner !== change.owner) throw new MemoryOwnerError();
  let reset = await bounded(transport.reset(signal));
  if (!alive()) return result('stale');
  let row = await bounded(transport.find(change, signal));
  if (!alive()) return result('stale');
  const afterReadReset = await bounded(transport.reset(signal));
  if (!alive()) return result('stale');
  if (afterReadReset !== reset) return result('reset');
  // An absent row after a reset cannot prove that an earlier write was cancelled.
  if (reset !== change.reset && mode !== 'renew') return result('reset');
  if (mode === 'renew') {
    change = { ...change, reset }; // Original reset, ID and before are never replaced.
    persist(change);
    if (!alive()) return result('stale');
  }
  const observed = () => memoryMatches(row, change, change.after) ? 'saved' : row === null ? 'missing' : memoryMatches(row, change, change.before) ? 'before' : 'conflict';
  const state = observed();
  if (mode === 'check' || (mode === 'send' && change.attempted) || state === 'saved' || state === 'conflict') return result(state);
  // An edit of a deleted row is never converted into an insert. A changed row is never overwritten.
  if (change.before && row === null) return result('missing');
  // Recheck reset immediately before dispatch. This is not a server transaction/fence.
  reset = await bounded(transport.reset(signal));
  if (!alive()) return result('stale');
  if (reset !== change.reset) return result('reset');
  change = { ...change, attempted: true };
  persist(change); // Required durable-before-dispatch checkpoint, including exact ID/before/after.
  if (!alive()) return result('stale');
  try { await bounded(transport.write(change, signal)); }
  catch { /* A rejection/timeout does not prove non-commit. Only inspect the same row. */ }
  if (!alive()) return result('stale');
  try {
    reset = await bounded(transport.reset(signal));
    if (!alive()) return result('stale');
    row = await bounded(transport.find(change, signal));
    if (!alive()) return result('stale');
    const finalReset = await bounded(transport.reset(signal));
    if (!alive()) return result('stale');
    if (reset !== change.reset || finalReset !== reset) return result('reset');
    return result(observed());
  } catch { return result(alive() ? 'unknown' : 'stale'); }
}

export type MemoryJournalStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const memoryJournalKey = (owner: string) => `yeoni-memory-confirmation-v1:${encodeURIComponent(owner)}`;
function valuesValid(value: unknown): value is MemoryValues {
  if (!value || typeof value !== 'object') return false;
  const row = value as MemoryValues;
  return typeof row.topic === 'string' && row.topic.trim().length > 0 && row.topic.length <= 80 && typeof row.content === 'string' && row.content.trim().length > 0 && row.content.length <= 2000;
}
function onlyKeys(value: object, keys: string[]) { return Object.keys(value).every(key => keys.includes(key)); }
function validChange(value: unknown, owner: string): value is MemoryChange {
  if (!value || typeof value !== 'object') return false;
  const entry = value as MemoryChange;
  return onlyKeys(entry, ['owner', 'id', 'before', 'after', 'originalReset', 'reset', 'attempted']) && entry.owner === owner && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 200 &&
    typeof entry.originalReset === 'string' && typeof entry.reset === 'string' && typeof entry.attempted === 'boolean' &&
    (entry.before === null || (typeof entry.before === 'object' && typeof entry.before.topic === 'string' && typeof entry.before.content === 'string' && onlyKeys(entry.before, ['id', 'user_id', 'topic', 'content']) && entry.before.id === entry.id && entry.before.user_id === owner)) &&
    (entry.after === null || (valuesValid(entry.after) && onlyKeys(entry.after, ['topic', 'content']))) && (entry.before !== null || entry.after !== null);
}
export function readMemoryJournal(storage: MemoryJournalStorage, owner: string): MemoryChange[] {
  try {
    const raw = storage.getItem(memoryJournalKey(owner));
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || data.owner !== owner || !Array.isArray(data.entries) || data.entries.length > 50 || !data.entries.every((entry: unknown) => validChange(entry, owner)) || new Set(data.entries.map((entry: MemoryChange) => entry.id)).size !== data.entries.length) throw Error();
    return data.entries;
  } catch { throw new MemoryJournalError(); }
}
/** Read back the exact serialized value. A storage error always prevents new writes. */
export function writeMemoryJournal(storage: MemoryJournalStorage, owner: string, entries: MemoryChange[]) {
  try {
    if (entries.length > 50 || new Set(entries.map(entry => entry.id)).size !== entries.length || !entries.every(entry => validChange(entry, owner))) throw Error();
    const value = JSON.stringify({ version: 1, owner, entries });
    storage.setItem(memoryJournalKey(owner), value);
    if (storage.getItem(memoryJournalKey(owner)) !== value) throw Error();
  } catch { throw new MemoryJournalError(); }
}
export function rememberMemoryChange(storage: MemoryJournalStorage, change: MemoryChange): MemoryChange[] {
  const entries = readMemoryJournal(storage, change.owner);
  const next = [...entries.filter(entry => entry.id !== change.id), change];
  writeMemoryJournal(storage, change.owner, next);
  return next;
}
export function completeMemoryChange(storage: MemoryJournalStorage, change: MemoryChange): MemoryChange[] {
  const entries = readMemoryJournal(storage, change.owner).filter(entry => entry.id !== change.id);
  writeMemoryJournal(storage, change.owner, entries);
  return entries;
}
