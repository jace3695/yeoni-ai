import { assertStorageOwnership } from './storageOwnership.ts';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const JOURNAL_KEY = 'yeoni-storage-transaction-v1';
let activeWrite = false;

function restoreStorageTransaction(storage: StorageLike) {
  assertStorageOwnership();
  const raw = storage.getItem(JOURNAL_KEY);
  if (raw === null) return;
  let before: unknown;
  try {
    before = JSON.parse(raw);
  } catch {
    throw new Error('이전 저장 복구 정보를 확인할 수 없어 기록을 변경하지 않았습니다.');
  }
  // Validate the entire v1 journal before removing any current values. Storage
  // coerces non-strings, and a self-entry could destroy the recovery evidence.
  if (before === null || typeof before !== 'object' || Array.isArray(before)
    || Object.entries(before).some(([key, value]) => key === JOURNAL_KEY || (value !== null && typeof value !== 'string'))) {
    throw new Error('이전 저장 복구 정보를 확인할 수 없어 기록을 변경하지 않았습니다.');
  }
  const entries = Object.entries(before) as [string, string | null][];
  // Remove new values first so restoring the old snapshot does not need extra quota.
  for (const [key] of entries) {
    assertStorageOwnership();
    storage.removeItem(key);
  }
  for (const [key, value] of entries) {
    assertStorageOwnership();
    if (value !== null) storage.setItem(key, value);
  }
  assertStorageOwnership();
  storage.removeItem(JOURNAL_KEY);
}

/** Only a document holding the exclusive Web Lock may recover an old journal. */
export function recoverStorageTransaction(storage: StorageLike) {
  assertStorageOwnership();
  if (activeWrite) throw new Error('기록 저장이 진행 중이라 복구와 추가 접근을 멈췄습니다.');
  restoreStorageTransaction(storage);
}

/** All callers publish React state only after this synchronous commit succeeds. */
export function writeStorageBatch(storage: StorageLike, changes: Record<string, string | null>) {
  recoverStorageTransaction(storage);
  const before = Object.fromEntries(Object.keys(changes).map(key => [key, storage.getItem(key)]));
  activeWrite = true;
  try {
    // If the journal cannot be saved, none of the user's keys have been changed.
    assertStorageOwnership();
    storage.setItem(JOURNAL_KEY, JSON.stringify(before));
    try {
      for (const [key, value] of Object.entries(changes)) {
        assertStorageOwnership();
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
      assertStorageOwnership();
      storage.removeItem(JOURNAL_KEY);
    } catch (error) {
      restoreStorageTransaction(storage);
      throw error;
    }
  } finally {
    activeWrite = false;
  }
}

export const RECORDS_CHANGED_EVENT = 'yeoni-records-changed';
export const CLOUD_RECORDS_REFRESH_EVENT = 'yeoni-cloud-records-refresh';
/** A confirmed server command changed records without changing local storage. */
export function requestCloudRecordsRefresh(ownerId: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CLOUD_RECORDS_REFRESH_EVENT, { detail: { ownerId } }));
}
let notificationQueued = false;
export function notifyRecordsChanged() {
  if (typeof window === 'undefined' || notificationQueued) return;
  notificationQueued = true;
  queueMicrotask(() => {
    notificationQueued = false;
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
  });
}
