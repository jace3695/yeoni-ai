import { getLocalDateKey } from "@/utils/dateKey";
import { recoverLanguageStorage, withLanguageRecordLock, writeLanguageStorageBatch } from "@/app/data/languageStorageLock";

export const DAILY_ROUTINE_STORAGE_KEY = "dailyRoutineProgress";
export const DAILY_LEARNING_HISTORY_STORAGE_KEY = "dailyLearningHistory";
const ROUTINE_IDS = ["kana", "words", "sentences", "grammar", "review"] as const;
export type RoutineId = (typeof ROUTINE_IDS)[number];
const scopeKeys = ["language-cloud-sync-user", "language-cloud-sync-epoch", "fitness-cloud-sync-user", "fitness-cloud-sync-epoch", "languageRecordResetV1"] as const;
export type DailyRoutineCompletionIntent = Readonly<{ routineId: RoutineId; dateKey: string; scope: string }>;
export type DailyRoutineCompletionGuard = { signal?: AbortSignal; isCurrent?: () => boolean };
const isRoutineId = (value: unknown): value is RoutineId => typeof value === "string" && (ROUTINE_IDS as readonly string[]).includes(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const invalid = () => new Error("오늘 학습 기록의 형식을 확인하지 못했어요. 원본을 보존하고 저장을 멈췄습니다.");
const validDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function ids(value: unknown): RoutineId[] {
  if (!Array.isArray(value) || !value.every(isRoutineId)) throw invalid();
  return [...new Set(value)];
}
function parseRecord(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw invalid(); }
  if (!record(value)) throw invalid();
  return value;
}
const scope = (storage: Storage) => {
  const values = scopeKeys.map(key => storage.getItem(key));
  if (!values[0]?.trim() || values[0] !== values[2]) {
    throw new Error("학습 기록의 계정을 확인하지 못했어요. 로그인 상태를 확인하고 화면을 다시 열어 주세요.");
  }
  return JSON.stringify(values);
};

/** Capture once at completion, not again on retry. This is a local cache fence,
 * not authentication or a promise of cloud synchronization. */
export function captureDailyRoutineCompletion(routineId: RoutineId, dateKey = getLocalDateKey()): DailyRoutineCompletionIntent {
  if (!isRoutineId(routineId) || !validDay(dateKey)) throw invalid();
  return Object.freeze({ routineId, dateKey, scope: scope(window.localStorage) });
}

/** Strict reads are intentional: malformed records must not become empty writes. */
export function getTodayRoutineCompletedIds(todayKey: string): RoutineId[] {
  const progress = parseRecord(window.localStorage.getItem(DAILY_ROUTINE_STORAGE_KEY));
  if (!progress) return [];
  if (!validDay(progress.date)) throw invalid();
  const completed = ids(progress.completedIds);
  return progress.date === todayKey ? completed : [];
}

export async function saveDailyRoutineCompletion(intent: DailyRoutineCompletionIntent, guard: DailyRoutineCompletionGuard = {}): Promise<void> {
  const storage = window.localStorage;
  const check = () => {
    if (guard.signal?.aborted) throw guard.signal.reason ?? new DOMException("Aborted", "AbortError");
    if (guard.isCurrent?.() === false || scope(storage) !== intent.scope) throw new Error("계정이나 학습 기록이 바뀌어 저장을 멈췄어요. 화면을 다시 열어 주세요.");
  };
  if (!isRoutineId(intent.routineId) || !validDay(intent.dateKey)) throw invalid();
  check();
  await withLanguageRecordLock(() => {
    check();
    recoverLanguageStorage(storage);
    check();
    // Read BOTH originals before preparing any changes.
    const progressRaw = storage.getItem(DAILY_ROUTINE_STORAGE_KEY);
    const historyRaw = storage.getItem(DAILY_LEARNING_HISTORY_STORAGE_KEY);
    const progress = parseRecord(progressRaw);
    const history = parseRecord(historyRaw) ?? {};
    if (progress && !validDay(progress.date)) throw invalid();
    const progressIds = progress ? ids(progress.completedIds) : [];
    const item = Object.hasOwn(history, intent.dateKey) ? history[intent.dateKey] : undefined;
    if (item !== undefined && !record(item)) throw invalid();
    const previous = (item ?? {}) as Record<string, unknown>;
    const hasIds = Object.hasOwn(previous, "completedIds");
    const historyIds = hasIds ? ids(previous.completedIds) : [];
    // Count-only legacy records are valid; never invent the identities they omit.
    if (item !== undefined && !hasIds && !Object.hasOwn(previous, "completedCount")) throw invalid();
    for (const key of ["completedCount", "totalCount"]) {
      if (Object.hasOwn(previous, key) && (!Number.isSafeInteger(previous[key]) || Number(previous[key]) < 0)) throw invalid();
    }
    if (Object.hasOwn(previous, "updatedAt") && (typeof previous.updatedAt !== "string" || !Number.isFinite(Date.parse(previous.updatedAt)))) throw invalid();
    const union = [...new Set([... (progress?.date === intent.dateKey ? progressIds : []), ...historyIds, intent.routineId])];
    const changes: Record<string, string> = {};
    // A delayed completion belongs only to its captured day. Never overwrite a
    // newer progress day or carry yesterday's IDs into today's progress.
    const today = getLocalDateKey();
    if (intent.dateKey > today) throw invalid();
    const updateProgress = progress?.date === intent.dateKey || (intent.dateKey === today && (!progress || String(progress.date) < intent.dateKey));
    if (updateProgress) {
      const next = JSON.stringify({ ...progress, date: intent.dateKey, completedIds: union });
      if (progress?.date !== intent.dateKey || JSON.stringify(progressIds) !== JSON.stringify(union)) changes[DAILY_ROUTINE_STORAGE_KEY] = next;
    }
    const completedCount = Math.max(Number(previous.completedCount ?? 0), union.length);
    if (!item || !hasIds || JSON.stringify(historyIds) !== JSON.stringify(union) || previous.completedCount !== completedCount || previous.totalCount === undefined) {
      changes[DAILY_LEARNING_HISTORY_STORAGE_KEY] = JSON.stringify({ ...history, [intent.dateKey]: { ...previous, completedIds: union, completedCount, totalCount: previous.totalCount ?? ROUTINE_IDS.length, updatedAt: new Date().toISOString() } });
    }
    check();
    if (Object.keys(changes).length) writeLanguageStorageBatch(storage, changes);
  }, guard.signal);
  // The IDB completion event is asynchronous: do not report stale UI success.
  // A failure here can follow an already-committed local batch.
  check();
}

/** Compatibility only. Callers MUST await, and retries must use a captured intent. */
export function markTodayRoutineCompleted(routineId: RoutineId): Promise<void> {
  return saveDailyRoutineCompletion(captureDailyRoutineCompletion(routineId));
}
