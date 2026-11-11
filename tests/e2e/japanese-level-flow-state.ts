import type { Page } from '@playwright/test';
import { expect, canonical, login, type State, type Traffic } from './fixture';
import { LEVEL_JOURNEY_KEY, readLevelJourney, type UpperAnswerRecord } from '../../utils/japaneseLevelJourney';
export { LEVEL_JOURNEY_KEY, emptyLevelJourney } from '../../utils/japaneseLevelJourney';
export { getJapaneseReadingLesson } from '../../data/japaneseReadingLessons';
export { CURRICULUM_PROGRESS_KEY } from '../../utils/curriculumProgress';
export { CURRICULUM } from '../../data/curriculum';
export type { LevelJourney } from '../../utils/japaneseLevelJourney';
export type Qa = { account: Parameters<typeof login>[1]; traffic: Traffic; read: () => Promise<State>; readLanguage: () => Promise<State> };
export const oldTime = '2001-01-02T00:00:00.000Z';
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Explicitly synthetic historical inputs, never claims that UI answers were performed.
// Date.now / the application clock is not replaced and no new outcome is seeded.
export const historicalAnswer = (lessonId: string, questionId: string, future = false): UpperAnswerRecord => ({
  lessonId, questionId, lastAttemptId: `synthetic-history:${questionId}`, lastAnsweredAt: oldTime,
  correct: false, neededHelp: false, attempts: 1, intervalDays: 1,
  nextReviewAt: future ? '2099-01-01T00:00:00.000Z' : '2001-01-03T00:00:00.000Z', successDates: [],
});
export const synced = (page: Page) => expect(page.getByText('학습 기록 · 서버 저장 확인', { exact: true })).toBeVisible();
export async function journeySnapshot(page: Page) {
  const snapshot = await page.evaluate(key => ({ raw: localStorage.getItem(key), at: Date.now() }), LEVEL_JOURNEY_KEY);
  expect(snapshot.raw).not.toBeNull();
  const journey = readLevelJourney({ getItem: () => snapshot.raw, setItem: () => { throw new Error('Read-only snapshot'); } });
  return { raw: snapshot.raw!, at: snapshot.at, journey };
}
export async function localMatches(page: Page, expected: State) {
  const actual = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(expected));
  expect(canonical(actual)).toBe(canonical(expected));
}
export async function persisted(page: Page, qa: Qa, expected: State, fitness: State) {
  await localMatches(page, expected);
  await expect.poll(async () => canonical(await qa.readLanguage())).toBe(canonical(expected));
  await expect.poll(() => qa.traffic.entries.some(entry => entry.table === 'language_user_state' && entry.method === 'GET'
    && entry.status === 200 && entry.delivered && entry.receivedState && canonical(entry.receivedState) === canonical(expected))).toBe(true);
  await synced(page); qa.traffic.assertLanguageConfirmed(expected);
  expect(await qa.read()).toEqual(fitness);
}
export function observeSilentReading(page: Page) {
  let ttsRequests = 0;
  page.context().on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:3000' && url.pathname === '/api/language/tts') ttsRequests++;
  });
  return () => expect(ttsRequests, 'No same-origin TTS requests during level verification').toBe(0);
}
export const writeCount = (qa: Qa) => qa.traffic.entries.filter(entry => entry.table === 'language_user_state' && entry.method !== 'GET').length;
