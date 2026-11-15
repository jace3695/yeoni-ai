import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { parseBudgetAmountCommand, isBudgetCommandProposal, matchesBudgetReceipt, type BudgetCommandProposal, type BudgetCommandReceipt } from '../lib/assistant-budget-command.ts';
import { applyBudgetAmount, proposeBudgetAmount } from '../lib/assistant-budget-server.ts';
import { readCommandDrafts } from '../lib/assistant-command-drafts.ts';

const owner = randomUUID(), transactionId = randomUUID();
const original = { id: transactionId, user_id: owner, date: '2026-09-15', place: '합성 카페', amount: 5000, category: '카페', payment: '체크카드', transaction_type: '일반 지출', memo: 'keep' };
const proposal = (): BudgetCommandProposal => ({ domain: 'budget', operation: 'update', requestId: randomUUID(), expected: original, amount: 4500, expiresAt: new Date(Date.now() + 900000).toISOString() });
const receipt = (p: BudgetCommandProposal): BudgetCommandReceipt => ({ id: p.requestId, category: null, field_name: 'amount', field_value: p.amount, entry_count: 1, created_at: new Date().toISOString(), undone_at: null });
const detail = (p: BudgetCommandProposal) => ({ transaction_id: p.expected.id, before_category: null, before_value: p.expected.amount, place: p.expected.place, date: p.expected.date });
function fixture(p: BudgetCommandProposal) {
  const state = { receipt: null as BudgetCommandReceipt | null, currency: 'KRW', rows: [original], calls: [] as { table: string; owner: string | null; body?: Record<string, unknown> }[], failRead: false, failRpc: false };
  const db = createClient('http://127.0.0.1:54321', 'synthetic-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), table = url.pathname.split('/').pop()!;
    state.calls.push({ table, owner: url.searchParams.get('user_id'), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (table === 'budget_category_changes' && state.failRead) return new Response(JSON.stringify({ message: 'synthetic read failure' }), { status: 503 });
    if (table === 'change_budget_expense_fields') {
      if (state.failRpc) return new Response(JSON.stringify({ code: 'P0001', message: '기록이 다른 곳에서 변경되었습니다.' }), { status: 409 });
      state.receipt = receipt(p); return new Response(JSON.stringify({ count: 1, reused: false, undone: false }));
    }
    const data = table === 'budget_user_settings' ? [{ currency: state.currency }]
      : table === 'budget_category_changes' ? state.receipt ? [state.receipt] : []
      : table === 'budget_category_change_items' ? state.receipt ? [detail(p)] : []
      : table === 'budget_transactions' ? state.rows : [];
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } } });
  return { db, state };
}

test('amount commands resolve one explicit date, merchant and integer without confusing merchant digits', () => {
  assert.deepEqual(parseBudgetAmountCommand('가계부 오늘 GS25 지출 금액을 5,000원으로 수정해줘', '2026-09-15'), { date: '2026-09-15', place: 'GS25', amount: 5000 });
  assert.equal(parseBudgetAmountCommand('어제 합성 카페 지출 4500원으로 변경해주세요', '2026-01-01').date, '2025-12-31');
  assert.equal(parseBudgetAmountCommand('그제 합성 카페 지출 4500원으로 변경해줘', '2026-03-01').date, '2026-02-27');
});
test('uncertain amounts, missing dates, multiple changes and nonexistent dates do not become proposals', () => {
  for (const text of ['가계부 편의점 지출 금액을 5000원으로 수정해줘', '오늘 편의점 지출 5,00원으로 수정해줘', '오늘 편의점 지출 -1원으로 수정해줘', '오늘 편의점 지출 0원으로 수정해줘', '오늘 편의점 지출 1.5원으로 수정해줘', '오늘 편의점 지출 9007199254740992원으로 수정해줘', '2026-02-30 편의점 지출 5000원으로 수정해줘', '오늘 편의점 지출 1000원으로 수정해줘 그리고 삭제해줘']) assert.throws(() => parseBudgetAmountCommand(text, '2026-09-15'));
});
test('a budget draft restores exact reviewed values and rejects another owner or malformed amount', () => {
  const p = proposal(), raw = JSON.stringify({ ownerId: owner, drafts: [{ proposal: p, attempted: true }] });
  assert.deepEqual(readCommandDrafts(raw, owner)[0].proposal, p);
  assert.deepEqual(readCommandDrafts(raw, randomUUID()), []);
  assert.equal(isBudgetCommandProposal({ ...p, amount: '4500' }), false);
  assert.throws(() => readCommandDrafts(JSON.stringify({ ownerId: owner, drafts: [{ proposal: { ...p, expected: { ...p.expected, user_id: randomUUID() } }, attempted: false }] }), owner));
});
test('proposal selection refuses ambiguous and foreign currency records without mutation', async () => {
  const p = proposal(), { db, state } = fixture(p), target = { date: original.date, place: original.place, amount: p.amount };
  const proposed = await proposeBudgetAmount(db, owner, target);
  assert.equal(proposed.expected.id, transactionId); assert.equal(proposed.amount, 4500);
  state.rows = [original, original]; await assert.rejects(proposeBudgetAmount(db, owner, target), /여러 건/);
  state.rows = []; await assert.rejects(proposeBudgetAmount(db, owner, target), /찾지 못/);
  state.currency = 'JPY'; await assert.rejects(proposeBudgetAmount(db, owner, target), /원화/);
  assert.equal(state.calls.filter(c => c.table === 'change_budget_expense_fields').length, 0);
});
test('apply uses the reviewed original and returns the same saved receipt on repeat without a second mutation', async () => {
  const p = proposal(), { db, state } = fixture(p);
  const first = await applyBudgetAmount(db, owner, p); const again = await applyBudgetAmount(db, owner, p);
  assert.deepEqual(again, first);
  const calls = state.calls.filter(c => c.table === 'change_budget_expense_fields'); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { p_request_id: p.requestId, p_rows: [{ id: transactionId, expected: original }], p_field: 'amount', p_value: 4500 });
  assert.ok(state.calls.filter(c => c.table !== 'change_budget_expense_fields').every(c => c.owner === `eq.${owner}`));
});
test('expired new requests and changed owners/currency never mutate; expired saved requests only read the receipt', async () => {
  const p = proposal(), { db, state } = fixture(p);
  await assert.rejects(applyBudgetAmount(db, randomUUID(), p), /본인의/); assert.equal(state.calls.length, 0);
  p.expiresAt = new Date(Date.now() - 1000).toISOString();
  await assert.rejects(applyBudgetAmount(db, owner, p), /확인 시간이/);
  state.receipt = receipt(p); assert.equal((await applyBudgetAmount(db, owner, p)).id, p.requestId);
  state.receipt = null; p.expiresAt = new Date(Date.now() + 900000).toISOString(); state.currency = 'USD';
  await assert.rejects(applyBudgetAmount(db, owner, p), /통화/);
  assert.equal(state.calls.filter(c => c.table === 'change_budget_expense_fields').length, 0);
});
test('failed history lookup is not absence; changed-record RPC error is reported and cannot become success', async () => {
  const p = proposal(), { db, state } = fixture(p); state.failRead = true;
  await assert.rejects(applyBudgetAmount(db, owner, p), /이력을 확인하지/);
  assert.equal(state.calls.filter(c => c.table === 'change_budget_expense_fields').length, 0);
  state.failRead = false; state.failRpc = true;
  await assert.rejects(applyBudgetAmount(db, owner, p), /다른 곳/);
  assert.equal(state.receipt, null);
});
test('request collisions cannot report unrelated receipts as this change', async () => {
  const p = proposal(), { db, state } = fixture(p); state.receipt = { ...receipt(p), field_value: 9999 };
  assert.equal(matchesBudgetReceipt(p, state.receipt, [detail(p)]), false);
  await assert.rejects(applyBudgetAmount(db, owner, p), /이미 사용한/);
  assert.equal(state.calls.filter(c => c.table === 'change_budget_expense_fields').length, 0);
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as summary from '../lib/assistant-budget-summary.ts';
import * as adviceIntent from '../lib/assistant-advice-intent.ts';

// Synthetic read-summary regressions share the existing budget command suite.
// Keep the fixed CI file inventory and its safety declarations unchanged.
{
const today = '2026-11-15';
const owner = 'synthetic-owner';
const query = (text = '이번 달 지출 알려줘') => summary.parseBudgetSummaryQuery(text, today)!;
const row = (id = 'a', amount: unknown = 4500, extra: Record<string, unknown> = {}) => ({ id, date: '2026-11-02', amount, category: '카페', place: '합성 카페', transaction_type: '일반 지출', ...extra });

test('month questions use the requested month, explicit year and actual last day', () => {
  assert.deepEqual(query(), { startDate: '2026-11-01', endDate: today, filter: null });
  for (const text of ['지난달 지출 알려줘', '저번 달 소비 얼마야?', '10월 지출 알려주세요', '2026년 10월 지출', '2026-10 지출 합계']) {
    assert.deepEqual(query(text), { startDate: '2026-10-01', endDate: '2026-10-31', filter: null });
  }
  assert.equal(summary.parseBudgetSummaryQuery('지난달 지출', '2027-01-01')?.startDate, '2026-12-01');
  assert.equal(query('2024년 2월 지출')?.endDate, '2024-02-29');
});
test('exact categories and explicitly named merchants are distinct, never fuzzy coffee guesses', () => {
  assert.deepEqual(query('이번 달 카페 지출 알려줘').filter, { field: 'category', value: '카페' });
  assert.deepEqual(query('가계부 이번 달 사용처 "GS25 합성점" 지출').filter, { field: 'place', value: 'GS25 합성점' });
  assert.deepEqual(query('이번 달 분류 "사용자 분류" 지출').filter, { field: 'category', value: '사용자 분류' });
  assert.equal(query('이번 달 커피 지출'), null);
});
test('future, invalid, comparison, exclusion, multiple clauses and unsupported questions do not broaden', () => {
  for (const text of ['12월 지출', '2026년 13월 지출', '2026년 0월 지출', '10월과 11월 지출 비교', '이번 달 카페 빼고 지출', '지난 3개월 지출', '매월 지출', '이번 달 지출 그리고 저축 알려줘', '이번 달 지출 삭제해줘', '이번 달 사용처 "" 지출']) assert.equal(query(text), null, text);
  assert.throws(() => summary.parseBudgetSummaryQuery('이번달 지출', '2026-02-30'));
});
test('topups are excluded, actual prepaid use is included, source period and limitations are shown', () => {
  const rows = [row(), row('b', 10000, { transaction_type: '충전카드 충전' }), row('c', 2000, { transaction_type: '충전카드 사용' })];
  const before = JSON.stringify(rows);
  const text = summary.summarizeBudgetExpenses(query(), rows, 3, 'KRW');
  assert.match(text, /2026-11-01~2026-11-15/); assert.match(text, /6,500원, 2건/); assert.match(text, /충전카드 충전 1건.*제외/);
  assert.match(text, /서버에 저장된/); assert.match(text, /저장되지 않은 소비/); assert.equal(JSON.stringify(rows), before);
});
test('only a proven empty full result may answer zero', () => {
  assert.match(summary.summarizeBudgetExpenses(query(), [], 0, 'KRW'), /0원, 0건/);
  for (const [rows, count] of [[null, 0], [[], null], [[row()], 1001], [[row()], undefined], [[], 1]]) assert.throws(() => summary.summarizeBudgetExpenses(query(), rows, count, 'KRW'), /확정하지/);
});
test('currency stays explicit and minor units never use rounded floating-point sums', () => {
  assert.match(summary.summarizeBudgetExpenses(query(), [row('a', '0.10'), row('b', '0.20')], 2, 'USD'), /0.3달러/);
  assert.match(summary.summarizeBudgetExpenses(query(), [row()], 1, 'JPY'), /4,500엔/);
  assert.match(summary.summarizeBudgetExpenses(query(), [row('a', '90071992547409.91')], 1, 'USD'), /90,071,992,547,409\.91달러/);
  for (const currency of ['EUR', '', null, undefined, ['KRW'], { toString: () => 'KRW' }]) assert.throws(() => summary.summarizeBudgetExpenses(query(), [row()], 1, currency));
  assert.throws(() => summary.summarizeBudgetExpenses(query(), [row('a', 1.5)], 1, 'KRW'));
});
test('malformed, out-of-range, duplicate and unsafe financial values fail closed', () => {
  for (const amount of [null, '', ' ', '1e3', '-5', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1.001']) assert.throws(() => summary.summarizeBudgetExpenses(query(), [row('a', amount)], 1, 'USD'), String(amount));
  for (const extra of [{ date: '2026-10-31' }, { date: '2026-11-16' }, { date: '2026-02-30' }, { id: '' }, { transaction_type: 'unknown' }, { transaction_type: ['일반 지출'] }]) assert.throws(() => summary.summarizeBudgetExpenses(query(), [row('a', 1, extra)], 1, 'KRW'));
  assert.throws(() => summary.summarizeBudgetExpenses(query(), [row(), row()], 2, 'KRW'));
  assert.throws(() => summary.summarizeBudgetExpenses(query(), [row('a', Number.MAX_SAFE_INTEGER), row('b', 1)], 2, 'KRW'));
  assert.throws(() => summary.summarizeBudgetExpenses(query('이번 달 카페 지출'), [row('b', 1, { category: '식비' })], 1, 'KRW'));
});
test('prototype-looking category labels cannot mutate aggregation or hide totals', () => {
  const text = summary.summarizeBudgetExpenses(query(), [row('a', 5, { category: '__proto__' }), row('b', 7, { category: 'constructor' })], 2, 'KRW');
  assert.match(text, /12원, 2건/); assert.match(text, /constructor.*7원/);
});

function fixture() {
  const state = { rows: [row()], currency: 'KRW' as unknown, countOverride: undefined as number | null | undefined, errorTable: '', calls: [] as { table: string; method: string; params: URLSearchParams }[], history: [] as unknown[], loggedIn: true };
  const db = createClient('http://127.0.0.1:54321', 'synthetic-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), table = url.pathname.split('/').at(-1)!;
    const method = init?.method ?? 'GET'; state.calls.push({ table, method, params: url.searchParams });
    if (table === state.errorTable) return new Response(JSON.stringify({ message: 'synthetic failure' }), { status: 400 });
    if (table === 'assistant_chat_messages' && method === 'POST') { state.history.push(JSON.parse(String(init?.body))); return new Response(null, { status: 201 }); }
    if (table === 'assistant_chat_messages') return Response.json([]);
    if (table === 'budget_user_settings') return Response.json(state.currency === undefined ? [] : [{ currency: state.currency }]);
    if (table !== 'budget_transactions') return Response.json([]);
    const dates = url.searchParams.getAll('date');
    const rows = state.rows.filter(r => dates.every(d => d.startsWith('gte.') ? r.date >= d.slice(4) : r.date <= d.slice(4))
      && ['category', 'place'].every(k => !url.searchParams.has(k) || r[k as 'category' | 'place'] === url.searchParams.get(k)!.slice(3)));
    const count = state.countOverride === undefined ? rows.length : state.countOverride;
    return Response.json(rows, { headers: count === null ? {} : { 'content-range': `0-${Math.max(0, rows.length - 1)}/${count}` } });
  } } });
  return { db, state };
}

test('loader scopes both settings and records to authenticated owner, filters server-side, and only reads', async () => {
  const { db, state } = fixture(); state.rows.push(row('b', 9000, { category: '식비' }));
  const text = await summary.loadBudgetExpenseSummary(db, owner, query('이번 달 카페 지출'));
  assert.match(text, /4,500원, 1건/); assert.match(text, /저장 분류 ‘카페’ 정확히 일치/);
  assert.ok(state.calls.every(c => c.method === 'GET' && c.params.get('user_id') === `eq.${owner}`));
  const record = state.calls.find(c => c.table === 'budget_transactions')!;
  assert.equal(record.params.get('category'), 'eq.카페'); assert.equal(record.params.get('limit'), '1000');
  assert.equal(record.params.get('select'), 'id,amount,date,category,place,transaction_type');
});
test('loader refuses missing owner, partial count, settings failure and unknown currency', async () => {
  const { db, state } = fixture();
  await assert.rejects(summary.loadBudgetExpenseSummary(db, '', query())); assert.equal(state.calls.length, 0);
  state.countOverride = 1001; await assert.rejects(summary.loadBudgetExpenseSummary(db, owner, query()), /確定|확정/);
  state.countOverride = null; await assert.rejects(summary.loadBudgetExpenseSummary(db, owner, query()));
  state.countOverride = undefined; state.errorTable = 'budget_user_settings'; await assert.rejects(summary.loadBudgetExpenseSummary(db, owner, query()), /통화/);
  state.errorTable = ''; state.currency = 'EUR'; await assert.rejects(summary.loadBudgetExpenseSummary(db, owner, query()));
  state.currency = undefined; assert.match(await summary.loadBudgetExpenseSummary(db, owner, query()), /4,500원/);
});

// Execute the actual POST handler with a fake authenticated Supabase transport.
// No real credentials, database, model, audio, browser or global fetch is used.
function handler(db: ReturnType<typeof fixture>['db'], loggedIn = true) {
  const source = readFileSync(new URL('../app/api/assistant/chat/route.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  vm.runInNewContext('(function(exports, require){' + code + '\n})', { Error, Date: class extends Date { static now() { return Date.parse('2026-11-15T03:00:00Z'); } }, Intl, crypto: { randomUUID: () => 'synthetic-request-id' }, console: { error() {}, warn() {} } })(exports, (name: string) => {
    if (name === '@/lib/assistant-budget-summary') return summary;
    if (name === '@/lib/supabase-server') return { createServerSupabaseClient: async () => Object.assign(Object.create(db), { auth: { getUser: async () => ({ data: { user: loggedIn ? { id: owner } : null } }) }, from: db.from.bind(db) }) };
    if (name === 'next/server') return { NextResponse: { json: Response.json } };
    if (name === '@/lib/assistant-advice-intent') return adviceIntent;
    if (name === '@/lib/assistant-budget-command') return { isBudgetEditIntent: () => false };
    if (name === '@/lib/assistant-diet-command') return { isDietRecordIntent: () => false, isDietMemoCommand: () => false };
    if (name === '@/lib/assistant-growth-command') return { isGrowthCompletionIntent: () => false };
    if (name === '@/lib/assistant-workout-cardio-command') return { isWorkoutCardioIntent: () => false };
    if (name === '@/lib/assistant-workout-feedback-command') return { isWorkoutFeedbackIntent: () => false };
    if (name === '@/app/lib/assistantConversation') return { selectConversationHistory: () => [{ role: 'user', text: '오늘 할 일에 우유 사기 추가해줘' }] };
    if (name === '@/lib/yeoni/reply-plan') return { buildReplyPlan: () => ({ synthetic: true }) };
    if (name === '@/lib/ai-router') return { isAiFeatureAvailable: () => false, generateAiText: () => { throw Error('Provider must not run'); } };
    return {};
  });
  return async (message: string) => exports.POST(new Request('http://localhost/api/assistant/chat', { method: 'POST', body: JSON.stringify({ message }) }));
}

test('actual POST answers the requested historical month, not today, and never mutates financial tables', async () => {
  const { db, state } = fixture(); state.rows.push(row('oct', 9000, { date: '2026-10-14' }));
  const res = await handler(db)('10월 지출 알려줘'); const body = await res.json();
  assert.equal(res.status, 200); assert.match(body.reply, /2026-10-01~2026-10-31.*9,000원, 1건/);
  assert.equal(body.changed, false); assert.equal(body.proposal, undefined);
  assert.ok(state.calls.filter(c => c.table !== 'assistant_chat_messages').every(c => c.method === 'GET'));
});
test('actual POST clarifies unsupported category/exclusion without querying finance or calling a model', async () => {
  const { db, state } = fixture(); const post = handler(db);
  for (const text of ['이번 달 커피 지출 알려줘', '이번 달 카페 빼고 지출 알려줘', '2026년 12월 지출', '이번 달 사용처 브리핑 지출 알려줘']) {
    const res = await post(text); assert.equal(res.status, 200); assert.equal((await res.json()).reply, summary.BUDGET_SUMMARY_HELP);
  }
  assert.ok(state.calls.every(c => c.table === 'assistant_chat_messages'));
});
test('actual POST reports incomplete totals as errors, and unauthenticated requests read nothing', async () => {
  const { db, state } = fixture(); state.countOverride = 1001;
  const res = await handler(db)('이번 달 지출 알려줘'); assert.equal(res.status, 500); assert.match((await res.json()).error, /확정하지/); assert.equal(state.history.length, 0);
  state.calls = []; const denied = await handler(db, false)('이번 달 지출 알려줘'); assert.equal(denied.status, 401); assert.equal(state.calls.length, 0);
});

test('actual POST prioritizes only complete read grammar; quoted labels stay literal', async () => {
  for (const place of ['브리핑', '추천카페', '그리고 카페', '그거', '할 일 추가', '기록 삭제']) {
    const { db, state } = fixture(); state.rows = [row('a', 4500, { place }), row('b', 9000, { place: '다른 곳' })];
    const res = await handler(db)(`이번 달 사용처 "${place}" 지출 알려줘`); const body = await res.json();
    assert.equal(res.status, 200, place); assert.match(body.reply, /4,500원, 1건/);
    assert.equal(body.adviceRequest, undefined); assert.equal(body.proposal, undefined);
    assert.equal(state.calls.find(c => c.table === 'budget_transactions')?.params.get('place'), `eq.${place}`);
    assert.ok(state.calls.filter(c => c.table !== 'assistant_chat_messages').every(c => c.method === 'GET'));
  }
  const { db, state } = fixture(); state.rows = [row('a', 100, { date: '2026-10-04' })];
  const res = await handler(db)('2026-10 지출 알려줘'); assert.match((await res.json()).reply, /2026-10-01~2026-10-31.*100원, 1건/);
});
test('actual advice keeps the preview gate and write sentences do not enter the summary branch', async () => {
  const { db, state } = fixture(); const res = await handler(db)('이번 달 소비를 줄이려면 어떻게 하면 좋을까?');
  assert.equal(res.status, 200); assert.equal((await res.json()).adviceRequest?.scope, 'budget');
  assert.ok(state.calls.every(c => c.table === 'assistant_chat_messages'));
  for (const text of ['이번 달 지출 할 일 추가해줘', '일정 "이번 달 지출" 추가', '이번 달 지출 삭제해줘', '이번 달 가계부 금액 수정해줘']) {
    assert.equal(query(text), null); assert.equal(summary.isBudgetSummaryIntent(text), false);
  }
});

}
