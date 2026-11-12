import { test, expect, login, today } from './fixture';
import { dailyKeys, journalKey, saveFailure, scopeFailure, localSuccess, retryButton, nextButton, seedReferenceState, referenceSnapshot, equalRecords, languageWrites, unchanged, confirmed, assertDailyDelta, installJournalHarness, journalStats, restoreJournal, kanaAnswers, correctChoice, score, silentGuard, boardCheck, noOverflow, noApplicationAlerts, settingsState, synced } from './japanese-reference-routine-state';
test('kana and word ordinary quizzes retry exact daily completion once and preserve records through invalidation boards settings and relogin', async ({ page, context, qa }) => {
  const silence = await test.step('reference silent guard setup', () => silentGuard(page, context));
  try {
    const { fitness, seeded } = await test.step('reference initial reads and seed', async () => { const fitness = await qa.read(); const seeded = await seedReferenceState(qa); return { fitness, seeded }; }); let saved = seeded;
    await test.step('reference narrow viewport setup', () => page.setViewportSize({ width: 320, height: 740 }));
    await test.step('reference initial login and acknowledgement', async () => { await login(page, qa.account, '/language/kana'); await synced(page); });
    await test.step('reference initial local state preservation', async () => { equalRecords(await settingsState(page), saved, 'reference-initial-local-state'); });
    const { day, kana } = await test.step('reference visible kana answer source', async () => { const day = today(); const kana = await kanaAnswers(page); return { day, kana }; });
    for (const id of ['kana', 'words'] as const) {
      await test.step(`${id}: four ordinary correct answers have no daily completion`, async () => {
        if (id === 'words') {
          await silence.check();
          await page.getByRole('navigation', { name: '언어 주요 메뉴', exact: true }).locator('a[href="/language"]').click();
          await expect(page.getByRole('heading', { name: '글자부터 문장까지', exact: true })).toBeVisible();
          await page.locator('a[href="/language/words"]').click();
          await synced(page);
        }
        await expect(page.getByRole('heading', { name: id === 'kana' ? '히라가나 / 가타카나 훈련' : '단어 학습', exact: true })).toBeVisible();
        await test.step('reference ordinary initial quiz score', async () => { await page.getByRole('button', { name: '퀴즈 모드', exact: true }).click(); await score(page, id, 0); });
        const snapshot = await referenceSnapshot(page), writes = languageWrites(qa);
        for (let count = 1; count <= 4; count++) {
          await test.step('reference ordinary answer and score', async () => { await (await correctChoice(page, id, kana)).click(); await score(page, id, count); });
          await test.step('reference ordinary unchanged records', async () => { await unchanged(page, qa, saved, fitness, snapshot, writes); });
          await expect(page.getByText(localSuccess, { exact: true })).toHaveCount(0);
          await expect(retryButton(page)).toHaveCount(0);
          await nextButton(page, id).click();
        }
        await ordinarySilence(silence); await ordinaryAlerts(page); await ordinaryLayout(page);
      });
      await test.step(`${id}: fifth score survives targeted pre-write failure and genuine UI retry`, async () => {
        const snapshot = await referenceSnapshot(page), writes = languageWrites(qa);
        const expected = Object.fromEntries(dailyKeys.map(key => [key, saved[key] as string]));
        await page.evaluate(installJournalHarness, { expected, fail: true });
        try {
          const answer = await correctChoice(page, id, kana);
          await answer.click(); await score(page, id, 5);
          await expect(page.getByRole('status').filter({ hasText: saveFailure })).toHaveText(saveFailure);
          await expect(retryButton(page)).toBeEnabled();
          await expect(page.getByText(localSuccess, { exact: true })).toHaveCount(0);
          await expect(page.getByText(/^아직 저장하지 못한 일일 완료 요청은/)).toBeVisible();
          expect(await journalStats(page), 'reference-only-intended-journal-failed').toEqual({ hits: 1, dailyWrites: 0, otherJournals: 0 });
          await unchanged(page, qa, saved, fitness, snapshot, writes);
          // Kana disables the answer; words keeps it clickable but its ref guard
          // must still prevent a second score/attempt and an implicit retry.
          if (id === 'kana') await expect(answer).toBeDisabled();
          else { await answer.click(); await score(page, id, 5); await unchanged(page, qa, saved, fitness, snapshot, writes); }
        } finally { await restoreJournal(page); }
        const since = qa.traffic.entries.length, started = await page.evaluate(() => Date.now());
        await retryButton(page).click();
        await expect(page.getByText(localSuccess, { exact: true })).toBeVisible(); await expect(retryButton(page)).toBeDisabled();
        await expect(page.getByText(/^아직 저장하지 못한 일일 완료 요청은/)).toHaveAttribute('aria-hidden', 'true');
        const current = await settingsState(page), observed = await page.evaluate(() => Date.now());
        saved = assertDailyDelta(saved, current, id, day, started, observed);
        await confirmed(page, qa, saved, fitness, since); await score(page, id, 5);
        // All owner/epoch/reset markers and unrelated local/fitness records survive.
        const after = await referenceSnapshot(page);
        equalRecords(Object.fromEntries(Object.entries(after).filter(([key]) => !dailyKeys.includes(key as typeof dailyKeys[number]))),
          Object.fromEntries(Object.entries(snapshot).filter(([key]) => !dailyKeys.includes(key as typeof dailyKeys[number]))), 'reference-only-daily-local-delta');
        expect(after[journalKey], 'reference-no-leftover-journal').toBeNull();
        await silence.check();
      });
      await test.step(`${id}: injected mounted-page invalidation stops the next answer and reload recovers`, async () => {
        await nextButton(page, id).click(); const answer = await correctChoice(page, id, kana);
        const snapshot = await referenceSnapshot(page), writes = languageWrites(qa);
        // Listener stimulus only: no real reset, owner, epoch or other account changes.
        await page.evaluate(() => window.dispatchEvent(new Event('ai-yeoni-record-reset')));
        await answer.click(); await score(page, id, 5);
        await expect(page.getByRole('status').filter({ hasText: scopeFailure })).toHaveText(scopeFailure);
        await expect(nextButton(page, id)).toHaveCount(0);
        await unchanged(page, qa, saved, fitness, snapshot, writes);
        await silence.check(); await page.reload(); await synced(page);
        equalRecords(await settingsState(page), saved, 'reference-reloaded-records');
        await page.getByRole('button', { name: '퀴즈 모드', exact: true }).click(); await score(page, id, 0);
        const restored = await referenceSnapshot(page), restoredWrites = languageWrites(qa);
        await (await correctChoice(page, id, kana)).click(); await score(page, id, 1);
        await unchanged(page, qa, saved, fitness, restored, restoredWrites);
        await expect(page.getByText(scopeFailure, { exact: true })).toHaveCount(0);
        await silence.check(); await noApplicationAlerts(page);
      });
      if (id === 'kana') await test.step('320px writing view and faint guide share backgrounds and support draw erase', async () => {
        const snapshot = await referenceSnapshot(page), writes = languageWrites(qa);
        await boardCheck(page); await unchanged(page, qa, saved, fitness, snapshot, writes); await silence.check();
      });
    }
    await test.step('Settings has normal controls without a displayed guide or common character', async () => {
      await page.getByRole('navigation', { name: '언어 주요 메뉴', exact: true }).locator('a[href="/language/settings"]').click();
      await expect(page.getByRole('heading', { name: '학습 설정', exact: true })).toBeVisible(); await synced(page);
      await expect(page.getByRole('complementary', { name: '연이의 안내', exact: true })).toHaveCount(0);
      await expect(page.locator('[data-yeoni-guide]')).toHaveCount(0);
      await expect(page.locator('[data-yeoni-common-host]:visible')).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: '하루 학습 시간', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '설정 저장', exact: true })).toBeVisible();
      equalRecords(await settingsState(page), saved, 'reference-settings-records-preserved');
      await noApplicationAlerts(page); await noOverflow(page); await silence.check();
    });
    await test.step('both genuine daily completions survive reload logout and real relogin', async () => {
      const restored = async () => {
        await synced(page); equalRecords(await settingsState(page), saved, 'reference-restored-exact-local-state');
        equalRecords(await qa.readLanguage(), saved, 'reference-restored-exact-database-state');
        equalRecords(await qa.read(), fitness, 'reference-restored-fitness');
        const progress = JSON.parse(saved.dailyRoutineProgress as string), history = JSON.parse(saved.dailyLearningHistory as string);
        expect(progress.completedIds, 'reference-two-distinct-completions').toEqual(['kana', 'words']);
        expect(history[day].completedIds).toEqual(['kana', 'words']); expect(history[day].completedCount).toBe(2);
      };
      await page.reload(); await restored(); await silence.check();
      await page.getByRole('button', { name: '로그아웃', exact: true }).click();
      await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [...dailyKeys])).toEqual([null, null]);
      await silence.check(); await login(page, qa.account, '/language/words'); await restored();
      expect(today(), 'reference-no-midnight-crossing').toBe(day);
      expect(qa.traffic.blockedOrigins.size, 'reference-no-external-origin-attempts').toBe(0);
      await silence.check(); await noApplicationAlerts(page);
    });
  } finally { await test.step('reference silent guard restoration', () => silence.restore()); }
});

// Spec-owned helper phases retain numeric attribution without exposing helper sources.
async function ordinarySilence(silence: Awaited<ReturnType<typeof silentGuard>>) { await test.step('reference ordinary silence', () => silence.check()); }
async function ordinaryAlerts(page: Parameters<typeof noApplicationAlerts>[0]) { await test.step('reference ordinary application alerts', () => noApplicationAlerts(page)); }
async function ordinaryLayout(page: Parameters<typeof noOverflow>[0]) { await test.step('reference ordinary layout', () => noOverflow(page)); }
