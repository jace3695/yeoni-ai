import { test, expect, login, today } from './fixture';
import { nickname, expense, tables, snapshot, same, menu, assertPreview, observeBatchWrites, rpcUrl, assertSavedRows, assertHomeRow, assertOtherOwnerHidden, silentGuard, noOverflow } from './budget-first-manual-state';
test('first budget profile and manual expense require review and preserve both owners through authentic save and reload', async ({ page, context, qa }) => {
  const silence = await test.step('budget core silent read-only authentication boundary', () => silentGuard(page, context));
  const traffic = observeBatchWrites(page);
  try {
    const date = today(), item = expense(date);
    const fitness = await qa.read(), language = await qa.readLanguage(), before = await snapshot(qa.account);
    for (const table of tables) expect(before[table], 'budget-core-fresh-account').toEqual([]);
    const other = await qa.createAccount();
    // Only this second owner's sentinel is seeded. The primary profile and
    // expense must be created by genuine UI actions below, never direct seeds.
    const sentinel = { user_id: other.id, date: '2001-01-02', amount: 1700, place: 'CI other-owner sentinel', category: '기타', payment: '현금', transaction_type: '일반 지출', memo: 'CI do not change' };
    expect((await other.client.from('budget_transactions').insert(sentinel)).error, 'budget-core-other-sentinel-seed').toBeNull();
    const otherBefore = await snapshot(other), otherFitness = await qa.read(other), otherLanguage = await qa.readLanguage(other);
    const preserved = async () => {
      same(await qa.read(), fitness, 'budget-core-fitness-preserved'); same(await qa.readLanguage(), language, 'budget-core-language-preserved');
      same(await snapshot(other), otherBefore, 'budget-core-other-budget-preserved');
      same(await qa.read(other), otherFitness, 'budget-core-other-fitness-preserved'); same(await qa.readLanguage(other), otherLanguage, 'budget-core-other-language-preserved');
    };
    await test.step('budget core first profile is created in ordinary UI', async () => {
      await page.setViewportSize({ width: 320, height: 800 }); await login(page, qa.account, '/budget');
      const dialog = page.getByRole('dialog', { name: '닉네임을 입력해주세요', exact: true });
      await expect(dialog).toBeVisible(); await dialog.getByPlaceholder('닉네임', { exact: true }).fill(nickname);
      await dialog.getByRole('button', { name: '저장', exact: true }).click(); await expect(dialog).toHaveCount(0);
      const current = await snapshot(qa.account);
      same(current, { ...before, budget_profiles: [{ user_id: qa.account.id, nickname }] }, 'budget-core-profile-only-created');
      await preserved(); await silence.check();
    });
    const afterProfile = await snapshot(qa.account);
    await test.step('budget core manual preview and edit do not save', async () => {
      await menu(page).getByRole('button', { name: '기록', exact: true }).click();
      await page.getByRole('button', { name: '직접 적기', exact: true }).click();
      const form = page.getByRole('form', { name: '가계부 직접 입력', exact: true });
      await form.locator('xpath=.//label[normalize-space(text())="지출 또는 수입"]/select').selectOption('expense');
      await form.getByLabel('날짜', { exact: true }).fill(item.date);
      await form.getByLabel('금액 · 원', { exact: true }).fill(String(item.amount));
      await form.getByLabel('사용처', { exact: true }).fill(item.place);
      await form.locator('xpath=.//label[normalize-space(text())="분류"]/select').selectOption(item.category);
      await form.locator('xpath=.//label[normalize-space(text())="결제수단"]/select').selectOption(item.payment);
      await form.getByLabel('메모 · 선택', { exact: true }).fill(item.memo);
      await form.getByRole('button', { name: '입력한 내용 확인', exact: true }).click(); await assertPreview(page, item);
      same(await snapshot(qa.account), afterProfile, 'budget-core-preview-no-write'); expect(traffic.count()).toBe(0);
      await page.getByRole('button', { name: '입력 수정', exact: true }).click(); await expect(form).toBeVisible();
      await expect(form.getByLabel('사용처', { exact: true })).toHaveValue(item.place);
      same(await snapshot(qa.account), afterProfile, 'budget-core-edit-no-write'); await preserved();
      await form.getByRole('button', { name: '입력한 내용 확인', exact: true }).click(); await assertPreview(page, item);
      await noOverflow(page); await silence.check();
    });
    const committed = await test.step('budget core authentic batch and exact owned readback', async () => {
      const started = Date.now();
      const responsePromise = page.waitForResponse(response => response.url() === rpcUrl && response.request().method() === 'POST');
      await page.getByRole('button', { name: '1건 확인 후 저장', exact: true }).click();
      const response = await responsePromise; expect(response.ok(), 'budget-core-genuine-rpc-success').toBe(true);
      const payload = response.request().postDataJSON() as { p_batch_id: string; p_items: unknown[] };
      same(payload, { p_batch_id: payload.p_batch_id, p_items: [item] }, 'budget-core-exact-rpc-request');
      same(await response.json(), { count: 1, reused: false }, 'budget-core-genuine-rpc-receipt');
      await expect(page.getByText('1건의 저장을 확인했어요.', { exact: true })).toBeVisible();
      const current = await snapshot(qa.account);
      assertSavedRows(current, afterProfile, qa.account.id, item, payload.p_batch_id, started, Date.now());
      expect(traffic.count(), 'budget-core-exactly-one-write').toBe(1); await preserved();
      await assertOtherOwnerHidden(qa.account, other); await assertOtherOwnerHidden(other, qa.account);
      await assertHomeRow(page, item); await silence.check(); return current;
    });
    await test.step('budget core reload preserves exact rows without another write', async () => {
      await page.reload(); await expect(page.getByRole('navigation', { name: '가계부 주요 메뉴', exact: true })).toBeVisible();
      await expect(page.getByRole('dialog', { name: '닉네임을 입력해주세요', exact: true })).toHaveCount(0);
      await assertHomeRow(page, item); same(await snapshot(qa.account), committed, 'budget-core-exact-reload');
      expect(traffic.count(), 'budget-core-no-repeat-rpc').toBe(1); await preserved();
      await assertOtherOwnerHidden(qa.account, other); await assertOtherOwnerHidden(other, qa.account);
      expect(today(), 'budget-core-no-midnight-crossing').toBe(date);
      expect(qa.traffic.blockedOrigins.size, 'budget-core-no-external-origins').toBe(0);
      await noOverflow(page); await silence.check();
    });
  } finally { traffic.stop(); await silence.restore(); }
});
