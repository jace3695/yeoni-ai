import { buildCurrentWorkoutSettings, CURRENT_WEEKLY_METHODS } from '../../app/data/currentWorkoutDirection';
import { expect, login, original, synced, test, today, type State } from './fixture';
import { canonical, localState } from './fixture'; import { plannedReview, expectedApplied, same, silentGuard, noOverflow } from './workout-core-state';
const MAIN_EXERCISES = ['덤벨 고블릿 스쿼트', '밴드 로우', '덤벨 플로어프레스', '루프밴드 사이드워크', '버드독'];

function dateMinus(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function completedStrengthSession() {
  return {
    workoutDone: true,
    workoutGroupId: 'current-fullbody-strength-circuit',
    workoutStatus: 'completed',
    workoutDifficulty: 'easy',
    workoutFatigue: 2,
    workoutBackStatus: 'none',
    workoutNeurologicalSymptoms: [],
    workoutMethod: { ...CURRENT_WEEKLY_METHODS.mon },
    workoutExerciseRecords: MAIN_EXERCISES.map((exerciseName, exerciseIndex) => ({
      exerciseName,
      status: 'completed',
      sets: Array.from({ length: 3 }, (_, setIndex) => ({
        setNumber: setIndex + 1,
        completed: true,
        plannedReps: exerciseIndex === 0 ? 12 : exerciseIndex === 1 ? 10 : exerciseIndex === 4 ? 6 : 8,
        reps: exerciseIndex === 0 ? 12 : exerciseIndex === 1 ? 10 : exerciseIndex === 4 ? 6 : 8,
        weightKg: exerciseIndex === 0 || exerciseIndex === 2 ? 5 : undefined,
        bandLevel: exerciseIndex === 1 || exerciseIndex === 3 ? '약' : undefined,
      })),
    })),
  };
}

test('authenticated workout review requires confirmation before applying one load step', async ({ page, context, qa }) => {
  await test.step('workout phase 001', async () => { await page.setViewportSize({ width: 320, height: 844 }); });
  const date = await test.step('workout phase 002', async () => (today()));
  const settings = await test.step('workout phase 003', async () => (buildCurrentWorkoutSettings({ weeklyGroups: {}, weeklyMethods: {}, weeklyEdits: {}, exerciseTargets: {}, dateOverrides: {} })));
  await test.step('workout phase 004', async () => { settings.weeklyExerciseTargets = Object.fromEntries(['mon', 'wed', 'fri'].map((day) => [day, { [MAIN_EXERCISES[0]]: { reps: 12 } }])); });
  const workouts = await test.step('workout phase 005', async () => ({
    ...(original['ai-fitness-workout-completed-days'] as Record<string, unknown>),
    [dateMinus(date, 1)]: completedStrengthSession(),
    [dateMinus(date, 2)]: completedStrengthSession(),
    [dateMinus(date, 3)]: completedStrengthSession(),
  }));
  const seeded: State = await test.step('workout phase 006', async () => ({
    ...original,
    'ai-fitness-workout-completed-days': workouts,
    'ai-fitness-user-workout-settings': settings,
    'ai-fitness-selected-weekly-workout-plan': 'five-day-fullbody-circuit',
    'ai-fitness-workout-direction-version': 'five-day-circuit-v1',
  }));
  const update = await test.step('workout phase 007', async () => (await qa.account.client.from('user_app_state').update({ state: seeded }).eq('user_id', qa.account.id)));
  await test.step('workout phase 008', async () => { expect(update.error).toBeNull(); });

  // Primary history above is explicit synthetic fixture input, not UI-created training.
  const language = await test.step('workout phase 009', async () => (await qa.readLanguage()));
  const silence = await test.step('workout phase 010', async () => (await silentGuard(page, context)));
  try {
    await test.step('workout phase 011', async () => { await login(page, qa.account, '/fitness'); }); await test.step('workout phase 012', async () => { await synced(page); });
    await test.step('workout phase 013', async () => { await expect.poll(async () => canonical(await qa.read())).toBe(canonical(seeded)); });
    await test.step('workout phase 014', async () => { same(await localState(page), seeded, 'workout-initial-local-exact'); });
    const before = await test.step('workout phase 015', async () => (await qa.read())), localBefore = await test.step('workout phase 016', async () => (await localState(page)));
    const review = await test.step('workout phase 017', async () => (plannedReview(before, date, MAIN_EXERCISES[0])));
    const card = await test.step('workout phase 018', async () => (page.getByRole('region', { name: '기록에 따른 운동 조정', exact: true })));
    const preserved = async () => {
      same(await qa.read(), before, 'workout-preview-db-unchanged');
      same(await localState(page), localBefore, 'workout-preview-local-unchanged');
      same(await qa.readLanguage(), language, 'workout-language-unchanged');
    };
    await test.step('workout phase 019', async () => { await expect(card.getByText('근력일 한 운동의 중량 0.5kg 증가 검토', { exact: true })).toBeVisible(); });
    await test.step('workout phase 020', async () => { await noOverflow(page); }); await test.step('workout phase 021', async () => { await silence.check(); });
    await test.step('workout phase 022', async () => { await card.getByRole('button', { name: '변경 내용 확인', exact: true }).click(); });
    const apply = await test.step('workout phase 023', async () => (card.getByRole('button', { name: '확인한 변경 적용', exact: true })));
    await test.step('workout phase 024', async () => { await expect(apply).toBeDisabled(); }); await test.step('workout phase 025', async () => { await preserved(); });
    // The UI offers collapse, not a no-write "keep plan" decision. Collapse is cancellation here.
    await test.step('workout phase 026', async () => { await card.getByRole('button', { name: '변경 내용 접기', exact: true }).click(); });
    await test.step('workout phase 027', async () => { await expect(apply).toHaveCount(0); }); await test.step('workout phase 028', async () => { await preserved(); });
    await test.step('workout phase 029', async () => { await card.getByRole('button', { name: '변경 내용 확인', exact: true }).click(); });
    await test.step('workout phase 030', async () => { await expect(apply).toBeDisabled(); });
    await test.step('workout phase 031', async () => { await expect(card.getByText(review.change!.before, { exact: true })).toBeVisible(); });
    await test.step('workout phase 032', async () => { await expect(card.getByText(review.change!.after, { exact: true })).toBeVisible(); });
    await test.step('workout phase 033', async () => { await card.getByLabel(/5\.5kg 덤벨을 안전하게 준비/).check(); });
    await test.step('workout phase 034', async () => { await expect(apply).toBeEnabled(); }); await test.step('workout phase 035', async () => { await preserved(); });
    const started = await test.step('workout phase 036', async () => (Date.now()));
    await test.step('workout phase 037', async () => { await apply.click(); }); await test.step('workout phase 038', async () => { await expect(card.getByText(/확인한 변경을 적용했습니다/)).toBeVisible(); });
    await test.step('workout phase 039', async () => { await synced(page); });
    await test.step('workout phase 040', async () => { await expect.poll(async () => ((await qa.read())['ai-fitness-user-workout-settings'] as typeof settings).adaptiveReviewDecisions?.length).toBe(1); });
    const saved = await test.step('workout phase 041', async () => (await qa.read()));
    const next = await test.step('workout phase 042', async () => (expectedApplied(before, saved, review, date, MAIN_EXERCISES[0], started, Date.now())));
    await test.step('workout phase 043', async () => { same(saved, next, 'workout-exact-db-change'); });
    await test.step('workout phase 044', async () => { same(await localState(page), next, 'workout-exact-local-change'); });
    await test.step('workout phase 045', async () => { qa.traffic.assertConfirmed(next); });
    await test.step('workout phase 046', async () => { same(await qa.readLanguage(), language, 'workout-language-preserved-after-save'); });
    await test.step('workout phase 047', async () => { await noOverflow(page); }); await test.step('workout phase 048', async () => { await silence.check(); });
    await test.step('workout phase 049', async () => { await page.reload(); }); await test.step('workout phase 050', async () => { await synced(page); });
    await test.step('workout phase 051', async () => { same(await qa.read(), next, 'workout-reload-exact-db'); });
    await test.step('workout phase 052', async () => { same(await localState(page), next, 'workout-reload-exact-local'); });
    await test.step('workout phase 053', async () => { same(await qa.readLanguage(), language, 'workout-reload-language-preserved'); });
    await test.step('workout phase 054', async () => { await card.getByText('내가 확인한 조정 이력', { exact: true }).click(); });
    await test.step('workout phase 055', async () => { await expect(card.getByText(`${review.change!.before} → ${review.change!.after}`, { exact: true })).toBeVisible(); });
    await test.step('workout phase 056', async () => { expect(today(), 'workout-no-midnight-crossing').toBe(date); });
    await test.step('workout phase 057', async () => { expect(qa.traffic.blockedOrigins.size, 'workout-no-external-origin').toBe(0); });
    await test.step('workout phase 058', async () => { await noOverflow(page); }); await test.step('workout phase 059', async () => { await silence.check(); });
    // Additional synthetic corruption coverage; the original happy path above is unchanged.
    const corruptionKey = 'ai-fitness-workout-completed-days';
    const corruptionRaw = '{synthetic-workout-corruption';
    const rawFitness = await test.step('workout phase 061', async () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('ai-fitness-')).sort().map(key => [key, localStorage.getItem(key)]))));
    const rawLanguage = await test.step('workout phase 062', async () => page.evaluate(keys => Object.fromEntries(keys.sort().map(key => [key, localStorage.getItem(key)])), Object.keys(language)));
    const writesBeforeCorruption = await test.step('workout phase 063', async () => qa.traffic.entries.filter(entry => entry.method !== 'GET').length);
    const corruptionAlert = page.getByRole('alert').filter({ hasText: '운동 기록을 안전하게 읽거나 저장하지 못했습니다. 원본은 보존했으며 기록 저장을 중단했습니다.' });
    try {
      await test.step('workout phase 064', async () => { await page.evaluate(({ key, raw }) => { const oldValue = localStorage.getItem(key); localStorage.setItem(key, raw); window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue: raw, storageArea: localStorage })); }, { key: corruptionKey, raw: corruptionRaw }); });
      await test.step('workout phase 065', async () => { await expect(corruptionAlert).toBeVisible(); });
      await test.step('workout phase 066', async () => { await silence.check(); });
      await test.step('workout phase 067', async () => { await page.reload(); });
      await test.step('workout phase 068', async () => { await expect(corruptionAlert).toBeVisible(); });
      await test.step('workout phase 069', async () => { await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toBeVisible(); });
      await test.step('workout phase 080', async () => { await page.evaluate(() => window.dispatchEvent(new Event('yeoni-records-changed'))); });
      await test.step('workout phase 081', async () => { await expect(corruptionAlert).toBeVisible(); await silence.check(); });
      await test.step('workout phase 070', async () => { await expect(corruptionAlert.getByRole('button')).toHaveCount(0); await expect(card).toHaveCount(0); });
      await test.step('workout phase 071', async () => { same(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('ai-fitness-')).sort().map(key => [key, localStorage.getItem(key)]))), { ...rawFitness, [corruptionKey]: corruptionRaw }, 'workout-corruption-local-raw-preserved'); });
      await test.step('workout phase 072', async () => { same(await qa.read(), next, 'workout-corruption-database-preserved'); same(await qa.readLanguage(), language, 'workout-corruption-language-database-preserved'); });
      await test.step('workout phase 073', async () => { same(await page.evaluate(keys => Object.fromEntries(keys.sort().map(key => [key, localStorage.getItem(key)])), Object.keys(language)), rawLanguage, 'workout-corruption-language-local-preserved'); });
      await test.step('workout phase 074', async () => { expect(qa.traffic.entries.filter(entry => entry.method !== 'GET').length, 'workout-corruption-no-server-writes').toBe(writesBeforeCorruption); });
      await test.step('workout phase 075', async () => { await noOverflow(page); await silence.check(); });
    } finally {
      await test.step('workout phase 076', async () => { await page.evaluate(({ key, raw }) => { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); }, { key: corruptionKey, raw: rawFitness[corruptionKey] }); });
    }
    await test.step('workout phase 077', async () => { await page.reload(); await synced(page); await expect(card).toBeVisible(); });
    await test.step('workout phase 078', async () => { same(await localState(page), next, 'workout-reentry-local-exact'); same(await qa.read(), next, 'workout-reentry-database-exact'); same(await qa.readLanguage(), language, 'workout-reentry-language-exact'); });
    await test.step('workout phase 079', async () => { expect(today(), 'workout-corruption-no-midnight-crossing').toBe(date); expect(qa.traffic.blockedOrigins.size, 'workout-corruption-no-external-origin').toBe(0); await noOverflow(page); await silence.check(); });
  } finally { await test.step('workout phase 060', async () => { await silence.restore(); }); }
});
