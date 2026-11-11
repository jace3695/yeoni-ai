import { test, expect, login, canonical, type State } from './fixture';
import { seedCurriculum, answerTerminal, curriculumSnapshot, currentState, terminalPath, CURRICULUM_PROGRESS_KEY, CURRICULUM_REVIEW_KEY, persisted, localMatches } from './curriculum-browser-state';
test('corrupt curriculum bytes survive attempted UI writes and reload until explicit synthetic fixture correction', async ({ page, qa }) => {
  const { observeSilentReading, synced, writeCount } = await import('./japanese-level-flow-state');
  const silent = observeSilentReading(page);
  const malformed = '{"completedLessonIds":["f01"],"lessonAttempts":';
  const invalidShape = '{"completedLessonIds":["f01"],"lessonAttempts":[]}';
  let saved: State, fitness: State, writes = 0;
  const raw = () => page.evaluate(key => localStorage.getItem(key), CURRICULUM_PROGRESS_KEY);
  const noCompletion = () => expect(page.getByRole('heading', { name: '오늘의 연습을 저장했어요', exact: true })).toHaveCount(0);
  const warning = () => expect(page.getByRole('alert').filter({ hasText: '원본을 보존하고 저장을 멈췄습니다.' }).first()).toBeVisible();
  const preserved = async (value: string) => {
    expect(await raw()).toBe(value); await localMatches(page, { ...saved, [CURRICULUM_PROGRESS_KEY]: value });
    expect(canonical(await qa.readLanguage())).toBe(canonical(saved)); expect(await qa.read()).toEqual(fitness);
    expect(writeCount(qa)).toBe(writes); await noCompletion();
    await expect(page.getByText('학습 기록 · 서버 저장 확인', { exact: true })).toHaveCount(0);
  };
  // Local writes below are explicitly fault injection/correction, not learning
  // outcomes or a mocked successful Auth/DB response. Service traffic is real.
  const fixtureReplace = (value: string) => page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: CURRICULUM_PROGRESS_KEY, value });
  try {
    await test.step('valid synthetic history and real unanswered completion draft', async () => {
      fitness = await qa.read(); saved = await seedCurriculum(qa);
      await login(page, qa.account, terminalPath); await answerTerminal(page);
      saved = await currentState(page, saved); await persisted(page, qa, saved, fitness); writes = writeCount(qa);
      expect(JSON.parse(saved[CURRICULUM_PROGRESS_KEY] as string).completedLessonIds).toEqual(['f01']);
    });
    await test.step('malformed local bytes block completion autosave and cloud writes', async () => {
      await fixtureReplace(malformed);
      await page.getByRole('button', { name: '오늘 연습 저장하기', exact: true }).click(); await warning();
      await page.getByRole('button', { name: '이전', exact: true }).click(); await warning();
      await expect(page.getByText('학습 기록 · 동기화 확인 필요', { exact: true })).toBeVisible();
      // Trigger the existing visibility/focus sync callback instead of replacing
      // the clock or waiting 30 seconds. Its real GET must settle with no write.
      const reads = qa.traffic.entries.filter(entry => entry.table === 'language_user_state' && entry.method === 'GET' && entry.delivered).length;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => qa.traffic.entries.filter(entry => entry.table === 'language_user_state' && entry.method === 'GET' && entry.delivered).length).toBeGreaterThan(reads);
      await preserved(malformed);
      expect(await page.evaluate(key => localStorage.getItem(key), CURRICULUM_REVIEW_KEY)).toBe(saved[CURRICULUM_REVIEW_KEY]);
    });
    await test.step('normal mount retry and invalid shape keep their original bytes', async () => {
      await page.reload(); await warning(); await page.getByRole('button', { name: '기록 다시 읽기', exact: true }).click(); await warning(); await preserved(malformed);
      await fixtureReplace(invalidShape); await page.reload(); await warning(); await preserved(invalidShape);
      await page.goto('/language/learn'); await warning(); await page.getByRole('button', { name: '기록 다시 읽기', exact: true }).click(); await warning(); await preserved(invalidShape);
    });
    await test.step('explicit fixture correction permits a genuine track save without false completion', async () => {
      // Restore only the exact pre-fault progress bytes. No implicit reset or
      // repair and no change to the authenticated remote baseline or receipts.
      await fixtureReplace(saved[CURRICULUM_PROGRESS_KEY] as string);
      await page.reload(); await synced(page); await localMatches(page, saved);
      expect(canonical(await qa.readLanguage())).toBe(canonical(saved)); expect(writeCount(qa)).toBe(writes);
      await page.getByRole('navigation', { name: '학습 과정 선택', exact: true }).getByRole('link', { name: '회사 일본어', exact: true }).click();
      const snapshot = await curriculumSnapshot(page), progress = JSON.parse(snapshot.raw), before = JSON.parse(saved[CURRICULUM_PROGRESS_KEY] as string);
      expect(progress).toEqual({ ...before, selectedTrack: 'work', updatedAt: progress.updatedAt });
      expect(progress.completedLessonIds).toEqual(['f01']); expect(progress.lessonAttempts).toEqual(before.lessonAttempts);
      saved = { ...saved, [CURRICULUM_PROGRESS_KEY]: snapshot.raw }; await persisted(page, qa, saved, fitness);
      await page.reload(); await synced(page); await localMatches(page, saved); await noCompletion();
    });
  } finally { silent(); }
});
