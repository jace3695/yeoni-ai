import { assertLanguageStorageReadable, recoverLanguageStorage, withLanguageRecordLock } from '../app/data/languageStorageLock.ts';
import { learningOwner, LEVEL_JOURNEY_KEY, readLevelJourney, writeLevelJourney, type JourneyStorage, type LevelJourney } from './japaneseLevelJourney.ts';

type StorageAccess = JourneyStorage & Pick<Storage, 'removeItem'>;
type Guard = { signal?: AbortSignal; assertCurrent?: () => void };

/** The mounted language boundary prepares both owners before admitting writers.
 * Never adopt anonymous or partially switched account caches here. */
export function assertLevelJourneyOwner(storage: JourneyStorage, expectedOwner: string, guard: Guard = {}) {
  if (guard.signal?.aborted) throw guard.signal.reason ?? new DOMException('Aborted', 'AbortError');
  guard.assertCurrent?.();
  const language = storage.getItem('language-cloud-sync-user');
  if (!language || language !== storage.getItem('fitness-cloud-sync-user') || learningOwner(storage) !== expectedOwner) {
    throw new Error('계정이나 기록이 바뀌었어요. 학습 화면을 다시 열어 주세요.');
  }
}

export async function readLevelJourneySafely(storage: StorageAccess, expectedOwner: string, guard: Guard = {}) {
  assertLevelJourneyOwner(storage, expectedOwner, guard);
  const value = await withLanguageRecordLock(() => {
    assertLevelJourneyOwner(storage, expectedOwner, guard);
    recoverLanguageStorage(storage);
    assertLevelJourneyOwner(storage, expectedOwner, guard);
    assertLanguageStorageReadable(storage);
    const next = readLevelJourney(storage);
    assertLevelJourneyOwner(storage, expectedOwner, guard);
    return next;
  }, guard.signal);
  assertLevelJourneyOwner(storage, expectedOwner, guard);
  return value;
}

/** Local confirmation only, not cloud acknowledgement. Existing synchronous
 * utility/schema stay intact. Non-participating old tabs remain outside this gate. */
export async function writeLevelJourneySafely(storage: StorageAccess, expectedOwner: string, change: (latest: LevelJourney) => LevelJourney, guard: Guard = {}): Promise<LevelJourney> {
  assertLevelJourneyOwner(storage, expectedOwner, guard);
  const value = await withLanguageRecordLock(() => {
    assertLevelJourneyOwner(storage, expectedOwner, guard);
    recoverLanguageStorage(storage);
    assertLevelJourneyOwner(storage, expectedOwner, guard);
    assertLanguageStorageReadable(storage);
    // The legacy helper rereads inside this synchronous critical section.
    const next = writeLevelJourney(storage, expectedOwner, latest => {
      const changed = change(latest);
      assertLevelJourneyOwner(storage, expectedOwner, guard);
      return changed;
    });
    assertLevelJourneyOwner(storage, expectedOwner, guard);
    if (storage.getItem(LEVEL_JOURNEY_KEY) !== JSON.stringify(next)) {
      throw new Error('학습 기록 저장 결과를 확인하지 못했어요. 반영됐을 수 있으니 기록을 다시 읽어 확인해 주세요.');
    }
    return next;
  }, guard.signal);
  assertLevelJourneyOwner(storage, expectedOwner, guard);
  return value;
}
