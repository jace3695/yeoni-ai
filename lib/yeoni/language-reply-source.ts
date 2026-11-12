import { withLanguageRecordLock } from '../../app/data/languageStorageLock.ts';
import { CHUNK_REVIEW_KEY, compareChunkGenerations, parseChunkReview } from '../../utils/japaneseChunkReview.ts';
import { LEVEL_JOURNEY_KEY, readLevelJourney } from '../../utils/japaneseLevelJourney.ts';
import { replySource } from './record-reply-sources.ts';
import type { SourceSnapshot } from './generated-record-reply.ts';

export const LANGUAGE_GUIDANCE_KEYS = [
  'japaneseCurriculumProgressV1', 'japaneseCurriculumReviewV1', 'dailyRoutineProgress',
  'grammarProgress', 'savedWords', 'wrongWords', 'wrongKana', 'wrongKanaChars', 'reviewCompletedItemsByDate',
] as const;
export const LANGUAGE_REPLY_KEYS = [...LANGUAGE_GUIDANCE_KEYS, LEVEL_JOURNEY_KEY, CHUNK_REVIEW_KEY] as const;
const boundaryKeys = ['fitness-cloud-sync-user', 'language-cloud-sync-user', 'fitness-cloud-sync-epoch',
  'language-cloud-sync-epoch', 'languageRecordResetV1', 'yeoni-storage-transaction-v1', 'language-storage-transaction-v1'] as const;
const allKeys = [...boundaryKeys, ...LANGUAGE_REPLY_KEYS];
type ReadStorage = Pick<Storage, 'getItem'>;
export type LanguageReplySnapshot = { source: SourceSnapshot; state: 'ready' | 'loading' | 'error'; stillCurrent(): boolean };
const unavailable = (owner: string, state: 'loading' | 'error' = 'loading'): LanguageReplySnapshot => ({ source: { owner, app: 'language', records: null, complete: false }, state, stillCurrent: () => false });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function journeyInput(raw: string | null): unknown {
  if (raw === null) return null; // Absence is not evidence of beginner selection or no study.
  const value = readLevelJourney({ getItem: () => raw, setItem: () => { throw new Error('Read-only source'); } });
  const rootFields = ['version', 'selectedLevel', 'selectionUpdatedAt', 'updatedAt', 'answers', 'practicedUnits'];
  const answerFields = ['lessonId', 'questionId', 'lastAttemptId', 'lastAnsweredAt', 'correct', 'neededHelp', 'attempts', 'intervalDays', 'nextReviewAt', 'successDates'];
  if (Object.keys(value).some(key => !rootFields.includes(key))
    || Object.values(value.answers).some(answer => Object.keys(answer).some(key => !answerFields.includes(key)))
    || [value.updatedAt, value.selectionUpdatedAt].some(stamp => stamp !== undefined && (typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp))))) {
    throw new Error('Unsupported level source');
  }
  // These two root clocks reconcile writes/selection; they are not new study.
  // Actual answer, practice and review dates remain intact and affect the hash.
  return { version: value.version, selectedLevel: value.selectedLevel, answers: value.answers, practicedUnits: value.practicedUnits };
}

/** Non-mutating primitive for an already held language lock or synthetic tests.
 * The eleven-key analysis scope is explicit. This is not server authentication
 * or a durable revision for every language/app record. Never use it for dispatch.
 */
export function captureLanguageReplySnapshot(storage: ReadStorage, owner: string, ready: boolean): LanguageReplySnapshot {
  if (!owner || !ready) return unavailable(owner);
  try {
    const captured = Object.fromEntries(allKeys.map(key => [key, storage.getItem(key)]));
    if (captured['fitness-cloud-sync-user'] !== owner || captured['language-cloud-sync-user'] !== owner
      || captured['yeoni-storage-transaction-v1'] !== null || captured['language-storage-transaction-v1'] !== null) return unavailable(owner);
    const generation = captured.languageRecordResetV1;
    compareChunkGenerations(generation, null); // Validate, including malformed/empty markers.
    const records: Record<string, unknown> = { languageRecordResetV1: generation };
    for (const key of LANGUAGE_GUIDANCE_KEYS) {
      const raw = captured[key];
      const value: unknown = raw === null ? null : JSON.parse(raw);
      const expectsObject = key === 'japaneseCurriculumProgressV1' || key === 'dailyRoutineProgress';
      if (value !== null && (expectsObject ? !object(value) : !Array.isArray(value))) throw new Error('Invalid language source');
      if (raw !== null && value === null) throw new Error('Invalid stored null');
      records[key] = value;
    }
    records[LEVEL_JOURNEY_KEY] = journeyInput(captured[LEVEL_JOURNEY_KEY]);
    const chunkRaw = captured[CHUNK_REVIEW_KEY];
    if (chunkRaw === null) records[CHUNK_REVIEW_KEY] = null;
    else {
      const chunk = parseChunkReview(chunkRaw);
      const order = compareChunkGenerations(chunk.generation, generation);
      if (order > 0) throw new Error('Future chunk generation');
      // No current tracked events: use the same absence representation before
      // and after stale-key cleanup. The explicit reset remains a separate input.
      records[CHUNK_REVIEW_KEY] = order < 0 || Object.keys(chunk.events).length === 0 ? null : chunk;
    }
    const stillCurrent = () => {
      try { return allKeys.every(key => storage.getItem(key) === captured[key]); }
      catch { return false; }
    };
    if (!stillCurrent()) return unavailable(owner);
    const source = replySource(owner, 'language', records, true);
    return source.complete ? { source, state: 'ready', stillCurrent } : unavailable(owner, 'error');
  } catch { return unavailable(owner, 'error'); }
}

/** Uses the same serialization boundary as language writers, without recovery,
 * migration, storage writes, network requests, AI/TTS or a fallback on failure.
 */
export async function readLanguageReplySnapshot(storage: ReadStorage, owner: string, ready: boolean, signal?: AbortSignal): Promise<LanguageReplySnapshot> {
  if (!owner || !ready || signal?.aborted) return unavailable(owner);
  try {
    const snapshot = await withLanguageRecordLock(() => {
      if (signal?.aborted) return unavailable(owner);
      return captureLanguageReplySnapshot(storage, owner, ready);
    }, signal);
    if (signal?.aborted) return unavailable(owner);
    if (!snapshot.source.complete) return snapshot;
    return snapshot.stillCurrent() ? snapshot : unavailable(owner);
  } catch { return unavailable(owner, 'error'); }
}
