import { expect, canonical, type State } from './fixture';
import { buildAdaptiveWorkoutReview, type AdaptiveReviewInput, type AdaptiveWorkoutReview } from '../../app/data/workoutAdaptiveReview';
import type { UserWorkoutSettings } from '../../app/data/userWorkoutSettings';
export { noOverflow } from './japanese-reference-routine-state';
import { isReferencePinStatusRead } from './japanese-reference-routine-state';
import type { Page, BrowserContext, Route, Request, Response } from '@playwright/test';
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

// Workout-only mandatory read. No AI invocation, writes, alternate URL or body.
export function isWorkoutHistoryRead(url: string, method: string, body: string | null): boolean {
  return url === 'http://127.0.0.1:3000/api/fitness/coach/history' && method === 'GET' && body === null;
}

export async function silentGuard(page: Page, context: BrowserContext) {
  let apiRequests = 0, allowedPinStatusReads = 0, pageErrors = 0, historyFailures = 0;
  const historyRequests = new Set<Request>(), completedHistory = new Set<Request>();
  const onResponse = (response: Response) => {
    const request = response.request();
    if (!historyRequests.has(request)) return;
    void response.finished().then(error => {
      if (error || response.status() !== 200) historyFailures++;
      else completedHistory.add(request);
    }, () => { historyFailures++; });
  };
  const deny = async (route: Route) => {
    const request = route.request();
    if (isReferencePinStatusRead(request.url(), request.method(), request.postData())) {
      allowedPinStatusReads++; await route.fallback(); return;
    }
    if (isWorkoutHistoryRead(request.url(), request.method(), request.postData())) {
      historyRequests.add(request); await route.fallback(); return;
    }
    apiRequests++; await route.abort('blockedbyclient');
  };
  const onError = () => { pageErrors++; };
  await context.route('http://127.0.0.1:3000/api/**', deny);
  page.on('pageerror', onError); page.on('response', onResponse);
  await context.addInitScript(() => {
    const target = window as Window & { __qaReferenceSpeech?: { attempts: number; restore: () => boolean } };
    const speech = window.speechSynthesis;
    const descriptor = speech && Object.getOwnPropertyDescriptor(speech, 'speak');
    const control = { attempts: 0, restore: () => {
      if (speech) {
        if (descriptor) Object.defineProperty(speech, 'speak', descriptor);
        else Reflect.deleteProperty(speech, 'speak');
      }
      delete target.__qaReferenceSpeech;
      const after = speech && Object.getOwnPropertyDescriptor(speech, 'speak');
      return descriptor ? after?.value === descriptor.value && after?.get === descriptor.get && after?.set === descriptor.set
        && after?.configurable === descriptor.configurable && after?.enumerable === descriptor.enumerable && after?.writable === descriptor.writable : after === undefined;
    } };
    if (speech) Object.defineProperty(speech, 'speak', { configurable: true, value() { control.attempts++; throw new Error('Reference case forbids native speech'); } });
    target.__qaReferenceSpeech = control;
  });
  return {
    check: async () => {
      expect(apiRequests, 'reference-no-disallowed-api-or-paid-call').toBe(0);
      expect(allowedPinStatusReads, 'reference-pin-status-route-allowed').toBeGreaterThan(0);
      expect(historyRequests.size, 'workout-history-read-observed').toBeGreaterThan(0);
      await expect.poll(() => completedHistory.size === historyRequests.size, { message: 'workout-history-200-completed' }).toBe(true);
      expect(historyFailures, 'workout-history-read-failures').toBe(0);
      expect(pageErrors, 'reference-no-application-errors').toBe(0);
      expect(await page.evaluate(() => (window as Window & { __qaReferenceSpeech?: { attempts: number } }).__qaReferenceSpeech?.attempts), 'reference-no-native-speech-attempts').toBe(0);
      // Recheck after the last await: every read observed by this checkpoint must finish.
      expect(completedHistory.size, 'workout-history-final-completed').toBe(historyRequests.size);
      expect(historyFailures, 'workout-history-final-failures').toBe(0);
    },
    restore: async () => {
      try { if (!page.isClosed()) expect(await page.evaluate(() => (window as Window & { __qaReferenceSpeech?: { restore: () => boolean } }).__qaReferenceSpeech?.restore()), 'reference-speech-descriptor-restored').toBe(true); }
      finally { page.off('pageerror', onError); page.off('response', onResponse); await context.unroute('http://127.0.0.1:3000/api/**', deny); }
    },
  };
}
