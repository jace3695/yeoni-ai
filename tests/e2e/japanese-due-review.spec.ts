import { test, expect, login, canonical, type State } from './fixture';
import { LEVEL_JOURNEY_KEY, emptyLevelJourney, getJapaneseReadingLesson, historicalAnswer, oldTime, uuid, journeySnapshot, localMatches, persisted, restoredLevelJourney, synced, observeSilentReading, writeCount, type LevelJourney } from './japanese-level-flow-state';
test('synthetic overdue reading subset keeps its queue and saves helped repeats without completing the full unit', async ({ page, qa }) => {
  const silent = observeSilentReading(page);
  const lesson = getJapaneseReadingLesson('middle-core-01')!; const foreign = getJapaneseReadingLesson('upper-core-01')!;
  const queue = [lesson.questions[0], lesson.questions[2]];
  const records = [...queue.map(question => historicalAnswer(lesson.id, question.id)), historicalAnswer(lesson.id, lesson.questions[1].id, true),
    historicalAnswer(foreign.id, foreign.questions[0].id), historicalAnswer('retired-unit', 'retired-q')];
  const prior: LevelJourney = { ...emptyLevelJourney(), selectedLevel: 'intermediate', selectionUpdatedAt: oldTime,
    answers: Object.fromEntries(records.map(record => [record.questionId, record])), practicedUnits: { 'retired-unit': oldTime } };
  let fitness: State; let saved: State; let expectedAnswers = { ...prior.answers };
  const sessions = new Set<string>(); const path = `/language/levels?lesson=${lesson.id}&review=1`;
  const listing = () => page.getByRole('region', { name: '중급 학습 안내', exact: true });
  const dueLink = () => page.getByRole('link', { name: `${lesson.title} · 예정된 2문제 복습`, exact: true });
  const questionRegion = () => page.getByRole('region', { name: '읽기 확인 문제', exact: true });
  const fixedQueue = async () => { await expect(page.getByRole('region', { name: '예정 복습 진행', exact: true }).getByText('예정 복습 · 이번 큐 2문제', { exact: true })).toBeVisible(); };
  const unchanged = async () => { await localMatches(page, saved); expect(canonical(await qa.readLanguage())).toBe(canonical(saved)); expect(await qa.read()).toEqual(fitness); };
  const preserved = (journey: LevelJourney) => {
    expect(journey.selectedLevel).toBe('intermediate'); expect(journey.selectionUpdatedAt).toBe(oldTime);
    expect(journey.answers).toEqual(expectedAnswers); expect(journey.practicedUnits).toEqual(prior.practicedUnits);
    expect(journey.practicedUnits).not.toHaveProperty(lesson.id);
    for (const id of [lesson.questions[1].id, foreign.questions[0].id, 'retired-q']) expect(journey.answers[id]).toEqual(prior.answers[id]);
    expect(Object.keys(journey.answers).sort()).toEqual(Object.keys(prior.answers).sort());
  };
  const answerQueue = async (repeat: boolean) => {
    let session = '';
    for (const [index, question] of queue.entries()) {
      await fixedQueue();
      const region = questionRegion();
      await expect(region.getByRole('heading', { level: 2, name: question.prompt, exact: true })).toBeVisible();
      await expect(region.getByText(`문제 ${index + 1} / 2 · 본문 확인`, { exact: true })).toBeVisible();
      await expect(region.getByRole('status')).toHaveCount(0);
      await expect(region.getByRole('region', { name: '본문 정답 근거', exact: true })).toHaveCount(0);
      const next = region.getByRole('button', { name: index === 0 ? '다음 문제' : '복습 마치기', exact: true }); await expect(next).toBeDisabled();
      const previous = expectedAnswers[question.id]; const startedAt = Date.now();
      await region.getByRole('button', { name: question.choices[question.answer], exact: true }).click();
      const feedback = region.getByRole('status');
      await expect(feedback.getByText('맞게 골랐어요.', { exact: true })).toBeVisible();
      await expect(feedback.getByText(`정답: ${question.choices[question.answer]}`, { exact: true })).toBeVisible();
      await expect(feedback.getByText(question.explanation, { exact: true })).toBeVisible();
      await expect(feedback.getByText('이 답을 복습 기록에 저장했어요.', { exact: true })).toBeVisible();
      await expect(region.getByRole('region', { name: '본문 정답 근거', exact: true })).toBeVisible();
      for (const choice of question.choices) await expect(region.getByRole('button', { name: choice, exact: true })).toBeDisabled();
      const current = await journeySnapshot(page); const answer = current.journey.answers[question.id];
      expect(answer).toMatchObject({ lessonId: lesson.id, questionId: question.id, correct: true, neededHelp: repeat,
        attempts: repeat ? 3 : 2, intervalDays: repeat ? 1 : 3 });
      expect(answer.lastAttemptId).not.toBe(previous.lastAttemptId); expect(answer.lastAttemptId.endsWith(`:${question.id}`)).toBe(true);
      const prefix = answer.lastAttemptId.slice(0, -question.id.length - 1); expect(prefix).toMatch(uuid);
      if (index === 0) { expect(sessions.has(prefix)).toBe(false); sessions.add(prefix); session = prefix; }
      expect(prefix).toBe(session);
      expect(Date.parse(answer.lastAnsweredAt)).toBeGreaterThanOrEqual(startedAt); expect(Date.parse(answer.lastAnsweredAt)).toBeLessThanOrEqual(current.at);
      expect(Date.parse(answer.nextReviewAt)).toBe(Date.parse(answer.lastAnsweredAt) + (repeat ? 1 : 3) * 86_400_000);
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(answer.lastAnsweredAt));
      expect(answer.successDates).toEqual(repeat ? [] : [day]);
      expectedAnswers = { ...expectedAnswers, [question.id]: answer }; preserved(current.journey);
      saved = { ...saved, [LEVEL_JOURNEY_KEY]: current.raw }; await persisted(page, qa, saved, fitness);
      // Saving moves this answer's due date, but the current queue and feedback stay mounted.
      await fixedQueue(); await expect(region.getByRole('heading', { name: question.prompt, exact: true })).toBeVisible();
      await expect(next).toBeEnabled(); await next.click();
    }
    await expect(page.getByRole('region', { name: '연습 마침', exact: true }).getByRole('heading', { name: '이번 복습을 마쳤어요', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '서면 표현 자기점검', exact: true })).toHaveCount(0);
    preserved((await journeySnapshot(page)).journey); await unchanged();
  };
  try {
    await test.step('synthetic due setup', async () => {
      expect(queue.map(question => question.id)).toEqual(['middle-core-01-q1', 'middle-core-01-q3']);
      expect(Date.now()).toBeGreaterThan(Date.parse('2001-01-03T00:00:00.000Z'));
      expect(Date.now()).toBeLessThan(Date.parse('2099-01-01T00:00:00.000Z'));
      fitness = await qa.read(); saved = { ...await qa.readLanguage(), [LEVEL_JOURNEY_KEY]: JSON.stringify(prior) };
      // Only the documented old/future subset is seeded before login. All four new answers use UI.
      const seeded = await qa.account.client.from('language_user_state').update({ state: saved }).eq('user_id', qa.account.id).select('state').single();
      expect(seeded.error).toBeNull(); expect(seeded.data?.state).toEqual(saved);
      await login(page, qa.account, '/language/levels?level=intermediate'); await synced(page); await expect(listing()).toBeVisible(); await unchanged();
    });
    await test.step('all and current level due scope', async () => {
      const writes = writeCount(qa);
      await expect(page.getByText('전체 단계 예정 복습: 3문제 · 전체 3문제', { exact: true })).toBeVisible();
      await expect(dueLink()).toBeVisible();
      const foreignLink = page.getByRole('link', { name: `${foreign.title} · 예정된 1문제 복습`, exact: true }); await expect(foreignLink).toBeVisible();
      await page.getByRole('button', { name: '살펴보는 중급만', exact: true }).click();
      await expect(page.getByText('살펴보는 중급 예정 복습: 2문제 · 전체 3문제', { exact: true })).toBeVisible(); await expect(foreignLink).toHaveCount(0);
      await page.getByRole('button', { name: '전체 단계 예정 복습', exact: true }).click();
      await expect(page.getByText('전체 단계 예정 복습: 3문제 · 전체 3문제', { exact: true })).toBeVisible();
      await unchanged(); expect(writeCount(qa)).toBe(writes);
    });
    await test.step('no answer exit and reopen', async () => {
      const writes = writeCount(qa);
      await dueLink().click(); await fixedQueue();
      await expect(questionRegion().getByRole('heading', { name: queue[0].prompt, exact: true })).toBeVisible();
      await page.getByRole('link', { name: '← 중급 단원으로', exact: true }).click(); await expect(listing()).toBeVisible(); await unchanged();
      await page.goBack(); await fixedQueue(); await expect(questionRegion().getByRole('status')).toHaveCount(0); await unchanged();
      await page.getByRole('link', { name: '← 중급 단원으로', exact: true }).click(); await expect(listing()).toBeVisible();
      await dueLink().click(); await fixedQueue(); await expect(questionRegion().getByRole('status')).toHaveCount(0);
      await unchanged(); expect(writeCount(qa)).toBe(writes);
    });
    await test.step('genuine due answers without unit completion', async () => { await answerQueue(false); });
    await test.step('immediate helped due repeat', async () => {
      await page.getByRole('region', { name: '연습 마침', exact: true }).getByRole('button', { name: '같은 문제 더 반복하기', exact: true }).click();
      await answerQueue(true); expect(sessions.size).toBe(2);
    });
    await test.step('due reopen reload and relogin', async () => {
      await page.getByRole('link', { name: '중급 단원 목록으로', exact: true }).click(); await expect(listing()).toBeVisible();
      await expect(page.getByText('전체 단계 예정 복습: 1문제 · 전체 1문제', { exact: true })).toBeVisible(); await expect(dueLink()).toHaveCount(0);
      await page.getByRole('button', { name: '살펴보는 중급만', exact: true }).click();
      await expect(page.getByText('살펴보는 중급 예정 복습: 0문제 · 전체 1문제', { exact: true })).toBeVisible(); await unchanged();
      await page.goto(path);
      const restored = async () => {
        await synced(page); await expect(page.getByRole('heading', { level: 1, name: '지금 예정된 복습은 없어요', exact: true })).toBeVisible();
        await expect(questionRegion()).toHaveCount(0); preserved((await journeySnapshot(page)).journey); saved = await restoredLevelJourney(page, qa, saved, fitness);
      };
      await restored(); await page.reload(); await restored();
      await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), LEVEL_JOURNEY_KEY)).toBeNull();
      await login(page, qa.account, path); await restored();
      await page.getByRole('link', { name: '중급 단계 화면으로', exact: true }).click(); await expect(listing()).toBeVisible();
      await expect(page.getByText('전체 단계 예정 복습: 1문제 · 전체 1문제', { exact: true })).toBeVisible(); await unchanged();
    });
  } finally { silent(); }
});
