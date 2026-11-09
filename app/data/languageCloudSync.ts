import { mergeCloudState, mergeCloudStateFromBase, type CloudState } from "./cloudSync.ts";
import { CHUNK_REVIEW_EVENT, CHUNK_REVIEW_KEY, compareChunkGenerations, emptyChunkReview, mergeChunkReviewSnapshots, parseChunkReview, readChunkReview } from "../../utils/japaneseChunkReview.ts";
import { respectRecordResets } from "./appRecordReset.ts";
import { LANGUAGE_DATA_KEYS, assertLanguageStorageReadable, readOwnedLanguageCacheSnapshot, recoverLanguageStorage, withLanguageRecordLock, writeLanguageStorageBatch } from "./languageStorageLock.ts";
import { LEVEL_JOURNEY_EVENT, LEVEL_JOURNEY_KEY, mergeLevelJourneySnapshots } from "../../utils/japaneseLevelJourney.ts";

export const LANGUAGE_STORAGE_KEYS = LANGUAGE_DATA_KEYS;

const LANGUAGE_SYNC_BASE_PREFIX = "language-cloud-sync-base:";
const LANGUAGE_LAST_USER_KEY = "language-cloud-sync-user";

export type LanguageState = Record<string, string>;

export function readLanguageState(): LanguageState {
  if (typeof window === "undefined") return {};
  assertLanguageStorageReadable(window.localStorage);
  const state: LanguageState = {};
  for (const key of LANGUAGE_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value !== null) state[key] = value;
  }
  if (state[CHUNK_REVIEW_KEY] !== undefined) state[CHUNK_REVIEW_KEY] = JSON.stringify(readChunkReview(window.localStorage));
  return state;
}

/** Runtime snapshot collection shares the write lock; the synchronous reader
 * above is only a non-mutating primitive for an already-owned lock or tests. */
export async function readLanguageStateSafely(check?: () => void): Promise<LanguageState> {
  if (typeof window === 'undefined') return {};
  return withLanguageRecordLock(() => {
    check?.();
    recoverLanguageStorage(window.localStorage);
    check?.();
    return readLanguageState();
  });
}

function notifyChunkReview() {
  if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(CHUNK_REVIEW_EVENT));
}

export async function applyLanguageState(state: CloudState, base?: CloudState, check?: () => void) {
  if (typeof window === "undefined") return;
  return withLanguageRecordLock(() => {
    check?.();
    recoverLanguageStorage(window.localStorage);
    const previousJourney = window.localStorage.getItem(LEVEL_JOURNEY_KEY);
    const previousCurriculum = window.localStorage.getItem("japaneseCurriculumProgressV1");
    const previousChunk = window.localStorage.getItem(CHUNK_REVIEW_KEY);
    const previousReset = window.localStorage.getItem("languageRecordResetV1");
    // A version that does not know this optional key cannot delete its history.
    // Validate and union before touching ANY existing language record.
    const local: CloudState = Object.fromEntries(LANGUAGE_STORAGE_KEYS.flatMap(key => {
      const value = window.localStorage.getItem(key);
      return value === null ? [] : [[key, value]];
    }));
    // Reading here, after acquiring the lock, also preserves curriculum/level
    // edits made while this remote response waited for another tab's answer.
    const reconciled = base ? mergeLanguageStateFromBase(base, state, local) : state;
    const protectedState = mergeChunkReviews({}, reconciled, local, reconciled);
    check?.();
    const changes: Record<string, string | null> = {};
    for (const key of LANGUAGE_STORAGE_KEYS) {
      const value = protectedState[key];
      changes[key] = typeof value === "string" ? value : null;
    }
    writeLanguageStorageBatch(window.localStorage, changes);
    if ((previousJourney !== window.localStorage.getItem(LEVEL_JOURNEY_KEY) || previousCurriculum !== window.localStorage.getItem("japaneseCurriculumProgressV1")) && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(LEVEL_JOURNEY_EVENT));
    if (previousChunk !== window.localStorage.getItem(CHUNK_REVIEW_KEY) || previousReset !== window.localStorage.getItem("languageRecordResetV1")) notifyChunkReview();

  });
}

function resetTime(state: CloudState) {
  const marker = state.languageRecordResetV1;
  if (marker === undefined) return 0;
  if (typeof marker !== 'string' || !Number.isFinite(Date.parse(marker.split('|')[0]))) {
    throw new Error('일본어 기록 초기화 기준을 확인하지 못했어요. 기존 보충 오답은 보존합니다.');
  }
  return Date.parse(marker.split('|')[0]);
}

function mergeChunkReviews(base: CloudState, remote: CloudState, local: CloudState, merged: CloudState): CloudState {
  // The latest explicit reset generation wins. Include the baseline as evidence
  // when older clients omit the key, but never revive a preceding generation.
  const sources = [base, remote, local];
  const latest = [...sources].sort((a, b) => resetTime(a) - resetTime(b)
    || (String(a.languageRecordResetV1 ?? '') < String(b.languageRecordResetV1 ?? '') ? -1 : String(a.languageRecordResetV1 ?? '') > String(b.languageRecordResetV1 ?? '') ? 1 : 0)).at(-1)!;
  const generation = latest.languageRecordResetV1;
  const current = sources.filter(source => source.languageRecordResetV1 === generation);
  const snapshots = current.filter(source => Object.prototype.hasOwnProperty.call(source, CHUNK_REVIEW_KEY)).map(source => {
    const raw = source[CHUNK_REVIEW_KEY];
    if (typeof raw !== 'string') throw new Error('보충 오답 동기화 형식을 확인해 주세요. 기존 기록을 보존합니다.');
    const parsed = parseChunkReview(raw);
    if (compareChunkGenerations(parsed.generation, (generation as string | undefined) ?? null) > 0) {
      throw new Error('보충 오답의 초기화 기준이 맞지 않아요. 원본을 보존하고 동기화를 멈췄습니다.');
    }
    return raw;
  });
  const result = respectRecordResets(latest, merged, merged);
  if (snapshots.length) result[CHUNK_REVIEW_KEY] = mergeChunkReviewSnapshots(JSON.stringify(emptyChunkReview((generation as string | undefined) ?? null)), ...snapshots);
  else delete result[CHUNK_REVIEW_KEY];
  // Reset selection normally comes from respectRecordResets. A newer baseline
  // must also prevent a stale pair of snapshots from rolling a generation back.
  if (generation !== undefined) result.languageRecordResetV1 = generation;
  return result;
}

function mergeJourney(base: CloudState, remote: CloudState, local: CloudState, merged: CloudState): CloudState {
  // The existing reset-generation policy wins over all older question records.
  if (remote.languageRecordResetV1 !== local.languageRecordResetV1) return merged;
  const r = remote[LEVEL_JOURNEY_KEY], l = local[LEVEL_JOURNEY_KEY];
  if (typeof r !== 'string' || typeof l !== 'string') return merged;
  return { ...merged, [LEVEL_JOURNEY_KEY]: mergeLevelJourneySnapshots(base[LEVEL_JOURNEY_KEY], r, l) };
}

export function mergeLanguageState(remote: CloudState, local: CloudState): CloudState {
  return mergeChunkReviews({}, remote, local, mergeJourney({}, remote, local, mergeCloudState(remote, local)));
}

export function mergeLanguageStateFromBase(base: CloudState, remote: CloudState, local: CloudState): CloudState {
  return mergeChunkReviews(base, remote, local, mergeJourney(base, remote, local, mergeCloudStateFromBase(base, remote, local)));
}

export async function clearLanguageLocalState() {
  if (typeof window === "undefined") return;
  const expectedUser = window.localStorage.getItem(LANGUAGE_LAST_USER_KEY);
  const expectedEpoch = window.localStorage.getItem('language-cloud-sync-epoch');
  return withLanguageRecordLock(() => {
    // A delayed sign-out callback must never clear a subsequently prepared user.
    if (window.localStorage.getItem(LANGUAGE_LAST_USER_KEY) !== expectedUser
      || window.localStorage.getItem('language-cloud-sync-epoch') !== expectedEpoch) return;
    recoverLanguageStorage(window.localStorage);
    const baseKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(LANGUAGE_SYNC_BASE_PREFIX)));
    const changes: Record<string, string | null> = Object.fromEntries([...LANGUAGE_STORAGE_KEYS, ...baseKeys, LANGUAGE_LAST_USER_KEY].map(key => [key, null]));
    changes['language-cloud-sync-epoch'] = String(Number(expectedEpoch || 0) + 1);
    writeLanguageStorageBatch(window.localStorage, changes);
    notifyChunkReview();
  });
}

export async function prepareLanguageLocalState(userId: string, check?: () => void) {
  if (typeof window === "undefined") return;
  return withLanguageRecordLock(() => {
    check?.();
    const fitnessUser = window.localStorage.getItem('fitness-cloud-sync-user');
    if (fitnessUser && fitnessUser !== userId) throw new Error('계정이 바뀌었어요. 일본어 화면을 다시 열어 주세요.');
    recoverLanguageStorage(window.localStorage);
    const previousUserId = window.localStorage.getItem(LANGUAGE_LAST_USER_KEY);
    const changes: Record<string, string | null> = { [LANGUAGE_LAST_USER_KEY]: userId };
    if (previousUserId && previousUserId !== userId) {
      for (const key of LANGUAGE_STORAGE_KEYS) changes[key] = null;
      changes['language-cloud-sync-epoch'] = String(Number(window.localStorage.getItem('language-cloud-sync-epoch') || 0) + 1);
    }
    writeLanguageStorageBatch(window.localStorage, changes);
    if (previousUserId !== userId) notifyChunkReview();
  });
}

export function readLanguageSyncBase(userId: string): LanguageState | null {
  if (typeof window === "undefined") return null;
  const key = `${LANGUAGE_SYNC_BASE_PREFIX}${userId}`;
  try {
    assertLanguageStorageReadable(window.localStorage);
    const value: unknown = JSON.parse(window.localStorage.getItem(key) || "null");
    if (value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(item => typeof item !== 'string')) throw new Error('Invalid language sync baseline');
    return value as LanguageState;
  } catch {
    throw new Error("기존 일본어 동기화 기준을 읽지 못했어요. 원본을 보존하고 동기화를 멈췄습니다.");
  }
}

export async function saveLanguageSyncBase(userId: string, state: CloudState, check?: () => void) {
  if (typeof window === "undefined") return;
  return withLanguageRecordLock(() => {
    check?.();
    if (window.localStorage.getItem(LANGUAGE_LAST_USER_KEY) !== userId) throw new Error('계정이 바뀌어 동기화 확인을 멈췄어요.');
    recoverLanguageStorage(window.localStorage);
    window.localStorage.setItem(`${LANGUAGE_SYNC_BASE_PREFIX}${userId}`, JSON.stringify(state));
  });
}

/** A limited read-only view when writes cannot be coordinated. It never adopts
 * unowned data, recovers a journal, or claims a server/atomic snapshot. */
export function readLanguageCacheOverview(storage: Pick<Storage, 'getItem'>, userId: string) {
  const snapshot = readOwnedLanguageCacheSnapshot(storage, ['japaneseCurriculumProgressV1', 'dailyLearningHistory', 'savedWords', LEVEL_JOURNEY_KEY], userId);
  if (!snapshot) return null;
  const parse = (key: string): unknown => snapshot[key] === null ? null : JSON.parse(snapshot[key]!);
  const curriculum = parse('japaneseCurriculumProgressV1');
  const history = parse('dailyLearningHistory');
  const words = parse('savedWords');
  const journey = parse(LEVEL_JOURNEY_KEY);
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (curriculum !== null && !object(curriculum) || history !== null && !object(history)
    || words !== null && !Array.isArray(words) || journey !== null && !object(journey)) throw new Error('저장한 학습 기록의 요약 형식을 확인하지 못했어요. 원본 기록은 변경하지 않았습니다.');
  const completed = object(curriculum) ? curriculum.completedLessonIds : [];
  if (completed !== undefined && (!Array.isArray(completed) || completed.some(item => typeof item !== 'string'))) throw new Error('저장한 수업 기록을 확인하지 못했어요. 원본 기록은 변경하지 않았습니다.');
  const selected = object(journey) ? journey.selectedLevel : null;
  return {
    completedLessons: Array.isArray(completed) ? new Set(completed).size : 0,
    studyDays: object(history) ? Object.keys(history).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key)).length : 0,
    savedWords: Array.isArray(words) ? words.length : 0,
    selectedLevel: selected === 'beginner' ? '초급' : selected === 'intermediate' ? '중급' : selected === 'advanced' ? '고급' : null,
  };
}
