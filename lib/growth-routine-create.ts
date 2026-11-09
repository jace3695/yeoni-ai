import type { SupabaseClient } from '@supabase/supabase-js';
import type { GrowthRoutineRow } from '../app/data/growthPlatform.ts';
import { GROWTH_CATEGORIES, type GrowthCategoryId } from '../app/data/growthRoutines.ts';
import { normalizeGrowthPreferredDays, normalizeGrowthWeeklyTarget } from '../app/data/growthSchedule.ts';
import { resetMarkerKey } from '../app/data/appRecordReset.ts';

type JournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type NewGrowthRoutine = { id?: string; title: string; category: GrowthCategoryId; targetMinutes: number; preferredDays: number[]; targetSessionsPerWeek: number };
export type PendingGrowthRoutine = {
  version: 1;
  owner: string;
  resetMarker: string | null;
  row: Pick<GrowthRoutineRow, 'id' | 'user_id' | 'title' | 'category' | 'target_minutes' | 'preferred_days' | 'target_sessions_per_week' | 'enabled' | 'sort_order' | 'updated_at'>;
};
export const pendingGrowthRoutineKey = (owner: string) => `ai-yeoni-growth-create-v1:${owner}`;
export class GrowthRoutineResetConfirmation extends Error {}
const pendingMessage = '저장 결과를 아직 확인하지 못했어요. 같은 활동의 저장 결과를 다시 확인해 주세요.';

export function readPendingGrowthRoutine(storage: JournalStorage, owner: string): PendingGrowthRoutine | null {
  const raw = storage.getItem(pendingGrowthRoutineKey(owner));
  if (raw === null) return null;
  try {
    const item = JSON.parse(raw) as PendingGrowthRoutine;
    const row = item.row;
    if (item.version !== 1 || item.owner !== owner || !row || row.user_id !== owner
      || typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
      || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 60
      || !GROWTH_CATEGORIES.some(category => category.id === row.category)
      || !Number.isInteger(row.target_minutes) || row.target_minutes < 5 || row.target_minutes > 240
      || !Array.isArray(row.preferred_days) || !row.preferred_days.length || row.preferred_days.some(day => !Number.isInteger(day) || day < 1 || day > 7)
      || !Number.isInteger(row.target_sessions_per_week) || row.target_sessions_per_week < 1 || row.target_sessions_per_week > new Set(row.preferred_days).size
      || row.enabled !== true || !Number.isInteger(row.sort_order) || row.sort_order < 0 || row.sort_order > 1000
      || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))
      || (item.resetMarker !== null && typeof item.resetMarker !== 'string')) throw new Error('invalid');
    return item;
  } catch { throw new Error('이 탭의 미확인 활동 저장 정보를 읽지 못했어요. 새로고침 후 기존 활동 목록을 먼저 확인해 주세요.'); }
}

async function verifiedResetMarker(client: SupabaseClient, owner: string, check: () => void) {
  check();
  const auth = await client.auth.getUser();
  check();
  if (auth.error || auth.data.user?.id !== owner) throw new Error('계정이 변경됐어요. 현재 계정에서 다시 확인해 주세요.');
  const result = await client.from('user_app_state').select('state').eq('user_id', owner).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  check();
  if (result.error) throw new Error('기록 초기화 상태를 확인하지 못해 활동을 추가하지 않았어요. 다시 시도해 주세요.');
  const marker: unknown = result.data?.state?.[resetMarkerKey('growth')];
  return typeof marker === 'string' ? marker : null;
}

// Retain one exact request per tab and owner before dispatch. Reload only reads the
// journal; recovery is explicit. No upsert or deletion of cloud records is used.
export async function createGrowthRoutineSafely(client: SupabaseClient, owner: string, storage: JournalStorage, input: NewGrowthRoutine | null, sortOrder: number, check: () => void = () => {}, confirmAfterReset = false) {
  check();
  let pending = readPendingGrowthRoutine(storage, owner);
  if (pending && input) throw new Error(pendingMessage);
  if (!pending && !input) throw new Error('다시 확인할 저장 요청이 없어요. 활동 목록을 새로 불러와 주세요.');
  const marker = await verifiedResetMarker(client, owner, check);
  if (!pending) {
    const value = input!;
    const title = value.title.trim().slice(0, 60);
    if (!title || !Number.isFinite(value.targetMinutes) || !value.preferredDays.length) throw new Error('활동 이름과 진행할 요일을 확인해 주세요.');
    pending = { version: 1, owner, resetMarker: marker, row: {
      id: value.id ?? crypto.randomUUID(), user_id: owner, title, category: value.category,
      target_minutes: Math.min(240, Math.max(5, Math.round(value.targetMinutes))),
      preferred_days: normalizeGrowthPreferredDays(value.preferredDays),
      target_sessions_per_week: normalizeGrowthWeeklyTarget(value.targetSessionsPerWeek, value.preferredDays),
      enabled: true, sort_order: Math.min(1000, Math.max(0, Math.floor(sortOrder))), updated_at: new Date().toISOString(),
    } };
    const raw = JSON.stringify(pending);
    check();
    // A blocked/quota-limited journal must stop before any insert.
    storage.setItem(pendingGrowthRoutineKey(owner), raw);
    if (storage.getItem(pendingGrowthRoutineKey(owner)) !== raw) throw new Error('재시도 정보를 보관하지 못해 활동을 추가하지 않았어요.');
    readPendingGrowthRoutine(storage, owner);
  }
  const requestId = pending.row.id;
  let snapshot = JSON.stringify(pending);
  const unchanged = () => {
    check();
    if (JSON.stringify(readPendingGrowthRoutine(storage, owner)) !== snapshot) throw new Error('미확인 저장 요청이 바뀌어 이전 요청을 중단했어요.');
  };
  const read = async () => {
    unchanged();
    const result = await client.from('growth_routines').select('*').eq('user_id', owner).eq('id', requestId).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
    unchanged();
    if (result.error) throw new Error(pendingMessage);
    return result.data as GrowthRoutineRow | null;
  };
  const clearJournal = () => {
    unchanged();
    storage.removeItem(pendingGrowthRoutineKey(owner));
    if (storage.getItem(pendingGrowthRoutineKey(owner)) !== null) throw new Error('재시도 표시를 정리하지 못했어요. 같은 요청을 다시 확인해 주세요.');
  };
  let row = await read();
  if (!row && pending.resetMarker !== marker) {
    if (!confirmAfterReset) throw new GrowthRoutineResetConfirmation('이 활동을 요청한 뒤 기록이 초기화됐어요. 이전 저장 결과는 아직 불확실해요. 초기화 후에도 같은 활동을 추가할지 확인해 주세요.');
    // Explicit renewed intent after reset still uses the original request ID.
    // An old delayed insert and this retry can never create two IDs.
    unchanged();
    pending = { ...pending, resetMarker: marker };
    snapshot = JSON.stringify(pending);
    storage.setItem(pendingGrowthRoutineKey(owner), snapshot);
    unchanged();
  }
  if (!row) {
    unchanged();
    // Fixed ID makes an uncertain dispatch safe to retry, even after a reload.
    try { await client.from('growth_routines').insert(pending.row).select('*').abortSignal(AbortSignal.timeout(15000)).single(); }
    catch { /* Verify even a transport exception without allocating another ID. */ }
    unchanged();
    row = await read();
  }
  if (!row || row.id !== pending.row.id || row.user_id !== owner) throw new Error(pendingMessage);
  // A later edit/archive is authoritative. Recover the current row without
  // overwriting it or claiming the original title/schedule is still current.
  clearJournal();
  return row;
}
