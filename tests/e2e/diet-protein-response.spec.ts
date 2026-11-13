import { expect, login, original, synced, test, today, saveMeal, mealSaved, assertOriginalPreserved, type State } from './fixture';
import type { Page } from '@playwright/test';

const key = 'ai-fitness-diet-completed-days';
const row = (state: State, date = today()) => (state[key] as Record<string, State>)[date];
async function summary(page: Page) {
  const region = page.getByRole('region', { name: '최근 7일 식단 요약', exact: true });
  if (!await region.isVisible()) await page.locator('summary').filter({ hasText: '식단 분석·추세' }).click();
  await expect(region).toBeVisible();
  return region;
}

test('water-only save excludes unanswered protein while explicit zero persists and calendar translates statuses', async ({ page, qa }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, qa.account); await synced(page); await page.goto('/diet');
  await page.getByRole('button', { name: '+300mL', exact: true }).click();
  await saveMeal(page, 'CI water only'); await mealSaved(page, qa, 'CI water only');
  const waterOnly = await qa.read();
  expect(row(waterOnly)).toMatchObject({ waterMl: 300, proteinTotal: 0, proteinRecorded: false });
  assertOriginalPreserved(waterOnly);
  await expect(await summary(page)).toContainText('단백질 평균 미기록');
  await expect(await summary(page)).toContainText('수분 평균 300mL · 1일 입력');
  await page.reload(); await synced(page);
  await expect(await summary(page)).toContainText('단백질 평균 미기록');
  expect(await qa.read()).toEqual(waterOnly);

  const lunch = page.getByRole('article').filter({ has: page.getByText('점심', { exact: true }) });
  await lunch.getByRole('combobox', { name: '식품 단백질', exact: true }).selectOption('custom');
  await page.getByLabel('점심 식품 단백질 직접 입력', { exact: true }).fill('0');
  await expect(page.getByLabel('점심 식품 단백질 직접 입력', { exact: true })).toHaveValue('0');
  await saveMeal(page, 'CI explicit protein zero'); await mealSaved(page, qa, 'CI explicit protein zero');
  const zero = await qa.read();
  expect(row(zero)).toMatchObject({ waterMl: 300, proteinTotal: 0, proteinRecorded: true });
  assertOriginalPreserved(zero);
  await expect(await summary(page)).toContainText('단백질 평균 0g · 1일 입력');
  await page.reload(); await synced(page);
  await expect(await summary(page)).toContainText('단백질 평균 0g · 1일 입력');
  expect(await qa.read()).toEqual(zero);
  await expect(page.getByLabel('점심 식품 단백질 직접 입력', { exact: true })).toHaveValue('0');

  const dinner = page.getByRole('article').filter({ has: page.getByText('저녁', { exact: true }) });
  await dinner.getByRole('combobox', { name: '식품 단백질', exact: true }).selectOption('custom');
  await page.getByLabel('저녁 식품 단백질 직접 입력', { exact: true }).fill('0');
  await expect(page.getByLabel('저녁 식품 단백질 직접 입력', { exact: true })).toHaveValue('0');
  await saveMeal(page, 'CI dinner explicit protein zero'); await mealSaved(page, qa, 'CI dinner explicit protein zero');
  const dinnerZero = await qa.read();
  expect(row(dinnerZero)).toMatchObject({ waterMl: 300, proteinTotal: 0, proteinRecorded: true });
  expect((dinnerZero['ai-fitness-diet-meal-log'] as Record<string, State>)[today()]).toMatchObject({ dinnerProteinChoice: 'custom', dinnerProteinCustom: 0 });
  assertOriginalPreserved(dinnerZero);
  await page.reload(); await synced(page);
  await expect(page.getByLabel('저녁 식품 단백질 직접 입력', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('점심 식품 단백질 직접 입력', { exact: true })).toHaveValue('0');
  await expect(await summary(page)).toContainText('단백질 평균 0g · 1일 입력');
  expect(await qa.read()).toEqual(dinnerZero);

  await page.goto('/calendar');
  await page.getByRole('button', { name: `${today()} 기록 상세 보기`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('보통');
  await expect(dialog).toContainText('공복 미기록');
  await expect(dialog).not.toContainText('normal');
  await expect(dialog).not.toContainText('unrecorded');
  await page.getByRole('button', { name: '기록 상세 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await qa.read()).toEqual(dinnerZero);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ambiguous legacy zero is not silently reclassified when merely viewed or reloaded', async ({ page, qa }) => {
  const legacy = { dietStatus: 'normal', fastingRecordStatus: 'unrecorded', proteinTotal: 0, waterMl: 300,
    meals: { breakfast: false, lunch: false, dinner: false }, dietMemo: 'CI ambiguous legacy zero' };
  const seeded: State = { ...original, [key]: { ...(original[key] as State), [today()]: legacy } };
  expect((await qa.account.client.from('user_app_state').update({ state: seeded }).eq('user_id', qa.account.id)).error).toBeNull();
  await login(page, qa.account); await synced(page); await page.goto('/diet');
  await expect(await summary(page)).toContainText('단백질 평균 0g · 1일 입력');
  await page.reload(); await synced(page);
  await expect(await summary(page)).toContainText('단백질 평균 0g · 1일 입력');
  expect(row(await qa.read())).toEqual(legacy);
  expect(row(await qa.read())).not.toHaveProperty('proteinRecorded');
  assertOriginalPreserved(await qa.read());
});
