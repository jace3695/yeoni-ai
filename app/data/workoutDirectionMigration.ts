import { buildCurrentWorkoutSettings, CURRENT_WORKOUT_DIRECTION_BACKUP_KEY, CURRENT_WORKOUT_DIRECTION_VERSION, CURRENT_WORKOUT_DIRECTION_VERSION_KEY } from './currentWorkoutDirection.ts';
import { DEFAULT_WEEKLY_WORKOUT_PLAN_ID, LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY, SELECTED_WEEKLY_WORKOUT_PLAN_KEY, WEEKLY_WORKOUT_PLANS } from './workoutPlans.ts';
import { USER_WORKOUT_SETTINGS_KEY, type UserWorkoutSettings } from './userWorkoutSettings.ts';
import { assertStorageOwnership } from './storageOwnership.ts';
import { notifyRecordsChanged, writeStorageBatch } from './storageTransaction.ts';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const JOURNAL_KEY = 'yeoni-storage-transaction-v1';
const OWNER_KEY = 'fitness-cloud-sync-user';
const EPOCH_KEY = 'fitness-cloud-sync-epoch';
export const WORKOUT_DIRECTION_RAW_BACKUP_PREFIX = 'ai-fitness-workout-direction-raw-backup-v1:';
export const WORKOUT_DIRECTION_SOURCE_KEYS = [USER_WORKOUT_SETTINGS_KEY, SELECTED_WEEKLY_WORKOUT_PLAN_KEY, LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY, CURRENT_WORKOUT_DIRECTION_VERSION_KEY, CURRENT_WORKOUT_DIRECTION_BACKUP_KEY] as const;
const blocked = () => new Error('운동 설정 원문을 안전하게 보관하지 못해 계획 변경을 멈췄습니다. 기존 기록을 유지한 채 저장 공간과 로그인 상태를 확인해 주세요.');
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function settingsFromRaw(raw: string | null): UserWorkoutSettings {
  const value: unknown = raw === null ? {} : JSON.parse(raw);
  if (!object(value)) throw blocked();
  for (const key of ['weeklyGroups', 'exerciseTargets', 'weeklyEdits', 'weeklyMethods', 'dateOverrides', 'weeklyExerciseTargets']) {
    if (Object.hasOwn(value, key) && (!object(value[key])
      || Object.values(value[key]).some(item => key === 'weeklyGroups' ? typeof item !== 'string' : !object(item)))) throw blocked();
  }
  if (object(value.weeklyExerciseTargets) && Object.values(value.weeklyExerciseTargets).some(targets => !object(targets) || Object.values(targets).some(target => !object(target)))) throw blocked();
  if (Object.hasOwn(value, 'adaptiveReviewDecisions') && (!Array.isArray(value.adaptiveReviewDecisions) || value.adaptiveReviewDecisions.some(item => !object(item)))) throw blocked();
  // Match the existing reader's view, but retain the exact, unnormalized source
  // separately before any field is reset. Unknown fields are never discarded
  // from the immutable raw backup.
  return {
    weeklyGroups: value.weeklyGroups || {}, exerciseTargets: value.exerciseTargets || {},
    weeklyEdits: value.weeklyEdits || {}, weeklyMethods: value.weeklyMethods || {},
    dateOverrides: value.dateOverrides || {}, weeklyExerciseTargets: value.weeklyExerciseTargets || {},
    adaptiveReviewDecisions: Array.isArray(value.adaptiveReviewDecisions) ? value.adaptiveReviewDecisions.slice(0, 20) : [],
  } as UserWorkoutSettings;
}

/** Synchronous, owner-scoped migration. Existing backups are never overwritten.
 * Each source gets a unique cloud-synced key, so two devices' raw snapshots do
 * not compete for one backup slot. This preserves evidence, not a restore UI.
 */
export function initializeWorkoutDirection(storage: StorageLike) {
  assertStorageOwnership();
  const owner = storage.getItem(OWNER_KEY), epoch = storage.getItem(EPOCH_KEY);
  const assertScope = () => {
    assertStorageOwnership();
    if (storage.getItem(OWNER_KEY) !== owner || storage.getItem(EPOCH_KEY) !== epoch) throw blocked();
  };
  assertScope();
  // Root ownership recovery handles interrupted journals. Never recover or
  // overwrite an unresolved journal from this mounted page's migration.
  if (storage.getItem(JOURNAL_KEY) !== null) throw blocked();
  const raw = Object.fromEntries(WORKOUT_DIRECTION_SOURCE_KEYS.map(key => [key, storage.getItem(key)])) as Record<typeof WORKOUT_DIRECTION_SOURCE_KEYS[number], string | null>;
  assertScope();
  const settings = settingsFromRaw(raw[USER_WORKOUT_SETTINGS_KEY]);
  const savedPlan = raw[SELECTED_WEEKLY_WORKOUT_PLAN_KEY] || raw[LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY] || DEFAULT_WEEKLY_WORKOUT_PLAN_ID;
  const weeklyPlanId = WEEKLY_WORKOUT_PLANS.some(plan => plan.id === savedPlan) ? savedPlan : DEFAULT_WEEKLY_WORKOUT_PLAN_ID;
  if (raw[CURRENT_WORKOUT_DIRECTION_VERSION_KEY] === CURRENT_WORKOUT_DIRECTION_VERSION) {
    return { settings, weeklyPlanId, migrated: false, notified: true };
  }
  const oldBackup = raw[CURRENT_WORKOUT_DIRECTION_BACKUP_KEY];
  if (oldBackup !== null && !object(JSON.parse(oldBackup))) throw blocked();
  const id = globalThis.crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw blocked();
  const backupKey = WORKOUT_DIRECTION_RAW_BACKUP_PREFIX + id;
  if (storage.getItem(backupKey) !== null) throw blocked();
  const savedAt = new Date().toISOString();
  const backupRaw = JSON.stringify({ schema: 1, targetVersion: CURRENT_WORKOUT_DIRECTION_VERSION, savedAt, owner, epoch, raw });
  const next = buildCurrentWorkoutSettings(settings);
  const assertUnchanged = () => {
    assertScope();
    if (storage.getItem(JOURNAL_KEY) !== null || storage.getItem(backupKey) !== null
      || WORKOUT_DIRECTION_SOURCE_KEYS.some(key => storage.getItem(key) !== raw[key])) throw blocked();
  };
  assertUnchanged();
  let started = false;
  const checkedStorage: StorageLike = {
    getItem: key => {
      const value = storage.getItem(key);
      if (key === JOURNAL_KEY && !started && value !== null) throw blocked();
      return value;
    },
    setItem: (key, value) => {
      if (key === JOURNAL_KEY) assertUnchanged();
      storage.setItem(key, value);
      if (key === backupKey && storage.getItem(key) !== value) throw blocked();
      if (key === JOURNAL_KEY) started = true;
    },
    removeItem: key => storage.removeItem(key),
  };
  const changes: Record<string, string | null> = {
    [backupKey]: backupRaw,
    [USER_WORKOUT_SETTINGS_KEY]: JSON.stringify(next),
    [SELECTED_WEEKLY_WORKOUT_PLAN_KEY]: DEFAULT_WEEKLY_WORKOUT_PLAN_ID,
    [LEGACY_SELECTED_WEEKLY_WORKOUT_PLAN_KEY]: null,
    [CURRENT_WORKOUT_DIRECTION_VERSION_KEY]: CURRENT_WORKOUT_DIRECTION_VERSION,
  };
  if (oldBackup === null) changes[CURRENT_WORKOUT_DIRECTION_BACKUP_KEY] = JSON.stringify({ savedAt, selectedPlanId: weeklyPlanId, settings });
  // Backup is written first. The shipped raw journal restores all values if a
  // later write fails; no React state is published before commit completes.
  writeStorageBatch(checkedStorage, changes);
  try { notifyRecordsChanged(); return { settings: next, weeklyPlanId: DEFAULT_WEEKLY_WORKOUT_PLAN_ID, migrated: true, notified: true }; }
  catch { return { settings: next, weeklyPlanId: DEFAULT_WEEKLY_WORKOUT_PLAN_ID, migrated: true, notified: false }; }
}
