import { DIET_STATUS_LABELS, FASTING_STATUS_LABELS } from './dietPlans.ts';

function label(labels: Record<string, string>, value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(labels, value) ? labels[value] : '미기록';
}
export const calendarDietStatusLabel = (value: unknown) => label(DIET_STATUS_LABELS, value);
export const calendarFastingStatusLabel = (value: unknown) => label(FASTING_STATUS_LABELS, value);
