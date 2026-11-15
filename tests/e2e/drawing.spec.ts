import { randomUUID } from 'node:crypto';
import { test, expect, login, synced } from './fixture';
import { seedLegacyDrawing, visitRetiredPractice, observeRetiredRequests, assertRetiredPractice, legacyRelationDocument, saveLegacyRelation } from './drawing-tools';

// Backend privacy/CAS remains meaningful after the exercise UI is retired.
// These are explicit fixture operations, never successful browser drawing saves.
test('drawing: retired route preserves historical rows, owner privacy and backend CAS', async ({ page, qa }) => {
  const original = await seedLegacyDrawing(qa.account.client, qa.account.id, 'D01');
  const other = await qa.createAccount();
  const foreign = await seedLegacyDrawing(other.client, other.id, 'D02');
  const read = async () => { const result = await qa.account.client.from('growth_drawing_attempts').select('*').order('id'); expect(result.error).toBeNull(); return result.data!; };
  const foreignRead = await other.client.from('growth_drawing_attempts').select('*').eq('id', original.id);
  expect(foreignRead.error).toBeNull(); expect(foreignRead.data).toEqual([]);
  for (const operation of ['update', 'delete'] as const) {
    const result = operation === 'update'
      ? await other.client.from('growth_drawing_attempts').update({ revision: 2, status: 'completed' }).eq('id', original.id).select('*')
      : await other.client.from('growth_drawing_attempts').delete().eq('id', original.id).select('*');
    expect(result.error).toBeNull(); expect(result.data).toEqual([]);
  }
  const forged = await other.client.from('growth_drawing_attempts').insert({ id: randomUUID(), user_id: qa.account.id, status: 'draft', document: original.document });
  expect(forged.error).not.toBeNull();
  expect(await read()).toEqual([original]);
  const current = await qa.account.client.from('growth_drawing_attempts').update({ revision: 2, status: 'completed' }).eq('id', original.id).eq('revision', 1).select('*');
  expect(current.error).toBeNull(); expect(current.data).toHaveLength(1); expect(current.data![0].revision).toBe(2);
  const stale = await qa.account.client.from('growth_drawing_attempts').update({ revision: 2, document: { ...original.document, memo: 'must not overwrite' } }).eq('id', original.id).eq('revision', 1).select('*');
  expect(stale.error).toBeNull(); expect(stale.data).toEqual([]);
  const beforeRows = await read(); expect(beforeRows).toEqual(current.data); expect(beforeRows[0].document).toEqual(original.document);
  await login(page, qa.account); await synced(page);
  const fitness = await qa.read(), language = await qa.readLanguage(); const observer = observeRetiredRequests(page);
  try {
    await visitRetiredPractice(page, '/growth/drawing');
    expect(await read()).toEqual(beforeRows);
    const otherRows = await other.client.from('growth_drawing_attempts').select('*'); expect(otherRows.error).toBeNull(); expect(otherRows.data).toEqual([foreign]);
    expect(await qa.read()).toEqual(fitness); expect(await qa.readLanguage()).toEqual(language); observer.assertQuiet();
  } finally { observer.dispose(); }
});

// Representative legacy-document contracts, not the former 80 lesson successes.
// Prefixes preserve existing stage16/17/20 selection without skipping a stage.
const representatives = ['D06', 'D23', 'D27', 'D33', 'D79', 'C01', 'C02', 'C03', 'C04', 'D71', 'D80', 'D61', 'D70', 'D53', 'D60', 'D46', 'D43', 'D52', 'D14'];
for (const id of representatives) {
  test(`drawing ${id}: ${id === 'D46' ? 'reuse blocked; ' : ''}retired route retains legacy source and derivative snapshots`, async ({ page, qa }) => {
    const source = await seedLegacyDrawing(qa.account.client, qa.account.id, id === 'D27' ? 'D20' : id === 'D33' ? 'D31' : id === 'D46' ? 'D45' : ['D61', 'D70'].includes(id) ? 'D61' : id.startsWith('C') || ['D79', 'D80'].includes(id) ? 'D74' : 'D01');
    const derivative = await seedLegacyDrawing(qa.account.client, qa.account.id, id, [source.id]);
    // Actual model helpers construct valid historical relation fields; no retired UI is restored.
    const additional = [];
    if (id === 'D70') for (const sourceId of ['D66', 'D67']) additional.push(await seedLegacyDrawing(qa.account.client, qa.account.id, sourceId));
    if (id === 'D80') {
      const happy = await saveLegacyRelation(qa.account.client, await seedLegacyDrawing(qa.account.client, qa.account.id, 'D77'), source);
      const expressions = await saveLegacyRelation(qa.account.client, await seedLegacyDrawing(qa.account.client, qa.account.id, 'D78'), source, [happy]);
      const poses = await saveLegacyRelation(qa.account.client, await seedLegacyDrawing(qa.account.client, qa.account.id, 'D79'), source);
      additional.push(expressions, poses);
    }
    const relation = legacyRelationDocument(derivative, source, additional);
    const stored = await qa.account.client.from('growth_drawing_attempts').update({ revision: 2, document: relation }).eq('id', derivative.id).eq('revision', 1).select('*').single();
    expect(stored.error).toBeNull();
    const read = async () => { const result = await qa.account.client.from('growth_drawing_attempts').select('*').order('id'); expect(result.error).toBeNull(); return result.data!; };
    const before = await read(); expect(before).toHaveLength(id === 'D70' ? 4 : id === 'D80' ? 5 : 2); expect(before.find(row => row.id === source.id)).toEqual(source);
    await login(page, qa.account); await synced(page); const fitness = await qa.read(), language = await qa.readLanguage();
    const observer = observeRetiredRequests(page);
    try {
      await visitRetiredPractice(page, '/growth/drawing');
      expect(await read()).toEqual(before);
      expect((await read()).find(row => row.id === derivative.id).document).toEqual(relation);
      for (const item of additional) expect((await read()).find(row => row.id === item.id)).toEqual(item);
      if (id === 'D70') expect(relation.identity!.collection.map(item => item.attemptId)).toEqual(additional.map(item => item.id));
      if (id === 'D80') expect(relation.original!.sources.map(item => item.lessonId)).toEqual(['D74', 'D78', 'D79']);
      if (id === 'D33') {
        // Separate synthetic backend retention probe, never a retired-page deletion.
        const removed = await qa.account.client.from('growth_drawing_attempts').delete().eq('id', source.id).select('id');
        expect(removed.error).toBeNull(); expect(removed.data).toEqual([{ id: source.id }]);
        await page.reload({ waitUntil: 'domcontentloaded' }); await assertRetiredPractice(page);
        const remaining = await read(); expect(remaining).toEqual([stored.data]);
        expect(remaining[0].document).toEqual(relation);
        expect(remaining[0].document.memory.source).toEqual({ attemptId: source.id, revision: source.revision, lessonId: 'D31' });
        expect(remaining[0].document.example).toEqual(source.document.example);
      }
      expect(await qa.read()).toEqual(fitness); expect(await qa.readLanguage()).toEqual(language); observer.assertQuiet();
    } finally { observer.dispose(); }
  });
}
