import { randomUUID } from 'node:crypto';
import { test, expect, login, synced } from './fixture';
import { observeRetiredRequests, visitRetiredPractice } from './drawing-tools';

for (const path of ['/growth/typing', '/growth/typing/basics']) {
  test(`retired typing route ${path} preserves historical sessions and owner isolation at 320px`, async ({ page, qa }) => {
    const routine = { id: randomUUID(), user_id: qa.account.id, category: 'typing', title: 'QA historical typing', target_minutes: 5, enabled: true };
    expect((await qa.account.client.from('growth_routines').insert(routine)).error).toBeNull();
    const session = { id: randomUUID(), user_id: qa.account.id, routine_id: routine.id, session_date: '2001-01-02', status: 'completed', planned_minutes: 5, actual_minutes: 3, source: 'typing', memo: 'QA preserved original', metrics: { courseId: 'typing-position-v1', lessonId: 'anchors', keyPresses: 13, correctKeyPresses: 12, keyAccuracy: 92, mistakeKeys: { f: 1 }, legacyUnknown: { keep: true } } };
    expect((await qa.account.client.from('growth_sessions').insert(session)).error).toBeNull();
    const snapshot = async () => {
      const routines = await qa.account.client.from('growth_routines').select('*').order('id');
      const sessions = await qa.account.client.from('growth_sessions').select('*').order('id');
      expect(routines.error).toBeNull(); expect(sessions.error).toBeNull();
      return { routines: routines.data, sessions: sessions.data };
    };
    const originalRows = await snapshot();
    expect(originalRows.routines).toHaveLength(1); expect(originalRows.sessions).toHaveLength(1);
    await page.setViewportSize({ width: 320, height: 844 });
    await login(page, qa.account); await synced(page);
    const originalState = await qa.read();
    const observer = observeRetiredRequests(page);
    try {
      await visitRetiredPractice(page, path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await snapshot()).toEqual(originalRows);
      expect(await qa.read()).toEqual(originalState);
      const other = await qa.createAccount();
      for (const table of ['growth_sessions', 'growth_routines']) {
        const hidden = await other.client.from(table).select('*').eq('user_id', qa.account.id);
        expect(hidden.error).toBeNull(); expect(hidden.data).toEqual([]);
      }
      expect(await snapshot()).toEqual(originalRows);
      observer.assertQuiet();
    } finally { observer.dispose(); }
  });
}
