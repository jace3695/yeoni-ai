import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAdviceScope } from './assistant-advice-intent.ts';
import { commandDueDate } from './assistant-task-command.ts';

// These are helper contracts, not a substitute for route/confirmation testing.
const today = '2026-11-09';
for (const ending of ['추가', '추가해', '등록해', '기록해!', '내일로 변경해', '중요로 수정']) {
  test(`short advice-titled task keeps review eligibility and rejects malformed dates: ${ending}`, () => {
    for (const date of ['2026-11-123', '2026-111-09', '20266-11-09', '11월 123일', '2026-02-30']) {
      const message = `할 일에 ${date} 운동 개선 방법 ${ending}`;
      assert.equal(detectAdviceScope(message), null, message);
      assert.throws(() => commandDueDate(message, today), /존재하는 날짜/, message);
    }
  });
}
for (const [date, expected] of [['2026-11-12', '2026-11-12'], ['2028년 2월 29일', '2028-02-29'], ['내일', '2026-11-10']]) {
  test(`valid date with advice title preserves both helper contracts: ${date}`, () => {
    for (const title of ['운동 개선 방법', '공부 방법 추천받기', '소비 줄이는 방법 조언받기', '“운동 추천받기”']) {
      const message = `할 일에 ${date} ${title} 추가해`;
      assert.equal(detectAdviceScope(message), null, message);
      assert.equal(commandDueDate(message, today), expected, message);
    }
  });
}
test('questions and quoted examples remain advice even with malformed date text', () => {
  for (const message of [
    '2026-11-123 할 일에 운동을 추가하는 방법 추천해줘',
    '“2026-11-123 할 일에 운동 개선 방법 추가해”라는 문장은 어떤 방법으로 해석해?',
    '"2026-11-123 할 일에 운동 개선 방법 추가해"',
  ]) {
    assert.equal(detectAdviceScope(message), 'fitness', message);
    // Date helper alone rejects it; the route must decide whether to call it.
    assert.throws(() => commandDueDate(message, today), /존재하는 날짜/, message);
  }
});
test('quoted titles and compound requests preserve helper boundaries without claiming server splitting', () => {
  for (const message of [
    '할 일에 2026-11-123 "운동 조언받기 그리고 공부하기" 추가해',
    '할 일에 2026-11-123 운동 조언받기 추가해 그리고 일본어 공부 방법 추천해줘',
    '일본어 공부 방법 추천해줘 그 다음 할 일에 2026-11-123 운동 조언받기 추가',
  ]) {
    assert.equal(detectAdviceScope(message), null, message);
    assert.throws(() => commandDueDate(message, today), /존재하는 날짜/, message);
  }
});

test('title-first malformed-date tasks stay advice while date validation remains independently strict', () => {
  for (const [title, scope] of [['식단 분석', 'fitness'], ['자기계발 개발 완료 조언', 'assistant'], ['가계부 소비 지출 조언', 'budget']]) {
    const message = `${title} 할 일 2026-11-123 내일로 변경해`;
    assert.equal(detectAdviceScope(message), scope, message);
    assert.throws(() => commandDueDate(message, today), /존재하는 날짜/, message);
  }
});
