import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import { test, expect, login, originalLanguage, type State } from './fixture';
import { RouteDrain } from './route-drain';
import { APP_RECORD_KEYS } from '../../app/data/appRecordReset';

const markerKey = 'languageRecordResetV1';
const recordKeys = ['japaneseLevelJourneyV1', 'japaneseChunkReviewV1'] as const;
const settingKeys = ['learningSettings', 'integratedLearningSettingsV1', 'japaneseAppSettings'];
const settings = (state: State) => Object.fromEntries(settingKeys.map(key => [key, state[key]]));
const stamp = '2026-11-01T00:00:00.000Z';
function seeded(owner: 'A' | 'B'): State {
  const common = { ttsRate: 0.8, repeatCount: 2, repeatDelayMs: 300 };
  const detailed = { ...common, showKoreanPronunciation: true, showReading: false };
  return {
    ...originalLanguage,
    learningSettings: JSON.stringify({ dailyGoalCount: owner === 'A' ? 3 : 4 }),
    japaneseAppSettings: JSON.stringify({ sections: {
      kana: common, words: detailed, sentences: detailed, speaking: detailed, conversation: detailed,
    } }),
    japaneseLevelJourneyV1: JSON.stringify({ version: 1, selectedLevel: 'beginner', answers: {}, practicedUnits: { [`ci-${owner}`]: stamp } }),
    japaneseChunkReviewV1: JSON.stringify({ version: 1, generation: null, events: {
      [`ci-${owner}`]: { lessonId: 'ci-lesson', questionId: 'ci-question', attemptId: `ci-${owner}`, correct: false, neededHelp: true, mode: 'choice', answeredAt: stamp },
    } }),
  };
}
const languageSynced = (page: Page) => expect(page.getByText('학습 기록 · 서버 저장 확인', { exact: true })).toBeVisible();
const local = (page: Page, keys: readonly string[]) => page.evaluate(list => Object.fromEntries(list.map(key => [key, localStorage.getItem(key)])), [...keys]);
async function assertCleared(page: Page, state: State, marker: string, kept: State) {
  for (const key of APP_RECORD_KEYS.language) expect(state).not.toHaveProperty(key);
  expect(state[markerKey]).toBe(marker);
  expect(settings(state)).toEqual(kept);
  expect(await local(page, APP_RECORD_KEYS.language)).toEqual(Object.fromEntries(APP_RECORD_KEYS.language.map(key => [key, null])));
  expect(await local(page, [markerKey])).toEqual({ [markerKey]: marker });
  expect(await local(page, settingKeys)).toEqual(kept);
}

test('Japanese reset uses the real settings UI, clears both new keys and preserves settings and another owner after reload and relogin', async ({ page, qa }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const other = await qa.createAccount();
  const a = seeded('A'), b = seeded('B');
  for (const [account, state] of [[qa.account, a], [other, b]] as const) {
    const result = await account.client.from('language_user_state').update({ state }).eq('user_id', account.id).select('state').single();
    expect(result.error).toBeNull(); expect(result.data?.state).toEqual(state);
  }
  const otherFitness = await qa.read(other), ownerFitness = await qa.read();
  await login(page, qa.account, '/language/settings'); await languageSynced(page);
  expect(await local(page, recordKeys)).toEqual(Object.fromEntries(recordKeys.map(key => [key, a[key]])));
  await page.reload(); await languageSynced(page);
  expect(await local(page, recordKeys)).toEqual(Object.fromEntries(recordKeys.map(key => [key, a[key]])));
  // Exercise an actual settings save before reset, not only fixture seeding.
  await page.getByRole('button', { name: /^2\s*개$/ }).click();
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect.poll(async () => JSON.parse((await qa.readLanguage()).learningSettings as string).dailyGoalCount).toBe(2);
  await languageSynced(page);
  const kept = settings(await qa.readLanguage());
  qa.traffic.assertLanguageConfirmed(await qa.readLanguage());

  const panel = page.getByRole('region', { name: '일본어 기록 초기화', exact: true });
  await expect(panel.getByText(`대상 계정: ${qa.account.email}`, { exact: true })).toBeVisible();
  const open = () => panel.getByRole('button', { name: '일본어 기록 초기화하기', exact: true }).click();
  const checkbox = panel.getByRole('checkbox');
  const confirmation = panel.getByLabel('확인을 위해 ‘초기화’를 입력해 주세요.', { exact: true });
  const submit = panel.getByRole('button', { name: '일본어 기록 영구 삭제', exact: true });
  const cancel = panel.getByRole('button', { name: '취소', exact: true });
  await open();
  await expect(submit).toBeDisabled();
  await checkbox.check(); await expect(submit).toBeDisabled();
  await confirmation.fill('초기화x'); await expect(submit).toBeDisabled();
  await confirmation.fill('초기화'); await expect(submit).toBeEnabled();
  await cancel.click(); await open();
  await expect(checkbox).not.toBeChecked(); await expect(confirmation).toHaveValue('');
  await expect(submit).toBeDisabled();
  await confirmation.fill('초기화'); await expect(submit).toBeDisabled();
  // Scroll each control into view: the whole panel may be taller than a phone.
  // Check usable vertical visibility and full horizontal containment separately.
  for (const control of [confirmation, cancel, submit]) {
    await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport();
    const box = await control.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  const panelBox = await panel.boundingBox(); expect(panelBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0); expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await qa.readLanguage(other)).toEqual(b);
  expect((await qa.readLanguage())[markerKey]).toBeUndefined();
  expect(await local(page, recordKeys)).toEqual(Object.fromEntries(recordKeys.map(key => [key, a[key]])));
  await checkbox.check();
  const rpcResponse = page.waitForResponse(response => response.url() === 'http://127.0.0.1:54321/rest/v1/rpc/reset_my_app_records' && response.request().method() === 'POST');
  await panel.getByRole('button', { name: '일본어 기록 영구 삭제', exact: true }).click();
  const response = await rpcResponse;
  expect(response.ok()).toBe(true);
  const request = response.request().postDataJSON() as { p_app: string; p_request_id: string; p_confirmation: string };
  expect(request).toMatchObject({ p_app: 'language', p_confirmation: '초기화' });
  const receipt = await response.json() as { app: string; user_id: string; marker: string };
  expect(receipt).toMatchObject({ app: 'language', user_id: qa.account.id });
  expect(receipt.marker.split('|')[1]).toBe(request.p_request_id);
  expect(Number.isFinite(Date.parse(receipt.marker.split('|')[0]))).toBe(true);
  // This receipt only appears after the product's own location.reload().
  await expect(page.getByText('일본어 기록을 초기화했어요. 유지되는 항목은 아래에서 확인해 주세요.', { exact: true })).toBeVisible();
  await languageSynced(page);
  await assertCleared(page, await qa.readLanguage(), receipt.marker, kept);
  await page.reload(); await languageSynced(page);
  await assertCleared(page, await qa.readLanguage(), receipt.marker, kept);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await login(page, qa.account, '/language/settings'); await languageSynced(page);
  await assertCleared(page, await qa.readLanguage(), receipt.marker, kept);
  await expect(page.getByRole('button', { name: /^2\s*개$/ })).toHaveAttribute('aria-pressed', 'true');
  expect(await qa.readLanguage(other)).toEqual(b);
  expect(await qa.read()).toEqual(ownerFitness); expect(await qa.read(other)).toEqual(otherFitness);
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await login(page, other, '/language/settings'); await languageSynced(page);
  expect(await local(page, recordKeys)).toEqual(Object.fromEntries(recordKeys.map(key => [key, b[key]])));
  expect(await local(page, [markerKey])).toEqual({ [markerKey]: null });
  expect(await qa.readLanguage(other)).toEqual(b);
});

test('Japanese reset keeps owner RLS and denies anonymous RPC execution', async ({ qa }) => {
  const other = await qa.createAccount();
  const before = await qa.readLanguage();
  const otherBefore = await qa.readLanguage(other);
  const read = await other.client.from('language_user_state').select('state').eq('user_id', qa.account.id);
  expect(read.error).toBeNull(); expect(read.data).toEqual([]);
  const write = await other.client.from('language_user_state').update({ state: { forbidden: true } }).eq('user_id', qa.account.id).select();
  expect(write.error).toBeNull(); expect(write.data).toEqual([]);
  const insert = await other.client.from('language_user_state').insert({ user_id: qa.account.id, state: {} });
  expect(insert.error?.code).toBe('42501');
  const remove = await other.client.from('language_user_state').delete().eq('user_id', qa.account.id).select();
  expect(remove.error).toBeNull(); expect(remove.data).toEqual([]);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url !== 'http://127.0.0.1:54321' || !key) throw new Error('Disposable anonymous client configuration required');
  const anonymous = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const denied = await anonymous.rpc('reset_my_app_records', { p_app: 'language', p_request_id: randomUUID(), p_confirmation: '초기화' });
  expect(denied.error?.code).toBe('42501'); expect(denied.data).toBeNull();
  expect(await qa.readLanguage()).toEqual(before); expect(await qa.readLanguage(other)).toEqual(otherBefore);
});

test('Japanese reset with an injected readback failure preserves local records and retries the same real committed RPC request', async ({ page, context, qa }) => {
  const a = seeded('A');
  const seed = await qa.account.client.from('language_user_state').update({ state: a }).eq('user_id', qa.account.id).select('state').single();
  expect(seed.error).toBeNull(); expect(seed.data?.state).toEqual(a);
  await login(page, qa.account, '/language/settings'); await languageSynced(page);
  expect(await local(page, recordKeys)).toEqual(Object.fromEntries(recordKeys.map(key => [key, a[key]])));
  const kept = settings(await qa.readLanguage());
  const calls: { requestId: string; marker: string }[] = [];
  const rpcUrl = 'http://127.0.0.1:54321/rest/v1/rpc/reset_my_app_records';
  // The RPC always reaches real disposable Postgres. Only the following browser
  // GET is deliberately replaced by Traffic's labelled synthetic HTTP 503.
  // No production RPC/body or successful response is fabricated here.
  const rpcRoutes = new RouteDrain();
  let tearingDown = false;
  await context.route(rpcUrl, route => rpcRoutes.run(async () => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    const response = await route.fetch({ maxRetries: 0 });
    expect(response.ok()).toBe(true);
    const request = route.request().postDataJSON() as { p_app: string; p_request_id: string; p_confirmation: string };
    expect(request).toMatchObject({ p_app: 'language', p_confirmation: '초기화' });
    const receipt = await response.json() as { app: string; user_id: string; marker: string };
    expect(receipt).toMatchObject({ app: 'language', user_id: qa.account.id });
    expect(receipt.marker.split('|')[1]).toBe(request.p_request_id);
    calls.push({ requestId: request.p_request_id, marker: receipt.marker });
    if (calls.length === 1 && !tearingDown) qa.traffic.failReads = true;
    await route.fulfill({ response });
  }));
  try {
    const panel = page.getByRole('region', { name: '일본어 기록 초기화', exact: true });
    await expect(panel.getByText(`대상 계정: ${qa.account.email}`, { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '일본어 기록 초기화하기', exact: true }).click();
    await panel.getByRole('checkbox').check();
    await panel.getByLabel('확인을 위해 ‘초기화’를 입력해 주세요.', { exact: true }).fill('초기화');
    const submit = panel.getByRole('button', { name: '일본어 기록 영구 삭제', exact: true });
    await submit.click();
    await expect(panel.getByText('서버의 일본어 초기화 결과를 확인하지 못했어요. 이 기기의 기록은 지우지 않았으니 같은 버튼으로 다시 확인해 주세요.', { exact: true })).toBeVisible();
    expect(calls).toHaveLength(1);
    await expect(page.getByText('일본어 기록을 초기화했어요. 유지되는 항목은 아래에서 확인해 주세요.', { exact: true })).toHaveCount(0);
    expect(await local(page, recordKeys)).toEqual(Object.fromEntries(recordKeys.map(key => [key, a[key]])));
    expect(await local(page, [markerKey])).toEqual({ [markerKey]: null });
    expect(qa.traffic.entries.some(entry => entry.table === 'language_user_state' && entry.method === 'GET' && entry.status === 503 && entry.synthetic)).toBe(true);
    // A separate real authenticated read proves the database reset committed even
    // though this browser cannot yet verify it. The failure is not a DB failure.
    const committed = await qa.readLanguage();
    for (const key of APP_RECORD_KEYS.language) expect(committed).not.toHaveProperty(key);
    expect(committed[markerKey]).toBe(calls[0].marker); expect(settings(committed)).toEqual(kept);
    qa.traffic.failReads = false;
    await submit.click();
    await expect(page.getByText('일본어 기록을 초기화했어요. 유지되는 항목은 아래에서 확인해 주세요.', { exact: true })).toBeVisible();
    await languageSynced(page);
    expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]);
    await assertCleared(page, await qa.readLanguage(), calls[0].marker, kept);
    await page.reload(); await languageSynced(page);
    await assertCleared(page, await qa.readLanguage(), calls[0].marker, kept);
  } finally {
    // Keep the generic external-origin blocker installed until this callback
    // finishes too; fixture Traffic only drains its own registered callbacks.
    tearingDown = true;
    qa.traffic.failReads = false;
    await rpcRoutes.wait();
    await context.unroute(rpcUrl);
  }
});
