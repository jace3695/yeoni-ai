import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputLocally } from './transaction-parser.ts';

// Exercise the two candidate fixes together. Synthetic inputs only; no storage,
// server parser, or account-dependent behavior is involved in these assertions.
const malformedInterestAmounts = [
  '.5원', '-.5원', '1e3원', '-1e3원', '1E+3원', '1e-3원',
  '1.2.3원', '1.원', '1+ 3원', '1e +3원', '--1000원', '++1000원',
  '- +1000원', '−1000원', '− 1000원', '1/2원', '1 _ 234원',
  '1,23원', '1,234,5원', '1,,234원', '1.2,345만원',
  '.5천원', '1e3만원', '1/2천원', '1_234만원',
  '0원', '-5000원', '0.5원', '9007199254740992원', '0.00001만원',
];

for (const amount of malformedInterestAmounts) {
  test(`interest classification cannot rescue a malformed amount: ${amount}`, () => {
    for (const input of [
      `대출 이자 ${amount} 냈어`,
      `예금 이자 ${amount} 받았어`,
      `점심 9000원, 대출 이자 ${amount} 냈어 그리고 예금 이자 5000원 받았어`,
      `대출 이자 5000원 납입 그리고 예금 이자 ${amount} 받았어\n적금 1만원 넣었어`,
    ]) {
      // A throw, rather than a partial returned array, rejects the whole preview.
      assert.throws(() => parseInputLocally(input), /금액/, input);
    }
  });
}

test('all explicit amount tokens are checked even outside the single-interest grammar', () => {
  for (const input of [
    '대출 이자 5000원 납입 .5원',
    '예금 이자 1e3원 받았어 5000원',
    '대출 이자 5000원 납입 그리고 커피 1000원 1/2원',
    '커피 1_234원 1000원 그리고 예금 이자 5000원 받았어',
    '대출 이자 5000원 납입 그리고 커피 1e3',
    '예금 이자 5000원 받았어 그리고 커피 .5',
    '대출 이자 5000원 납입 그리고 커피 1,23원 그리고 취소했어',
  ]) {
    assert.throws(() => parseInputLocally(input), /금액/, input);
  }
});

const exactInterestAmounts = [
  ['1원', 1], ['5000 원', 5000], ['5,000원', 5000],
  ['1.0000원', 1], ['0.5천원', 500], ['1.001천원', 1001],
  ['5천 원', 5000], ['0.0001만원', 1], ['2.5만 원', 25000],
  ['1,234.5천원', 1234500], ['9007199254740991원', 9007199254740991],
] as const;

for (const [amount, expected] of exactInterestAmounts) {
  test(`valid whole-won interest amount and type survive integration: ${amount}`, () => {
    const items = parseInputLocally(`대출 이자 ${amount} 냈어 현금, 예금 이자 ${amount} 받았어`);
    assert.deepEqual(items.map(item => [item.type, item.amount, item.category, item.payment, item.transaction_type]), [
      ['expense', expected, '대출', '현금', '일반 지출'],
      ['income', expected, '이자', '', ''],
    ]);
  });
}

for (const separator of [', ', '\n', ' 그리고 ', '하고', '랑']) {
  test(`unit conversion keeps the conservative continuation gate: ${JSON.stringify(separator)}`, () => {
    for (const continuation of ['취소했어', '저축했어', '2번 돌려받았어', '2회 취소했어', '1000']) {
      const items = parseInputLocally([
        '대출 이자 1,000원 납입', continuation, '예금 이자 1.001천원 받았어',
      ].join(separator));
      // Compatibility only: counts/bare numbers can still produce legacy items.
      // Their presence must never permit the new interest classification.
      assert.equal(items[0].type, 'income', continuation);
      assert.equal(items[0].amount, 1000, continuation);
      assert.equal(items.at(-1)?.type, 'saving', continuation);
      assert.equal(items.at(-1)?.amount, 1001, continuation);
      assert.equal(items.length, /^\d/.test(continuation) ? 3 : 2, continuation);
    }
  });

  test(`explicit mixed transactions retain both fixes: ${JSON.stringify(separator)}`, () => {
    const items = parseInputLocally([
      '대출 이자 1,000원 납입', '예금 이자 0.5천원 받았어',
      '대출 100만원 받았어', '적금 2.5만원 넣었어', 'GS25 커피 1,000원',
    ].join(separator));
    assert.deepEqual(items.map(item => [item.type, item.amount, item.category]), [
      ['expense', 1000, '대출'], ['income', 500, '이자'],
      ['income', 1000000, '기타수입'], ['saving', 25000, '저축'], ['expense', 1000, '카페'],
    ]);
  });
}

test('amount support does not silently broaden the interest grammar', () => {
  for (const [input, type, amount] of [
    ['대출 이자 +5000원 냈어', 'income', 5000],
    ['예금 이자 + 5000원 받았어', 'saving', 5000],
    ['대출 이자 5000 냈어', 'income', 5000],
    ['예금 이자 5000 받았어', 'saving', 5000],
    ['신한은행 예금 이자 1,000원 받았어', 'saving', 1000],
    ['대출 이자 1.001천원 안 냈어', 'income', 1001],
  ] as const) {
    const [item] = parseInputLocally(input);
    assert.deepEqual([item.type, item.amount], [type, amount], input);
  }
});

test('relative dates and merchant context keep their existing behavior in mixed previews', t => {
  const priorTimezone = process.env.TZ;
  process.env.TZ = 'Asia/Seoul';
  t.after(() => { if (priorTimezone === undefined) delete process.env.TZ; else process.env.TZ = priorTimezone; });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-08T23:30:00Z') });

  const items = parseInputLocally([
    '오늘 대출 이자 1.001천원 냈어',
    '어제 예금 이자 5,000원 받았어',
    '그제 스타벅스 1,000원 현금',
    '2026-11-01 GS25 커피 1000원',
    '2026/11/01 QA_PR189 커피 1000원',
    'QA-PR189 커피 1000원',
  ].join(', '));
  assert.deepEqual(items.map(item => [item.type, item.amount, item.date, item.place]), [
    ['expense', 1001, '2026-11-09', '미분류'],
    ['income', 5000, '2026-11-08', '수입'],
    ['expense', 1000, '2026-11-07', '스타벅스'],
    // Explicit calendar dates are still not interpreted by getRelativeDate.
    ['expense', 1000, '2026-11-09', '미분류'],
    ['expense', 1000, '2026-11-09', '미분류'],
    ['expense', 1000, '2026-11-09', '미분류'],
  ]);
});
