import { INBODY_RECORDS_KEY, WEIGHT_RECORDS_KEY, isValidInbodyRecord } from './recordStorage';
import type { InbodyRecordStore, WeightRecordStore } from './recordStorage';
import { notifyRecordsChanged, recoverStorageTransaction, writeStorageBatch } from './storageTransaction';
import { assertStorageOwnership, getStorageOwnershipToken } from './storageOwnership.ts';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type BodySaveScope = { owner: string | null; epoch: string | null };
const JOURNAL_KEY = 'yeoni-storage-transaction-v1';
const changedMessage = '기록 또는 로그인 상태가 바뀌었습니다. 입력값을 보관한 뒤 최신 기록을 다시 확인해주세요.';

export function readBodySaveScope(storage: StorageLike): BodySaveScope {
  assertStorageOwnership();
  return { owner: storage.getItem('fitness-cloud-sync-user'), epoch: storage.getItem('fitness-cloud-sync-epoch') };
}

export function isBodySaveScopeCurrent(storage: StorageLike, expected: BodySaveScope | null) {
  if (getStorageOwnershipToken() === null) return false;
  const current = readBodySaveScope(storage);
  return expected !== null && current.owner === expected.owner && current.epoch === expected.epoch;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readStore(raw: string | null, kind: 'weight' | 'inbody') {
  // Only a missing key is an empty store. Empty/malformed text must never become {}.
  const value: unknown = raw === null ? {} : JSON.parse(raw);
  if (!object(value) || !Object.entries(value).every(([date, entry]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !object(entry)) return false;
    if (kind === 'weight') return typeof entry.weight === 'number' && Number.isFinite(entry.weight)
      && entry.weight > 0 && typeof entry.recordedAt === 'string';
    return isValidInbodyRecord(entry);
  })) throw new Error('기존 체중·인바디 기록 형식을 확인할 수 없어 저장하지 않았습니다. 입력값과 기존 원문은 보관됩니다.');
  return value;
}

export function readBodySaveSnapshot(storage: StorageLike, scope: BodySaveScope | null) {
  if (!isBodySaveScopeCurrent(storage, scope)) throw new Error(changedMessage);
  // Validate the existing journal before delegating recovery to the shipped helper.
  const journal = storage.getItem(JOURNAL_KEY);
  if (journal !== null) {
    const before: unknown = JSON.parse(journal);
    if (!object(before) || Object.entries(before).some(([key, raw]) => key === JOURNAL_KEY || (raw !== null && typeof raw !== 'string'))) {
      throw new Error('이전 저장 복구 정보를 확인할 수 없어 저장하지 않았습니다. 입력값을 보관해주세요.');
    }
    // Recovery must not restore another session underneath this mounted draft.
    for (const [key, expected] of [['fitness-cloud-sync-user', scope?.owner], ['fitness-cloud-sync-epoch', scope?.epoch]] as const) {
      if (Object.prototype.hasOwnProperty.call(before, key) && before[key] !== expected) throw new Error(changedMessage);
    }
  }
  recoverStorageTransaction(storage);
  if (!isBodySaveScopeCurrent(storage, scope)) throw new Error(changedMessage);
  const weightsRaw = storage.getItem(WEIGHT_RECORDS_KEY);
  const inbodyRaw = storage.getItem(INBODY_RECORDS_KEY);
  return {
    weightsRaw, inbodyRaw,
    weights: readStore(weightsRaw, 'weight') as WeightRecordStore,
    inbody: readStore(inbodyRaw, 'inbody') as InbodyRecordStore,
  };
}

export function assertBodyRecordUnchanged(
  snapshot: ReturnType<typeof readBodySaveSnapshot>, date: string,
  weights: WeightRecordStore, inbody: InbodyRecordStore,
) {
  if (JSON.stringify(snapshot.weights[date]) !== JSON.stringify(weights[date])
    || JSON.stringify(snapshot.inbody[date]) !== JSON.stringify(inbody[date])) throw new Error(changedMessage);
}

export function commitBodySave(
  storage: StorageLike, scope: BodySaveScope | null,
  snapshot: ReturnType<typeof readBodySaveSnapshot>,
  weights: WeightRecordStore, inbody: InbodyRecordStore,
) {
  const assertCurrent = () => {
    if (!isBodySaveScopeCurrent(storage, scope)
      || storage.getItem(WEIGHT_RECORDS_KEY) !== snapshot.weightsRaw
      || storage.getItem(INBODY_RECORDS_KEY) !== snapshot.inbodyRaw
      || storage.getItem(JOURNAL_KEY) !== null) throw new Error(changedMessage);
  };
  assertCurrent();
  // Recheck immediately before the shipped helper writes its original-raw journal.
  // This is an optimistic guard, not a cross-tab lock or an atomic localStorage CAS.
  let journalStarted = false;
  const checkedStorage: StorageLike = {
    getItem: (key) => {
      const raw = storage.getItem(key);
      if (key === JOURNAL_KEY && !journalStarted && raw !== null) throw new Error(changedMessage);
      return raw;
    },
    setItem: (key, value) => {
      if (key === JOURNAL_KEY) assertCurrent();
      storage.setItem(key, value);
      if (key === JOURNAL_KEY) journalStarted = true;
    },
    removeItem: (key) => storage.removeItem(key),
  };
  writeStorageBatch(checkedStorage, {
    [WEIGHT_RECORDS_KEY]: JSON.stringify(weights),
    [INBODY_RECORDS_KEY]: JSON.stringify(inbody),
  });
  // A notification failure is not a persistence failure after the journal is
  // removed. Return the distinction so the UI never offers a false save retry.
  try {
    notifyRecordsChanged();
    return { notified: true };
  } catch {
    return { notified: false };
  }
}
