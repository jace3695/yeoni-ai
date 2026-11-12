import { DEFAULT_INTEGRATED_LEARNING_SETTINGS, INTEGRATED_LEARNING_SETTINGS_KEY } from '../../utils/integratedLearningSettings.ts';
import type { LearnerMode, LearningMinutes } from '../../utils/learningSession.ts';
import { PreviewMemoryStorage } from './memory-storage.ts';

export type PreviewSessionOptions = { minutes: LearningMinutes; mode: LearnerMode };

function readSettings(store: PreviewMemoryStorage): Record<string, unknown> {
  // This helper cannot be used to write the real browser's settings.
  if (!(store instanceof PreviewMemoryStorage)) throw new Error('가상 메모리에서만 검사 설정을 바꿀 수 있어요.');
  const raw = store.getItem(INTEGRATED_LEARNING_SETTINGS_KEY);
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('기존 검사 설정을 읽지 못했어요. 설정과 기록은 바꾸지 않았어요.');
  return value as Record<string, unknown>;
}

export function readPreviewSessionOptions(store: PreviewMemoryStorage): PreviewSessionOptions {
  const settings = readSettings(store);
  return {
    minutes: settings.dailyMinutes === 5 || settings.dailyMinutes === 20 ? settings.dailyMinutes : DEFAULT_INTEGRATED_LEARNING_SETTINGS.dailyMinutes,
    mode: settings.learnerMode === 'reader' ? 'reader' : 'starter',
  };
}

/** Change only the defaults for future sessions. Existing drafts/answers and
 * review/level records are neither read nor written by this operation. The real
 * FocusedLesson continues to prefer its existing draft over these defaults. */
export function applyPreviewSessionOptions(store: PreviewMemoryStorage, options: PreviewSessionOptions) {
  if (![5, 10, 20].includes(options.minutes) || !['starter', 'reader'].includes(options.mode)) throw new Error('검사 분량과 모드를 다시 골라 주세요.');
  const settings = readSettings(store);
  store.setItem(INTEGRATED_LEARNING_SETTINGS_KEY, JSON.stringify({ ...settings, dailyMinutes: options.minutes, learnerMode: options.mode }));
}
