import type { SupabaseClient } from '@supabase/supabase-js';
import { getGrowthLegacySessionCloudId } from '../app/data/growthRoutines.ts';
import type { GrowthRoutineRow, GrowthSessionRow } from '../app/data/growthPlatform.ts';

export function checklistCompleted(sessions: GrowthSessionRow[], routineId: string, date: string) {
  return sessions.some(row => row.routine_id === routineId && row.session_date === date && row.status === 'completed');
}

// Desired state, not a toggle: retries and multiple tabs converge to one date row.
// Existing session rows are retained, including when the check is removed.
export async function setChecklistCompletion(client: SupabaseClient, owner: string, routine: GrowthRoutineRow, date: string, completed: boolean) {
  const auth = await client.auth.getUser();
  if (auth.error || auth.data.user?.id !== owner || routine.user_id !== owner) throw new Error('계정이 변경됐어요. 화면을 다시 열어 주세요.');
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('날짜를 확인해 주세요.');
  const id = await getGrowthLegacySessionCloudId(owner, routine.id, date);
  const query = await client.from('growth_sessions').select('*').eq('user_id', owner).eq('routine_id', routine.id).eq('session_date', date);
  if (query.error) throw query.error;
  const rows = (query.data ?? []) as GrowthSessionRow[];
  const now = new Date().toISOString();
  const marker = 'yeoniChecklistUnchecked';
  const change = async (row: GrowthSessionRow, checked: boolean) => {
    const metrics = { ...row.metrics };
    if (checked) delete metrics[marker];
    else metrics[marker] = true;
    const result = await client.from('growth_sessions').update({ status: checked ? 'completed' : 'stopped', metrics, updated_at: now }).eq('user_id', owner).eq('id', row.id);
    if (result.error) throw result.error;
  };
  if (!completed) {
    for (const row of rows.filter(row => row.status === 'completed')) await change(row, false);
    return;
  }
  const unchecked = rows.filter(row => row.status === 'stopped' && row.metrics?.[marker] === true);
  for (const row of unchecked) await change(row, true);
  if (unchecked.length) return;
  if (rows.some(row => row.status === 'completed')) return;
  const existing = rows.find(row => row.id === id);
  if (existing) {
    const result = await client.from('growth_sessions').update({ status: 'completed', updated_at: now }).eq('user_id', owner).eq('id', id);
    if (result.error) throw result.error;
    return;
  }
  const result = await client.from('growth_sessions').insert({ id, user_id: owner, routine_id: routine.id, session_date: date, status: 'completed', planned_minutes: routine.target_minutes, actual_minutes: 0, memo: '완료 체크', source: 'manual', metrics: { checklist: true } });
  if (result.error) {
    // Recover only our exact desired row after a duplicate or lost response.
    const recovery = await client.from('growth_sessions').select('*').eq('user_id', owner).eq('id', id).maybeSingle();
    if (recovery.error || recovery.data?.status !== 'completed' || recovery.data?.routine_id !== routine.id || recovery.data?.session_date !== date) throw result.error;
  }
}
