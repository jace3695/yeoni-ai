import test from 'node:test';
import assert from 'node:assert/strict';
import { fitnessGuidance, dietGuidance, languageGuidance as rawLanguageGuidance, growthGuidance, collectionGuidance, assistantGuidance, budgetGuidance, guidanceText, validDate, type RecordState } from './record-guidance.ts';
const today = '2026-11-06';
const languageGuidance = (state: RecordState, date: string, progress: unknown, reviews: unknown) => rawLanguageGuidance(state, date, progress, reviews, Date.parse(date + 'T12:00:00Z'));
const variants = [
  (state: RecordState) => fitnessGuidance(state,today,today,{workoutDone:true},{},{}),
  (state: RecordState) => dietGuidance(state,today,today,{meals:{breakfast:true}}, {},500),
  (state: RecordState) => languageGuidance(state,today,{completedLessonIds:['a'],activityDates:[today]},[]),
  (state: RecordState) => growthGuidance(state,today,today,2,2),
  (state: RecordState) => assistantGuidance(state,3),
  (state: RecordState) => budgetGuidance(state,'2026-11',today,12,100,1000,1000),
  (state: RecordState) => collectionGuidance('자료',state,3),
];
for(const [i,fn] of variants.entries()) for(const state of ['loading','error'] as const) test(`scope ${i}: ${state} never exposes stale counts or congratulations`,()=>{const g=fn(state);assert.match(g.title,/확인/);assert.doesNotMatch(guidanceText(g),/완료|\d|수고/);});
for(const date of ['2026-99-99','2026-02-30','invalid','']) test(`invalid date ${date} does not throw`,()=>assert.equal(validDate(date),false));
for(const date of ['2026-11-07','2027-01-01']) test(`future ${date} suppresses completion`,()=>{
 for(const g of [fitnessGuidance('ready',date,today,true,{},{}),dietGuidance('ready',date,today,{meals:{breakfast:true}}, {},1000),growthGuidance('ready',date,today,4,4),budgetGuidance('ready',date.slice(0,7),'2026-10-31',12,50,100,100)]) assert.match(g.title,/앞으로/);
});
test('fitness missing/default false is not inactivity',()=>{const g=fitnessGuidance('ready',today,today,undefined,undefined,undefined);assert.match(g.detail,/하지 않았다는 뜻은 아니/);assert.doesNotMatch(g.title,/해냈|수고/);});
test('fitness legacy complete supported',()=>assert.match(fitnessGuidance('ready',today,today,true,{},{}).title,/완료 기록/));
for(const status of ['partial','stopped']) test(`fitness ${status} overrides done flag`,()=>assert.match(fitnessGuidance('ready',today,today,{workoutStatus:status,workoutDone:true},{},{}).title,/일부/));
for(const record of [{workoutPain:true},{workoutBackStatus:'worse'},{workoutNeurologicalSymptoms:['numbness']}]) test(`saved symptom priority ${JSON.stringify(record)}`,()=>assert.match(fitnessGuidance('ready',today,today,{workoutDone:true,...record},{},{}).detail,/중단 안내/));
test('saved recovery and condition have priority',()=>{assert.match(fitnessGuidance('ready',today,today,true,{signals:['poorSleep']},{}).title,/몸 상태/);assert.match(fitnessGuidance('ready',today,today,true,{}, {recoveryMode:true}).title,/몸 상태/);});
test('other fitness activities not main workout completion',()=>assert.match(fitnessGuidance('ready',today,today,{cardioDone:true},{},{}).detail,/본운동 완료와는 구분/));
test('diet empty distinct from missing food',()=>assert.match(dietGuidance('ready',today,today,undefined,undefined,undefined).detail,/안 먹었다는 뜻은 아니/));
test('diet saved checks only, explicit zero water retained',()=>{const g=dietGuidance('ready',today,today,{meals:{breakfast:true,lunch:false,dinner:true}}, {},0);assert.match(g.title,/2개, 물 0mL/);assert.match(g.basis,/입력 중인 값 제외/);});
test('diet unknown water not invented as zero',()=>assert.doesNotMatch(dietGuidance('ready',today,today,{}, {breakfastShake:true},undefined).title,/물 0/));
test('language due future and malformed excluded',()=>{const g=languageGuidance('ready',today,{},[{createdAt:today,nextReviewAt:today},{createdAt:today,nextReviewAt:'2026-12-01'},{createdAt:'2026-12-01'},{createdAt:'bad'}]);assert.match(g.title,/1개/);});
test('language today activity distinct from historical completion',()=>{assert.match(languageGuidance('ready',today,{completedLessonIds:['a','a'],activityDates:[today]},[]).detail,/1개/);assert.doesNotMatch(languageGuidance('ready',today,{completedLessonIds:['a'],activityDates:['2026-12-01']},[]).title,/오늘/);});
test('growth empty does not mean failed day',()=>assert.match(growthGuidance('ready',today,today,0,0).title,/예정된 활동은 없/));
test('growth exact denominator/complete/partial',()=>{assert.match(growthGuidance('ready',today,today,3,1).title,/3개 중 1개/);assert.match(growthGuidance('ready',today,today,3,3).detail,/수고/);assert.match(growthGuidance('ready',today,today,1,2).title,/확인하지 못/);});
test('assistant own task scope explicit',()=>assert.match(assistantGuidance('ready',2).basis,/다른 앱 기록은 섞지/));
for(const budget of [null,0]) test(`budget ${budget} no false stability`,()=>{const g=budgetGuidance('ready','2026-10',today,12,100,1000,budget);assert.match(g.detail,/예산이 설정되지/);assert.doesNotMatch(guidanceText(g),/이번 달|안정|저축률이 좋/);});
test('budget no income no saving claim',()=>assert.match(budgetGuidance('ready','2026-10',today,1,100,0,500).detail,/수입 기록이 없어/));
test('budget over and within are factual',()=>{assert.match(budgetGuidance('ready','2026-10',today,1,600,1000,500).detail,/넘었/);assert.match(budgetGuidance('ready','2026-10',today,1,100,1000,500).detail,/예산 안/);});
test('budget empty no claim zero actual spending',()=>assert.match(budgetGuidance('ready','2026-10',today,0,0,0,null).detail,/지출이 없었다는 뜻은 아니/));

test('language same-day future review is not due',()=>{ const g=rawLanguageGuidance('ready',today,{},[{createdAt:today+'T01:00:00Z',nextReviewAt:today+'T13:00:00Z'}],Date.parse(today+'T12:00:00Z'));assert.doesNotMatch(g.title,/복습 시점/); });
test('language UTC previous date not mistaken for due local day',()=>{ const g=rawLanguageGuidance('ready','2026-11-07',{},[{createdAt:'2026-11-06T10:00:00Z',nextReviewAt:'2026-11-06T23:00:00Z'}],Date.parse('2026-11-06T15:30:00Z'));assert.doesNotMatch(g.title,/복습 시점/); });
