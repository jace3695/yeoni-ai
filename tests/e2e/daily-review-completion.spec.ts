import { test, expect, login, today, canonical, type State } from './fixture';

test('three distinct reviews save one daily completion and hide the stale warning across reload and relogin', async ({ page, qa }) => {
  const words = ['one', 'two', 'three'].map(label => ({ word: `ci-word-${label}`, meaning: `CI meaning ${label}`, example: `CI example ${label}`, category: '일상' as const }));
  const keys = ['reviewCompletedItemsByDate', 'dailyRoutineProgress', 'dailyLearningHistory'];
  const beforeFitness = await qa.read();
  const before: State = { ...await qa.readLanguage(), savedWords: JSON.stringify(words) };
  for (const key of keys) expect(before).not.toHaveProperty(key);
  const seeded = await qa.account.client.from('language_user_state').update({ state: before }).eq('user_id', qa.account.id).select('state').single();
  expect(seeded.error).toBeNull(); expect(seeded.data?.state).toEqual(before);
  const synced = () => expect(page.getByText('학습 기록 · 서버 저장 확인', { exact: true })).toBeVisible();
  const reviewed = (state: State): { date: string; items: string[] }[] => JSON.parse(state.reviewCompletedItemsByDate as string || '[]');
  const success = page.getByText('일일 학습 기록이 이 기기에 저장됐어요. 서버 동기화 완료를 뜻하지는 않아요.', { exact: true });
  const warning = page.getByText(/^아직 저장하지 못한 일일 완료 요청은/);
  const retry = page.getByRole('button', { name: '일일 학습 기록 다시 저장', exact: true });
  await login(page, qa.account, '/language/review'); await synced();
  const day = today();
  const itemIds = words.map(word => `saved-word:${word.word}`);
  const card = (index: number) => page.getByRole('listitem').filter({ has: page.getByText(words[index].word, { exact: true }) });
  for (let index = 0; index < words.length; index++) await expect(card(index)).toHaveCount(1);
  const notComplete = async (count: number) => {
    await expect.poll(async () => reviewed(await qa.readLanguage())).toEqual([{ date: day, items: itemIds.slice(0, count) }]);
    await synced();
    const state = await qa.readLanguage();
    expect(state).not.toHaveProperty('dailyRoutineProgress');
    expect(state).not.toHaveProperty('dailyLearningHistory');
    await expect(success).not.toBeVisible(); await expect(retry).toHaveCount(0);
    qa.traffic.assertLanguageConfirmed(state);
  };
  await card(0).getByRole('button', { name: '복습 완료', exact: true }).click(); await notComplete(1);
  await card(0).getByRole('button', { name: '복습 완료됨', exact: true }).click(); await notComplete(1);
  await card(1).getByRole('button', { name: '복습 완료', exact: true }).click(); await notComplete(2);
  await card(2).getByRole('button', { name: '복습 완료', exact: true }).click();
  await expect(success).toBeVisible();
  await expect(warning).toHaveCount(1); await expect(warning).not.toBeVisible();
  await expect(warning).toHaveAttribute('aria-hidden', 'true'); await expect(warning).toHaveCSS('visibility', 'hidden');
  expect(await warning.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(0);
  await expect(retry).toBeVisible(); await expect(retry).toBeDisabled();
  await expect.poll(async () => {
    const state = await qa.readLanguage();
    return ['dailyRoutineProgress', 'dailyLearningHistory'].map(key => typeof state[key] === 'string');
  }).toEqual([true, true]);
  await synced();
  const saved = await qa.readLanguage();
  const assertCompletion = (state: State) => {
    expect(JSON.parse(state.dailyRoutineProgress as string)).toEqual({ date: day, completedIds: ['review'] });
    const history = JSON.parse(state.dailyLearningHistory as string);
    expect(Object.keys(history)).toEqual([day]);
    expect(history[day]).toMatchObject({ completedIds: ['review'], completedCount: 1, totalCount: 5 });
    expect(Number.isFinite(Date.parse(history[day].updatedAt))).toBe(true);
    expect(reviewed(state)).toEqual([{ date: day, items: itemIds }]);
    expect(canonical(Object.fromEntries(Object.entries(state).filter(([key]) => !keys.includes(key))))).toBe(canonical(before));
  };
  assertCompletion(saved); qa.traffic.assertLanguageConfirmed(saved);
  expect(await qa.read()).toEqual(beforeFitness);
  const restored = async () => {
    await synced();
    await expect(page.getByRole('button', { name: '복습 완료됨', exact: true })).toHaveCount(3);
    const state = await qa.readLanguage(); assertCompletion(state);
    expect(canonical(state)).toBe(canonical(saved)); expect(await qa.read()).toEqual(beforeFitness);
    expect(await page.evaluate(list => list.map(key => localStorage.getItem(key)), keys)).toEqual(keys.map(key => saved[key]));
  };
  await page.reload(); await restored();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(list => list.map(key => localStorage.getItem(key)), keys)).toEqual(keys.map(() => null));
  await login(page, qa.account, '/language/review'); await restored();
});
