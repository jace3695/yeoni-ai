import { test, expect, login, canonical, type State } from './fixture';
import { seedCurriculum, answerTerminal, completeTerminal, terminalPath, CURRICULUM_PROGRESS_KEY, CURRICULUM_REVIEW_KEY, LEVEL_JOURNEY_KEY, localMatches, persisted } from './curriculum-browser-state';
test('terminal beginner f12 completes twice through silent meaning UI with real saves and manual intermediate choice', async ({ page, qa }) => {
  const { observeSilentReading, synced, journeySnapshot, restoredLevelJourney } = await import('./japanese-level-flow-state');
  const silent = observeSilentReading(page);
  let saved: State, fitness: State; const sessions: string[] = [];
  const unchanged = async () => {
    await preservationSync(() => synced(page)); await preservationLocal(() => localMatches(page, saved));
    await preservationServer(async () => { expect(canonical(await qa.readLanguage())).toBe(canonical(saved)); }); await preservationFitness(async () => { expect(await qa.read()).toEqual(fitness); });
  };
  try {
    await test.step('historical fixture setup opens the real terminal lesson', async () => {
      fitness = await qa.read(); saved = await seedCurriculum(qa);
      expect(JSON.parse(saved[CURRICULUM_PROGRESS_KEY] as string).completedLessonIds).toEqual(['f01']);
      await login(page, qa.account, terminalPath);
    });
    await test.step('first normal five minute silent completion and conditional confirmation', async () => {
      await answerTerminal(page);
      const completed = await completeTerminal(page, qa, saved, fitness, sessions); saved = completed.saved; sessions.push(completed.sessionId);
    });
    await test.step('reload and relogin preserve genuine completion without promotion', async () => {
      await page.getByRole('link', { name: '초급 더 반복하기', exact: true }).click(); await returnedToBeginner(page); await unchanged();
      await page.reload(); await unchanged();
      await page.getByRole('button', { name: '로그아웃', exact: true }).click(); await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), CURRICULUM_PROGRESS_KEY)).toBeNull();
      await login(page, qa.account, '/language/levels?level=beginner'); await unchanged();
      expect((await journeySnapshot(page)).journey.selectedLevel).toBe('beginner');
      await expect(page.getByRole('region', { name: '초급 학습 안내', exact: true }).locator('a[href="/language/learn?lesson=f12&level=beginner"]')).toHaveText('다시 연습');
    });
    await test.step('second normal completion has a distinct session and restores again', async () => {
      await page.getByRole('region', { name: '초급 학습 안내', exact: true }).locator('a[href="/language/learn?lesson=f12&level=beginner"]').click();
      await answerTerminal(page);
      const completed = await completeTerminal(page, qa, saved, fitness, sessions); saved = completed.saved; sessions.push(completed.sessionId);
      expect(new Set(sessions).size).toBe(2);
      await page.getByRole('link', { name: '초급 더 반복하기', exact: true }).click(); await returnedToBeginner(page); await page.reload(); await unchanged();
    });
    await test.step('only explicit intermediate selection changes the chosen level', async () => {
      const before = (await journeySnapshot(page)).journey;
      await page.getByRole('link', { name: '중급 살펴보기', exact: true }).click(); await unchanged();
      expect((await journeySnapshot(page)).journey.selectedLevel).toBe('beginner');
      const startedAt = await page.evaluate(() => Date.now());
      await page.getByRole('region', { name: '중급 학습 안내', exact: true }).getByRole('button', { name: '중급 선택하기', exact: true }).click();
      await expect(page.getByText('중급을 선택했어요. 이전 학습 기록은 그대로예요.', { exact: true })).toBeVisible();
      const chosen = await journeySnapshot(page);
      expect(chosen.journey).toEqual({ ...before, selectedLevel: 'intermediate', selectionUpdatedAt: chosen.journey.selectionUpdatedAt, updatedAt: chosen.journey.updatedAt });
      expect(Date.parse(chosen.journey.selectionUpdatedAt!)).toBeGreaterThanOrEqual(startedAt); expect(Date.parse(chosen.journey.selectionUpdatedAt!)).toBeLessThanOrEqual(chosen.at);
      const progressRaw = saved[CURRICULUM_PROGRESS_KEY], reviewRaw = saved[CURRICULUM_REVIEW_KEY];
      saved = { ...saved, [LEVEL_JOURNEY_KEY]: chosen.raw }; await persisted(page, qa, saved, fitness);
      await page.reload(); saved = await restoredLevelJourney(page, qa, saved, fitness);
      expect(await page.evaluate(key => localStorage.getItem(key), CURRICULUM_PROGRESS_KEY)).toBe(progressRaw);
      expect(await page.evaluate(key => localStorage.getItem(key), CURRICULUM_REVIEW_KEY)).toBe(reviewRaw);
    });
  } finally { silent(); }
});

async function returnedToBeginner(page: Parameters<typeof login>[0]) {
  await expect(page).toHaveURL('http://127.0.0.1:3000/language/levels?level=beginner');
  await expect(page.getByRole('region', { name: '초급 학습 안내', exact: true })).toBeVisible();
}

function preservationSync(action: () => Promise<void>) {
  return test.step('terminal sync confirmation', action);
}
function preservationLocal(action: () => Promise<void>) {
  return test.step('terminal local preservation', action);
}
function preservationServer(action: () => Promise<void>) {
  return test.step('terminal server preservation', action);
}
function preservationFitness(action: () => Promise<void>) {
  return test.step('terminal fitness preservation', action);
}
