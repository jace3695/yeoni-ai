import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import { validBudgetDate } from '../app/budget/lib/manual-entry.ts';
import { getFixedExpenseSignature, FIXED_EXPENSE_PRIORITY_CATEGORIES, getRecurringPatternText } from '../app/budget/lib/transaction-parser.ts';

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

// Execute the page's actual derived calculation, not a second implementation.
const recurringStart = source.indexOf('    const recurringSourceTransactions =');
const recurringEnd = source.indexOf('    const recurringPreferenceMap =', recurringStart);
assert.ok(recurringStart >= 0 && recurringEnd > recurringStart);
const recurringCode = ts.transpileModule(source.slice(recurringStart, recurringEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const recurringRows = (dates: unknown[], patch = {}) => dates.map((date, i) => ({
  id: `synthetic-${i}`, date, amount: 10000, place: '가상 통신사', category: '통신비', payment: '체크카드', ...patch,
}));
function recurring(rows: readonly unknown[], loaded: readonly unknown[] = []) {
  const result = vm.runInNewContext(recurringCode + '; recurringExpenseCandidates', {
    transactions: rows, recurringTransactions: loaded, validBudgetDate,
    getFixedExpenseSignature, FIXED_EXPENSE_PRIORITY_CATEGORIES, getRecurringPatternText,
  });
  return JSON.parse(JSON.stringify(result));
}

test('recurring detection retains civil months and day stability across positive, negative and DST timezones', () => {
  const cases = [
    recurringRows(['2026-11-01', '2026-11-30']),
    recurringRows(['2026-10-31', '2026-11-01']),
    recurringRows(['2026-12-31', '2027-01-01']),
    recurringRows(['2024-02-29', '2024-03-01']),
    recurringRows(['2026-01-01', '2026-02-03', '2026-03-05']),
    recurringRows(['2026-03-08', '2026-04-08', '2026-11-01']),
  ];
  const script = `
    import fs from 'node:fs'; import vm from 'node:vm';
    const helpers = await import(${JSON.stringify(new URL('../app/budget/lib/transaction-parser.ts', import.meta.url).href)});
    const { validBudgetDate } = await import(${JSON.stringify(new URL('../app/budget/lib/manual-entry.ts', import.meta.url).href)});
    const { code, cases } = JSON.parse(fs.readFileSync(0, 'utf8'));
    console.log(JSON.stringify(cases.map(transactions => vm.runInNewContext(code + '; recurringExpenseCandidates', {
      transactions, recurringTransactions: [], validBudgetDate, ...helpers,
    }))));
  `;
  const zones = ['UTC', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Kathmandu', 'Pacific/Kiritimati', 'America/Los_Angeles', 'America/New_York', 'America/St_Johns', 'Pacific/Honolulu'];
  const results = zones.map(TZ => {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
      env: { ...process.env, TZ }, input: JSON.stringify({ code: recurringCode, cases }), encoding: 'utf8', timeout: 15000,
    });
    assert.equal(child.status, 0, `${TZ}: ${child.stderr}`);
    return JSON.parse(child.stdout);
  });
  assert.deepEqual(results[0][0], []);
  for (const index of [1, 2, 3]) {
    assert.equal(results[0][index].length, 1);
    assert.equal(results[0][index][0].monthCount, 2);
    assert.equal(results[0][index][0].dayStable, false);
    assert.equal(results[0][index][0].lastDate, cases[index][1].date);
  }
  assert.equal(results[0][4][0].dayStable, true);
  assert.equal(results[0][4][0].patternText, '최근 3개월간 비슷한 시기와 금액으로 지출');
  results.forEach((result, index) => assert.deepEqual(result, results[0], zones[index]));
});

test('recurring evidence excludes impossible or non-date keys without normalizing or mutating records', () => {
  const valid = recurringRows(['2024-02-29', '2024-03-01']);
  const invalid = recurringRows(['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z', '', null, 20260101]);
  const rows = Object.freeze([...valid, ...invalid].map(row => Object.freeze(row)));
  const before = JSON.stringify(rows);
  assert.deepEqual(recurring(rows), recurring(valid));
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(recurring(invalid), []);
  assert.deepEqual(recurring([valid[0], ...invalid]), []);
});

test('recurring date keys sort chronologically without mutating order or losing leap and year boundaries', () => {
  for (const dates of [['2027-01-01', '2026-12-31'], ['2024-03-01', '2024-02-29'], ['0099-02-01', '0099-01-31']]) {
    const rows = Object.freeze(recurringRows(dates).map(row => Object.freeze(row)));
    const result = recurring(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].lastDate, dates[0]);
    assert.equal(result[0].count, 2);
    assert.deepEqual(rows.map(row => row.date), dates);
  }
});

test('recurring date repair preserves source selection, stability thresholds, category and explicit preference boundaries', () => {
  const sameMonth = recurringRows(['2026-11-01', '2026-11-30']);
  const differentMonths = recurringRows(['2026-10-01', '2026-11-01']);
  assert.deepEqual(recurring(differentMonths, sameMonth), []);
  assert.deepEqual(recurring([], differentMonths), recurring(differentMonths));
  assert.deepEqual(recurring([differentMonths[0]]), []);
  assert.deepEqual(recurring([differentMonths[0], { ...differentMonths[1], amount: 30000 }]), []);
  const result = recurring(differentMonths)[0];
  assert.equal(result.avgAmount, 10000);
  assert.equal(result.count, 2);
  assert.equal(result.score, 105);
  assert.equal(result.priority, true);
  assert.equal(result.amountStable, true);
  assert.ok(!/\b(?:supabase|localStorage|sessionStorage|fetch|setItem)\b/.test(recurringCode));
  assert.ok(source.includes("!recurringPreferenceMap.has(item.key)"));
  assert.ok(source.includes("item.status === 'confirmed'"));
  assert.ok(source.includes("item.status === 'excluded'"));
  const derivedEnd = source.indexOf('    const budget = monthlyBudget || 0', recurringEnd);
  assert.ok(derivedEnd > recurringEnd);
  const derivedCode = ts.transpileModule(source.slice(recurringStart, derivedEnd), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const signature = result.key;
  const preference = Object.freeze({ signature, name: '가상 통신사', category: '통신비', status: 'confirmed', average_amount: 9000, last_detected_on: '2026-09-01' });
  const readDerived = (rows: readonly unknown[], saved: readonly unknown[]) => JSON.parse(JSON.stringify(vm.runInNewContext(derivedCode + '; ({pendingRecurringCandidates, confirmedRecurringExpenses, excludedRecurringExpenses, estimatedFixedTotal})', {
    transactions: rows, recurringTransactions: [], recurringExpensePreferences: saved,
    validBudgetDate, getFixedExpenseSignature, FIXED_EXPENSE_PRIORITY_CATEGORIES, getRecurringPatternText,
  })));
  assert.equal(readDerived(differentMonths, []).estimatedFixedTotal, 0);
  const confirmed = readDerived(differentMonths, Object.freeze([preference]));
  assert.equal(confirmed.pendingRecurringCandidates.length, 0);
  assert.equal(confirmed.estimatedFixedTotal, 10000);
  const fallback = readDerived(sameMonth, Object.freeze([preference]));
  assert.equal(fallback.pendingRecurringCandidates.length, 0);
  assert.equal(fallback.confirmedRecurringExpenses.length, 1);
  assert.equal(fallback.estimatedFixedTotal, 9000);
  assert.equal(fallback.confirmedRecurringExpenses[0].lastDate, '2026-09-01');
  const excluded = readDerived(differentMonths, Object.freeze([Object.freeze({ ...preference, status: 'excluded' })]));
  assert.equal(excluded.pendingRecurringCandidates.length, 0);
  assert.equal(excluded.excludedRecurringExpenses.length, 1);
  assert.equal(excluded.estimatedFixedTotal, 0);
  assert.equal(preference.average_amount, 9000);
});
