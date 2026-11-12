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
  await page.setViewportSize({ width: 320, height: 844 });
  const date = today();
  const settings = buildCurrentWorkoutSettings({ weeklyGroups: {}, weeklyMethods: {}, weeklyEdits: {}, exerciseTargets: {}, dateOverrides: {} });
  settings.weeklyExerciseTargets = Object.fromEntries(['mon', 'wed', 'fri'].map((day) => [day, { [MAIN_EXERCISES[0]]: { reps: 12 } }]));
  const workouts = {
    ...(original['ai-fitness-workout-completed-days'] as Record<string, unknown>),
    [dateMinus(date, 1)]: completedStrengthSession(),
    [dateMinus(date, 2)]: completedStrengthSession(),
    [dateMinus(date, 3)]: completedStrengthSession(),
  };
  const seeded: State = {
    ...original,
    'ai-fitness-workout-completed-days': workouts,
    'ai-fitness-user-workout-settings': settings,
    'ai-fitness-selected-weekly-workout-plan': 'five-day-fullbody-circuit',
    'ai-fitness-workout-direction-version': 'five-day-circuit-v1',
  };
  const update = await qa.account.client.from('user_app_state').update({ state: seeded }).eq('user_id', qa.account.id);
  expect(update.error).toBeNull();

  // Primary history above is explicit synthetic fixture input, not UI-created training.
  const language = await qa.readLanguage();
  const silence = await silentGuard(page, context);
  try {
    await login(page, qa.account, '/fitness'); await synced(page);
    await expect.poll(async () => canonical(await qa.read())).toBe(canonical(seeded));
    same(await localState(page), seeded, 'workout-initial-local-exact');
    const before = await qa.read(), localBefore = await localState(page);
    const review = plannedReview(before, date, MAIN_EXERCISES[0]);
    const card = page.getByRole('region', { name: '기록에 따른 운동 조정', exact: true });
    const preserved = async () => {
      same(await qa.read(), before, 'workout-preview-db-unchanged');
      same(await localState(page), localBefore, 'workout-preview-local-unchanged');
      same(await qa.readLanguage(), language, 'workout-language-unchanged');
    };
    await expect(card.getByText('근력일 한 운동의 중량 0.5kg 증가 검토', { exact: true })).toBeVisible();
    await noOverflow(page); await silence.check();
    await card.getByRole('button', { name: '변경 내용 확인', exact: true }).click();
    const apply = card.getByRole('button', { name: '확인한 변경 적용', exact: true });
    await expect(apply).toBeDisabled(); await preserved();
    // The UI offers collapse, not a no-write "keep plan" decision. Collapse is cancellation here.
    await card.getByRole('button', { name: '변경 내용 접기', exact: true }).click();
    await expect(apply).toHaveCount(0); await preserved();
    await card.getByRole('button', { name: '변경 내용 확인', exact: true }).click();
    await expect(apply).toBeDisabled();
    await expect(card.getByText(review.change!.before, { exact: true })).toBeVisible();
    await expect(card.getByText(review.change!.after, { exact: true })).toBeVisible();
    await card.getByLabel(/5\.5kg 덤벨을 안전하게 준비/).check();
    await expect(apply).toBeEnabled(); await preserved();
    const started = Date.now();
    await apply.click(); await expect(card.getByText(/확인한 변경을 적용했습니다/)).toBeVisible();
    await synced(page);
    await expect.poll(async () => ((await qa.read())['ai-fitness-user-workout-settings'] as typeof settings).adaptiveReviewDecisions?.length).toBe(1);
    const saved = await qa.read();
    const next = expectedApplied(before, saved, review, date, MAIN_EXERCISES[0], started, Date.now());
    same(saved, next, 'workout-exact-db-change');
    same(await localState(page), next, 'workout-exact-local-change');
    qa.traffic.assertConfirmed(next);
    same(await qa.readLanguage(), language, 'workout-language-preserved-after-save');
    await noOverflow(page); await silence.check();
    await page.reload(); await synced(page);
    same(await qa.read(), next, 'workout-reload-exact-db');
    same(await localState(page), next, 'workout-reload-exact-local');
    same(await qa.readLanguage(), language, 'workout-reload-language-preserved');
    await card.getByText('내가 확인한 조정 이력', { exact: true }).click();
    await expect(card.getByText(`${review.change!.before} → ${review.change!.after}`, { exact: true })).toBeVisible();
    expect(today(), 'workout-no-midnight-crossing').toBe(date);
    expect(qa.traffic.blockedOrigins.size, 'workout-no-external-origin').toBe(0);
    await noOverflow(page); await silence.check();
  } finally { await silence.restore(); }
});
