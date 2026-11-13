import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDietStatusLabel, calendarFastingStatusLabel } from './calendarDietLabels.ts';
import { DIET_STATUS_LABELS, FASTING_STATUS_LABELS } from './dietPlans.ts';

test('통합 달력은 모든 저장 상태를 공통 한국어 표시로 바꾼다', () => {
  for (const [value, text] of Object.entries(DIET_STATUS_LABELS)) assert.equal(calendarDietStatusLabel(value), text);
  for (const [value, text] of Object.entries(FASTING_STATUS_LABELS)) assert.equal(calendarFastingStatusLabel(value), text);
  assert.equal(calendarDietStatusLabel('normal'), '보통');
  assert.equal(`공복 ${calendarFastingStatusLabel('unrecorded')}`, '공복 미기록');
});
test('미지정·잘못된 상태는 원시값 대신 미기록으로 표시한다', () => {
  for (const value of [undefined, null, '', 'unexpected', '__proto__', 0, {}]) {
    assert.equal(calendarDietStatusLabel(value), '미기록');
    assert.equal(calendarFastingStatusLabel(value), '미기록');
  }
});
