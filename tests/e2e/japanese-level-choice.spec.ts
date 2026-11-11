import { test, expect, login, canonical, type State } from './fixture';
import { LEVEL_JOURNEY_KEY, CURRICULUM_PROGRESS_KEY, CURRICULUM, emptyLevelJourney, getJapaneseReadingLesson, historicalAnswer, oldTime, uuid, journeySnapshot, localMatches, persisted, synced, observeSilentReading, writeCount } from './japanese-level-flow-state';
test('explicit Japanese level choices and preview backtracking preserve earlier records through real save, reload and relogin', async ({ page, qa }) => {
  const silent = observeSilentReading(page);
  const oldReading = getJapaneseReadingLesson('upper-01')!;
  const prior = { ...emptyLevelJourney(), answers: {
    [oldReading.questions[0].id]: historicalAnswer(oldReading.id, oldReading.questions[0].id),
    'retired-q': historicalAnswer('retired-unit', 'retired-q'),
  }, practicedUnits: { 'upper-01': oldTime, 'retired-unit': oldTime } };
  const curriculum = { completedLessonIds: ['f01', 'f12'], quizScores: { f01: 2, f12: 3 }, selectedTrack: 'foundation',
    lastLessonId: 'f12', lessonAttempts: { f01: [{ score: 2, completedAt: oldTime, sessionId: 'synthetic-f01' }],
      f12: [{ score: 3, completedAt: oldTime, sessionId: 'synthetic-f12' }] }, activityDates: ['2001-01-02'], lessonDrafts: {}, kanaCompletedGroups: [] };
  let fitness: State; let saved: State; let previousChoice = 0;
  const preview = (title: string) => page.getByRole('region', { name: `${title} 학습 안내`, exact: true });
  const unchanged = async () => {
    await localMatches(page, saved); expect(canonical(await qa.readLanguage())).toBe(canonical(saved));
    expect(await qa.read()).toEqual(fitness);
  };
  const choose = async (level: 'beginner' | 'intermediate' | 'advanced', title: string) => {
    const startedAt = Date.now();
    await preview(title).getByRole('button', { name: `${title} 선택하기`, exact: true }).click();
    await expect(page.getByText(`${title}을 선택했어요. 이전 학습 기록은 그대로예요.`, { exact: true })).toBeVisible();
    const current = await journeySnapshot(page);
    expect(current.journey.selectedLevel).toBe(level);
    expect(Date.parse(current.journey.selectionUpdatedAt!)).toBeGreaterThanOrEqual(startedAt);
    expect(Date.parse(current.journey.selectionUpdatedAt!)).toBeGreaterThan(previousChoice);
    expect(Date.parse(current.journey.selectionUpdatedAt!)).toBeLessThanOrEqual(current.at);
    previousChoice = Date.parse(current.journey.selectionUpdatedAt!);
    expect(current.journey.answers).toEqual(prior.answers); expect(current.journey.practicedUnits).toEqual(prior.practicedUnits);
    saved = { ...saved, [LEVEL_JOURNEY_KEY]: current.raw }; await persisted(page, qa, saved, fitness);
  };
  try {
    await test.step('level setup', async () => {
      expect(oldReading).toBeDefined(); fitness = await qa.read();
      // Prior f01/f12 results are synthetic preservation inputs, not new completion evidence.
      saved = { ...await qa.readLanguage(), [LEVEL_JOURNEY_KEY]: JSON.stringify(prior), [CURRICULUM_PROGRESS_KEY]: JSON.stringify(curriculum) };
      const seeded = await qa.account.client.from('language_user_state').update({ state: saved }).eq('user_id', qa.account.id).select('state').single();
      expect(seeded.error).toBeNull(); expect(seeded.data?.state).toEqual(saved);
      await login(page, qa.account, '/language/levels'); await synced(page); await expect(preview('초급')).toBeVisible(); await unchanged();
    });
    await test.step('level previews and history', async () => {
      const writes = writeCount(qa);
      await page.getByRole('link', { name: '중급 살펴보기', exact: true }).click(); await expect(preview('중급')).toBeVisible(); await unchanged();
      await page.getByRole('link', { name: '고급 살펴보기', exact: true }).click(); await expect(preview('고급')).toBeVisible(); await unchanged();
      await page.goBack(); await expect(preview('중급')).toBeVisible(); await unchanged();
      await page.goForward(); await expect(preview('고급')).toBeVisible(); await unchanged();
      await page.getByRole('link', { name: '초급 살펴보기', exact: true }).click(); await expect(preview('초급')).toBeVisible(); await unchanged();
      expect((await journeySnapshot(page)).journey).toEqual(prior); expect(writeCount(qa)).toBe(writes);
    });
    await test.step('explicit intermediate and advanced choice', async () => {
      await page.getByRole('link', { name: '중급 살펴보기', exact: true }).click(); await expect(preview('중급')).toBeVisible(); await choose('intermediate', '중급');
      await page.getByRole('link', { name: '고급 살펴보기', exact: true }).click(); await expect(preview('고급')).toBeVisible(); await choose('advanced', '고급');
      await page.reload(); await synced(page); await expect(preview('고급')).toBeVisible(); await unchanged();
      await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), LEVEL_JOURNEY_KEY)).toBeNull();
      await login(page, qa.account, '/language/levels'); await synced(page); await expect(preview('고급')).toBeVisible(); await unchanged();
    });
    await test.step('earlier beginner material and allowed draft', async () => {
      const writes = writeCount(qa);
      await page.getByRole('link', { name: '초급 더 반복하기', exact: true }).click(); await expect(preview('초급')).toBeVisible();
      for (const id of ['f01', 'f12']) {
        const item = preview('초급').getByRole('listitem').filter({ has: page.locator(`a[href="/language/learn?lesson=${id}&level=beginner"]`) });
        await expect(item.getByText('연습 기록 있음 · 반복 가능', { exact: true })).toBeVisible();
        await expect(item.getByRole('link', { name: '다시 연습', exact: true })).toHaveAttribute('href', `/language/learn?lesson=${id}&level=beginner`);
      }
      await expect(preview('초급').locator('a[href*="lesson=f13"]')).toHaveCount(0);
      expect((await journeySnapshot(page)).journey.selectedLevel).toBe('advanced'); await unchanged(); expect(writeCount(qa)).toBe(writes);
      const openedAt = Date.now();
      await preview('초급').locator('a[href="/language/learn?lesson=f01&level=beginner"]').click();
      await expect(page.getByRole('region', { name: '집중 학습', exact: true }).getByRole('heading', { level: 1, name: CURRICULUM.find(item => item.id === 'f01')!.title, exact: true })).toBeVisible();
      // FocusedLesson legitimately saves an unanswered draft upon opening.
      await expect.poll(() => page.evaluate(key => Boolean(JSON.parse(localStorage.getItem(key) ?? '{}').lessonDrafts?.f01), CURRICULUM_PROGRESS_KEY)).toBe(true);
      const raw = (await page.evaluate(key => localStorage.getItem(key), CURRICULUM_PROGRESS_KEY))!;
      const opened = JSON.parse(raw); const draft = opened.lessonDrafts.f01;
      expect(draft.id).toMatch(uuid);
      expect(draft).toEqual({ version: 1, id: draft.id, lessonId: 'f01', minutes: 10, mode: 'starter', stage: 0, wordIndex: 0, quizCursor: 0,
        answers: {}, firstAnswers: {}, responses: {}, speakingChecks: [false, false, false] });
      expect(opened).toEqual({ ...curriculum, activeSession: draft, lessonDrafts: { f01: draft }, updatedAt: opened.updatedAt });
      expect(Date.parse(opened.updatedAt)).toBeGreaterThanOrEqual(openedAt); expect(Date.parse(opened.updatedAt)).toBeLessThanOrEqual(Date.now());
      saved = { ...saved, [CURRICULUM_PROGRESS_KEY]: raw }; await persisted(page, qa, saved, fitness);
      expect((await journeySnapshot(page)).journey.selectedLevel).toBe('advanced');
      await page.getByRole('link', { name: '← 과정으로', exact: true }).click(); await expect(preview('초급')).toBeVisible(); await unchanged();
    });
    await test.step('explicit beginner choice and restoration', async () => {
      await choose('beginner', '초급');
      const restore = async () => { await synced(page); await expect(preview('초급')).toBeVisible(); await unchanged(); };
      await page.reload(); await restore();
      await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), LEVEL_JOURNEY_KEY)).toBeNull();
      await login(page, qa.account, '/language/levels'); await restore();
      const final = (await journeySnapshot(page)).journey;
      expect(final.selectedLevel).toBe('beginner'); expect(final.answers).toEqual(prior.answers); expect(final.practicedUnits).toEqual(prior.practicedUnits);
      expect(JSON.parse(saved[CURRICULUM_PROGRESS_KEY] as string).completedLessonIds).toEqual(['f01', 'f12']);
    });
  } finally { silent(); }
});
