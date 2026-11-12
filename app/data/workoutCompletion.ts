import { getLocalDateKey } from "./dietPlans.ts";

export type WorkoutDayId =
  | "sun"
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat";
export interface ExerciseSetRecord {
  setNumber: number;
  completed: boolean;
  reps?: number;
  weightKg?: number;
  durationSeconds?: number;
  bandLevel?: string;
  leftReps?: number;
  rightReps?: number;
  restAfterSeconds?: number;
  plannedReps?: number;
  plannedDurationSeconds?: number;
  plannedRestSeconds?: number;
}
export interface ExerciseRecord {
  exerciseName: string;
  status: "pending" | "completed" | "partial" | "skipped";
  durationMinutes?: number;
  sets?: ExerciseSetRecord[];
  distanceKm?: number;
  stepCount?: number;
  intervalWorkSeconds?: number;
  intervalRestSeconds?: number;
  intervalRounds?: number;
  painScore?: number;
  summary?: string;
  executionContext?: {
    method: "standard" | "circuit" | "superset" | "interval" | "free";
    sourceExerciseIndex: number;
    sequenceIndex: number;
    roundNumber?: number;
    groupNumber?: number;
    plannedSets?: number;
    plannedRestSeconds?: number;
    plannedWorkSeconds?: number;
  };
}
export type WorkoutOverallStatus = "completed" | "partial" | "stopped";
export type WorkoutDifficulty = "easy" | "moderate" | "hard";
export type WorkoutBackStatus = "none" | "stiff" | "pain" | "worse";
export type WorkoutNeurologicalSymptom =
  | "radiating-pain"
  | "tingling"
  | "numbness"
  | "leg-weakness";
export interface WorkoutFeedback {
  status: WorkoutOverallStatus;
  difficulty?: WorkoutDifficulty;
  fatigue?: number;
  lastSetRpe?: number;
  painArea?: string;
  backStatus?: WorkoutBackStatus;
  neurologicalSymptoms?: WorkoutNeurologicalSymptom[];
  painExercise?: string;
  painSet?: number;
}
export interface WorkoutDayRecord {
  workoutDone?: boolean;
  workoutRoutineName?: string;
  workoutPlanName?: string;
  workoutGroupId?: string;
  workoutExerciseNames?: string[];
  workoutSourceDay?: string;
  workoutPain?: boolean;
  workoutBackStatus?: WorkoutBackStatus;
  workoutNeurologicalSymptoms?: WorkoutNeurologicalSymptom[];
  workoutPainExercise?: string;
  workoutPainSet?: number;
  workoutMemo?: string;
  workoutStatus?: WorkoutOverallStatus;
  workoutDifficulty?: WorkoutDifficulty;
  workoutFatigue?: number;
  workoutLastSetRpe?: number;
  workoutPainArea?: string;
  workoutExerciseRecords?: ExerciseRecord[];
  workoutMethod?: {
    method: "standard" | "circuit" | "superset" | "interval" | "free";
    rounds: number;
    restSeconds: number;
    workSeconds: number;
  };
  workoutRecordedAt?: string;
  cardioDone?: boolean;
  cardioType?: string;
  cardioMinutes?: number;
  cardioMemo?: string;
  rosaryCardioDone?: boolean;
  rosaryCardioMinutes?: number;
  rosaryDecades?: number;
  postWorkoutCardioDone?: boolean;
  postWorkoutCardioMinutes?: number;
  pullupDone?: boolean;
  pullupStage?: number;
  pullupExerciseNames?: string[];
  pullupPain?: boolean;
  pullupMemo?: string;
  foamRollerDone?: boolean;
  foamRollerTiming?: "before" | "after" | "both" | "recovery";
  foamRollerAreas?: string[];
  foamRollerPain?: boolean;
  foamRollerMemo?: string;
}
export type WorkoutCompletionValue = boolean | WorkoutDayRecord;
export type WorkoutCompletionStore = Record<string, WorkoutCompletionValue>;

export function isWorkoutDone(value?: WorkoutCompletionValue) {
  return typeof value === "boolean" ? value : Boolean(value?.workoutDone);
}

export function isWorkoutPerformed(value?: WorkoutCompletionValue) {
  if (typeof value === "boolean") return value;
  return value?.workoutStatus === "completed" || value?.workoutStatus === "partial" || Boolean(value?.workoutDone);
}

export function isCardioDone(value?: WorkoutCompletionValue) {
  return typeof value === "object" && Boolean(value?.cardioDone);
}

export function isPullupDone(value?: WorkoutCompletionValue) {
  return typeof value === "object" && Boolean(value?.pullupDone);
}

const GENERAL_WORKOUT_FIELDS: (keyof WorkoutDayRecord)[] = [
  "workoutDone",
  "workoutRoutineName",
  "workoutPlanName",
  "workoutGroupId",
  "workoutExerciseNames",
  "workoutSourceDay",
  "workoutPain",
  "workoutBackStatus",
  "workoutNeurologicalSymptoms",
  "workoutPainExercise",
  "workoutPainSet",
  "workoutMemo",
  "workoutStatus",
  "workoutDifficulty",
  "workoutFatigue",
  "workoutLastSetRpe",
  "workoutPainArea",
  "workoutExerciseRecords",
  "workoutMethod",
  "workoutRecordedAt",
];

const CARDIO_FIELDS: (keyof WorkoutDayRecord)[] = [
  "cardioDone",
  "cardioType",
  "cardioMinutes",
  "cardioMemo",
];

const PULLUP_FIELDS: (keyof WorkoutDayRecord)[] = [
  "pullupDone",
  "pullupStage",
  "pullupExerciseNames",
  "pullupPain",
  "pullupMemo",
];

const FOAM_ROLLER_FIELDS: (keyof WorkoutDayRecord)[] = [
  "foamRollerDone",
  "foamRollerTiming",
  "foamRollerAreas",
  "foamRollerPain",
  "foamRollerMemo",
];

function removeFields(
  record: WorkoutDayRecord,
  fields: (keyof WorkoutDayRecord)[],
) {
  const preservedRecord = { ...record };
  fields.forEach((key) => delete preservedRecord[key]);
  return preservedRecord;
}

export function removeGeneralWorkoutRecord(record: WorkoutDayRecord) {
  return removeFields(record, GENERAL_WORKOUT_FIELDS);
}

export function removeCardioRecord(record: WorkoutDayRecord) {
  return removeFields(record, CARDIO_FIELDS);
}

export function removePullupRecord(record: WorkoutDayRecord) {
  return removeFields(record, PULLUP_FIELDS);
}

export function removeFoamRollerRecord(record: WorkoutDayRecord) {
  return removeFields(record, FOAM_ROLLER_FIELDS);
}

export function getWorkoutRecord(
  value?: WorkoutCompletionValue,
): WorkoutDayRecord {
  return typeof value === "object" && value
    ? value
    : { workoutDone: Boolean(value) };
}

export function getPreviousExerciseRecord(
  store: WorkoutCompletionStore,
  exerciseName: string,
) {
  const dateKeys = Object.keys(store).sort((a, b) => b.localeCompare(a));
  for (const dateKey of dateKeys) {
    const record = getWorkoutRecord(store[dateKey]);
    const exerciseRecord = record.workoutExerciseRecords?.find(
      (item) => item.exerciseName === exerciseName && item.status === "completed",
    );
    if (exerciseRecord) return exerciseRecord;
  }
  return undefined;
}

export const WORKOUT_COMPLETED_DAYS_KEY = "ai-fitness-workout-completed-days";
export const WORKOUT_DAY_IDS: WorkoutDayId[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

const dayIndexById: Record<WorkoutDayId, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function isWorkoutDayId(value: string): value is WorkoutDayId {
  return WORKOUT_DAY_IDS.includes(value as WorkoutDayId);
}

export function getDateForWorkoutDay(
  dayId: WorkoutDayId,
  baseDate = new Date(),
) {
  const current = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
  );
  const diff = dayIndexById[dayId] - current.getDay();
  current.setDate(current.getDate() + diff);
  return getLocalDateKey(current);
}

export function getWorkoutDayForDate(date = new Date()): WorkoutDayId | null {
  const entry = Object.entries(dayIndexById).find(
    ([, dayIndex]) => dayIndex === date.getDay(),
  );
  return entry ? (entry[0] as WorkoutDayId) : null;
}

export function getWeeklyWorkoutCompletion(
  store: WorkoutCompletionStore,
  baseDate = new Date(),
) {
  return WORKOUT_DAY_IDS.reduce<Record<WorkoutDayId, boolean>>(
    (acc, dayId) => {
      acc[dayId] = isWorkoutDone(store[getDateForWorkoutDay(dayId, baseDate)]);
      return acc;
    },
    {
      sun: false,
      mon: false,
      tue: false,
      wed: false,
      thu: false,
      fri: false,
      sat: false,
    },
  );
}

export const WORKOUT_STORAGE_ERROR = "운동 기록을 안전하게 읽거나 저장하지 못했습니다. 원본은 보존했으며 기록 저장을 중단했습니다.";

function invalidWorkoutStore(): never { throw new Error(WORKOUT_STORAGE_ERROR); }

/** Validate container shape without discarding unknown record fields. */
export function assertWorkoutCompletionStore(value: unknown): asserts value is WorkoutCompletionStore {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.prototype.toString.call(value) !== "[object Object]") invalidWorkoutStore();
  for (const [key, record] of Object.entries(value)) {
    if (!isWorkoutDayId(key)) {
      const date = new Date(key + "T12:00:00Z");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(date.getTime())
        || date.toISOString().slice(0, 10) !== key) invalidWorkoutStore();
    }
    if (typeof record === "boolean") continue; // historical boolean records
    if (!record || typeof record !== "object" || Array.isArray(record)
      || Object.prototype.toString.call(record) !== "[object Object]") invalidWorkoutStore();
    for (const flag of ["workoutDone", "cardioDone", "pullupDone", "foamRollerDone", "rosaryCardioDone", "postWorkoutCardioDone"]) {
      if (flag in record && (record as Record<string, unknown>)[flag] !== undefined
        && typeof (record as Record<string, unknown>)[flag] !== "boolean") invalidWorkoutStore();
    }
  }
}

export function readWorkoutCompletionStore(baseDate = new Date()): WorkoutCompletionStore {
  return readWorkoutCompletionStoreInternal(baseDate, true);
}

function readWorkoutCompletionStoreInternal(baseDate: Date, persistMigration: boolean): WorkoutCompletionStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WORKOUT_COMPLETED_DAYS_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    assertWorkoutCompletionStore(parsed);
    // Copy dated records first, independent of JSON property order. Never silently
    // replace a richer dated record with a legacy weekday boolean.
    const migrated: WorkoutCompletionStore = Object.fromEntries(Object.entries(parsed).filter(([key]) => !isWorkoutDayId(key)));
    let changed = false;
    for (const [key, value] of Object.entries(parsed)) {
      if (!isWorkoutDayId(key)) continue;
      changed = true;
      const date = getDateForWorkoutDay(key, baseDate);
      const incoming = typeof value === "boolean" ? { workoutDone: value } : value;
      const existing = migrated[date];
      if (existing === undefined) migrated[date] = incoming;
      else {
        const prior = typeof existing === "boolean" ? { workoutDone: existing } : existing;
        for (const field of Object.keys(incoming)) {
          if (Object.hasOwn(prior, field) && JSON.stringify(prior[field as keyof WorkoutDayRecord]) !== JSON.stringify(incoming[field as keyof WorkoutDayRecord])) invalidWorkoutStore();
        }
        migrated[date] = { ...prior, ...incoming };
      }
    }
    // Complete validation/collision checks precede the only write. On quota,
    // read, parse or migration failure the original storage entry stays intact.
    if (changed && persistMigration) window.localStorage.setItem(WORKOUT_COMPLETED_DAYS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch { return invalidWorkoutStore(); }
}

/** A caller's fallback/empty view must never overwrite an unreadable original. */
export function writeWorkoutCompletionStore(next: WorkoutCompletionStore): void {
  if (typeof window === "undefined") return;
  try {
    assertWorkoutCompletionStore(next);
    readWorkoutCompletionStoreInternal(new Date(), false);
    window.localStorage.setItem(WORKOUT_COMPLETED_DAYS_KEY, JSON.stringify(next));
  } catch { invalidWorkoutStore(); }
}

export function isWorkoutCompletedOnDate(
  store: WorkoutCompletionStore,
  date = new Date(),
) {
  return isWorkoutDone(store[getLocalDateKey(date)]);
}
