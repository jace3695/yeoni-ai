import { fastingStartForDay } from '../../lib/diet-time.ts';
import { DIET_COMPLETED_DAYS_KEY, DIET_GOAL_CHECK_ITEMS, DIET_SAFETY_CHECK_ITEMS, DINNER_CARB_CHOICE_KEY, DINNER_COMPLETED_TIME_KEY, LUNCH_CARB_CHOICE_KEY, LUNCH_PROTEIN_CHOICE_KEY, FASTING_START_TIME_KEY, WATER_INTAKE_KEY, getLocalDateKey, normalizeDinnerCarbStore, normalizeLunchCarbStore, normalizeLunchProteinStore } from './dietPlans.ts';
import type { DinnerCarbRecord, LunchCarbRecord, LunchProteinRecord } from './dietPlans.ts';
import { WORKOUT_COMPLETED_DAYS_KEY, readWorkoutCompletionStore, writeWorkoutCompletionStore } from './workoutCompletion.ts';
import type { WorkoutCompletionStore } from './workoutCompletion.ts';
import type { DailyConditionRecord } from './recoveryMode.ts';
import { notifyRecordsChanged, recoverStorageTransaction } from './storageTransaction.ts';
import { assertStorageOwnership } from './storageOwnership.ts';

export const WEIGHT_RECORDS_KEY = 'ai-fitness-weight-records';
export const INBODY_RECORDS_KEY = 'ai-fitness-inbody-records';
export const WEIGHT_GOAL_KEY = 'ai-fitness-weight-goal';
export const DAILY_NOTES_KEY = 'ai-fitness-daily-notes';
export const DAILY_CONDITION_KEY_FOR_RECORDS = 'ai-fitness-daily-condition';

export type DietDayRecord = Record<string, unknown> & { meals?: Record<string, boolean>; safetyAlert?: boolean; dietStatus?: string; fastingRecordStatus?: string; fastingHours?: number; fastingSuccess?: boolean; dietMemo?: string };
export type DietCompletedStore = Record<string, DietDayRecord>;
export type NumberStore = Record<string, number>;
export type StringStore = Record<string, string>;

export interface WeightRecord { weight: number; recordedAt: string }
export type WeightRecordStore = Record<string, WeightRecord>;

export interface WeightGoal {
  minKg: number;
  maxKg: number;
}

export const DEFAULT_WEIGHT_GOAL: WeightGoal = { minKg: 65, maxKg: 67 };

export type BodyMetricSource = { device: 'OA Smart Scale PRO' | 'OA long report' | 'InBody 270S English report'; originalLabel: string; originalUnit?: string; originalText?: string; method: 'ocr' | 'ocr-edited'; mappingVersion: 'oa-pro-v1' | 'inbody-270s-en-v1' };
export type BodyMetricSources = Partial<Record<string, BodyMetricSource>>;
export interface InbodyRecord {
  standardWeight?: number;
  reportedBodyAge?: number;
  reportedBodyAgeUnit?: string;
  bodyShape?: string;
  /** Source wall-clock text; no inferred timezone or UTC conversion. */
  measurementTime?: string;
  trunkMuscleMass?: number;
  trunkFatMass?: number;
  metricSources?: BodyMetricSources;
  weight?: number;
  bmi?: number;
  musclePercent?: number;
  skeletalMuscleMass?: number;
  muscleMass?: number;
  bodyFatMass?: number;
  fatMass?: number;
  bodyFatPercent?: number;
  visceralFatLevel?: number;
  subcutaneousFatMass?: number;
  subcutaneousFatPercent?: number;
  bodyWaterPercent?: number;
  proteinPercent?: number;
  fatFreeMass?: number;
  boneMass?: number;
  basalMetabolicRate?: number;
  bodyAge?: number;
  bodyScore?: number;
  leftArmFatMass?: number;
  rightArmFatMass?: number;
  leftLegFatMass?: number;
  rightLegFatMass?: number;
  leftArmMuscleMass?: number;
  rightArmMuscleMass?: number;
  leftLegMuscleMass?: number;
  rightLegMuscleMass?: number;
  memo?: string;
}
/** One non-normalizing contract shared by calendar reads, saving and sync. */
export function isValidInbodyRecord(value: unknown): value is InbodyRecord {
  const object = (item: unknown): item is Record<string, unknown> => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)
      || Object.prototype.toString.call(item) !== '[object Object]') return false;
    for (const key in item) if (!Object.prototype.hasOwnProperty.call(item, key)) return false;
    return true;
  };
  const reserved = (key: string) => key === '__proto__' || key === 'prototype' || key === 'constructor';
  if (!object(value)) return false;
  return Object.entries(value).every(([name, field]) => {
    if (reserved(name)) return false;
    if (name === 'measurementTime') return typeof field === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(field);
    if (['memo', 'bodyShape', 'reportedBodyAgeUnit'].includes(name)) return typeof field === 'string';
    if (name === 'metricSources') {
      if (!object(field)) return false;
      return Object.entries(field).every(([metric, source]) => {
        if (reserved(metric) || !object(source)) return false;
        const own = (key: string) => Object.prototype.hasOwnProperty.call(source, key);
        return own('device') && typeof source.device === 'string' && ['OA Smart Scale PRO', 'OA long report', 'InBody 270S English report'].includes(source.device)
          && own('originalLabel') && typeof source.originalLabel === 'string'
          && own('method') && typeof source.method === 'string' && ['ocr', 'ocr-edited'].includes(source.method)
          && own('mappingVersion') && typeof source.mappingVersion === 'string' && ['oa-pro-v1', 'inbody-270s-en-v1'].includes(source.mappingVersion)
          && Object.entries(source).every(([key, entry]) =>
            ['device', 'originalLabel', 'originalUnit', 'originalText', 'method', 'mappingVersion'].includes(key)
            && typeof entry === 'string');
      });
    }
    // Preserve existing and future numeric metrics without rounding or stripping.
    return typeof field === 'number' && Number.isFinite(field) && field >= 0;
  });
}
export type InbodyRecordStore = Record<string, InbodyRecord>;
export type DailyNotesStore = Record<string, string>;
export type DailyConditionStore = Record<string, DailyConditionRecord>;
export interface RecoveryDayRecord { recoveryMode: boolean; reasons: string[]; completedAsRecovery?: boolean; recoveryPriorityOnly?: boolean; recoveryMemo?: string; intensity: 'normal' | '70%' | 'recovery'; updatedAt?: string }
export type RecoveryModeStore = Record<string, RecoveryDayRecord>;
export const RECOVERY_MODE_DAYS_KEY_FOR_RECORDS = 'ai-fitness-recovery-mode-days';

export interface RecordStores {
  workouts: WorkoutCompletionStore;
  diet: DietCompletedStore;
  water: NumberStore;
  dinner: StringStore;
  dinnerCarbs: Record<string, DinnerCarbRecord>;
  lunchCarbs: Record<string, LunchCarbRecord>;
  lunchProteins: Record<string, LunchProteinRecord>;
  fastingStart: string;
  weights: WeightRecordStore;
  inbody: InbodyRecordStore;
  weightGoal: WeightGoal;
  notes: DailyNotesStore;
  recovery: RecoveryModeStore;
  conditions: DailyConditionStore;
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  recoverStorageTransaction(window.localStorage);
  if (key === WORKOUT_COMPLETED_DAYS_KEY) return readWorkoutCompletionStore() as T;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  assertStorageOwnership();
  if (key === WORKOUT_COMPLETED_DAYS_KEY) writeWorkoutCompletionStore(value as WorkoutCompletionStore);
  else window.localStorage.setItem(key, JSON.stringify(value));
  notifyRecordsChanged();
}

export function normalizeWeightGoal(value: unknown): WeightGoal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_WEIGHT_GOAL };
  }
  const candidate = value as Partial<WeightGoal>;
  const minKg = Math.round(Number(candidate.minKg) * 10) / 10;
  const maxKg = Math.round(Number(candidate.maxKg) * 10) / 10;
  if (
    !Number.isFinite(minKg) ||
    !Number.isFinite(maxKg) ||
    minKg < 30 ||
    maxKg > 250 ||
    minKg > maxKg
  ) {
    return { ...DEFAULT_WEIGHT_GOAL };
  }
  return { minKg, maxKg };
}

export function saveWeightGoal(goal: WeightGoal) {
  const normalized = normalizeWeightGoal(goal);
  writeJson(WEIGHT_GOAL_KEY, normalized);
  return normalized;
}

function readBodyRecords<T>(key: string, kind: "weight" | "inbody"): T {
  if (typeof window === "undefined") return {} as T;
  const raw = window.localStorage.getItem(key);
  const value: unknown = raw === null ? {} : JSON.parse(raw);
  const isObject = (item: unknown): item is Record<string, unknown> =>
    item !== null && typeof item === "object" && !Array.isArray(item);
  if (!isObject(value) || !Object.entries(value).every(([date, entry]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isObject(entry)) return false;
    if (kind === "weight") return typeof entry.weight === "number" && Number.isFinite(entry.weight)
      && entry.weight > 0 && typeof entry.recordedAt === "string";
    return isValidInbodyRecord(entry);
  })) throw new Error("기존 체중·인바디 기록 형식을 확인할 수 없습니다.");
  return value as T;
}

export function readRecordStores(options: { strictBodyRecords?: boolean } = {}): RecordStores {
  return {
    workouts: readJson<WorkoutCompletionStore>(WORKOUT_COMPLETED_DAYS_KEY, {}),
    diet: readJson<DietCompletedStore>(DIET_COMPLETED_DAYS_KEY, {}),
    water: readJson<NumberStore>(WATER_INTAKE_KEY, {}),
    dinner: readJson<StringStore>(DINNER_COMPLETED_TIME_KEY, {}),
    dinnerCarbs: normalizeDinnerCarbStore(readJson<Record<string, unknown>>(DINNER_CARB_CHOICE_KEY, {})),
    lunchCarbs: normalizeLunchCarbStore(readJson<Record<string, unknown>>(LUNCH_CARB_CHOICE_KEY, {})),
    lunchProteins: normalizeLunchProteinStore(readJson<Record<string, unknown>>(LUNCH_PROTEIN_CHOICE_KEY, {})),
    fastingStart: typeof window === 'undefined' ? '' : fastingStartForDay(window.localStorage.getItem(FASTING_START_TIME_KEY) ?? undefined, getLocalDateKey()),
    weights: options.strictBodyRecords ? readBodyRecords<WeightRecordStore>(WEIGHT_RECORDS_KEY, "weight") : readJson<WeightRecordStore>(WEIGHT_RECORDS_KEY, {}),
    inbody: options.strictBodyRecords ? readBodyRecords<InbodyRecordStore>(INBODY_RECORDS_KEY, "inbody") : readJson<InbodyRecordStore>(INBODY_RECORDS_KEY, {}),
    weightGoal: normalizeWeightGoal(readJson<unknown>(WEIGHT_GOAL_KEY, DEFAULT_WEIGHT_GOAL)),
    notes: readJson<DailyNotesStore>(DAILY_NOTES_KEY, {}),
    recovery: readJson<RecoveryModeStore>(RECOVERY_MODE_DAYS_KEY_FOR_RECORDS, {}),
    conditions: readJson<DailyConditionStore>(DAILY_CONDITION_KEY_FOR_RECORDS, {}),
  };
}

export function isDietSuccess(record?: DietDayRecord) {
  if (!record) return false;
  return DIET_GOAL_CHECK_ITEMS.every((item) => Boolean(record[item.id]));
}

export function getDietGoalCount(record?: DietDayRecord) {
  return DIET_GOAL_CHECK_ITEMS.filter((item) => Boolean(record?.[item.id])).length;
}

export function hasSafetyAlert(record?: DietDayRecord) {
  return Boolean(record?.safetyAlert) || DIET_SAFETY_CHECK_ITEMS.some((item) => Boolean(record?.[item.id]));
}

export function isTodayKey(dateKey: string) {
  return dateKey === getLocalDateKey();
}

export function getPreviousWeightRecord(weights: WeightRecordStore, dateKey: string) {
  return Object.entries(weights)
    .filter(([key, record]) => key < dateKey && Number.isFinite(record.weight) && record.weight > 0)
    .sort(([a], [b]) => b.localeCompare(a))[0];
}

export function getMonthDateKeys(year: number, monthIndex: number) {
  const end = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: end }, (_, idx) => getLocalDateKey(new Date(year, monthIndex, idx + 1)));
}
