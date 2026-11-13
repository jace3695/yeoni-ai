import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app/budget/page.tsx', import.meta.url), 'utf8');
function badge(year: number, month: number, today: Date) {
  const start = source.indexOf('    const isFutureMonthSelected =');
  const end = source.indexOf('\n', source.indexOf('today.getFullYear() === currentYear', start));
  assert.ok(start >= 0 && end > start);
  const label = source.match(/\{(isFutureMonthSelected \? '시작 전' : isCurrentMonthSelected \? '진행 중' : '마감 완료')\}/);
  assert.ok(label);
  return vm.runInNewContext(source.slice(start, end) + ';' + label[1], {
    selectedMonthDate: new Date(year, month, 1), currentYear: year, currentMonth: month, today, Date,
  });
}
test('November actual-use case distinguishes past, current, and December future month', () => {
  const today = new Date(2026, 10, 13);
  assert.equal(badge(2026, 9, today), '마감 완료');
  assert.equal(badge(2026, 10, today), '진행 중');
  assert.equal(badge(2026, 11, today), '시작 전');
});
test('month status handles year rollover and first/last day without UTC conversion', () => {
  assert.equal(badge(2027, 0, new Date(2026, 11, 31, 23, 59)), '시작 전');
  assert.equal(badge(2026, 11, new Date(2027, 0, 1, 0, 0)), '마감 완료');
  assert.equal(badge(2027, 0, new Date(2027, 0, 1, 0, 0)), '진행 중');
  assert.equal(badge(2026, 10, new Date(2026, 10, 30, 23, 59)), '진행 중');
});
test('future report title and guidance do not imply month has closed', () => {
  assert.ok(source.includes("{selectedMonthLabel} {isFutureMonthSelected ? '예정 요약' : '마감 요약'}</h4>"));
  assert.ok(source.includes("{isFutureMonthSelected ? '아직 시작되지 않은 달이에요. 입력된 예정 기록을 참고용으로 확인하세요.' : monthEndHeadline}</p>"));
});
