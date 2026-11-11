import type { CourseTrack } from "@/data/curriculum";
import type { LearningSession } from "./learningSession";

export const CURRICULUM_PROGRESS_KEY = "japaneseCurriculumProgressV1";
export const CURRICULUM_REVIEW_KEY = "japaneseCurriculumReviewV1";

export type CurriculumReviewItem = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  prompt: string;
  explanation: string;
  createdAt: string;
  wrongCount?: number;
  lastWrongAt?: string;
  nextReviewAt?: string;
  intervalDays?: number;
  lastSessionId?: string;
  lastSessionResult?: boolean;
  lastResponseMs?: number;
  lastModality?: 'meaning' | 'listening' | 'typing';
  lastNeededHelp?: boolean;
  reviewCount?: number;
  successStreak?: number;
};

export type LessonAttempt = { score: number; completedAt: string; sessionId?: string };

export type CurriculumProgress = {
  completedLessonIds: string[];
  quizScores: Record<string, number>;
  lastLessonId?: string;
  selectedTrack: CourseTrack;
  updatedAt?: string;
  lessonAttempts: Record<string, LessonAttempt[]>;
  activityDates: string[];
  activeSession?: LearningSession;
  lessonDrafts?: Record<string, LearningSession>;
  kanaCompletedGroups?: string[];
};

export const DEFAULT_CURRICULUM_PROGRESS: CurriculumProgress = {
  completedLessonIds: [],
  quizScores: {},
  selectedTrack: "foundation",
  lessonAttempts: {},
  activityDates: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class CurriculumProgressError extends Error {
  readonly reason: 'invalid' | 'read' | 'stale';
  constructor(reason: 'invalid' | 'read' | 'stale') {
    super(reason === 'invalid'
      ? '기존 학습 기록의 형식을 확인하지 못했어요. 원본을 보존하고 저장을 멈췄습니다. 기록을 지우거나 초기화하지 말고 지원을 요청해 주세요.'
      : reason === 'read'
        ? '기존 학습 기록을 읽지 못했어요. 저장하지 않았습니다. 브라우저 저장소 설정을 확인한 뒤 다시 읽어 주세요. 기록은 초기화하지 마세요.'
        : '학습 기록이 다른 화면이나 동기화에서 바뀌었어요. 저장하지 않았습니다. 기존 기록을 지우지 말고 수업을 다시 열어 확인해 주세요.');
    this.name = 'CurriculumProgressError';
    this.reason = reason;
  }
}

export function curriculumProgressErrorMessage(error: unknown, fallback: string): string {
  return error instanceof CurriculumProgressError ? error.message : fallback;
}

const string = (value: unknown) => typeof value === 'string';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const strings = (value: unknown) => Array.isArray(value) && value.every(string);
const mapOf = (value: unknown, valid: (item: unknown) => boolean) => isRecord(value) && Object.values(value).every(valid);
const optional = (record: Record<string, unknown>, key: string, valid: (item: unknown) => boolean) =>
  !Object.prototype.hasOwnProperty.call(record, key) || valid(record[key]);

// Missing historical fields are supported. Present known fields are checked,
// never filtered or repaired. IDs and extension fields are not catalog-limited.
function validSession(value: unknown): boolean {
  if (!isRecord(value) || value.version !== 1 || !string(value.lessonId)
    || ![5, 10, 20].includes(value.minutes as number)
    || !['starter', 'reader'].includes(value.mode as string)) return false;
  const index = (item: unknown) => number(item) && Number.isInteger(item) && (item as number) >= 0;
  const answerMap = (item: unknown, valid: (answer: unknown) => boolean) => isRecord(item)
    && Object.entries(item).every(([key, answer]) => /^\d+$/.test(key) && valid(answer));
  return optional(value, 'id', item => string(item) && (item as string).length > 0 && (item as string).length <= 100)
    && optional(value, 'stage', item => index(item) && (item as number) <= 4)
    && optional(value, 'wordIndex', index) && optional(value, 'quizCursor', index)
    && ['answers', 'firstAnswers'].every(key => optional(value, key, item => answerMap(item, answer => typeof answer === 'boolean')))
    && optional(value, 'responses', item => answerMap(item, string))
    && optional(value, 'speakingChecks', item => Array.isArray(item) && item.every(check => typeof check === 'boolean'))
    && optional(value, 'observations', item => answerMap(item, observation => isRecord(observation)
      && optional(observation, 'responseMs', number)
      && optional(observation, 'neededHelp', item => typeof item === 'boolean')
      && optional(observation, 'modality', item => ['meaning', 'listening', 'typing'].includes(item as string))));
}

// JSON numeric overflow can occur even inside an unknown extension. Refuse it
// rather than serializing Infinity as null on the next otherwise-valid save.
function hasOnlyFiniteNumbers(value: unknown): boolean {
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'number' && !Number.isFinite(item)) return false;
    if (item !== null && typeof item === 'object') for (const child of Object.values(item)) pending.push(child);
  }
  return true;
}

export function parseCurriculumProgress(raw: string | null): CurriculumProgress {
  if (raw === null) return { ...DEFAULT_CURRICULUM_PROGRESS, completedLessonIds: [], quizScores: {}, lessonAttempts: {}, activityDates: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new CurriculumProgressError('invalid'); }
  if (!isRecord(value) || !hasOnlyFiniteNumbers(value)
    || !['completedLessonIds', 'activityDates', 'kanaCompletedGroups'].every(key => optional(value, key, strings))
    || !optional(value, 'quizScores', item => mapOf(item, number))
    || !['lastLessonId', 'updatedAt'].every(key => optional(value, key, string))
    || !optional(value, 'selectedTrack', item => ['foundation', 'work', 'travel'].includes(item as string))
    || !optional(value, 'lessonAttempts', item => mapOf(item, attempts => Array.isArray(attempts)
      && attempts.every(attempt => isRecord(attempt) && number(attempt.score) && string(attempt.completedAt)
        && optional(attempt, 'sessionId', string))))
    || !optional(value, 'activeSession', validSession)
    || !optional(value, 'lessonDrafts', item => isRecord(item)
      && Object.entries(item).every(([id, draft]) => validSession(draft) && (draft as LearningSession).lessonId === id))) {
    throw new CurriculumProgressError('invalid');
  }
  return { ...DEFAULT_CURRICULUM_PROGRESS, ...value } as CurriculumProgress;
}

// An enumerable symbol survives the existing object-spread update helpers but
// is never serialized. Compare exact bytes and owner/reset markers, not dates.
const snapshotKey = Symbol('curriculum-read-snapshot');
const contextKeys = ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1'] as const;
type Snapshot = { storage: Storage; raw: string | null; context: (string | null)[] };
type ReadProgress = CurriculumProgress & { [snapshotKey]?: Snapshot };
function readSnapshot(): Snapshot {
  try {
    const storage = window.localStorage;
    if (storage.getItem('language-storage-transaction-v1') !== null || storage.getItem('yeoni-storage-transaction-v1') !== null) throw new Error('Pending storage recovery');
    return { storage, raw: storage.getItem(CURRICULUM_PROGRESS_KEY), context: contextKeys.map(key => storage.getItem(key)) };
  } catch { throw new CurriculumProgressError('read'); }
}

export function loadCurriculumProgress(): CurriculumProgress {
  if (typeof window === 'undefined') return parseCurriculumProgress(null);
  const snapshot = readSnapshot();
  return { ...parseCurriculumProgress(snapshot.raw), [snapshotKey]: snapshot } as ReadProgress;
}

export function assertCurriculumProgressCurrent(progress: CurriculumProgress) {
  const expected = (progress as ReadProgress)[snapshotKey];
  const current = readSnapshot();
  parseCurriculumProgress(current.raw);
  if (!expected || expected.storage !== current.storage || expected.raw !== current.raw
    || expected.context.some((value, index) => value !== current.context[index])) throw new CurriculumProgressError('stale');
  return current;
}

/** A synchronous compare-before-write, not a cross-tab transaction or CAS. */
export function saveCurriculumProgress(progress: CurriculumProgress): CurriculumProgress {
  const serialized = JSON.stringify({ ...progress, updatedAt: new Date().toISOString() });
  const validated = parseCurriculumProgress(serialized);
  const snapshot = assertCurriculumProgressCurrent(progress);
  snapshot.storage.setItem(CURRICULUM_PROGRESS_KEY, serialized);
  return { ...validated, [snapshotKey]: { ...snapshot, raw: serialized } } as ReadProgress;
}
