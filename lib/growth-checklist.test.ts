import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checklistCompleted, setChecklistCompletion } from './growth-checklist.ts';
import { isGrowthRoutineScheduled, growthWeekdayForDateKey } from '../app/data/growthSchedule.ts';
import { getLocalDateKey } from '../utils/dateKey.ts';
import type { GrowthRoutineRow, GrowthSessionRow } from '../app/data/growthPlatform.ts';
const owner = 'user-a';
const routine = { id: 'routine-a', user_id: owner, title: '독서', preferred_days: [1, 7], enabled: true, target_minutes: 5 } as GrowthRoutineRow;
function fixture() {
  const rows: Record<string, unknown>[] = [];
  let currentOwner = owner;
  const client = { auth: { getUser: async () => ({ data: { user: { id: currentOwner } }, error: null }) }, from: () => {
    let operation = 'select'; let payload: Record<string, unknown> = {}; const filters: [string, unknown][] = [];
    const execute = () => {
      const matches = rows.filter(row => filters.every(([key, value]) => row[key] === value) && row.user_id === currentOwner);
      if (operation === 'insert') {
        if (rows.some(row => row.id === payload.id)) return { data: null, error: new Error('duplicate') };
        rows.push({ ...payload }); return { data: payload, error: null };
      }
      if (operation === 'update') matches.forEach(row => Object.assign(row, payload));
      return { data: matches, error: null };
    };
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key,value]); return query; }, insert: (value: Record<string,unknown>) => { operation='insert';payload=value;return query; }, update: (value: Record<string,unknown>) => { operation='update';payload=value;return query; }, maybeSingle: async () => { const result=execute();return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }; }, then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve) }; return query;
  } } as unknown as SupabaseClient;
  return { rows, client, account: (value: string) => { currentOwner=value; } };
}
test('completion retries, concurrent duplicate checks, reload and uncheck retain a single row and all other dates', async () => {
  const f=fixture();
  await Promise.all([setChecklistCompletion(f.client,owner,routine,'2026-11-01',true),setChecklistCompletion(f.client,owner,routine,'2026-11-01',true)]);
  assert.equal(f.rows.length,1);
  await setChecklistCompletion(f.client,owner,routine,'2026-10-31',true);
  const old = JSON.stringify(f.rows[1]);
  const reload = JSON.parse(JSON.stringify(f.rows)) as GrowthSessionRow[];
  assert.equal(checklistCompleted(reload,routine.id,'2026-11-01'),true);
  await setChecklistCompletion(f.client,owner,routine,'2026-11-01',false);
  await setChecklistCompletion(f.client,owner,routine,'2026-11-01',false);
  assert.equal(f.rows.length,2); assert.equal(f.rows[0].status,'stopped'); assert.equal(JSON.stringify(f.rows[1]),old);
  await setChecklistCompletion(f.client,owner,routine,'2026-11-01',true);
  assert.equal(f.rows.length,2); assert.equal(f.rows[0].status,'completed');
});
test('account mismatch and invalid calendar dates cannot write', async () => {
  const f=fixture(); f.account('user-b');
  await assert.rejects(setChecklistCompletion(f.client,owner,routine,'2026-11-01',true));
  await assert.rejects(setChecklistCompletion(f.client,'user-b',routine,'2026-11-01',true));
  f.account(owner); await assert.rejects(setChecklistCompletion(f.client,owner,routine,'2026-02-30',true));
  assert.equal(f.rows.length,0);
});
test('editing schedules and archiving do not rewrite historical completions; unscheduled days are excluded', async () => {
  const f=fixture(); await setChecklistCompletion(f.client,owner,routine,'2026-11-01',true);
  const before=JSON.stringify(f.rows);
  const changed={...routine, title:'수정한 독서',preferred_days:[2],enabled:false};
  assert.equal(isGrowthRoutineScheduled(changed,'2026-11-01'),false);
  assert.equal(isGrowthRoutineScheduled(changed,'2026-11-03'),true);
  assert.equal(JSON.stringify(f.rows),before);
});
test('local date follows midnight and Sunday to Monday in Seoul and Los Angeles', () => {
  const previous=process.env.TZ;
  try {
    process.env.TZ='Asia/Seoul';
    assert.equal(getLocalDateKey(new Date('2026-11-01T14:59:59Z')),'2026-11-01');
    assert.equal(getLocalDateKey(new Date('2026-11-01T15:00:00Z')),'2026-11-02');
    assert.equal(growthWeekdayForDateKey('2026-11-01'),7);assert.equal(growthWeekdayForDateKey('2026-11-02'),1);
    process.env.TZ='America/Los_Angeles';
    assert.equal(getLocalDateKey(new Date('2026-11-02T07:59:59Z')),'2026-11-01');
    assert.equal(getLocalDateKey(new Date('2026-11-02T08:00:00Z')),'2026-11-02');
  } finally { if(previous===undefined) delete process.env.TZ; else process.env.TZ=previous; }
});
test('uncheck then recheck restores all original timed completions and their metrics', async () => {
  const f=fixture();
  f.rows.push(...['first','second'].map((id,index)=>({id,user_id:owner,routine_id:routine.id,session_date:'2026-11-01',status:'completed',actual_minutes:20+index,metrics:{original:index}})));
  const original=JSON.parse(JSON.stringify(f.rows));
  await setChecklistCompletion(f.client,owner,routine,'2026-11-01',false);
  assert.ok(f.rows.every(row=>row.status==='stopped'));
  await setChecklistCompletion(f.client,owner,routine,'2026-11-01',true);
  assert.equal(f.rows.length,2);
  assert.deepEqual(f.rows.map(({updated_at: _updated,...rest})=>rest),original);
});

test('scope invalidation during auth prevents checklist queries and writes', async () => {
  const f=fixture(); let release!: () => void; let current=true; let queries=0;
  f.client.auth.getUser=(() => new Promise(resolve=>{release=()=>resolve({data:{user:{id:owner,app_metadata:{},user_metadata:{},aud:'authenticated',created_at:'2026-11-01T00:00:00Z'}},error:null});})) as typeof f.client.auth.getUser;
  const original=f.client.from.bind(f.client); f.client.from=((...args: Parameters<typeof f.client.from>)=>{queries++;return original(...args);}) as typeof f.client.from;
  const pending=setChecklistCompletion(f.client,owner,routine,'2026-11-01',true,()=>{if(!current)throw Error('stale scope');});
  current=false;release();await assert.rejects(pending,/stale scope/);assert.equal(queries,0);assert.equal(f.rows.length,0);
});
test('scope invalidation after a dispatched change stops subsequent timed-row changes', async () => {
  const f=fixture();f.rows.push(...['one','two'].map(id=>({id,user_id:owner,routine_id:routine.id,session_date:'2026-11-01',status:'completed',metrics:{}})));
  await assert.rejects(setChecklistCompletion(f.client,owner,routine,'2026-11-01',false,()=>{if(f.rows.some(r=>r.status==='stopped'))throw Error('stale scope');}),/stale scope/);
  assert.equal(f.rows[0].status,'stopped');assert.equal(f.rows[1].status,'completed');
});
test('scope invalidation after a failed insert suppresses recovery query', async () => {
  let current=true;let reads=0;
  const client={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},from:()=>{let insert=false;const q={select:()=>q,eq:()=>q,insert:()=>{insert=true;return q;},then:(resolve:(x:unknown)=>unknown)=>{if(insert){current=false;return Promise.resolve({error:Error('lost response')}).then(resolve);}reads++;return Promise.resolve({data:[],error:null}).then(resolve);}};return q;}} as unknown as SupabaseClient;
  await assert.rejects(setChecklistCompletion(client,owner,routine,'2026-11-01',true,()=>{if(!current)throw Error('stale scope');}),/stale scope/);assert.equal(reads,1);
});
