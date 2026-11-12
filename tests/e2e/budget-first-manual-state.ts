import type { Page, Request } from '@playwright/test';
import { expect, canonical, login } from './fixture';
export { silentGuard, noOverflow } from './japanese-reference-routine-state';
type Account = Parameters<typeof login>[1];
type Row = Record<string, unknown>;
export const tables = ['budget_profiles', 'budget_transactions', 'budget_income', 'budget_savings', 'budget_monthly_budgets', 'budget_category_budgets', 'budget_recurring_expense_preferences', 'budget_user_settings', 'budget_save_batches'] as const;
export type BudgetSnapshot = Record<typeof tables[number], Row[]>;
export const rpcUrl = 'http://127.0.0.1:54321/rest/v1/rpc/save_budget_batch';
export const nickname = 'CI synthetic budget owner';
export const expense = (date: string) => ({ type: 'expense', date, amount: 4200, place: 'CI synthetic manual expense', memo: 'CI synthetic preservation check', category: '기타', payment: '현금', transaction_type: '일반 지출' });
export const same = (actual: unknown, expected: unknown, label: string) => expect(canonical(actual), label).toBe(canonical(expected));
export async function snapshot(account: Account): Promise<BudgetSnapshot> {
  const entries = [];
  for (const table of tables) {
    const result = await account.client.from(table).select('*').eq('user_id', account.id);
    expect(result.error, 'budget-core-owned-read-error').toBeNull();
    expect(Array.isArray(result.data), 'budget-core-owned-read-array').toBe(true);
    const rows = [...result.data!].sort((a, b) => canonical(a).localeCompare(canonical(b)));
    entries.push([table, rows]);
  }
  return Object.fromEntries(entries) as BudgetSnapshot;
}
export async function assertOtherOwnerHidden(reader: Account, owner: Account) {
  for (const table of ['budget_profiles', 'budget_transactions', 'budget_save_batches']) {
    const result = await reader.client.from(table).select('*').eq('user_id', owner.id);
    expect(result.error, 'budget-core-other-owner-read-error').toBeNull();
    expect(result.data, 'budget-core-other-owner-hidden').toEqual([]);
  }
}
export const menu = (page: Page) => page.getByRole('navigation', { name: '가계부 주요 메뉴', exact: true });
export async function assertPreview(page: Page, item: ReturnType<typeof expense>) {
  const preview = page.locator('section').filter({ has: page.getByRole('button', { name: '1건 확인 후 저장', exact: true }) });
  await expect(preview).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '2. 입력 내용을 확인하고 저장하세요', exact: true })).toBeVisible();
  await expect(preview.locator('xpath=.//label[normalize-space(text())="구분"]/select')).toHaveValue('expense');
  await expect(preview.getByLabel('날짜', { exact: true })).toHaveValue(item.date);
  await expect(preview.getByLabel('사용처', { exact: true })).toHaveValue(item.place);
  await expect(preview.getByLabel('금액', { exact: true })).toHaveValue(String(item.amount));
  await expect(preview.locator('xpath=.//label[normalize-space(text())="카테고리"]/select')).toHaveValue(item.category);
  await expect(preview.locator('xpath=.//label[normalize-space(text())="결제수단"]/select')).toHaveValue(item.payment);
  await expect(preview.locator('xpath=.//label[normalize-space(text())="거래 유형"]/select')).toHaveValue(item.transaction_type);
  await expect(preview.getByLabel('메모 · 선택', { exact: true })).toHaveValue(item.memo);
}
export function observeBatchWrites(page: Page) {
  let writes = 0;
  const listener = (request: Request) => { if (request.url() === rpcUrl && request.method() === 'POST') writes++; };
  page.on('request', listener);
  return { count: () => writes, stop: () => page.off('request', listener) };
}
export function assertSavedRows(current: BudgetSnapshot, before: BudgetSnapshot, owner: string, item: ReturnType<typeof expense>, batchId: string, started: number, observed: number) {
  expect(current.budget_transactions, 'budget-core-one-expense').toHaveLength(1);
  expect(current.budget_save_batches, 'budget-core-one-receipt').toHaveLength(1);
  const row = current.budget_transactions[0], receipt = current.budget_save_batches[0];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  expect(row.id, 'budget-core-generated-row-id').toMatch(uuid); expect(batchId).toMatch(uuid);
  for (const value of [row.created_at, receipt.created_at]) {
    expect(typeof value, 'budget-core-created-time-type').toBe('string');
    const at = Date.parse(value as string);
    expect(Number.isFinite(at) && at >= started - 2000 && at <= observed + 2000, 'budget-core-created-time-bound').toBe(true);
  }
  expect(receipt.payload_hash, 'budget-core-receipt-hash-shape').toMatch(/^[a-f0-9]{32}$/);
  const { type: omittedType, ...fields } = item; expect(omittedType).toBe('expense');
  same(row, { id: row.id, user_id: owner, ...fields, created_at: row.created_at }, 'budget-core-exact-expense');
  same(receipt, { user_id: owner, id: batchId, payload_hash: receipt.payload_hash, entry_count: 1, created_at: receipt.created_at }, 'budget-core-exact-receipt');
  for (const table of tables) if (table !== 'budget_transactions' && table !== 'budget_save_batches') same(current[table], before[table], 'budget-core-other-budget-records-preserved');
}
export async function assertHomeRow(page: Page, item: ReturnType<typeof expense>) {
  await menu(page).getByRole('button', { name: '홈', exact: true }).click();
  const row = page.locator('.home-recent-row').filter({ has: page.getByText(item.place, { exact: true }) });
  await expect(row).toHaveCount(1); await expect(row).toBeVisible();
  await expect(row).toContainText(item.date); await expect(row).toContainText(item.category);
  await expect(row.locator('.home-recent-amount')).toHaveText('−₩4,200');
}
