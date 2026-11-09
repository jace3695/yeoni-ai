/** Participating writes use one IndexedDB transaction gate in every context.
 * Web Locks, when present, additionally coordinate with the preceding version.
 * Neither gate makes non-participating legacy localStorage writers atomic. */
export const LANGUAGE_RECORD_LOCK = 'yeoni-language-records-v1';
export const LANGUAGE_TRANSACTION_KEY = 'language-storage-transaction-v1';
export const LANGUAGE_DATA_KEYS = [
  "dailyRoutineProgress", "dailyLearningHistory", "integratedLearningSettingsV1",
  "japaneseCurriculumProgressV1", "japaneseCurriculumReviewV1", "japaneseAppSettings",
  "learningSettings", "savedWords", "savedSentences", "wrongKana", "wrongKanaChars",
  "wrongWords", "wrongSentences", "grammarProgress", "reviewCompletedItemsByDate",
  "languageRecordResetV1", "japaneseLevelJourneyV1", "japaneseChunkReviewV1",
] as const;

const cacheKeys = new Set<string>([...LANGUAGE_DATA_KEYS, 'language-cloud-sync-user', 'language-cloud-sync-epoch']);
const allowedKey = (key: string) => cacheKeys.has(key) || /^language-cloud-sync-base:[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(key);
function validateChanges(value: unknown): asserts value is Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.entries(value).some(([key, item]) => !allowedKey(key) || item !== null && typeof item !== 'string')) {
    throw new Error('중단된 일본어 저장 기록의 형식이나 범위를 확인해 주세요. 원본은 보존합니다.');
  }
}

type LanguageStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const LANGUAGE_LOCK_DATABASE = 'yeoni-language-serialization-v1';
export const LANGUAGE_LOCK_STORE = 'critical-section';
const WAIT_LIMIT_MS = 10_000;

/** Gate failure. Only the pre-start case can promise no callback changes. */
export class LanguageStorageUnavailableError extends Error {
  readonly mayHaveChanged: boolean;
  constructor(message = '이 브라우저에서 안전한 일본어 기록 저장을 준비하지 못했어요. 저장소 지원·설정을 확인하거나 다른 최신 브라우저를 이용해 주세요. 기존 기록은 보존합니다.', mayHaveChanged = false) {
    super(message);
    this.name = 'LanguageStorageUnavailableError';
    this.mayHaveChanged = mayHaveChanged;
  }
}

type Synchronous<T> = T extends PromiseLike<unknown> ? never : T;

/** A readwrite transaction serializes overlapping transactions across connections.
 * Execute ONLY synchronous local work in its request event. Never await network,
 * timers or a promise here: IndexedDB can finish the transaction at that boundary.
 * No learning data or lock lease is written to this database. localStorage's own
 * journal still handles interrupted multi-key work; IDB cannot roll it back. */
function withIndexedDBGate<T>(run: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let db: IDBDatabase | undefined;
    let transaction: IDBTransaction | undefined;
    let settled = false, started = false;
    let value: T;
    const finish = (success: boolean, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      db?.close();
      if (success) resolve(value); else reject(error);
    };
    const stopBeforeStart = (error: unknown) => {
      if (started || settled) return;
      // This cancels this caller, not another context's transaction or a lease.
      try { transaction?.abort(); } catch { /* Already ended; callback is fenced below. */ }
      finish(false, error);
    };
    const cancel = () => stopBeforeStart(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => stopBeforeStart(new LanguageStorageUnavailableError('안전한 일본어 저장소 준비가 지연되고 있어요. 다른 연이 탭을 닫은 뒤 다시 연결해 주세요. 기존 기록은 보존합니다.')), WAIT_LIMIT_MS);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    let request: IDBOpenDBRequest;
    try {
      // Canonical on BOTH paths. Falling back to Web Locks alone on IDB failure
      // would race another context which has IDB but lacks Web Locks.
      if (typeof indexedDB === 'undefined') throw new LanguageStorageUnavailableError();
      request = indexedDB.open(LANGUAGE_LOCK_DATABASE, 1);
    } catch (error) {
      finish(false, error instanceof LanguageStorageUnavailableError ? error : new LanguageStorageUnavailableError());
      return;
    }
    request.onblocked = () => stopBeforeStart(new LanguageStorageUnavailableError('다른 연이 탭에서 저장소를 사용하고 있어요. 해당 탭을 닫은 뒤 다시 연결해 주세요. 기존 기록은 보존합니다.'));
    request.onerror = () => finish(false, new LanguageStorageUnavailableError());
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return; }
      try { request.result.createObjectStore(LANGUAGE_LOCK_STORE); }
      catch { request.transaction?.abort(); finish(false, new LanguageStorageUnavailableError()); }
    };
    request.onsuccess = () => {
      db = request.result;
      // A blocked/timed-out/cancelled open may succeed later. Never run it then.
      if (settled) { db.close(); return; }
      db.onversionchange = () => {
        db?.close();
        stopBeforeStart(new LanguageStorageUnavailableError('일본어 저장소 버전이 바뀌었어요. 화면을 다시 열어 주세요. 기존 기록은 보존합니다.'));
      };
      db.onclose = () => {
        if (started) finish(false, new LanguageStorageUnavailableError('저장소 연결 종료로 저장 확인을 마치지 못했어요. 기기 기록이 반영됐을 수 있으니 다시 열어 확인해 주세요.', true));
        else stopBeforeStart(new LanguageStorageUnavailableError());
      };
      try {
        transaction = db.transaction(LANGUAGE_LOCK_STORE, 'readwrite');
        transaction.oncomplete = () => {
          if (started) finish(true); else finish(false, new LanguageStorageUnavailableError());
        };
        transaction.onabort = () => finish(false, started
          ? new LanguageStorageUnavailableError('저장 확인을 마치지 못했어요. 기기 기록이 반영됐을 수 있으니 다시 열어 확인해 주세요. 기존 기록을 지우지 마세요.', true)
          : new LanguageStorageUnavailableError());
        const gate = transaction.objectStore(LANGUAGE_LOCK_STORE).get(LANGUAGE_RECORD_LOCK);
        gate.onsuccess = () => {
          if (settled || signal?.aborted) { cancel(); return; }
          started = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
          try {
            value = run();
            if (value && typeof (value as { then?: unknown }).then === 'function') {
              // Defensive detection, not cancellation of arbitrary async code.
              // Callers must obey the synchronous contract before invoking us.
              void Promise.resolve(value).catch(() => {});
              throw new TypeError('일본어 저장 잠금 안에서는 비동기 작업을 실행할 수 없어요.');
            }
          } catch (error) {
            try { transaction?.abort(); } catch { /* Preserve the original error. */ }
            finish(false, error);
          }
        };
      } catch {
        stopBeforeStart(new LanguageStorageUnavailableError());
      }
    };
  });
}

/** Keep callbacks synchronous. The type rejects promises and known async
 * functions are refused before invocation, even from untyped callers. */
export async function withLanguageRecordLock<T>(run: () => T & Synchronous<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  if (Object.prototype.toString.call(run) === '[object AsyncFunction]') {
    throw new TypeError('일본어 저장 잠금 안에서는 비동기 작업을 실행할 수 없어요.');
  }
  const enter = () => withIndexedDBGate(run, signal);
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function'
    ? navigator.locks.request(LANGUAGE_RECORD_LOCK, { mode: 'exclusive', ...(signal ? { signal } : {}) }, enter)
    : enter();
}

export function assertLanguageStorageReadable(storage: Pick<Storage, 'getItem'>) {
  if (storage.getItem(LANGUAGE_TRANSACTION_KEY) !== null || storage.getItem('yeoni-storage-transaction-v1') !== null) {
    throw new Error('중단된 기록 저장을 복구하고 있어요. 동기화가 끝난 뒤 다시 확인해 주세요. 기존 기록은 보존합니다.');
  }
}

/** Caller must hold the common language gate. Never recover the other apps' journal. */
export function recoverLanguageStorage(storage: LanguageStorage) {
  if (storage.getItem('yeoni-storage-transaction-v1') !== null) throw new Error('다른 기록의 저장 복구가 필요해요. 기존 보충 기록을 보존하고 저장을 멈췄습니다.');
  const raw = storage.getItem(LANGUAGE_TRANSACTION_KEY);
  if (raw === null) return;
  let before: unknown;
  try { before = JSON.parse(raw); } catch { throw new Error('중단된 일본어 저장 기록을 확인하지 못했어요. 원본은 보존합니다.'); }
  validateChanges(before);
  const entries = Object.entries(before as Record<string, string | null>);
  for (const [key] of entries) storage.removeItem(key);
  for (const [key, value] of entries) if (value !== null) storage.setItem(key, value);
  storage.removeItem(LANGUAGE_TRANSACTION_KEY);
}

/** Caller must hold the common language gate. A journal-quota failure changes no key. */
export function writeLanguageStorageBatch(storage: LanguageStorage, changes: Record<string, string | null>) {
  validateChanges(changes);
  recoverLanguageStorage(storage);
  const before = Object.fromEntries(Object.keys(changes).map(key => [key, storage.getItem(key)]));
  storage.setItem(LANGUAGE_TRANSACTION_KEY, JSON.stringify(before));
  try {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) storage.removeItem(key); else storage.setItem(key, value);
    }
    storage.removeItem(LANGUAGE_TRANSACTION_KEY);
  } catch (error) {
    recoverLanguageStorage(storage);
    throw error;
  }
}

/** Narrow read for non-language pages, even when the browser cannot lock writes.
 * Never adopt an unowned or different owner's cached learning history. */
export function readOwnedLanguageCacheSnapshot(storage: Pick<Storage, 'getItem'>, keys: readonly typeof LANGUAGE_DATA_KEYS[number][], userId: string): Record<string, string | null> | null {
  const ownerMatches = () => Boolean(userId) && storage.getItem('language-cloud-sync-user') === userId
    && storage.getItem('fitness-cloud-sync-user') === userId
    && storage.getItem(LANGUAGE_TRANSACTION_KEY) === null && storage.getItem('yeoni-storage-transaction-v1') === null;
  if (!ownerMatches()) return null;
  const epoch = storage.getItem('language-cloud-sync-epoch');
  const fitnessEpoch = storage.getItem('fitness-cloud-sync-epoch');
  const values = Object.fromEntries(keys.map(key => [key, storage.getItem(key)]));
  return ownerMatches() && storage.getItem('language-cloud-sync-epoch') === epoch
    && storage.getItem('fitness-cloud-sync-epoch') === fitnessEpoch ? values : null;
}

export function readOwnedLanguageCache(storage: Pick<Storage, 'getItem'>, key: typeof LANGUAGE_DATA_KEYS[number], userId: string): string | null {
  return readOwnedLanguageCacheSnapshot(storage, [key], userId)?.[key] ?? null;
}
