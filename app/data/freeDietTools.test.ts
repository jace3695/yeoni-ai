import test from 'node:test';
import assert from 'node:assert/strict';
import { hasProteinResponse, previousMeal, quickMealPreset, summarizeFreeDiet } from './freeDietTools.ts';

test('지난 식사는 오늘·미래·잘못된 날짜와 다른 끼니를 복사하지 않는다', () => {
  const today = '2026-09-13';
  const meals = { '2026-09-10': { lunchProteinChoice: 'custom', lunchProteinCustom: 32, dinnerProteinChoice: '30', breakfastShake: true, lastMealTime: '23:00' }, '2026-09-12': { dinnerProteinChoice: '20' }, [today]: { lunchProteinChoice: '30' }, '2026-09-14': { lunchProteinChoice: '30' }, '2026-02-31': { lunchProteinChoice: '30' } };
  const before = JSON.stringify(meals);
  const reused = previousMeal(meals, { '2026-09-10': { amountType: 'custom', grams: 130, riceType: '현미밥' } }, {}, 'lunch', today);
  assert.equal(reused?.label, '2026-09-10 점심');
  assert.deepEqual(reused?.patch, { lunchProteinChoice: 'custom', lunchProteinCustom: 32, lunchRice: true });
  assert.equal(reused?.carb.grams, 130); assert.equal(JSON.stringify(meals), before);
  assert.equal(previousMeal({}, {}, {}, 'dinner', today), null);
});

test('간편 기본값은 한 끼의 명시된 입력값만 바꾼다', () => {
  assert.deepEqual(quickMealPreset('lunch').patch, { lunchProteinChoice: '20', lunchProteinCustom: 0, lunchRice: true });
  assert.equal(quickMealPreset('lunch').carb.grams, 100);
  assert.equal(quickMealPreset('dinner').carb.grams, 0);
  assert.equal(Object.hasOwn(quickMealPreset('dinner').patch, 'lastMealTime'), false);
});

test('주간 요약은 미응답과 미래 기록을 빼고 지표마다 실제 응답 수를 표시한다', () => {
  const result = summarizeFreeDiet({
    '2026-09-13': { proteinTotal: 100, waterMl: 1800, digestionStatus: 'bloated', lateSnack: 'yes' },
    '2026-09-12': { proteinTotal: 80, waterMl: 0, digestionStatus: 'comfortable', lateSnack: 'no', afterWorkoutMeal: 'yes' },
    '2026-09-07': { proteinTotal: null, waterMl: '2000', digestionStatus: 'corrupt' },
    '2026-09-06': { proteinTotal: 999, waterMl: 999 }, '2026-09-14': { proteinTotal: 999 },
  }, '2026-09-13');
  assert.deepEqual(result, { recordedDays: 3, proteinDays: 2, averageProtein: 90, waterDays: 2, averageWater: 900, digestionDays: 2, discomfortDays: 1, lateSnackDays: 1, lateSnackAnswers: 2, afterWorkoutDays: 1, afterWorkoutAnswers: 1 });
  assert.equal(summarizeFreeDiet({}, '2026-09-13').averageProtein, null);
});

test('물만 저장한 새 기록의 기본 단백질 0은 응답 일수에서 제외한다', () => {
  const result = summarizeFreeDiet({ '2026-11-13': { proteinTotal: 0, proteinRecorded: false, waterMl: 300,
    meals: { breakfast: false, lunch: false, afternoon: false, dinner: false } } }, '2026-11-13');
  assert.equal(result.proteinDays, 0);
  assert.equal(result.averageProtein, null);
  assert.equal(result.waterDays, 1);
  assert.equal(result.averageWater, 300);
});

test('입력 구분이 없던 과거 0g는 실제 명시적 0일 수 있어 임의 재분류하지 않는다', () => {
  const result = summarizeFreeDiet({ '2026-11-13': {proteinTotal: 0,
    meals: {breakfast:false, lunch:false, afternoon:false, dinner:false}} }, '2026-11-13');
  assert.equal(result.proteinDays, 1);
  assert.equal(result.averageProtein, 0);
});

test('새 미응답 표시가 있는 밥·메모 저장도 단백질 분모에 넣지 않는다', () => {
  const result = summarizeFreeDiet({ '2026-11-13': { proteinTotal: 0, proteinRecorded: false,
    meals: { breakfast: false, lunch: true, afternoon: false, dinner: false } } }, '2026-11-13');
  assert.equal(result.proteinDays, 0);
  assert.equal(result.averageProtein, null);
});

test('명시적 0g는 포함하고 미응답은 제외하여 분모를 계산한다', () => {
  const result = summarizeFreeDiet({
    '2026-11-13': { proteinTotal: 0, proteinRecorded: true },
    '2026-11-12': { proteinTotal: 30, proteinRecorded: true },
    '2026-11-11': { proteinTotal: 0, proteinRecorded: false },
    '2026-11-10': { proteinTotal: 60 },
  }, '2026-11-13');
  assert.equal(result.proteinDays, 3);
  assert.equal(result.averageProtein, 30);
});

import { DEFAULT_MEAL_LOG, DEFAULT_LUNCH_PROTEIN_RECORD } from './dietPlans.ts';
test('기본값·밥만은 미응답, 직접 입력 0과 실제 단백질 선택은 응답이다', () => {
  assert.equal(hasProteinResponse(DEFAULT_MEAL_LOG, DEFAULT_LUNCH_PROTEIN_RECORD), false);
  assert.equal(hasProteinResponse({...DEFAULT_MEAL_LOG, lunchRice: true}, DEFAULT_LUNCH_PROTEIN_RECORD), false);
  assert.equal(hasProteinResponse({...DEFAULT_MEAL_LOG, lunchProteinChoice: 'custom', lunchProteinCustom: 0}, DEFAULT_LUNCH_PROTEIN_RECORD), true);
  assert.equal(hasProteinResponse({...DEFAULT_MEAL_LOG, breakfastShake: true}, DEFAULT_LUNCH_PROTEIN_RECORD), true);
  assert.equal(hasProteinResponse(DEFAULT_MEAL_LOG, {...DEFAULT_LUNCH_PROTEIN_RECORD, type: 'custom', protein: 0}), true);
});

import { dietMealNextSnapshot } from '../../lib/assistant-diet-meal-command.ts';
test('미응답 저장 이후 대화로 단백질 0g·30g을 입력해도 분모에서 사라지지 않는다', () => {
  for (const grams of [0, 30]) {
    const next = dietMealNextSnapshot({ meal: {...DEFAULT_MEAL_LOG}, record: {proteinTotal: 0, proteinRecorded: false}}, {kind: 'meal', slot: 'lunch', field: 'protein', grams});
    assert.equal(next.record?.proteinRecorded, true);
    const result = summarizeFreeDiet({'2026-11-13': next.record}, '2026-11-13');
    assert.equal(result.proteinDays, 1);
    assert.equal(result.averageProtein, grams);
  }
});

import { readFileSync } from 'node:fs';
test('직접 입력한 0g를 빈 문자열로 바꾸지 않는 점심·저녁 입력 표시를 유지한다', () => {
  const view = readFileSync(new URL('../components/DietView.tsx', import.meta.url), 'utf8');
  for (const slot of ['lunch', 'dinner']) {
    assert.ok(view.includes(`value={mealLog.${slot}ProteinCustom ?? ''}`));
    assert.ok(!view.includes(`value={mealLog.${slot}ProteinCustom || ''}`));
  }
});
