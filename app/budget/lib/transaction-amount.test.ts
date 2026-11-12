import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputLocally } from './transaction-parser.ts';

test('currency amounts take precedence over digits in store names or dates', () => {
  assert.equal(parseInputLocally('오늘 GS25 카페 1000원 체크카드')[0].amount, 1000);
  assert.equal(parseInputLocally('9월 9일 점심 9000원')[0].amount, 9000);
  assert.equal(parseInputLocally('QA-PR189 카페 1000원')[0].amount, 1000);
});

test('thousands separators stay inside one amount while transaction commas split entries', () => {
  const items = parseInputLocally('점심 9,000원, 월급 2,500,000원, 적금 5만원');
  assert.deepEqual(items.map(item => item.amount), [9000, 2500000, 50000]);
  assert.equal(parseInputLocally('커피 1.5천원')[0].amount, 1500);
});

test('negative, fractional won and unsafe amounts are rejected instead of silently changed', () => {
  for (const input of ['환불 -1000원', '커피 - 1.5천원', '커피 1.5원', '커피 0.0001천원', '급여 9007199254740992원']) {
    assert.throws(() => parseInputLocally(input), /금액/);
  }
});
test('decimal unit conversion keeps exact whole won without floating rounding', () => {
  assert.equal(parseInputLocally('커피 1.001천원')[0].amount, 1001);
  assert.equal(parseInputLocally('식비 0.0001만원')[0].amount, 1);
  assert.equal(parseInputLocally('커피 1.0000원')[0].amount, 1);
});
test('invalid amount in a batch rejects the entire preview rather than dropping an entry', () => {
  assert.throws(() => parseInputLocally('점심 9000원, 환불 -1000원'), /금액/);
});

const malformedAmountInputs = [
  '커피 .5원',
  '환불 -.5원',
  '커피 1e3원',
  '환불 -1e3원',
  '커피 1E+3원',
  '커피 1e-3원',
  '커피 1.2.3원',
  '커피 1.원',
  '커피 1+3원',
  '커피 1+ 3원',
  '커피 1e +3원',
  '커피 --1000원',
  '커피 ++1000원',
  '커피 -+1000원',
  '커피 - +1000원',
  '환불 −1000원',
  '환불 − 1000원',
  '커피 .5천원',
  '커피 1e3만원',
  '커피 1/2원',
  '커피 1_234원',
  '환불 -1/2원',
  '환불 -1_234원',
  '커피 1/2천원',
  '커피 1_234만원',
  '커피 1 / 2원',
  '커피 1 _ 234원',
  '커피 1/2',
  '커피 1_234',
  '커피 1/2원 1000원',
  '커피 1000원 1_234원',
  '점심 9000원, 커피 1/2원',
  '점심 9000원, 커피 1_234원',
  '커피 .5',
  '커피 1e3',
  '커피 1.2.3',
  '커피 1000.',
  '환불 −1000',
  '커피 1,23원',
  '커피 1,234,5원',
  '커피 1,,234원',
  '커피 1.2,345만원',
  '9월 9일 커피 .5원',
  '커피 .5원 1000원',
  '커피 1000원 .5원',
  '커피 1.원 1000원',
  '커피 1e3원 1000원',
  '점심 9000원, 커피 .5원',
  '커피 1e3원, 점심 9000원',
  '점심 9000원, 커피 1e3',
  '점심 9000원, 커피 1,23원',
];

for (const input of malformedAmountInputs) {
  test(`malformed amount rejects the whole preview: ${input}`, () => {
    assert.throws(() => parseInputLocally(input), /금액/);
  });
}

test('valid amounts retain signs, units, grouping, bare amounts and surrounding context', () => {
  for (const [input, expected] of [
    ['커피 +1000원', 1000],
    ['커피 + 1000 원', 1000],
    ['커피 1.5천 원', 1500],
    ['월급 2.5만 원', 25000],
    ['커피 0.5천원', 500],
    ['식비 1,234.5천원', 1234500],
    ['커피 1,000', 1000],
    ['커피1000원', 1000],
    ['커피 1000원.', 1000],
    ['커피. 1000원', 1000],
    ['커피. 1000', 1000],
    ['커피 (1000원)', 1000],
    ['GS25 커피 1000', 1000],
    ['QA-PR189 커피 1000', 1000],
    ['2026-11-09 GS25 커피 1000원', 1000],
    ['2026/11/09 GS25 커피 1000원', 1000],
    ['QA_PR189 커피 1000원', 1000],
  ] as const) {
    assert.equal(parseInputLocally(input)[0].amount, expected, input);
  }
  assert.deepEqual(
    parseInputLocally('점심 9000원,커피 1000원 그리고 적금 5만원\n버스 1500원').map(item => item.amount),
    [9000, 1000, 50000, 1500],
  );
});
