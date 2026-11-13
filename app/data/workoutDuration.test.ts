import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sessionElapsedMinutes } from './workoutDuration.ts';
import { getWorkoutMinutes, getWorkoutPeriodSummary } from './recordAnalytics.ts';
import { removeGeneralWorkoutRecord, removeCardioRecord } from './workoutCompletion.ts';
import type { WorkoutDayRecord } from './workoutCompletion.ts';
const legacy: WorkoutDayRecord = { workoutDone: true, workoutMemo: '[따라하기 세션] 2분', workoutExerciseRecords: [
  { exerciseName: '몸풀기', status: 'completed', durationMinutes: 3 },
  { exerciseName: '정리운동', status: 'completed', durationMinutes: 3 },
] };
test('session duration rounding matches the visible summary', () => {
  for (const [seconds, minutes] of [[0,1],[1,1],[60,1],[61,2],[120,2],[121,3]]) assert.equal(sessionElapsedMinutes(seconds), minutes);
});
test('new session survives note replacement, clearing and contradictory text after JSON reload', () => {
  const saved = { ...legacy, workoutElapsedMinutes: sessionElapsedMinutes(120) };
  for (const memo of ['QA 메모 수정', '', '[따라하기 세션] 99분']) {
    const loaded = JSON.parse(JSON.stringify({ ...saved, workoutMemo: memo }));
    assert.equal(getWorkoutMinutes(loaded), 2);
    assert.equal(getWorkoutPeriodSummary({ '2026-11-13': loaded }, '2026-11-13', '2026-11-13').minutes, 2);
  }
});
test('legacy fallback is unchanged and does not mutate/backfill old records', () => {
  const before = JSON.stringify(legacy);
  assert.equal(getWorkoutMinutes(legacy), 2);
  assert.equal(getWorkoutMinutes({ ...legacy, workoutMemo: '' }), 6);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(Object.hasOwn(legacy, 'workoutElapsedMinutes'), false);
});
test('invalid structured values fall back, while explicit zero is respected', () => {
  for (const invalid of [-1, NaN, Infinity, '2', null]) assert.equal(getWorkoutMinutes({ ...legacy, workoutElapsedMinutes: invalid } as WorkoutDayRecord), 2);
  assert.equal(getWorkoutMinutes({ ...legacy, workoutElapsedMinutes: 0 }), 0);
});
test('general-workout cancellation removes duration but cardio cancellation preserves it', () => {
  const record = { ...legacy, workoutElapsedMinutes: 2, cardioDone: true, cardioMinutes: 10 };
  const cancelled = removeGeneralWorkoutRecord(record);
  assert.equal(cancelled.workoutElapsedMinutes, undefined);
  assert.equal(cancelled.cardioMinutes, 10);
  assert.equal(removeCardioRecord(record).workoutElapsedMinutes, 2);
});
test('session → DayView → save binding and both explicit clear paths retain the structured contract', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(source('../components/WorkoutSession.tsx'), /onFinish\?\.\(\{\s*elapsedMinutes: sessionElapsedMinutes\(elapsedSecondsRef.current\)/);
  assert.match(source('../components/DayView.tsx'), /elapsedMinutes: result.elapsedMinutes/);
  const page = source('../fitness/page.tsx');
  assert.match(page, /workoutElapsedMinutes: selectedOptionalCardio\?\.id === "rest" \? undefined : \(feedback\?\.elapsedMinutes \?\? current.workoutElapsedMinutes\)/);
  assert.equal((page.match(/workoutElapsedMinutes: undefined/g) ?? []).length, 2);
});
test('actual workout storage writer/reader preserves the new field and unchanged legacy records', async () => {
  const { writeWorkoutCompletionStore, readWorkoutCompletionStore } = await import('./workoutCompletion.ts');
  const data = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } } });
  try {
    const records = { '2026-11-13': { ...legacy, workoutElapsedMinutes: 2 }, '2026-11-12': legacy };
    writeWorkoutCompletionStore(records);
    const loaded = readWorkoutCompletionStore();
    assert.deepEqual(loaded, records);
    const edited = { ...loaded, '2026-11-13': { ...loaded['2026-11-13'] as WorkoutDayRecord, workoutMemo: '새 메모' } };
    writeWorkoutCompletionStore(edited);
    assert.equal(getWorkoutMinutes(readWorkoutCompletionStore()['2026-11-13']), 2);
    assert.deepEqual(readWorkoutCompletionStore()['2026-11-12'], legacy);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('calendar edit handler keeps structured time when the memo changes', () => {
  const source = readFileSync(new URL('../components/RecordCalendarView.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const saveWorkoutEdit =');
  const end = source.indexOf('  const addManualExercise =', start);
  assert.ok(start >= 0 && end > start);
  let record: WorkoutDayRecord = { ...legacy, workoutElapsedMinutes: 2 };
  const context = {
    selectedWorkoutRecord: record, exerciseRecordsDraft: record.workoutExerciseRecords,
    workoutStatusDraft: 'completed', workoutDifficultyDraft: undefined, workoutFatigueDraft: undefined,
    backFeedback: {}, workoutMemoDraft: '수정한 메모',
    writeWorkoutStore: (update: (current: WorkoutDayRecord) => WorkoutDayRecord) => { record = update(record); return true; },
    setEditingWorkout: () => {}, setWorkoutNotice: () => {},
  };
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code + '\nsaveWorkoutEdit();', context);
  assert.equal(record.workoutMemo, '수정한 메모');
  assert.equal(record.workoutElapsedMinutes, 2);
  assert.equal(getWorkoutMinutes(record), 2);
});

test('recovery conversion removes old exercise totals and preserves independent cardio/pullup records', () => {
  const source = readFileSync(new URL('../fitness/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const recordRecoveryPriority =');
  const end = source.indexOf('  const cancelRecoveryPriority =', start);
  assert.ok(start >= 0 && end > start);
  let records: Record<string, WorkoutDayRecord> = { '2026-11-13': { ...legacy, workoutElapsedMinutes: 2, workoutStatus: 'completed', cardioDone: true, cardioMinutes: 10, pullupDone: true } };
  const context = { window: { confirm: () => true }, getLocalDateKey: () => '2026-11-13', getWorkoutRecord: (r: WorkoutDayRecord) => r,
    completedStore: records, commitCompletedStore: (update: (store: typeof records) => typeof records) => { records = update(records); return true; },
    writeWorkoutCompletionStore: () => {}, saveRecoveryRecord: () => ({}), setRecoveryToday: () => {},
  };
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code + '\nrecordRecoveryPriority();', context);
  assert.equal(records['2026-11-13'].workoutExerciseRecords, undefined);
  assert.equal(records['2026-11-13'].workoutStatus, undefined);
  assert.equal(records['2026-11-13'].pullupDone, true);
  assert.equal(getWorkoutMinutes(records['2026-11-13']), 10);
});

test('optional rest does not inherit exercises from an earlier workout', () => {
  const source = readFileSync(new URL('../fitness/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const saveDayWorkout =');
  const end = source.indexOf('  const cancelDayWorkout =', start);
  assert.ok(start >= 0 && end > start);
  let records: Record<string, WorkoutDayRecord> = { '2026-11-13': { ...legacy, workoutElapsedMinutes: 2, pullupDone: true } };
  const context = { getDateForWorkoutDay: () => '2026-11-13', getWorkoutRecord: (r: WorkoutDayRecord) => r, recoveryToday: undefined,
    dayWorkout: { optionalCardio: { options: [{ id: 'rest', name: '휴식' }] } }, selectedWorkoutGroup: undefined,
    selectedWeeklyWorkoutPlan: { name: '가상' }, baseDayWorkout: undefined, activeWorkoutMethod: {},
    commitCompletedStore: (update: (store: typeof records) => typeof records) => { records = update(records); return true; },
    writeWorkoutCompletionStore: () => {}, saveRecoveryRecord: () => ({}), setRecoveryToday: () => {},
  };
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code + "\nsaveDayWorkout('sat', false, '휴식', 'rest');", context);
  assert.equal(records['2026-11-13'].workoutExerciseRecords, undefined);
  assert.equal(records['2026-11-13'].pullupDone, true);
  assert.equal(getWorkoutMinutes(records['2026-11-13']), 0);
});
