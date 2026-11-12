import type { Page } from '@playwright/test';
import { expect, canonical, type State } from './fixture';
import { CURRICULUM } from '../../data/curriculum';
import { CURRICULUM_PROGRESS_KEY, CURRICULUM_REVIEW_KEY, type CurriculumProgress, type CurriculumReviewItem } from '../../utils/curriculumProgress';
import { getSessionQuizIndices } from '../../utils/learningSession';
import { emptyLevelJourney, LEVEL_JOURNEY_KEY, type Qa, oldTime, uuid, persisted, localMatches } from './japanese-level-flow-state';
export { CURRICULUM_PROGRESS_KEY, CURRICULUM_REVIEW_KEY, LEVEL_JOURNEY_KEY, persisted, localMatches };
export const terminalPath = '/language/learn?lesson=f12&level=beginner';
export const terminal = CURRICULUM.find(lesson => lesson.id === 'f12')!;
export const indices = getSessionQuizIndices(terminal, 5);
export const historicalDraft = { version: 1, id: 'synthetic-retired-draft', lessonId: '__proto__', minutes: 5, mode: 'starter', stage: 0,
  wordIndex: 0, quizCursor: 0, answers: {}, firstAnswers: {}, responses: {}, speakingChecks: [false, false, false] };
export const historicalReview = { id: 'retired:0', lessonId: 'retired', lessonTitle: 'Synthetic history', prompt: 'Synthetic prompt',
  explanation: 'Synthetic explanation', wrongCount: 1, createdAt: oldTime, nextReviewAt: '2099-01-01T00:00:00.000Z', intervalDays: 30 };
// Explicitly historical fixture input, never new terminal-completion evidence.
export const historicalProgress = { completedLessonIds: ['f01'], quizScores: { f01: 67 }, selectedTrack: 'foundation', lastLessonId: 'f01',
  lessonAttempts: { f01: [{ score: 67, completedAt: oldTime, sessionId: 'synthetic-f01' }] }, activityDates: ['2001-01-02'],
  activeSession: historicalDraft, lessonDrafts: {}, kanaCompletedGroups: ['hiragana-0'], extension: { keep: 7 } };
export async function seedCurriculum(qa: Qa) {
  const before = await qa.readLanguage();
  const state = { ...before, integratedLearningSettingsV1: JSON.stringify({ ...JSON.parse(before.integratedLearningSettingsV1 as string),
    dailyMinutes: 5, includeSpeaking: false, autoPlayDialogue: false }),
    [LEVEL_JOURNEY_KEY]: JSON.stringify({ ...emptyLevelJourney(), practicedUnits: { 'retired-unit': oldTime } }),
    [CURRICULUM_PROGRESS_KEY]: JSON.stringify(historicalProgress), [CURRICULUM_REVIEW_KEY]: JSON.stringify([historicalReview]) };
  const seeded = await qa.account.client.from('language_user_state').update({ state }).eq('user_id', qa.account.id).select('state').single();
  expect(seeded.error).toBeNull(); expect(seeded.data?.state).toEqual(state);
  return state;
}
export async function curriculumSnapshot(page: Page) {
  return page.evaluate(({ progress, review }) => ({ raw: localStorage.getItem(progress)!, reviewRaw: localStorage.getItem(review)!, at: Date.now() }),
    { progress: CURRICULUM_PROGRESS_KEY, review: CURRICULUM_REVIEW_KEY });
}
export async function currentState(page: Page, before: State): Promise<State> {
  const snapshot = await curriculumSnapshot(page);
  return { ...before, [CURRICULUM_PROGRESS_KEY]: snapshot.raw, [CURRICULUM_REVIEW_KEY]: snapshot.reviewRaw };
}
export async function answerTerminal(page: Page) {
  const region = page.getByRole('region', { name: '집중 학습', exact: true });
  await expect(region.getByRole('heading', { level: 1, name: terminal.title, exact: true })).toBeVisible();
  await expect(region.getByText('약 5분', { exact: true })).toBeVisible();
  const completedBefore = JSON.parse((await curriculumSnapshot(page)).raw).completedLessonIds;
  expect(indices).toHaveLength(3);
  for (const index of indices) expect(terminal.quiz[index].kind).not.toBe('listening');
  for (const [index, word] of terminal.words.entries()) {
    await expect(region.getByText(`오늘의 표현 ${index + 1} / ${terminal.words.length}`, { exact: true })).toBeVisible();
    await expect(region.getByText(word.meaning, { exact: true })).toBeVisible();
    await region.getByRole('button', { name: index < terminal.words.length - 1 ? '다음 표현' : '다음으로', exact: true }).click();
  }
  await expect(region.getByRole('heading', { name: terminal.pattern.explanation, exact: true })).toBeVisible();
  await region.getByRole('button', { name: '다음으로', exact: true }).click();
  for (const [cursor, index] of indices.entries()) {
    const question = terminal.quiz[index];
    await expect(region.getByText(`확인 문제 ${cursor + 1} / ${indices.length}`, { exact: true })).toBeVisible();
    await region.getByRole('button', { name: question.choices[question.answer], exact: true }).click();
    await expect(region.getByText(`내 답: ${question.choices[question.answer]}`, { exact: true })).toBeVisible();
    if (cursor < indices.length - 1) await region.getByRole('button', { name: '다음 문제', exact: true }).click();
  }
  await expect.poll(async () => {
    const progress = JSON.parse((await curriculumSnapshot(page)).raw) as CurriculumProgress;
    return indices.every(index => progress.activeSession?.answers[index] === true);
  }).toBe(true);
  const progress = JSON.parse((await curriculumSnapshot(page)).raw) as CurriculumProgress;
  const draft = progress.activeSession!;
  expect(draft.id).toMatch(uuid); expect(draft.lessonId).toBe('f12'); expect(draft.minutes).toBe(5);
  expect(draft.stage).toBe(4); expect(draft.quizCursor).toBe(2);
  expect(draft.speakingChecks).toEqual([false, false, false]);
  for (const index of indices) {
    expect(draft.firstAnswers[index]).toBe(true); expect(draft.responses[index]).toBe(terminal.quiz[index].choices[terminal.quiz[index].answer]);
    expect(draft.observations?.[index]).toMatchObject({ modality: 'meaning', neededHelp: false });
  }
  expect(progress.completedLessonIds).toEqual(completedBefore);
  return draft;
}
export async function completeTerminal(page: Page, qa: Qa, before: State, fitness: State, previousIds: string[]) {
  // A repeated session may already have the unique f12 completion ID. Its newly
  // answered draft and the extra history entry, not that ID, prove the repeat.
  const previous = JSON.parse(before[CURRICULUM_PROGRESS_KEY] as string) as CurriculumProgress;
  const priorAttempts = previous.lessonAttempts.f12 ?? [];
  expect(priorAttempts.map(attempt => attempt.sessionId)).toEqual(previousIds);
  const startedAt = await page.evaluate(() => Date.now());
  const draft = JSON.parse((await curriculumSnapshot(page)).raw).activeSession;
  expect(draft.id).toMatch(uuid); expect(previousIds).not.toContain(draft.id);
  await page.getByRole('button', { name: '오늘 연습 저장하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '오늘의 연습을 저장했어요', exact: true })).toBeVisible();
  const snapshot = await curriculumSnapshot(page), progress = JSON.parse(snapshot.raw) as CurriculumProgress;
  expect(progress.completedLessonIds).toEqual(['f01', 'f12']); expect(progress.quizScores).toEqual({ f01: 67, f12: 100 });
  expect(progress.lessonAttempts?.f01).toEqual(historicalProgress.lessonAttempts.f01);
  const attempts = progress.lessonAttempts.f12;
  expect(attempts).toHaveLength(priorAttempts.length + 1);
  expect(attempts.slice(0, -1)).toEqual(priorAttempts);
  const attempt = attempts.at(-1)!;
  expect(attempt.score).toBe(100); expect(Date.parse(attempt.completedAt)).toBeGreaterThanOrEqual(startedAt);
  expect(Date.parse(attempt.completedAt)).toBeLessThanOrEqual(snapshot.at);
  expect(progress.lessonAttempts).toEqual({ ...previous.lessonAttempts,
    f12: [...priorAttempts, { score: 100, completedAt: attempt.completedAt, sessionId: draft.id }] });
  // Both timestamps come from the browser, whose timezone is pinned to Seoul.
  // The app samples the day inside the save handler. A midnight crossing may
  // legitimately add either boundary day, but never drop history or add both.
  expect(snapshot.at).toBeGreaterThanOrEqual(startedAt);
  expect(snapshot.at - startedAt).toBeLessThan(90_000);
  const localDay = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  const possibleDays = [...new Set([localDay(startedAt), localDay(snapshot.at)])];
  const expectedDates = possibleDays.map(day => [...new Set([...previous.activityDates, day])].sort());
  expect(expectedDates).toContainEqual(progress.activityDates);
  expect(progress.lessonDrafts).toEqual({ [historicalDraft.lessonId]: historicalDraft });
  expect(progress.activeSession).toEqual(historicalDraft); expect(progress.kanaCompletedGroups).toEqual(historicalProgress.kanaCompletedGroups);
  expect((progress as unknown as { extension: unknown }).extension).toEqual(historicalProgress.extension);
  const reviews = JSON.parse(snapshot.reviewRaw) as CurriculumReviewItem[];
  expect(reviews.find(item => item.id === historicalReview.id)).toEqual(historicalReview); expect(reviews).toHaveLength(4);
  for (const index of indices) expect(reviews.find(item => item.id === `f12:${index}`)).toMatchObject({
    lessonId: 'f12', lastSessionId: draft.id, lastSessionResult: true, wrongCount: 0, lastModality: 'meaning' });
  const saved: State = { ...before, [CURRICULUM_PROGRESS_KEY]: snapshot.raw, [CURRICULUM_REVIEW_KEY]: snapshot.reviewRaw };
  await persisted(page, qa, saved, fitness);
  expect(JSON.parse(saved[LEVEL_JOURNEY_KEY] as string).selectedLevel).toBe('beginner');
  await expect(page.getByText('자동으로 다음 단계로 넘어가지 않아요. 이 단계를 더 반복하거나 단계 화면에서 직접 다음 단계를 선택할 수 있어요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '다음 수업 보기', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '초급 더 반복하기', exact: true })).toHaveAttribute('href', '/language/levels?level=beginner');
  expect(canonical(await qa.read())).toBe(canonical(fitness));
  return { saved, sessionId: draft.id as string };
}
