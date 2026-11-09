import { assertLanguageStorageReadable, recoverLanguageStorage, withLanguageRecordLock } from "../app/data/languageStorageLock.ts";
import { learningOwner, type JourneyStorage } from './japaneseLevelJourney.ts';

export const CHUNK_REVIEW_KEY = 'japaneseChunkReviewV1';
export const CHUNK_REVIEW_EVENT = 'yeoni-language-chunk-review-changed';
// Never silently prune an immutable history. Stop adding/merging before an
// unbounded document can exhaust storage; existing bytes remain recoverable.
export const MAX_CHUNK_REVIEW_EVENTS = 6000;
export const MAX_CHUNK_REVIEW_BYTES = 2_000_000;
export type ChunkAnswerInput = {
  lessonId: string; questionId: string; attemptId: string;
  correct: boolean; neededHelp: boolean; mode: 'choice' | 'audio' | 'reading';
};
export type ChunkAnswerEvent = ChunkAnswerInput & { answeredAt: string };
export type ChunkReviewState = { version: 1; generation: string | null; events: Record<string, ChunkAnswerEvent> };
export type ChunkReviewItem = ChunkAnswerEvent & {
  lastAttemptId: string; lastAnsweredAt: string; attempts: number;
  wrongAttempts: number; helpedAttempts: number; intervalDays: number;
  nextReviewAt: string; successDates: string[];
};
export const emptyChunkReview = (generation: string | null = null): ChunkReviewState => ({ version: 1, generation, events: {} });
const invalid = () => new Error('보충 오답 기록의 형식을 확인해 주세요. 기존 기록은 덮어쓰지 않고 보존합니다.');
const capacity = () => new Error('보충 오답 기록의 안전 저장 한도에 도달했어요. 기존 기록은 보존하며, 새 답은 저장하지 않았습니다.');
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value);
const fields = ['lessonId', 'questionId', 'attemptId', 'correct', 'neededHelp', 'mode', 'answeredAt'];
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const canonicalEvent = (event: ChunkAnswerEvent): ChunkAnswerEvent => ({
  lessonId: event.lessonId, questionId: event.questionId, attemptId: event.attemptId,
  correct: event.correct, neededHelp: event.neededHelp, mode: event.mode, answeredAt: event.answeredAt,
});
const canonicalState = (state: ChunkReviewState): ChunkReviewState => ({ version: 1, generation: state.generation,
  events: Object.fromEntries(Object.keys(state.events).sort(compare).map(key => [key, canonicalEvent(state.events[key])])),
});

function validateState(value: unknown): asserts value is ChunkReviewState {
  if (!object(value) || value.version !== 1 || !object(value.events)
    || !(value.generation === null || typeof value.generation === 'string' && value.generation.length <= 300 && Number.isFinite(Date.parse(value.generation.split('|')[0])))
    || Object.keys(value).some(key => !['version', 'generation', 'events'].includes(key))) throw invalid();
  if (Object.keys(value.events).length > MAX_CHUNK_REVIEW_EVENTS) throw capacity();
  for (const [key, event] of Object.entries(value.events)) {
    if (!object(event) || !id(key) || event.attemptId !== key || !id(event.lessonId) || !id(event.questionId)
      || typeof event.correct !== 'boolean' || typeof event.neededHelp !== 'boolean'
      || !['choice', 'audio', 'reading'].includes(String(event.mode))
      || typeof event.answeredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.answeredAt)
      || !Number.isFinite(Date.parse(event.answeredAt)) || new Date(event.answeredAt).toISOString() !== event.answeredAt
      || Object.keys(event).some(field => !fields.includes(field))) throw invalid();
  }
}

export function parseChunkReview(raw: unknown): ChunkReviewState {
  if (raw === undefined || raw === null) return emptyChunkReview();
  if (typeof raw !== 'string') throw invalid();
  // IDs and payloads are ASCII, but also bound malformed/non-ASCII input before parsing.
  if (new TextEncoder().encode(raw).byteLength > MAX_CHUNK_REVIEW_BYTES) throw capacity();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw invalid(); }
  validateState(value);
  return canonicalState(value);
}

function serialize(state: ChunkReviewState): string {
  validateState(state);
  const raw = JSON.stringify(canonicalState(state));
  if (new TextEncoder().encode(raw).byteLength > MAX_CHUNK_REVIEW_BYTES) throw capacity();
  return raw;
}

export function readChunkReview(storage: JourneyStorage): ChunkReviewState {
  assertLanguageStorageReadable(storage);
  const languageUser = storage.getItem('language-cloud-sync-user'), fitnessUser = storage.getItem('fitness-cloud-sync-user');
  if (languageUser && fitnessUser && languageUser !== fitnessUser) throw new Error('계정별 기록을 준비하고 있어요. 이전 계정의 보충 기록은 표시하지 않습니다.');
  const generation = storage.getItem('languageRecordResetV1');
  const raw = storage.getItem(CHUNK_REVIEW_KEY);
  const state = raw === null ? emptyChunkReview(generation) : parseChunkReview(raw);
  validateState(state);
  if (state.generation === generation) return state;
  if (compareChunkGenerations(generation, state.generation) > 0) return emptyChunkReview(generation);
  throw new Error('보충 오답의 초기화 기준이 맞지 않아요. 원본을 보존하고 저장을 멈췄습니다.');
}

/** Reset markers are explicit generations; event timestamps never imply a reset. */
export function compareChunkGenerations(a: string | null, b: string | null) {
  if ([a, b].some(value => value !== null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value.split('|')[0]))))) throw invalid();
  return (a === null ? 0 : Date.parse(a.split('|')[0])) - (b === null ? 0 : Date.parse(b.split('|')[0])) || compare(a ?? '', b ?? '');
}

/** Immutable event union. A baseline is evidence, never implicit deletion.
 * Unknown versions, conflicting IDs and oversized unions block synchronization
 * instead of choosing a whole document or fabricating a combined observation. */
export function mergeChunkReviewSnapshots(...snapshots: unknown[]): string {
  const parsed = snapshots.map(parseChunkReview);
  const generation = parsed.map(state => state.generation).sort(compareChunkGenerations).at(-1) ?? null;
  const events: Record<string, ChunkAnswerEvent> = {};
  for (const state of parsed.filter(item => item.generation === generation)) {
    for (const event of Object.values(state.events)) {
      const previous = Object.hasOwn(events, event.attemptId) ? events[event.attemptId] : undefined;
      if (previous && JSON.stringify(previous) !== JSON.stringify(event)) {
        throw new Error('동일한 보충 답안 번호의 내용이 서로 달라요. 두 기기의 원본 기록을 보존하고 동기화를 멈췄습니다.');
      }
      events[event.attemptId] = event;
    }
  }
  return serialize({ version: 1, generation, events });
}

export function rememberChunkAnswer(state: ChunkReviewState, input: ChunkAnswerInput, now = new Date()): ChunkReviewState {
  validateState(state);
  if (!Number.isFinite(now.getTime())) throw invalid();
  const event = canonicalEvent({ ...input, answeredAt: now.toISOString() });
  validateState({ version: 1, generation: state.generation, events: { [input.attemptId]: event } });
  const previous = Object.hasOwn(state.events, input.attemptId) ? state.events[input.attemptId] : undefined;
  if (previous) {
    // Retrying persistence later keeps the original observation time.
    if (fields.filter(key => key !== 'answeredAt').some(key => previous[key as keyof ChunkAnswerEvent] !== event[key as keyof ChunkAnswerEvent])) {
      throw new Error('이미 저장한 보충 답안을 다른 내용으로 바꿀 수 없어요. 기존 기록을 보존합니다.');
    }
    return state;
  }
  const tracked = Object.values(state.events).some(item => item.lessonId === input.lessonId && item.questionId === input.questionId);
  if (!tracked && input.correct && !input.neededHelp) return state;
  const next: ChunkReviewState = { version: 1, generation: state.generation, events: { ...state.events, [input.attemptId]: event } };
  serialize(next);
  return next;
}

/** Reread immediately before saving; never remove existing events through change.
 * A successful return verifies this browser's write, not a server acknowledgement. */
export async function writeChunkReview(storage: JourneyStorage & Pick<Storage, 'removeItem'>, expectedOwner: string, change: (latest: ChunkReviewState) => ChunkReviewState, signal?: AbortSignal): Promise<ChunkReviewState> {
  return withLanguageRecordLock(() => {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const assertOwner = () => { if (learningOwner(storage) !== expectedOwner) throw new Error('계정이나 기록이 바뀌었어요. 보충연습 화면을 다시 열어 주세요.'); };
    assertOwner();
    recoverLanguageStorage(storage);
    assertOwner();
    const before = readChunkReview(storage);
    const beforeRaw = serialize(before);
    const generation = before.generation;
    const changed = change(before);
    if (changed.generation !== generation) throw new Error('답안 저장으로 초기화 기준을 바꿀 수 없어요. 기존 기록을 보존합니다.');
    const nextRaw = mergeChunkReviewSnapshots(beforeRaw, serialize(changed), storage.getItem(CHUNK_REVIEW_KEY));
    assertOwner();
    if (nextRaw === beforeRaw && storage.getItem(CHUNK_REVIEW_KEY) === null) return parseChunkReview(beforeRaw);
    if (nextRaw !== storage.getItem(CHUNK_REVIEW_KEY)) {
      try { storage.setItem(CHUNK_REVIEW_KEY, nextRaw); }
      catch { throw new Error('이 기기에 보충 오답을 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 같은 답의 저장을 다시 시도해 주세요. 기존 기록은 보존합니다.'); }
    }
    assertOwner();
    const confirmed = storage.getItem(CHUNK_REVIEW_KEY);
    if (confirmed !== nextRaw) throw new Error('보충 오답 저장 결과가 달라졌어요. 같은 답의 저장을 다시 시도해 주세요.');
    return parseChunkReview(confirmed);
  }, signal);
}

/** One successful UTC day earns at most one interval step. Any wrong/assisted
 * observation that day keeps a one-day interval, even across competing devices.
 * This optional review never changes curriculum, level, or existing SRS scores. */
export function chunkReviewItems(state: ChunkReviewState): ChunkReviewItem[] {
  validateState(state);
  const groups = new Map<string, ChunkAnswerEvent[]>();
  for (const event of Object.values(state.events)) {
    const key = JSON.stringify([event.lessonId, event.questionId]);
    const group = groups.get(key) ?? [];
    group.push(event); groups.set(key, group);
  }
  const items: ChunkReviewItem[] = [];
  for (const events of groups.values()) {
    events.sort((a, b) => compare(a.answeredAt, b.answeredAt) || compare(a.attemptId, b.attemptId));
    let intervalDays = 1, nextReviewAt = '', successDates: string[] = [];
    const days = new Map<string, ChunkAnswerEvent[]>();
    for (const event of events) {
      const day = event.answeredAt.slice(0, 10);
      const group = days.get(day) ?? [];
      group.push(event); days.set(day, group);
    }
    for (const [day, attempts] of days) {
      const failures = attempts.filter(event => !event.correct || event.neededHelp);
      const lastFailure = failures.at(-1);
      if (lastFailure) { intervalDays = 1; successDates = []; }
      else {
        // Do not expand early review again before the existing due time.
        if (!nextReviewAt || attempts.some(event => event.answeredAt >= nextReviewAt)) {
          intervalDays = !nextReviewAt ? 1 : intervalDays < 3 ? 3 : intervalDays < 7 ? 7 : intervalDays < 14 ? 14 : 30;
          successDates = [...successDates, day];
        } else continue;
      }
      const anchor = lastFailure ?? attempts.find(event => !nextReviewAt || event.answeredAt >= nextReviewAt) ?? attempts[0];
      nextReviewAt = new Date(Date.parse(anchor.answeredAt) + intervalDays * 86_400_000).toISOString();
    }
    const last = events[events.length - 1];
    items.push({ ...last, lastAttemptId: last.attemptId, lastAnsweredAt: last.answeredAt,
      attempts: events.length, wrongAttempts: events.filter(event => !event.correct).length,
      helpedAttempts: events.filter(event => event.neededHelp).length, intervalDays, nextReviewAt, successDates });
  }
  return items.sort((a, b) => compare(a.nextReviewAt, b.nextReviewAt) || compare(a.lessonId, b.lessonId) || compare(a.questionId, b.questionId));
}

export function dueChunkReviews(state: ChunkReviewState, now = Date.now()): ChunkReviewItem[] {
  return chunkReviewItems(state).filter(item => Date.parse(item.nextReviewAt) <= now);
}
