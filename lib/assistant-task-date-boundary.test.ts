import assert from 'node:assert/strict';
import test from 'node:test';
import { commandDueDate } from './assistant-task-command.ts';

const today = '2026-11-09';
for (const value of [
  '2026-11-123', '2026-11-099', '2026년 11월 123일',
  '2026/11/123', '2026.11.123', '2026-111-09',
  '20266-11-09', '12026-11-09', '2026-11-12.5',
  '2026-11-12/5', '2026-11-12-5', '111월 9일',
  '11월 123일', '11월 09.5일', '2026-02-30', '2026-13-09',
]) {
  test(`invalid complete date token is rejected: ${value}`, () => {
    for (const message of [
      `${value} 할 일 보고서 추가해줘`,
      `${value} 내일 할 일 보고서 추가해줘`,
      `${value} 12월 1일 할 일 보고서 추가해줘`,
      `${value} 2026-12-01 할 일 보고서 추가해줘`,
    ]) assert.throws(() => commandDueDate(message, today), /존재하는 날짜/);
  });
}
for (const [input, expected] of [
  ['2026-11-12', '2026-11-12'], ['2026/1/2', '2026-01-02'],
  ['2026.1.2', '2026-01-02'], ['2026년 1월 2일', '2026-01-02'],
  ['2028년 2월 29일', '2028-02-29'], ['2026-11-30', '2026-11-30'],
  ['2026-12-31', '2026-12-31'], ['11월 9일', '2026-11-09'],
  ['오늘', '2026-11-09'], ['내일', '2026-11-10'], ['모레', '2026-11-11'],
  ['오늘 12월 1일', '2026-12-01'], ['내일 2026-12-02', '2026-12-02'],
  ['11월 10일 2026-12-02', '2026-12-02'],
  ['2026-12-02 2026-12-03', '2026-12-02'],
  ['2026-11-12. 보고서', '2026-11-12'],
  ['2026-11-12T10:00:00+09:00', '2026-11-12'],
]) test(`supported date and precedence stay unchanged: ${input}`, () => {
  assert.equal(commandDueDate(`${input} 할 일 보고서 추가해줘`, today), expected);
});
for (const input of ['보고서 123개', '버전 1.2.3 확인', '보고서 2026', '우선순위 5 보고서', '회의 11시 30분']) {
  test(`ordinary title numbers are not dates: ${input}`, () => assert.equal(commandDueDate(`할 일 ${input} 추가해줘`, today), null));
}
test('relative dates preserve month/year/leap rollover', () => {
  assert.equal(commandDueDate('내일 일정', '2026-12-31'), '2027-01-01');
  assert.equal(commandDueDate('모레 일정', '2026-01-30'), '2026-02-01');
  assert.equal(commandDueDate('내일 일정', '2028-02-28'), '2028-02-29');
  assert.throws(() => commandDueDate('2월 30일 일정', today), /존재하는 날짜/);
});

test('invalid later dates are rejected rather than ignored, without reinterpreting an explicit leap year', () => {
  for (const input of [
    '11월 12일, 2월 30일',
    '11월 12일, 2026-02-30',
    '2026-11-12, 2월 30일',
    '2026-11-12, 2026-02-30',
    '2026-11-12, 2월 29일',
  ]) assert.throws(() => commandDueDate(input, today), /존재하는 날짜/);
  assert.equal(commandDueDate('11월 12일, 2028년 2월 29일', today), '2028-02-29');
  assert.equal(commandDueDate('2028년 2월 29일, 11월 12일', today), '2028-02-29');
  assert.equal(commandDueDate('11월 12일, 2월 29일', '2028-11-09'), '2028-11-12');
});
