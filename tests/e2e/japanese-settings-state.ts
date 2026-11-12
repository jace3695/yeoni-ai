import type { Page } from '@playwright/test';
import { expect, canonical, type State, type Traffic } from './fixture';
import { LANGUAGE_DATA_KEYS } from '../../app/data/languageStorageLock';
import { synced, type Qa } from './japanese-level-flow-state';

export const settingsKeys = ['japaneseAppSettings', 'learningSettings', 'integratedLearningSettingsV1'] as const;
export type SettingsKey = typeof settingsKeys[number];
export type SettingsFaultMode = 'observe' | 'before-write' | 'readback';
type FaultStats = { writes: Record<SettingsKey, number>; hits: number; failedReads: number };
type FaultControl = { restore: () => void; stats: FaultStats };
type FaultWindow = Window & { __qaSettingsFault?: FaultControl };
export const successText = '학습 목표와 통합 과정 설정이 저장됐어요.';
export const errors = {
  stale: '다른 화면이나 동기화에서 설정이 바뀌었어요.',
  write: '설정을 모두 저장하지 못했어요.',
  confirmation: '설정의 저장 결과를 확인하지 못했어요.',
  invalid: '설정의 형식을 확인하지 못했어요.',
};
// Independent synthetic input, deliberately not imported from the product defaults.
// Unknown fields at all three settings boundaries must survive intended UI diffs.
// Object.fromEntries creates an enumerable own data key, never a prototype setter.
const ownFuture = Object.fromEntries([['__proto__', { syntheticKeep: ['own-data', 9] }]]);
const common = { ttsRate: 1, repeatCount: 1, repeatDelayMs: 500 };
const detail = { ...common, showKoreanPronunciation: true, showReading: true };
export const syntheticJapanese = { ...ownFuture, futureRoot: { keep: ['synthetic', 7] }, sections: {
  ...ownFuture, kana: { ...common, ...ownFuture, futureSection: { keep: true } }, words: { ...detail }, sentences: { ...detail },
  speaking: { ...detail }, conversation: { ...detail }, futureSection: { preserve: [1, 2] },
} };
export async function seedSettings(qa: Qa): Promise<State> {
  const before = await qa.readLanguage();
  const state = { ...before, japaneseAppSettings: JSON.stringify(syntheticJapanese),
    learningSettings: JSON.stringify({ dailyGoalCount: 5, ...ownFuture, futureGoal: { keep: ['synthetic', 2] } }),
    integratedLearningSettingsV1: JSON.stringify({ dailyMinutes: 10, preferredTrack: 'foundation', showReading: true, showMeaning: true,
      autoPlayDialogue: false, includeSpeaking: true, audioRate: 0.9, learnerMode: 'starter', hasChosenStart: true,
      showCompanion: true, homeCompanionMotion: true, showKoreanHint: true, ...ownFuture, futureIntegrated: { keep: { nested: true } } }),
    savedWords: JSON.stringify([{ id: 'synthetic-history', word: 'あいさつ', meaning: '인사', example: 'こんにちは。' }]),
  };
  const seeded = await qa.account.client.from('language_user_state').update({ state }).eq('user_id', qa.account.id).select('state').single();
  expect(seeded.error).toBeNull(); expect(seeded.data?.state).toEqual(state);
  return state;
}
export const changed = (state: State, key: SettingsKey, patch: Record<string, unknown>): State => ({
  ...state, [key]: JSON.stringify({ ...JSON.parse(state[key] as string), ...patch }),
});
export const selectedGoal = (page: Page, count: number) => page.getByRole('button', { name: new RegExp(`^${count}\\s*개$`) });
export const saveLearning = (page: Page) => page.getByRole('button', { name: '설정 저장', exact: true }).click();
export const noSuccess = (page: Page) => expect(page.getByText(successText, { exact: true })).toHaveCount(0);
export const settingsError = (page: Page, kind: keyof typeof errors) => expect(page.getByRole('alert').filter({ hasText: errors[kind] })).toBeVisible();
export async function settingsState(page: Page): Promise<State> {
  return page.evaluate(keys => Object.fromEntries(keys.flatMap(key => {
    const value = localStorage.getItem(key); return value === null ? [] : [[key, value]];
  })), [...LANGUAGE_DATA_KEYS]);
}
export async function localSettings(page: Page, expected: State) {
  expect(canonical(await settingsState(page))).toBe(canonical(expected));
}
export function hasSettingsAcknowledgement(entries: Traffic['entries'], expected: State) {
  const writes = entries.filter(entry => entry.table === 'language_user_state' && entry.method === 'PATCH'
    && entry.status === 200 && entry.matched && entry.cas && entry.delivered && !entry.synthetic && canonical(entry.sent) === canonical(expected));
  return entries.some(entry => entry.table === 'language_user_state' && entry.method === 'GET'
    && entry.status === 200 && entry.delivered && !entry.synthetic && canonical(entry.receivedState) === canonical(expected)
    && writes.some(write => entry.started >= write.received));
}
const confirmedThrough = new WeakMap<Qa, number>();
export async function confirmedSettings(page: Page, qa: Qa, expected: State, fitness: State) {
  // Exact local intent first. A prior green badge or old matching reply is not
  // proof of this new edit, including explicit correction back to an older value.
  await localSettings(page, expected);
  await expect.poll(async () => canonical(await qa.readLanguage())).toBe(canonical(expected));
  await expect.poll(() => hasSettingsAcknowledgement(qa.traffic.entries.slice(confirmedThrough.get(qa) ?? 0), expected)).toBe(true);
  await synced(page); qa.traffic.assertLanguageConfirmed(expected); expect(await qa.read()).toEqual(fitness);
  confirmedThrough.set(qa, qa.traffic.entries.length);
}
export async function rereadSettings(page: Page, accept: boolean) {
  const seen: { type: string; message: string }[] = [];
  const handler = async (dialog: import('@playwright/test').Dialog) => {
    seen.push({ type: dialog.type(), message: dialog.message() });
    if (accept) await dialog.accept(); else await dialog.dismiss();
  };
  page.on('dialog', handler);
  try {
    await page.getByRole('button', { name: '저장된 설정 다시 읽기', exact: true }).click();
    expect(seen).toEqual([{ type: 'confirm', message: '화면의 저장하지 않은 선택을 버리고 기기에 저장된 설정을 다시 읽을까요? 일부 설정은 이미 반영됐을 수 있어요.' }]);
  } finally { page.off('dialog', handler); }
}
// Installed only after genuine Auth/GET and on this page's Storage realm. Native
// writes are retained except the one named synthetic fault. No network replies,
// app module, React mount, timers, owner, epoch or transaction key are replaced.
export async function installSettingsFault(page: Page, key: SettingsKey, mode: SettingsFaultMode) {
  await page.evaluate(({ key, mode }) => {
    const target = window as FaultWindow;
    if (target.__qaSettingsFault) throw new Error('Synthetic settings fault already installed');
    const prototype = Storage.prototype;
    const getDescriptor = Object.getOwnPropertyDescriptor(prototype, 'getItem')!;
    const setDescriptor = Object.getOwnPropertyDescriptor(prototype, 'setItem')!;
    const get = prototype.getItem, set = prototype.setItem, storage = window.localStorage;
    const stats: FaultStats = { writes: { japaneseAppSettings: 0, learningSettings: 0, integratedLearningSettingsV1: 0 }, hits: 0, failedReads: 0 };
    let armedRead = false;
    Object.defineProperty(prototype, 'setItem', { ...setDescriptor, value(this: Storage, name: string, value: string) {
      if (this === storage && Object.prototype.hasOwnProperty.call(stats.writes, name)) stats.writes[name as SettingsKey]++;
      if (this !== storage || name !== key || mode === 'observe' || stats.hits !== 0) return set.call(this, name, value);
      stats.hits++;
      if (mode === 'before-write') throw new DOMException('Synthetic settings write failure', 'QuotaExceededError');
      set.call(this, name, value); armedRead = true;
    } });
    Object.defineProperty(prototype, 'getItem', { ...getDescriptor, value(this: Storage, name: string) {
      if (this === storage && name === key && armedRead) {
        armedRead = false; stats.failedReads++;
        throw new DOMException('Synthetic settings readback failure', 'SecurityError');
      }
      return get.call(this, name);
    } });
    target.__qaSettingsFault = { stats, restore() {
      Object.defineProperty(prototype, 'getItem', getDescriptor); Object.defineProperty(prototype, 'setItem', setDescriptor);
      delete target.__qaSettingsFault;
    } };
  }, { key, mode });
  return {
    stats: () => page.evaluate(() => {
      const fault = (window as FaultWindow).__qaSettingsFault;
      if (!fault) throw new Error('Synthetic settings fault missing');
      return fault.stats;
    }),
    restore: () => restoreSettingsFault(page),
  };
}
export async function restoreSettingsFault(page: Page) {
  if (!page.isClosed()) await page.evaluate(() => (window as FaultWindow).__qaSettingsFault?.restore());
}
// Explicit corruption/correction of a generated fixture only. The cloud collector
// can upload these raw bytes; this must never be called on real user data.
export async function replaceSyntheticSettings(page: Page, key: SettingsKey, value: string) {
  await page.evaluate(({ key, value }) => {
    if (!['japaneseAppSettings', 'learningSettings', 'integratedLearningSettingsV1'].includes(key)) throw new Error('Non-settings fault refused');
    localStorage.setItem(key, value);
  }, { key, value });
}
