import { test, expect, login, canonical, type State } from './fixture';
import { seedSettings, changed, selectedGoal, saveLearning, noSuccess, settingsError, localSettings, confirmedSettings, rereadSettings, installSettingsFault, restoreSettingsFault, replaceSyntheticSettings, successText, type SettingsKey } from './japanese-settings-state';
test('active settings preserve extensions and reject stale partial or uncertain saves through explicit recovery and reentry', async ({ page, context, qa }) => {
  const { synced } = await import('./japanese-level-flow-state');
  let saved: State, fitness: State, peer: import('@playwright/test').Page | undefined;
  let ttsRequests = 0;
  const onRequest = (request: import('@playwright/test').Request) => {
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:3000' && url.pathname === '/api/language/tts') ttsRequests++;
  };
  context.on('request', onRequest);
  const goal = (count: number) => selectedGoal(page, count).click();
  const minutes = (value: number) => page.getByLabel('하루 학습 시간', { exact: true }).selectOption(String(value));
  const noWrites = { japaneseAppSettings: 0, learningSettings: 0, integratedLearningSettingsV1: 0 };
  const restoredEditor = async () => {
    await synced(page);
    await expect(selectedGoal(page, 1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('하루 학습 시간', { exact: true })).toHaveValue('10');
    await expect(page.getByLabel('글자·문제 도움', { exact: true })).toHaveValue('reader');
    await expect(page.getByLabel('우선 학습 과정', { exact: true })).toHaveValue('travel');
    await expect(page.getByLabel('기본 음성 속도', { exact: true })).toHaveValue('0.8');
    await expect(page.locator('#kana-tts-rate')).toHaveValue('0.8');
    await expect(page.locator('#words-repeat-count')).toHaveValue('2');
    for (const name of ['수업의 한글 발음 보조 표시', '읽는 법 표시', '한국어 뜻 표시']) await expect(page.getByLabel(name, { exact: true })).not.toBeChecked();
    await expect(page.getByRole('button', { name: '설정 저장', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0); await noSuccess(page); await localSettings(page, saved);
  };
  try {
    await test.step('real settings entry preserves complete synthetic raw settings and unrelated history', async () => {
      fitness = await qa.read(); saved = await seedSettings(qa);
      await login(page, qa.account, '/language');
      await page.getByRole('navigation', { name: '언어 주요 메뉴', exact: true }).locator('a[href="/language/settings"]').click();
      await expect(page.getByRole('heading', { name: '학습 설정', exact: true })).toBeVisible(); await synced(page);
      await localSettings(page, saved); expect(canonical(await qa.readLanguage())).toBe(canonical(saved));
      await expect(selectedGoal(page, 5)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#kana-tts-rate')).toHaveValue('1');
    });
    await test.step('real automatic detail and explicit integrated saves preserve nested extensions with genuine server acknowledgement', async () => {
      await page.locator('#kana-tts-rate').selectOption('0.8');
      const detail = JSON.parse(saved.japaneseAppSettings as string);
      saved = changed(saved, 'japaneseAppSettings', { sections: { ...detail.sections, kana: { ...detail.sections.kana, ttsRate: 0.8 } } });
      await confirmedSettings(page, qa, saved, fitness);
      await goal(4); await minutes(20);
      await page.getByLabel('글자·문제 도움', { exact: true }).selectOption('reader');
      await page.getByLabel('우선 학습 과정', { exact: true }).selectOption('travel');
      await page.getByLabel('기본 음성 속도', { exact: true }).selectOption('0.8');
      await page.getByLabel('수업의 한글 발음 보조 표시', { exact: true }).uncheck();
      await page.getByLabel('읽는 법 표시', { exact: true }).uncheck();
      await page.getByLabel('한국어 뜻 표시', { exact: true }).uncheck();
      await localSettings(page, saved); await noSuccess(page);
      const expected = changed(changed(saved, 'learningSettings', { dailyGoalCount: 4 }), 'integratedLearningSettingsV1', {
        dailyMinutes: 20, learnerMode: 'reader', preferredTrack: 'travel', audioRate: 0.8,
        showKoreanHint: false, showReading: false, showMeaning: false, hasChosenStart: true,
      });
      const hold = qa.traffic.holdNext('PATCH', 'response', 'language_user_state');
      try {
        await saveLearning(page); await hold.arrived;
        await localSettings(page, expected);
        await expect(page.getByText(successText, { exact: true }).first()).toBeVisible();
        await expect(page.getByText('기기 저장 확인이며, 서버 반영 상태는 동기화 안내에서 확인해 주세요.', { exact: true })).toBeVisible();
        await expect(page.getByText('학습 기록 · 서버 반영 중…', { exact: true })).toBeVisible();
        expect(qa.traffic.entries.some(entry => entry.table === 'language_user_state' && entry.method === 'PATCH'
          && canonical(entry.sent) === canonical(expected) && entry.delivered === true)).toBe(false);
      } finally { hold.release(); }
      saved = expected; await confirmedSettings(page, qa, saved, fitness);
    });
    await test.step('two actual open settings screens reject stale writes and preserve cancel before explicit reread', async () => {
      peer = await context.newPage(); await peer.goto('/language/settings'); await synced(peer);
      await expect(selectedGoal(peer, 4)).toHaveAttribute('aria-pressed', 'true'); await localSettings(peer, saved);
      await selectedGoal(peer, 3).click(); await peer.getByLabel('하루 학습 시간', { exact: true }).selectOption('5'); await saveLearning(peer);
      saved = changed(changed(saved, 'learningSettings', { dailyGoalCount: 3 }), 'integratedLearningSettingsV1', { dailyMinutes: 5 });
      await confirmedSettings(peer, qa, saved, fitness);
      await page.bringToFront(); await goal(2); await minutes(10);
      const observe = await installSettingsFault(page, 'learningSettings', 'observe');
      try {
        await saveLearning(page); await settingsError(page, 'stale'); await noSuccess(page); await localSettings(page, saved);
        expect((await observe.stats()).writes).toEqual(noWrites);
      } finally { await observe.restore(); }
      await rereadSettings(page, false); await expect(selectedGoal(page, 2)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('하루 학습 시간', { exact: true })).toHaveValue('10'); await localSettings(page, saved);
      await rereadSettings(page, true); await expect(selectedGoal(page, 3)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('하루 학습 시간', { exact: true })).toHaveValue('5'); await localSettings(page, saved); await noSuccess(page);
      await qa.traffic.drain(); await peer.close(); peer = undefined;
    });
    await test.step('targeted automatic and first-key write failures retain selections and allow unchanged-choice retries', async () => {
      const detailFault = await installSettingsFault(page, 'japaneseAppSettings', 'before-write');
      try {
        await page.locator('#words-repeat-count').selectOption('2'); await settingsError(page, 'write');
        await localSettings(page, saved); await expect(page.locator('#words-repeat-count')).toHaveValue('2'); await noSuccess(page);
        expect(await detailFault.stats()).toEqual({ writes: { ...noWrites, japaneseAppSettings: 1 }, hits: 1, failedReads: 0 });
      } finally { await detailFault.restore(); }
      await page.getByRole('button', { name: '상세 설정 다시 저장', exact: true }).click();
      const detail = JSON.parse(saved.japaneseAppSettings as string);
      saved = changed(saved, 'japaneseAppSettings', { sections: { ...detail.sections, words: { ...detail.sections.words, repeatCount: 2 } } });
      await expect(page.getByRole('button', { name: '상세 설정 다시 저장', exact: true })).toHaveCount(0);
      await confirmedSettings(page, qa, saved, fitness);
      await goal(2); await minutes(10);
      const firstFault = await installSettingsFault(page, 'learningSettings', 'before-write');
      try {
        await saveLearning(page); await settingsError(page, 'write'); await noSuccess(page); await localSettings(page, saved);
        expect(await firstFault.stats()).toEqual({ writes: { ...noWrites, learningSettings: 1 }, hits: 1, failedReads: 0 });
      } finally { await firstFault.restore(); }
      await expect(selectedGoal(page, 2)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('하루 학습 시간', { exact: true })).toHaveValue('10'); await saveLearning(page);
      saved = changed(changed(saved, 'learningSettings', { dailyGoalCount: 2 }), 'integratedLearningSettingsV1', { dailyMinutes: 10 });
      await confirmedSettings(page, qa, saved, fitness);
    });
    await test.step('second-key failure keeps confirmed first bytes without rollback and retries only the remaining key', async () => {
      await goal(1); await minutes(5);
      const partial = changed(saved, 'learningSettings', { dailyGoalCount: 1 });
      const fault = await installSettingsFault(page, 'integratedLearningSettingsV1', 'before-write');
      try {
        await saveLearning(page); await settingsError(page, 'write'); await noSuccess(page); await localSettings(page, partial);
        expect(await fault.stats()).toEqual({ writes: { ...noWrites, learningSettings: 1, integratedLearningSettingsV1: 1 }, hits: 1, failedReads: 0 });
      } finally { await fault.restore(); }
      await expect(selectedGoal(page, 1)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('하루 학습 시간', { exact: true })).toHaveValue('5');
      const retry = await installSettingsFault(page, 'integratedLearningSettingsV1', 'observe');
      try { await saveLearning(page); expect((await retry.stats()).writes).toEqual({ ...noWrites, integratedLearningSettingsV1: 1 }); }
      finally { await retry.restore(); }
      saved = changed(partial, 'integratedLearningSettingsV1', { dailyMinutes: 5 }); await confirmedSettings(page, qa, saved, fitness);
    });
    await test.step('successful write with failed readback blocks further saves until confirmed or cancelled reread', async () => {
      await minutes(20);
      const uncertain = changed(saved, 'integratedLearningSettingsV1', { dailyMinutes: 20 });
      const fault = await installSettingsFault(page, 'integratedLearningSettingsV1', 'readback');
      try {
        await saveLearning(page); await settingsError(page, 'confirmation'); await noSuccess(page);
        expect(await fault.stats()).toEqual({ writes: { ...noWrites, integratedLearningSettingsV1: 1 }, hits: 1, failedReads: 1 });
      } finally { await fault.restore(); }
      await localSettings(page, uncertain);
      const blocked = await installSettingsFault(page, 'learningSettings', 'observe');
      try {
        await saveLearning(page); await settingsError(page, 'confirmation'); await noSuccess(page);
        await goal(2); await saveLearning(page); await settingsError(page, 'confirmation'); await noSuccess(page);
        await localSettings(page, uncertain); expect((await blocked.stats()).writes).toEqual(noWrites);
      } finally { await blocked.restore(); }
      // Remote upload is independent of the page's unresolved local snapshot.
      await confirmedSettings(page, qa, uncertain, fitness);
      await rereadSettings(page, false); await expect(selectedGoal(page, 2)).toHaveAttribute('aria-pressed', 'true'); await noSuccess(page);
      await rereadSettings(page, true); await expect(selectedGoal(page, 1)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByLabel('하루 학습 시간', { exact: true })).toHaveValue('20'); await noSuccess(page);
      await minutes(10); await saveLearning(page); saved = changed(uncertain, 'integratedLearningSettingsV1', { dailyMinutes: 10 });
      await confirmedSettings(page, qa, saved, fitness);
    });
    await test.step('real reload navigation history and narrow settings reentry restore the last confirmed selection', async () => {
      await page.setViewportSize({ width: 320, height: 740 }); await page.reload(); await restoredEditor();
      const size = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
      expect(size.width).toBe(320); expect(size.scroll).toBeLessThanOrEqual(size.width);
      await page.getByRole('navigation', { name: '언어 주요 메뉴', exact: true }).locator('a[href="/language"]').click();
      await expect(page).toHaveURL('http://127.0.0.1:3000/language');
      await page.goBack(); await restoredEditor();
      await page.goForward(); await expect(page).toHaveURL('http://127.0.0.1:3000/language');
      await page.getByRole('navigation', { name: '언어 주요 메뉴', exact: true }).locator('a[href="/language/settings"]').click();
      await restoredEditor();
      expect(canonical(await qa.readLanguage())).toBe(canonical(saved)); expect(await qa.read()).toEqual(fitness);
    });
    await test.step('malformed and invalid synthetic settings remain byte exact on mount and explicit reread without a false cloud gate claim', async () => {
      const cases: [SettingsKey, string][] = [
        ['japaneseAppSettings', '{"sections":'], ['learningSettings', '[]'],
        ['integratedLearningSettingsV1', '{"dailyMinutes":7,"future":{"keep":true}}'],
      ];
      for (const [key, raw] of cases) {
        await replaceSyntheticSettings(page, key, raw);
        const damaged = { ...saved, [key]: raw };
        // Genuine collector PATCH/GET/DB acknowledgement of synthetic corruption
        // is setup evidence, never a successful user settings save or a zero-write claim.
        await confirmedSettings(page, qa, damaged, fitness);
        await page.reload(); await settingsError(page, 'invalid'); await noSuccess(page); await localSettings(page, damaged);
        await expect(page.getByRole('button', { name: '설정 저장', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: '설정 다시 읽기', exact: true }).click(); await settingsError(page, 'invalid'); await localSettings(page, damaged);
        expect(canonical(await qa.readLanguage())).toBe(canonical(damaged));
        // Only the precise pre-fault bytes are explicitly restored by the fixture.
        await replaceSyntheticSettings(page, key, saved[key] as string); await confirmedSettings(page, qa, saved, fitness);
        await page.getByRole('button', { name: '설정 다시 읽기', exact: true }).click();
        await expect(selectedGoal(page, 1)).toHaveAttribute('aria-pressed', 'true'); await localSettings(page, saved); await noSuccess(page);
      }
      await page.reload(); await synced(page); await localSettings(page, saved); expect(await qa.read()).toEqual(fitness);
    });
  } finally {
    qa.traffic.releaseAll();
    try { await restoreSettingsFault(page); }
    finally {
      try { await qa.traffic.drain(); }
      finally { if (peer && !peer.isClosed()) await peer.close(); context.off('request', onRequest); }
    }
    expect(ttsRequests, 'No TTS requests during settings verification').toBe(0);
    // The unchanged qa fixture owns context close, account removal and exact
    // zero-row/storage cleanup evidence. Planned accounts are not cleanup proof.
  }
});
