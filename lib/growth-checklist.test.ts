import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checklistCompleted, setChecklistCompletion } from './growth-checklist.ts';
import { isGrowthRoutineScheduled, growthWeekdayForDateKey } from '../app/data/growthSchedule.ts';
import { getLocalDateKey } from '../utils/dateKey.ts';
import type { GrowthRoutineRow, GrowthSessionRow } from '../app/data/growthPlatform.ts';
import * as checklist from './growth-checklist.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
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

const weeklyRoutine = () => ({ ...routine, preferred_days: [1, 2, 3, 4, 5, 6, 7], target_sessions_per_week: 3 });

test('title-only, no-op and reordered weekday edits omit the hidden weekly target and retain opaque server fields', () => {
  const original = weeklyRoutine(); const before = JSON.stringify(original);
  for (const [title, days] of [[original.title, original.preferred_days], [' renamed ', original.preferred_days], ['renamed', [7, 6, 5, 4, 3, 2, 1]]] as const) {
    const patch = checklist.buildChecklistRoutineEdit(original, title, [...days]);
    assert.equal(Object.hasOwn(patch, 'target_sessions_per_week'), false);
    assert.deepEqual(Object.keys(patch).sort(), ['preferred_days', 'title']);
    assert.equal(patch.title, title.trim());
    assert.deepEqual(patch.preferred_days, original.preferred_days);
    assert.notEqual(patch.preferred_days, original.preferred_days);
    // A server goal changed after the edit was opened must not be overwritten
    // by the old client snapshot, nor should unknown server fields be sent.
    const latest = { ...original, target_sessions_per_week: 2, extension: { opaque: ['keep', 1] } };
    const merged = { ...latest, ...patch };
    assert.equal(merged.target_sessions_per_week, 2);
    assert.equal(merged.extension, latest.extension);
  }
  assert.equal(JSON.stringify(original), before);
});

test('actual weekday additions and removals keep the current day-count goal policy', () => {
  const original = { ...weeklyRoutine(), preferred_days: [1, 3, 5] };
  const before = JSON.stringify(original);
  assert.deepEqual(checklist.buildChecklistRoutineEdit(original, 'same', [1, 5]), { title: 'same', preferred_days: [1, 5], target_sessions_per_week: 2 });
  assert.deepEqual(checklist.buildChecklistRoutineEdit(original, 'same', [7, 5, 3, 1]), { title: 'same', preferred_days: [1, 3, 5, 7], target_sessions_per_week: 4 });
  assert.equal(JSON.stringify(original), before);
});

test('a missing current routine cannot produce a routine update', () => {
  assert.throws(() => checklist.buildChecklistRoutineEdit(undefined, 'name', [1]), /다시/);
});

// Execute the real page's submit callback with a synthetic storage boundary.
// This is not a rendered browser, React effect, authentication or DB test.
async function submitGrowthPage(editing: string | null, rows: GrowthRoutineRow[], title: string, days: number[]) {
  const source = readFileSync(new URL('../app/growth/page.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let save = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'save' && node.initializer) save = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree); assert.ok(save);
  const writes: { kind: string; id?: string; payload: Record<string, unknown> }[] = [];
  const errors: string[] = []; const pending: Promise<void>[] = [];
  const growth = { pendingRoutineCreate: null, routineCreateBlocked: false,
    updateRoutine: async (id: string, payload: Record<string, unknown>) => { writes.push({ kind: 'update', id, payload }); return { error: null }; },
    addRoutine: async (payload: Record<string, unknown>) => { writes.push({ kind: 'create', payload }); return { error: null }; },
  };
  const code = ts.transpileModule(`const submit = ${save}; submit;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const submit = vm.runInNewContext(code, { editing, routines: rows, title, days, category: 'custom', growth,
    GROWTH_ROUTINE_LIMIT: 100, isRetiredGrowthRoutine: () => false, setMessage: (message: string) => errors.push(message), resetEditor: () => {},
    buildChecklistRoutineEdit: checklist.buildChecklistRoutineEdit,
    run: (action: (isCurrent: () => boolean) => Promise<void>) => { pending.push(action(() => true).catch(error => { errors.push(error.message); })); },
  }) as (event: { preventDefault: () => void }) => void;
  submit({ preventDefault() {} }); await Promise.all(pending);
  return { writes, errors };
}

test('the actual growth submit callback preserves an existing hidden target for title-only edits', async () => {
  const original = weeklyRoutine();
  const result = await submitGrowthPage(original.id, [original], 'Renamed', [...original.preferred_days]);
  assert.equal(result.errors.length, 0); assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0].kind, 'update'); assert.equal(result.writes[0].id, original.id);
  assert.equal(Object.hasOwn(result.writes[0].payload, 'target_sessions_per_week'), false);
  assert.equal(result.writes[0].payload.title, 'Renamed');
});

test('the actual growth submit callback keeps changed-day and new-routine policy, and fails closed for a missing edit row', async () => {
  const original = weeklyRoutine();
  const changed = await submitGrowthPage(original.id, [original], 'Renamed', [1, 3]);
  assert.equal(changed.errors.length, 0); assert.equal(changed.writes[0].payload.target_sessions_per_week, 2);
  const created = await submitGrowthPage(null, [], 'New', [1, 3]);
  assert.equal(created.errors.length, 0); assert.equal(created.writes[0].kind, 'create');
  assert.equal(created.writes[0].payload.targetSessionsPerWeek, 2); assert.equal(created.writes[0].payload.targetMinutes, 5);
  const missing = await submitGrowthPage(original.id, [], 'Renamed', [1, 3]);
  assert.equal(missing.writes.length, 0); assert.equal(missing.errors.length, 1); assert.match(missing.errors[0], /다시/);
});
