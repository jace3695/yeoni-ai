import { expect, canonical, type State } from './fixture';
import { buildAdaptiveWorkoutReview, type AdaptiveReviewInput, type AdaptiveWorkoutReview } from '../../app/data/workoutAdaptiveReview';
import type { UserWorkoutSettings } from '../../app/data/userWorkoutSettings';
export { silentGuard, noOverflow } from './japanese-reference-routine-state';
const key = 'ai-fitness-user-workout-settings';
export const same = (actual: unknown, expected: unknown, label: string) => expect(canonical(actual), label).toBe(canonical(expected));
export function plannedReview(state: State, date: string, exercise: string) {
  const review = buildAdaptiveWorkoutReview({ settings: state[key], workouts: state['ai-fitness-workout-completed-days'], conditions: state['ai-fitness-daily-condition'], selectedPlanId: state['ai-fitness-selected-weekly-workout-plan'], today: date } as AdaptiveReviewInput);
  expect(review.action, 'workout-one-increase').toBe('increase'); expect(review.change?.scope).toBe('weekly');
  expect(['mon', 'wed', 'fri']).toContain(review.change?.dayId);
  expect(review.change?.groupId).toBeUndefined(); expect(review.change?.method).toBeUndefined();
  same(review.change?.targets, { [exercise]: { reps: 12, weightKg: 5.5 } }, 'workout-one-load-target');
  same(review.change?.previousTargets, { [exercise]: { reps: 12 } }, 'workout-previous-target');
  return review;
}
export function expectedApplied(before: State, saved: State, review: AdaptiveWorkoutReview, date: string, exercise: string, started: number, observed: number): State {
  const settings = before[key] as UserWorkoutSettings, after = saved[key] as UserWorkoutSettings, change = review.change!;
  expect(after.adaptiveReviewDecisions, 'workout-one-decision').toHaveLength(1);
  const entry = after.adaptiveReviewDecisions![0], at = Date.parse(entry.decidedAt);
  expect(Number.isFinite(at) && at >= started - 2000 && at <= observed + 2000, 'workout-decision-time-bound').toBe(true);
  same(entry, { id: review.id, action: 'increase', decision: 'applied', decidedAt: entry.decidedAt, decidedFor: date, evidenceThrough: review.evidenceThrough, summary: `${change.before} → ${change.after}` }, 'workout-exact-decision');
  const previous = new Date(`${change.date}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 7);
  const priorDate = previous.toISOString().slice(0, 10);
  const overrides = settings.dateOverrides[priorDate] ? settings.dateOverrides : { ...settings.dateOverrides, [priorDate]: {
    groupId: settings.weeklyGroups[change.dayId], method: settings.weeklyMethods[change.dayId],
    exerciseTargets: { ...settings.exerciseTargets, ...settings.weeklyExerciseTargets?.[change.dayId], ...change.previousTargets },
  } };
  return { ...before, [key]: { ...settings, dateOverrides: overrides,
    weeklyExerciseTargets: { ...settings.weeklyExerciseTargets, [change.dayId]: { ...settings.weeklyExerciseTargets?.[change.dayId], [exercise]: { reps: 12, weightKg: 5.5 } } },
    adaptiveReviewDecisions: [entry],
  } };
}
