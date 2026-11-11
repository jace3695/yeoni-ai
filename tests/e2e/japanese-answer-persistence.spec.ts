import { test, expect, login, canonical, type State } from './fixture';
import { getChunkLesson } from '../../data/japaneseChunkLessons';
import { chunkLessonInfo } from '../../utils/japaneseChunkCatalog';
import { CHUNK_REVIEW_KEY, parseChunkReview } from '../../utils/japaneseChunkReview';
import { LEVEL_JOURNEY_KEY, emptyLevelJourney } from '../../utils/japaneseLevelJourney';
import { JAPANESE_COURSE_GAP_CHUNKS } from '../../data/japaneseCourseGapChunks';

test('seven Japanese chunk answers persist through real preparation UI, reload and relogin without changing unrelated records', async ({ page, qa }) => {
  const original = getChunkLesson('upper-01');
  expect(original).toBeDefined(); expect(JAPANESE_COURSE_GAP_CHUNKS).toHaveLength(6);
  const lessons = [original!, ...JAPANESE_COURSE_GAP_CHUNKS];
  expect(new Set(lessons.map(lesson => lesson.lessonId)).size).toBe(7);
  for (const lesson of lessons) {
    expect(getChunkLesson(lesson.lessonId)).toEqual(lesson);
    expect(lesson.questions[0].kind).toBe('meaning');
    expect(lesson.questions[0].choices[lesson.questions[0].answer]).toBeTruthy();
  }
  const beforeFitness = await qa.read();
  const before: State = { ...await qa.readLanguage(), [LEVEL_JOURNEY_KEY]: JSON.stringify({
    ...emptyLevelJourney(), practicedUnits: { 'ci-preserved-unit': '2001-01-02T00:00:00.000Z' },
  }) };
  expect(before).not.toHaveProperty(CHUNK_REVIEW_KEY);
  const seeded = await qa.account.client.from('language_user_state').update({ state: before }).eq('user_id', qa.account.id).select('state').single();
  expect(seeded.error).toBeNull(); expect(seeded.data?.state).toEqual(before);
  const synced = () => expect(page.getByText('학습 기록 · 서버 저장 확인', { exact: true })).toBeVisible();
  const events = (state: State) => Object.values(parseChunkReview(state[CHUNK_REVIEW_KEY]).events);
  await login(page, qa.account, '/language/chunk-review'); await synced();
  await expect(page.getByRole('button', { name: '저장한 전체 0문제', exact: true })).toBeVisible();
  for (const [index, lesson] of lessons.entries()) {
    const question = lesson.questions[0];
    await page.getByRole('button', { name: '자유 재연습', exact: true }).click();
    await page.getByRole('button', { name: `${chunkLessonInfo(lesson.lessonId).title} 표현부터 자유 연습`, exact: true }).click();
    const practice = page.getByRole('region', { name: '표현 조각 보충연습', exact: true });
    await practice.getByRole('button', { name: '조각별 뜻과 역할 보기', exact: true }).click();
    await practice.getByRole('button', { name: '단어·시제 바꾼 예문 보기', exact: true }).click();
    await practice.getByRole('button', { name: '선택 문제 시작', exact: true }).click();
    // Use the existing lesson's answer semantics, without copying text or seeding answers.
    const startedAt = Date.now();
    await practice.getByRole('button', { name: question.choices[question.answer], exact: true }).click();
    await expect(practice.getByText('맞게 골랐어요.', { exact: true })).toBeVisible();
    await expect(practice.getByText('이 답을 이 기기의 보충복습 기록에 저장했어요.', { exact: true })).toBeVisible();
    await expect.poll(async () => events(await qa.readLanguage()).length).toBe(index + 1);
    await synced();
    const current = await qa.readLanguage();
    const answers = events(current).filter(answer => answer.lessonId === lesson.lessonId && answer.questionId === question.id);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ correct: true, neededHelp: true, mode: 'choice' });
    expect(answers[0].attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(answers[0].answeredAt)).toBeGreaterThanOrEqual(startedAt);
    expect(Date.parse(answers[0].answeredAt)).toBeLessThanOrEqual(Date.now());
    qa.traffic.assertLanguageConfirmed(current);
    await practice.getByRole('button', { name: '닫고 보충복습 목록으로', exact: true }).click();
  }
  const saved = await qa.readLanguage();
  expect(events(saved)).toHaveLength(7);
  expect(new Set(events(saved).map(answer => answer.attemptId)).size).toBe(7);
  expect(events(saved).map(answer => `${answer.lessonId}:${answer.questionId}`).sort()).toEqual(
    lessons.map(lesson => `${lesson.lessonId}:${lesson.questions[0].id}`).sort(),
  );
  const unrelated = Object.fromEntries(Object.entries(saved).filter(([key]) => key !== CHUNK_REVIEW_KEY));
  expect(canonical(unrelated)).toBe(canonical(before)); expect(await qa.read()).toEqual(beforeFitness);
  const restored = async () => {
    await synced();
    await page.getByRole('button', { name: '저장한 전체 7문제', exact: true }).click();
    for (const lesson of lessons) {
      const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: `${chunkLessonInfo(lesson.lessonId).title} · 뜻 고르기`, exact: true }) });
      await expect(card).toHaveCount(1);
      await expect(card.getByText('저장된 응답 1회 · 오답 0회 · 도움 포함 1회', { exact: true })).toBeVisible();
      await expect(card.getByText('최근 답: 정답 · 도움 포함', { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(key => localStorage.getItem(key), CHUNK_REVIEW_KEY)).toBe(saved[CHUNK_REVIEW_KEY]);
    expect(canonical(await qa.readLanguage())).toBe(canonical(saved)); expect(await qa.read()).toEqual(beforeFitness);
  };
  await restored(); await page.reload(); await restored();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), CHUNK_REVIEW_KEY)).toBeNull();
  await login(page, qa.account, '/language/chunk-review'); await restored();
});
