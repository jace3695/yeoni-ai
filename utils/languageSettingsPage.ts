import { DEFAULT_INTEGRATED_LEARNING_SETTINGS, INTEGRATED_LEARNING_SETTINGS_KEY, type IntegratedLearningSettings } from './integratedLearningSettings.ts';

// This active page boundary alone fails closed. Legacy readers, writers and the
// cloud collector keep their existing contracts; this is not a cloud write gate.
export type LearningSection = 'kana' | 'words' | 'sentences' | 'speaking' | 'conversation';
export type CommonSectionSettings = { ttsRate: number; repeatCount: number; repeatDelayMs: number };
export type DetailedSectionSettings = CommonSectionSettings & { showKoreanPronunciation: boolean; showReading: boolean };
export type JapaneseAppSettings = { sections: { kana: CommonSectionSettings } & Record<Exclude<LearningSection, 'kana'>, DetailedSectionSettings> };
const common = { ttsRate: 1, repeatCount: 1, repeatDelayMs: 500 };
const detailed = { ...common, showKoreanPronunciation: true, showReading: true };
export const DEFAULT_SETTINGS: JapaneseAppSettings = { sections: { kana: { ...common }, words: { ...detailed }, sentences: { ...detailed }, speaking: { ...detailed }, conversation: { ...detailed } } };
export const DAILY_GOAL_OPTIONS = [1, 2, 3, 4, 5] as const;
export const isValidTtsRate = (value: unknown): value is number => [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2].includes(value as number);
export const isValidRepeatCount = (value: unknown): value is number => [1, 2, 3].includes(value as number);
export const isValidRepeatDelayMs = (value: unknown): value is number => [0, 300, 500, 1000, 1500, 2000].includes(value as number);

type Reason = 'invalid' | 'read' | 'stale' | 'owner' | 'write' | 'confirmation' | 'not-ready';
export class LanguageSettingsPageError extends Error {
  readonly reason: Reason;
  constructor(reason: Reason) {
    super({
      invalid: '설정의 형식을 확인하지 못했어요. 원본은 변경하지 않았습니다. 초기화하지 말고 지원을 요청해 주세요.',
      read: '설정을 읽지 못했어요. 저장소 연결을 확인한 뒤 설정을 다시 읽어 주세요.',
      stale: '다른 화면이나 동기화에서 설정이 바뀌었어요. 현재 선택은 화면에 남아 있습니다. 저장된 설정을 다시 읽고 선택해 주세요.',
      owner: '계정 연결이 바뀌었어요. 이 화면의 선택은 저장하지 않습니다. 로그인 상태를 확인한 뒤 설정 화면을 다시 열어 주세요.',
      write: '설정을 모두 저장하지 못했어요. 일부는 기기에 반영됐을 수 있습니다. 현재 선택은 화면에 남아 있으니 저장 공간을 확인한 뒤 다시 저장해 주세요.',
      confirmation: '설정의 저장 결과를 확인하지 못했어요. 일부는 기기에 반영됐을 수 있습니다. 설정을 다시 읽어 확인해 주세요.',
      'not-ready': '학습 기록 연결을 확인하는 중이에요. 연결이 준비된 뒤 다시 시도해 주세요.',
    }[reason]);
    this.name = 'LanguageSettingsPageError'; this.reason = reason;
  }
}
const keys = { japanese: 'japaneseAppSettings', learning: 'learningSettings', integrated: INTEGRATED_LEARNING_SETTINGS_KEY } as const;
type Part = keyof typeof keys;
const contextKeys = ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1'] as const;
export type SettingsPageSnapshot = { storage: Storage; raw: Record<Part, string | null>; context: (string | null)[]; needsRead?: boolean };
export type SettingsPageValues = { japanese: JapaneseAppSettings; learning: Record<string, unknown> & { dailyGoalCount: number }; integrated: IntegratedLearningSettings };
export type SettingsPageRead = SettingsPageValues & { snapshot: SettingsPageSnapshot };
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LanguageSettingsPageError('invalid');
  return value as Record<string, unknown>;
}
function parseObject(raw: string | null): Record<string, unknown> {
  if (raw === null) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new LanguageSettingsPageError('invalid'); }
  const value = object(parsed), pending: unknown[] = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'number' && !Number.isFinite(item)) throw new LanguageSettingsPageError('invalid');
    if (item && typeof item === 'object') pending.push(...Object.values(item));
  }
  return value;
}
function commonSection(value: Record<string, unknown>, fallback: CommonSectionSettings) {
  for (const [key, validate] of Object.entries({ ttsRate: isValidTtsRate, repeatCount: isValidRepeatCount, repeatDelayMs: isValidRepeatDelayMs })) {
    if (own(value, key) && !validate(value[key])) throw new LanguageSettingsPageError('invalid');
  }
  for (const key of ['showKoreanPronunciation', 'showReading']) if (own(value, key) && typeof value[key] !== 'boolean') throw new LanguageSettingsPageError('invalid');
  return { ...fallback, ...value } as CommonSectionSettings;
}
function parseJapanese(raw: string | null): JapaneseAppSettings {
  const value = parseObject(raw);
  const legacyFields = Object.fromEntries(['ttsRate', 'repeatCount', 'repeatDelayMs', 'showReading', 'showKoreanPronunciation'].filter(key => own(value, key)).map(key => [key, value[key]]));
  const legacy = commonSection(legacyFields, common);
  const baseDetailed = { ...detailed, ...legacy };
  const sections = own(value, 'sections') ? object(value.sections) : {};
  const section = (key: LearningSection, fallback: CommonSectionSettings) => commonSection(own(sections, key) ? object(sections[key]) : {}, fallback);
  // Object spread preserves own __proto__ and other future fields as data.
  return { ...value, sections: { ...sections, kana: section('kana', legacy), words: section('words', baseDetailed), sentences: section('sentences', baseDetailed), speaking: section('speaking', baseDetailed), conversation: section('conversation', baseDetailed) } } as JapaneseAppSettings;
}
function parseIntegrated(raw: string | null): IntegratedLearningSettings {
  const value = parseObject(raw);
  const choices: Record<string, readonly unknown[]> = { dailyMinutes: [5, 10, 20], preferredTrack: ['foundation', 'work', 'travel'], audioRate: [0.8, 0.9, 1], learnerMode: ['starter', 'reader'] };
  for (const key of Object.keys(DEFAULT_INTEGRATED_LEARNING_SETTINGS)) {
    if (!own(value, key)) continue;
    if (choices[key] ? !choices[key].includes(value[key]) : typeof value[key] !== 'boolean') throw new LanguageSettingsPageError('invalid');
  }
  return { ...DEFAULT_INTEGRATED_LEARNING_SETTINGS, ...value } as IntegratedLearningSettings;
}
function parseLearning(raw: string | null): SettingsPageValues['learning'] {
  const value = parseObject(raw);
  if (own(value, 'dailyGoalCount') && !DAILY_GOAL_OPTIONS.includes(value.dailyGoalCount as 1)) throw new LanguageSettingsPageError('invalid');
  return { dailyGoalCount: 5, ...value } as SettingsPageValues['learning'];
}
function readSnapshot(): SettingsPageSnapshot {
  try {
    const storage = window.localStorage;
    if (storage.getItem('language-storage-transaction-v1') !== null || storage.getItem('yeoni-storage-transaction-v1') !== null) throw Error('Pending storage recovery');
    const context = contextKeys.map(key => storage.getItem(key));
    if (!context[0] || context[0] !== context[2]) throw new LanguageSettingsPageError('owner');
    return { storage, context, raw: { japanese: storage.getItem(keys.japanese), learning: storage.getItem(keys.learning), integrated: storage.getItem(keys.integrated) } };
  } catch (error) { if (error instanceof LanguageSettingsPageError) throw error; throw new LanguageSettingsPageError('read'); }
}
function sameOwner(expected: SettingsPageSnapshot, current: SettingsPageSnapshot) {
  if (expected.storage !== current.storage || expected.context.slice(0, 4).some((value, i) => value !== current.context[i])) throw new LanguageSettingsPageError('owner');
}
export function readLanguageSettingsPage(previous?: SettingsPageSnapshot): SettingsPageRead {
  const snapshot = readSnapshot();
  if (previous) sameOwner(previous, snapshot);
  return { japanese: parseJapanese(snapshot.raw.japanese), learning: parseLearning(snapshot.raw.learning), integrated: parseIntegrated(snapshot.raw.integrated), snapshot };
}
/** Synchronous compare-before-write and per-key readback, not a cross-tab lock
 * or multi-key transaction. Never roll old bytes back over newer data. Confirmed
 * keys advance even if a later write fails, allowing an unchanged-choice retry. */
export function saveLanguageSettingsPage(expected: SettingsPageSnapshot, values: Partial<SettingsPageValues>) {
  if (expected.needsRead) throw new LanguageSettingsPageError('confirmation');
  const parts = Object.keys(values) as Part[];
  const serialized = Object.fromEntries(parts.map(part => [part, JSON.stringify(values[part])])) as Record<Part, string>;
  for (const part of parts) {
    if (part === 'japanese') parseJapanese(serialized[part]);
    else if (part === 'learning') parseLearning(serialized[part]);
    else parseIntegrated(serialized[part]);
  }
  const assertCurrent = () => {
    const current = readSnapshot(); sameOwner(expected, current);
    if (expected.context[4] !== current.context[4] || parts.some(part => expected.raw[part] !== current.raw[part])) throw new LanguageSettingsPageError('stale');
    return current;
  };
  assertCurrent(); // All requested keys checked before any write.
  for (const part of parts) {
    const current = assertCurrent();
    if (current.raw[part] === serialized[part]) continue;
    try { current.storage.setItem(keys[part], serialized[part]); }
    catch {
      // Native Storage failures are atomic, but an intercepted setter can throw
      // after writing. Only an unchanged readback is a safely retryable failure.
      try {
        const afterFailure = readSnapshot(); sameOwner(current, afterFailure);
        if (afterFailure.context[4] !== current.context[4] || parts.some(key => afterFailure.raw[key] !== current.raw[key])) throw Error('Uncertain write');
      } catch { expected.needsRead = true; throw new LanguageSettingsPageError('confirmation'); }
      throw new LanguageSettingsPageError('write');
    }
    let confirmed: SettingsPageSnapshot;
    try { confirmed = readSnapshot(); sameOwner(current, confirmed); }
    catch { expected.needsRead = true; throw new LanguageSettingsPageError('confirmation'); }
    if (confirmed.context[4] !== current.context[4] || confirmed.raw[part] !== serialized[part]) { expected.needsRead = true; throw new LanguageSettingsPageError('confirmation'); }
    expected.raw[part] = serialized[part];
  }
  assertCurrent();
}
