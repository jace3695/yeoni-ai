import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVICE_QUESTIONS, detectAdviceScope, detectShortTaskOperation } from './assistant-advice-intent.ts';

test('unified chat recognizes advice scopes and preserves write/query commands', () => {
  for (const [scope, question] of Object.entries(ADVICE_QUESTIONS)) assert.equal(detectAdviceScope(question), scope);
  for (const question of ['요즘 운동 잘하고 있어?', '식단 어떻게 하면 좋을까?', '최근 운동 기록을 분석해줘']) assert.equal(detectAdviceScope(question), 'fitness');
  assert.equal(detectAdviceScope('운동과 가계부 기록을 보고 조언해줘'), 'assistant');
  for (const command of ['오늘 운동 계획 보여줘', '오늘 걷기 20분 기록해줘', '할 일에 운동 조언받기 추가해줘', '오늘 식단 메모에 "소비를 줄이려면?" 기록해줘', '운동 완료했어', '가계부 금액 수정해줘', '오늘 일본어 학습 진도 알려줘']) assert.equal(detectAdviceScope(command), null, command);
});


test('supported short task create/update imperatives keep the review route', () => {
  for (const command of [
    '할 일에 운동 개선 방법 추가해', '할 일에 운동 조언받기 추가',
    '일정에 공부 방법 추천받기 등록해', '할 일에 운동 개선 방법 기록해!',
    '할 일 운동 개선 방법 내일로 변경해',
    '할 일 운동 개선 방법 내일로 변경 처리해.',
    '할 일에 “운동을 추가하는 방법 추천해줘” 추가해',
    "할 일에 '운동 조언받기' 추가", '할 일에 ‘공부 방법 추천’ 등록해',
    '할 일에 "운동 조언받기 그리고 공부하기" 추가해',
    '할 일에 운동 조언받기 추가해 그리고 일본어 공부 방법 추천해줘',
    '일본어 공부 방법 추천해줘 그 다음 할 일에 운동 조언받기 추가',
  ]) assert.equal(detectAdviceScope(command), null, command);
});

test('task verb mentions, quoted examples and advice questions stay advice', () => {
  for (const question of [
    '운동을 추가하는 방법 추천해줘', '운동 기록을 삭제해도 될까?',
    '할 일에 운동을 추가하는 방법 추천해줘', '할 일에 운동 추천 추가?',
    '“할 일에 운동 개선 방법 추가해”라는 문장은 어떤 방법으로 해석해?',
    '"할 일에 운동 개선 방법 추가해"',
    '할 일에 "운동 개선 방법 추가해',
    '할 일 운동 조언받기 삭제해', '할 일 운동 조언받기 완료해',
  ]) assert.equal(detectAdviceScope(question), 'fitness', question);
  assert.equal(detectAdviceScope('할 일을 어떻게 관리하면 좋을까'), null);
  assert.equal(detectAdviceScope('오늘 할 일을 어떻게 관리하면 좋을까'), 'assistant');
  assert.equal(detectAdviceScope('삭제해도 될까'), null);
  assert.equal(detectAdviceScope('최근 운동 기록을 분석해줘'), 'fitness');
  assert.equal(detectAdviceScope('일본어 공부 방법 추천해줘'), 'language');
  assert.equal(detectAdviceScope('운동과 가계부 기록을 보고 조언해줘'), 'assistant');
  for (const [scope, question] of Object.entries(ADVICE_QUESTIONS)) assert.equal(detectAdviceScope(question), scope);
});

// v2 deliberately narrows only the new short imperative guard. Title-first
// inputs keep their baseline advice scope instead of exposing earlier domains.
test('title-first short tasks preserve advice rather than entering earlier record routes', () => {
  for (const [message, scope] of [
    ['식단 분석 할 일 기록해', 'fitness'],
    ['식단 분석 할 일 내일로 변경해', 'fitness'],
    ['자기계발 개발 완료 조언 할 일 기록해', 'assistant'],
    ['자기계발 개발 완료 조언 할 일 내일로 변경해', 'assistant'],
    ['가계부 소비 지출 조언 할 일 내일로 변경해', 'budget'],
    ['오늘 지출 조언 일정 내일로 변경해', 'budget'],
    ['운동 개선 방법 할 일을 중요로 수정', 'fitness'],
    ['오늘 할 일 운동 조언받기 추가해', 'fitness'],
    ['2026-11-12 할 일 운동 조언받기 추가해', 'fitness'],
    ['일정표 운동 조언받기 추가해', 'fitness'],
  ]) assert.equal(detectAdviceScope(message), scope, message);
});
test('explicit task clause prefix keeps supported short commands and the long guard unchanged', () => {
  for (const message of [
    '할 일에 식단 분석 기록해', '할 일 운동 개선 방법 추가해',
    '일정에 소비 조언받기 등록해', '할 일을 운동 조언받기로 수정',
    '일정을 공부 방법 추천받기로 변경해',
    '운동 방법 추천해줘 그리고 할 일에 공부 조언받기 추가해',
    '할 일에 운동 조언받기 추가해 그 다음 공부 방법 추천해줘',
    '식단 분석 할 일 기록해줘',
  ]) assert.equal(detectAdviceScope(message), null, message);
});

test('shared short task operation follows terminal verb rather than words inside the title', () => {
  for (const title of ['브리핑 개선 방법', '이번 달 소비 조언받기', '수정 방법 조언받기', '변경 계획', '식단 분석', '자기계발 개발 완료 조언']) {
    for (const ending of ['추가', '등록해', '기록해!']) assert.equal(detectShortTaskOperation(`할 일에 ${title} ${ending}`), 'create');
    for (const ending of ['수정', '변경해', '변경 처리해.']) assert.equal(detectShortTaskOperation(`할 일 ${title} 내일로 ${ending}`), 'update');
  }
  assert.equal(detectShortTaskOperation('할 일에 "운동 그리고 공부 조언받기" 추가해'), 'create');
  for (const message of [
    '식단 분석 할 일 기록해', '오늘 할 일 운동 조언받기 추가해',
    '2026-11-12 할 일 운동 조언받기 추가해', '할 일 운동 방법 추가?',
    '할 일에 운동 방법 추가해줘', '할 일 운동 방법 내일로 변경해주세요',
    '"할 일 운동 방법 추가해"', '할 일에 "운동 방법 추가해',
    '할 일에 운동 추가해 그리고 공부 추천해줘',
  ]) assert.equal(detectShortTaskOperation(message), null, message);
});
