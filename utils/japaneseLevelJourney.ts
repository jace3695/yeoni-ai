import { isJapaneseLevel, type JapaneseLevel } from '../data/japaneseLevels.ts';
import { reviewInterval } from './learningReview.ts';

export const LEVEL_JOURNEY_KEY = 'japaneseLevelJourneyV1';
export const LEVEL_JOURNEY_EVENT = 'yeoni-language-level-journey-changed';
const ownerKeys = ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1'];
export type JourneyStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type UpperAnswerRecord = {
  lessonId: string; questionId: string; lastAttemptId: string; lastAnsweredAt: string;
  correct: boolean; neededHelp: boolean; attempts: number; intervalDays: number;
  nextReviewAt: string; successDates: string[];
};
export type LevelJourney = {
  version: 1; selectedLevel: JapaneseLevel; selectionUpdatedAt?: string; updatedAt?: string;
  answers: Record<string, UpperAnswerRecord>;
  practicedUnits: Record<string, string>;
};
export const emptyLevelJourney = (): LevelJourney => ({ version: 1, selectedLevel: 'beginner', answers: {}, practicedUnits: {} });
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function learningOwner(storage: JourneyStorage): string {
  return JSON.stringify(ownerKeys.map(key => storage.getItem(key)));
}

export function readLevelJourney(storage: JourneyStorage): LevelJourney {
  const raw = storage.getItem(LEVEL_JOURNEY_KEY);
  if (raw === null) return emptyLevelJourney();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('단계별 학습 기록을 읽지 못했어요. 기존 기록을 덮어쓰지 않고 보존합니다.'); }
  if (!record(value) || value.version !== 1 || !isJapaneseLevel(value.selectedLevel) || !record(value.answers) || !record(value.practicedUnits)) {
    throw new Error('단계별 학습 기록의 형식을 확인해 주세요. 기존 기록을 덮어쓰지 않고 보존합니다.');
  }
  if (value.selectionUpdatedAt !== undefined && !validDate(value.selectionUpdatedAt)) throw new Error('단계 선택 기록을 읽지 못했어요. 기존 기록은 보존합니다.');
  for (const [key, item] of Object.entries(value.answers)) {
    if (!record(item) || item.questionId !== key || typeof item.lessonId !== 'string' || typeof item.lastAttemptId !== 'string'
      || !validDate(item.lastAnsweredAt) || !validDate(item.nextReviewAt) || typeof item.correct !== 'boolean' || typeof item.neededHelp !== 'boolean'
      || !Number.isInteger(item.attempts) || Number(item.attempts) < 1 || !Number.isFinite(item.intervalDays) || Number(item.intervalDays) < 1 || Number(item.intervalDays) > 30
      || !Array.isArray(item.successDates) || item.successDates.some(day => typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day))) {
      throw new Error('복습 기록 일부를 읽지 못했어요. 기존 기록을 보존하므로 저장하지 않았습니다.');
    }
  }
  if (Object.values(value.practicedUnits).some(item => !validDate(item))) throw new Error('단원 기록을 읽지 못했어요. 기존 기록은 보존합니다.');
  return value as LevelJourney;
}

// Every event rereads the latest state. Selection and study records are separate
// operations; completing any number of lessons can never promote the learner.
export function writeLevelJourney(storage: JourneyStorage, expectedOwner: string, change: (latest: LevelJourney) => LevelJourney, now = new Date()): LevelJourney {
  if (learningOwner(storage) !== expectedOwner) throw new Error('계정이나 기록이 바뀌었어요. 화면을 다시 열어 주세요.');
  const next = { ...change(readLevelJourney(storage)), updatedAt: now.toISOString() };
  if (learningOwner(storage) !== expectedOwner) throw new Error('학습 기록이 바뀌어 저장을 멈췄어요. 화면을 다시 열어 주세요.');
  storage.setItem(LEVEL_JOURNEY_KEY, JSON.stringify(next));
  return next;
}

export function chooseJapaneseLevel(state: LevelJourney, level: JapaneseLevel, now = new Date()): LevelJourney {
  if (!isJapaneseLevel(level)) throw new Error('선택할 학습 단계를 확인해 주세요.');
  return { ...state, selectedLevel: level, selectionUpdatedAt: now.toISOString() };
}

export function rememberUpperAnswer(state: LevelJourney, input: {
  lessonId: string; questionId: string; attemptId: string; correct: boolean; neededHelp: boolean;
}, now = new Date()): LevelJourney {
  const previous = state.answers[input.questionId];
  if (previous?.lastAttemptId === input.attemptId) return state;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const independent = input.correct && !input.neededHelp;
  const sameDay = previous && new Date(previous.lastAnsweredAt).toDateString() === now.toDateString();
  const intervalDays = !independent ? 1 : sameDay ? Math.max(1, previous.intervalDays) : reviewInterval(previous?.intervalDays, true, { neededHelp: false, modality: 'meaning' });
  const nextReviewAt = sameDay && independent && previous.correct && !previous.neededHelp ? previous.nextReviewAt : new Date(now.getTime() + intervalDays * 86_400_000).toISOString();
  const answer: UpperAnswerRecord = {
    lessonId: input.lessonId, questionId: input.questionId, lastAttemptId: input.attemptId, lastAnsweredAt: now.toISOString(),
    correct: input.correct, neededHelp: input.neededHelp, attempts: Math.min(10_000, (previous?.attempts ?? 0) + 1), intervalDays, nextReviewAt,
    successDates: independent ? [...new Set([...(previous?.successDates ?? []), day])].slice(-30) : [],
  };
  return { ...state, answers: { ...state.answers, [input.questionId]: answer } };
}

export function upperAnswerStable(answer: UpperAnswerRecord) {
  return answer.correct && !answer.neededHelp && new Set(answer.successDates).size >= 3 && answer.intervalDays >= 7;
}

export function dueUpperAnswers(state: LevelJourney, now = Date.now()) {
  return Object.values(state.answers).filter(item => Date.parse(item.nextReviewAt) <= now)
    .sort((a, b) => Number(a.correct) - Number(b.correct) || a.nextReviewAt.localeCompare(b.nextReviewAt));
}

const missingJourneyField = Symbol('missing journey field');
const journeyFields = new Set(['version', 'selectedLevel', 'selectionUpdatedAt', 'updatedAt', 'answers', 'practicedUnits']);
const extensionConflict = () => new Error('단계별 학습의 추가 기록이 서로 달라요. 두 기기의 원본 기록을 보존하고 동기화를 멈췄습니다.');

// Parsed JSON can contain nonfinite numbers (for example 1e400) or negative
// zero. Do not turn accepted opaque values into null/zero while merging.
function assertJourneyJsonSerializable(value: unknown): void {
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
    throw new Error('단계별 학습 기록을 손실 없이 저장할 수 없어 동기화를 멈췄습니다. 원본 기록은 보존합니다.');
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertJourneyJsonSerializable(item);
  }
}

function sameJourneyJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((item, index) => sameJourneyJson(item, b[index]));
  if (!record(a) || !record(b)) return false;
  return Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every(key => Object.hasOwn(b, key) && sameJourneyJson(a[key], b[key]));
}

const ownJourneyField = (value: Record<string, unknown>, key: string): unknown => Object.hasOwn(value, key) ? value[key] : missingJourneyField;

/** Unknown fields have no timestamp/winner contract. Preserve agreed and
 * disjoint changes, but never interpret a lone omission by an old client as
 * deletion. Both incoming sides may omit a field without reviving the base.
 * Arrays are opaque values, not sets or independent answer observations. */
function mergeJourneyExtension(base: unknown, remote: unknown, local: unknown): unknown {
  if (sameJourneyJson(remote, local)) return remote;
  if (base !== missingJourneyField && (remote === missingJourneyField || local === missingJourneyField)) throw extensionConflict();
  if (record(remote) && record(local) && (record(base) || base === missingJourneyField)) {
    const original = record(base) ? base : {};
    const entries: [string, unknown][] = [];
    for (const key of new Set([...Object.keys(original), ...Object.keys(remote), ...Object.keys(local)])) {
      const value = mergeJourneyExtension(ownJourneyField(original, key), ownJourneyField(remote, key), ownJourneyField(local, key));
      if (value !== missingJourneyField) entries.push([key, value]);
    }
    return Object.fromEntries(entries);
  }
  if (sameJourneyJson(local, base)) return remote;
  if (sameJourneyJson(remote, base)) return local;
  throw extensionConflict();
}

/** Merge independent question/unit updates, never a whole JSON-string winner.
 * A conflicting answer uses the latest complete observation; fields from two
 * attempts are not combined into fictitious mastery. Explicit selection has
 * its own clock, so merely answering a question cannot change another device's
 * chosen level. Equal clocks use a stable tie-break, independent of device side.
 */
export function mergeLevelJourneySnapshots(baseRaw: unknown, remoteRaw: string, localRaw: string): string {
  const parse = (raw: unknown) => raw === undefined ? emptyLevelJourney() : readLevelJourney({ getItem: () => {
    if (typeof raw !== 'string') throw new Error('동기화된 학습 기록의 형식을 확인해 주세요.');
    return raw;
  }, setItem: () => { throw new Error('Read-only merge'); } });
  const base = parse(baseRaw), remote = parse(remoteRaw), local = parse(localRaw);
  [base, remote, local].forEach(assertJourneyJsonSerializable);
  const extensions: [string, unknown][] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])) {
    if (journeyFields.has(key)) continue;
    const value = mergeJourneyExtension(ownJourneyField(base, key), ownJourneyField(remote, key), ownJourneyField(local, key));
    if (value !== missingJourneyField) extensions.push([key, value]);
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const latest = <T,>(a: T, b: T, stamp: (item: T) => string) => {
    const difference = Date.parse(stamp(a)) - Date.parse(stamp(b));
    return difference > 0 ? a : difference < 0 ? b : JSON.stringify(a).localeCompare(JSON.stringify(b)) >= 0 ? a : b;
  };
  const answerEntries: [string, UpperAnswerRecord][] = [];
  const ownAnswer = (state: LevelJourney, id: string) => Object.hasOwn(state.answers, id) ? state.answers[id] : undefined;
  for (const id of new Set([...Object.keys(remote.answers), ...Object.keys(local.answers)])) {
    const r = ownAnswer(remote, id), l = ownAnswer(local, id), b = ownAnswer(base, id);
    const answer = !r ? l : !l ? r : same(l, b) ? r : same(r, b) ? l : latest(r, l, item => item.lastAnsweredAt);
    if (answer) answerEntries.push([id, answer]);
  }
  const answers: LevelJourney['answers'] = Object.fromEntries(answerEntries);
  const practiceEntries: [string, string][] = [];
  for (const id of new Set([...Object.keys(remote.practicedUnits), ...Object.keys(local.practicedUnits)])) {
    const r = Object.hasOwn(remote.practicedUnits, id) ? remote.practicedUnits[id] : undefined;
    const l = Object.hasOwn(local.practicedUnits, id) ? local.practicedUnits[id] : undefined;
    const date = !r ? l : l && Date.parse(l) > Date.parse(r) ? l : r;
    if (date) practiceEntries.push([id, date]);
  }
  const practicedUnits: LevelJourney['practicedUnits'] = Object.fromEntries(practiceEntries);
  const selection = (state: LevelJourney) => ({ selectedLevel: state.selectedLevel, selectionUpdatedAt: state.selectionUpdatedAt });
  const remoteChoice = selection(remote), localChoice = selection(local), baseChoice = selection(base);
  const chosen = same(localChoice, baseChoice) ? remoteChoice : same(remoteChoice, baseChoice) ? localChoice : latest(remoteChoice, localChoice, item => item.selectionUpdatedAt ?? '1970-01-01T00:00:00Z');
  const updatedAt = [remote.updatedAt, local.updatedAt].filter(validDate).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
  return JSON.stringify({ version: 1, ...chosen, answers, practicedUnits, ...(updatedAt ? { updatedAt } : {}), ...Object.fromEntries(extensions) });
}
