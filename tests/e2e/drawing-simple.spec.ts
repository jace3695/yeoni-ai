import { test, expect, login, synced } from './fixture';
import { seedLegacyDrawing, visitRetiredPractice, observeRetiredRequests } from './drawing-tools';

for (const width of [320, 390]) test(`drawing simple: retired notice and preserved historical drawing at ${width}px`, async ({ page, qa }) => {
  const saved = await seedLegacyDrawing(qa.account.client, qa.account.id, 'D01');
  await login(page, qa.account); await synced(page); const fitness = await qa.read(), language = await qa.readLanguage();
  await page.setViewportSize({ width, height: 844 }); const observer = observeRetiredRequests(page);
  try {
    await visitRetiredPractice(page, '/growth/drawing');
    const rows = await qa.account.client.from('growth_drawing_attempts').select('*'); expect(rows.error).toBeNull(); expect(rows.data).toEqual([saved]);
    expect(await qa.read()).toEqual(fitness); expect(await qa.readLanguage()).toEqual(language); observer.assertQuiet();
  } finally { observer.dispose(); }
});

test('drawing simple: retired empty account stays empty and returns through normal growth navigation', async ({ page, qa }) => {
  await login(page, qa.account); await synced(page); const fitness = await qa.read(), language = await qa.readLanguage();
  const before = await qa.account.client.from('growth_drawing_attempts').select('*'); expect(before.error).toBeNull(); expect(before.data).toEqual([]);
  const observer = observeRetiredRequests(page);
  try {
    await visitRetiredPractice(page, '/growth/drawing');
    const rows = await qa.account.client.from('growth_drawing_attempts').select('*'); expect(rows.error).toBeNull(); expect(rows.data).toEqual([]);
    expect(await qa.read()).toEqual(fitness); expect(await qa.readLanguage()).toEqual(language); observer.assertQuiet();
  } finally { observer.dispose(); }
});
