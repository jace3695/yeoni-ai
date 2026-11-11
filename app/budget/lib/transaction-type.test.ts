import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputLocally } from './transaction-parser.ts';

const paidInterest = [
  ['대출 이자납입 5만원 계좌이체', 50000, '대출', '계좌이체'],
  ['대출 이자 5만원 냈어', 50000, '대출', '체크카드'],
  ['오늘 대출 이자를 5만 원 냈어요', 50000, '대출', '체크카드'],
  ['어제 대출 이자 납부 5만원 현금', 50000, '대출', '현금'],
  ['대출 이자 5,000원 납입했어요', 5000, '대출', '체크카드'],
  ['그제 대출 이자 5천 원 납부했습니다.', 5000, '대출', '체크카드'],
  ['이자납입 5000원', 5000, '대출', '체크카드'],
  ['이자 5000원 냈어', 5000, '기타', '체크카드'],
] as const;

for (const [input, amount, category, payment] of paidInterest) {
  test(`explicit interest payment is an expense: ${input}`, () => {
    const items = parseInputLocally(input);
    assert.equal(items.length, 1);
    assert.deepEqual(
      [items[0].type, items[0].amount, items[0].category, items[0].payment, items[0].transaction_type],
      ['expense', amount, category, payment, '일반 지출'],
    );
  });
}

const receivedInterest = [
  ['예금 이자 5000원 받았어', 5000],
  ['적금 이자 5천원 들어왔어요', 5000],
  ['예금 이자 입금 5000원', 5000],
  ['어제 적금 이자를 5000원 받았습니다.', 5000],
  ['오늘 예금 이자 수령 5000원', 5000],
  ['예금 이자 5.001천원 입금됐어요', 5001],
  ['이자 5000원 받았어', 5000],
] as const;

for (const [input, amount] of receivedInterest) {
  test(`explicit interest receipt is income: ${input}`, () => {
    const items = parseInputLocally(input);
    assert.equal(items.length, 1);
    assert.deepEqual(
      [items[0].type, items[0].amount, items[0].category, items[0].payment, items[0].transaction_type],
      ['income', amount, '이자', '', ''],
    );
  });
}

const unchangedTransactions = [
  ['적금 5만원 넣었어', 'saving', '저축'],
  ['예금 5만원 납입', 'saving', '저축'],
  ['저축 3만원', 'saving', '저축'],
  ['청약 10만원', 'saving', '저축'],
  ['비상금 1만원', 'saving', '저축'],
  ['저금 2만원', 'saving', '저축'],
  ['월급 250만원 들어왔어', 'income', '월급'],
  ['급여 100만원 입금', 'income', '월급'],
  ['용돈 5만원 받았어', 'income', '용돈'],
  ['보너스 10만원', 'income', '보너스'],
  ['부업 수입 3만원', 'income', '부업'],
  ['대출 100만원 받았어', 'income', '기타수입'],
  ['대출 상환 10만원 계좌이체', 'expense', '대출'],
  ['점심 9000원 카드', 'expense', '식비'],
  ['커피 5000원 현금', 'expense', '카페'],
  ['휴대폰 요금 5만원', 'expense', '통신비'],
] as const;

for (const [input, type, category] of unchangedTransactions) {
  test(`ordinary transaction classification is preserved: ${input}`, () => {
    const [item] = parseInputLocally(input);
    assert.deepEqual([item.type, item.category], [type, category]);
  });
}

// These are compatibility assertions, NOT claims that the legacy interpretation
// is correct. Unsupported clauses still use the old keyword fallback and review.
const outsideInterestOverride = [
  ['대출 이자 5만원 안 냈어', 'income'],
  ['대출 이자 5만원 냈어? 아니야', 'income'],
  ['대출 이자 5만원 냈어 취소했어', 'income'],
  ['예금 이자 5000원 못 받았어', 'saving'],
  ['예금 이자 5000원 받지 않았어', 'saving'],
  ['대출 이자 말고 용돈 5만원 받았어', 'income'],
  ['예금 이자 아닌 적금 5000원 넣었어', 'saving'],
  ['대출 이자 5000원 냈어 1000원 받았어', 'income'],
  ['예금 이자 5000원 받았어 1000원 냈어', 'saving'],
  ['예금 이자 5000원 받았어 냈어', 'saving'],
  ['대출 이자 5000원 납입 수령', 'income'],
  ['대출 이자 5000원 냈어 2회', 'income'],
  ['9월 9일 예금 이자 5000원 받았어', 'saving'],
  ['예금 이자 5000원', 'saving'],
  ['신한은행 예금 이자 5000원 받았어', 'saving'],
  ['예금 이자 5000원 받았어?', 'saving'],
] as const;

for (const [input, legacyType] of outsideInterestOverride) {
  test(`unsupported interest clause keeps legacy fallback, not a new inference: ${input}`, () => {
    assert.equal(parseInputLocally(input)[0].type, legacyType);
  });
}

// Independent review found that the splitter discards amountless continuations.
// Preserve the old classification instead of applying an isolated interest rule
// to only the surviving fragment. These assertions do not validate legacy NLP.
const ambiguousContinuations = [
  ['대출 이자 5000원 납입', '받았어', 'income'],
  ['예금 이자 5000원 받았어', '적금에 넣었어', 'saving'],
  ['예금 이자 5000원 받았어', '저축했어', 'saving'],
  ['대출 이자 5만원 냈어', '취소했어', 'income'],
  ['예금 이자 5000원 받았어', '사실 안 받았어', 'saving'],
  ['대출 이자 5000원 납입', '내지 않았어', 'income'],
] as const;

for (const separator of ['하고', ' 그리고 ', '랑', ', ', '\n']) {
  for (const [first, continuation, legacyType] of ambiguousContinuations) {
    const input = first + separator + continuation;
    test(`amountless continuation disables new inference across separator: ${JSON.stringify(input)}`, () => {
      const items = parseInputLocally(input);
      assert.equal(items.length, 1);
      assert.equal(items[0].type, legacyType);
    });
  }

  test(`explicit independent transactions keep the override across separator: ${JSON.stringify(separator)}`, () => {
    const items = parseInputLocally([
      '대출 이자납입 5만원 계좌이체', '예금 이자 5000원 받았어', '적금 3만원 넣었어', '점심 9000원 카드',
    ].join(separator));
    assert.deepEqual(items.map(item => [item.type, item.amount, item.category]), [
      ['expense', 50000, '대출'], ['income', 5000, '이자'], ['saving', 30000, '저축'], ['expense', 9000, '식비'],
    ]);
  });
}

test('amountless fragments before or between transactions also disable interest overrides', () => {
  for (const input of [
    '사실 안 받았어 그리고 예금 이자 5000원 받았어',
    '예금 이자 5000원 받았어 그리고 취소했어 그리고 적금 1만원 넣었어',
    '대출 이자 5000원 납입하고 취소했어 그리고 예금 이자 5000원 받았어',
  ]) {
    const items = parseInputLocally(input);
    assert.equal(items[0].type, input.startsWith('대출') ? 'income' : 'saving');
    assert.equal(items.at(-1)?.type, 'saving');
  }
});

test('a count or bare number in a continuation is not enough to enable the interest override', () => {
  for (const input of [
    '대출 이자 5000원 납입하고 2회 취소했어',
    '대출 이자 5만원 냈어 그리고 2번 돌려받았어',
    '대출 이자 5000원 납입 그리고 5000',
  ]) {
    const items = parseInputLocally(input);
    // The legacy amount parser still retains the numeric fragment. Only the
    // newly added interest override must be disabled; amount parsing is unchanged.
    assert.equal(items.length, 2);
    assert.equal(items[0].type, 'income');
  }
});

test('expense payment and transaction subtypes remain unchanged', () => {
  for (const [input, payment, transactionType] of [
    ['휴대폰 소액결제 1000원', '휴대폰 소액결제', '휴대폰 소액결제'],
    ['충전카드 충전 10000원', '충전카드', '충전카드 충전'],
    ['선불카드로 커피 5000원', '충전카드', '충전카드 사용'],
  ]) {
    const [item] = parseInputLocally(input);
    assert.deepEqual([item.type, item.payment, item.transaction_type], ['expense', payment, transactionType]);
  }
});

test('existing separators still allow independent expense, income and saving previews', () => {
  const items = parseInputLocally('대출 이자납입 5만원 계좌이체, 예금 이자 5,000원 받았어 그리고 적금 3만원 넣었어\n점심 9000원 카드');
  assert.deepEqual(items.map(item => [item.type, item.amount, item.category]), [
    ['expense', 50000, '대출'], ['income', 5000, '이자'], ['saving', 30000, '저축'], ['expense', 9000, '식비'],
  ]);
});

test('interest classification does not relax the existing invalid amount rejection', () => {
  for (const input of [
    '대출 이자 -5000원 냈어', '예금 이자 0.5원 받았어', '대출 이자 9007199254740992원 납입',
    '대출 이자 5000원 납입 그리고 커피 -1000원',
  ]) {
    assert.throws(() => parseInputLocally(input), /금액/);
  }
});
