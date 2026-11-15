import { createHash } from 'node:crypto';
import { request as apiRequest } from '@playwright/test';
import { test, expect, login, synced } from './fixture';
import { assertRetiredPractice, observeRetiredRequests, visitRetiredPractice } from './drawing-tools';
import { templatePath } from '../../lib/drawing/template-zip';

// One synthetic legacy object, not the private textbook, original ZIP, catalog,
// or a claim that the retired 150-template registration UI still works.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const asset = {
  id: 'tpl-000000000001', path: 'synthetic-legacy.png', label: 'Synthetic legacy fixture',
  group: 'synthetic', sha256: digest(png), size: png.length, lessonIds: [], note: 'Synthetic only',
};

test('retired drawing: legacy synthetic private asset protection', async ({ page, qa }) => {
  const ownerStore = qa.account.client.storage.from('growth-resources');
  const path = templatePath(qa.account.id, asset);
  // Seed and privacy probes use isolated Node clients, never browser requests.
  // The existing qa fixture removes owned objects before deleting Auth accounts,
  // including when a later assertion fails. Do not short-circuit that teardown.
  expect((await ownerStore.upload(path, png, { contentType: 'image/png', upsert: false })).error).toBeNull();
  const readOwner = async () => {
    const result = await ownerStore.download(path);
    expect(result.error, 'Owner retains access to synthetic legacy object').toBeNull();
    expect(result.data).not.toBeNull();
    const bytes = Buffer.from(await result.data!.arrayBuffer());
    expect(bytes).toEqual(png);
    expect(digest(bytes)).toBe(asset.sha256);
  };
  await readOwner();
  await login(page, qa.account); await synced(page);
  const beforeState = await qa.read();
  const beforeLanguage = await qa.readLanguage();
  const observer = observeRetiredRequests(page);
  try {
    await visitRetiredPractice(page, '/growth/drawing');
    await assertRetiredPractice(page);
    await observer.assertQuiet();
    await readOwner();
    expect(await qa.read()).toEqual(beforeState);
    expect(await qa.readLanguage()).toEqual(beforeLanguage);
  } finally { await observer.dispose(); }

  const other = await qa.createAccount();
  const otherStore = other.client.storage.from('growth-resources');
  expect((await otherStore.download(path)).error).not.toBeNull();
  expect((await otherStore.upload(path, png, { upsert: true, contentType: 'image/png' })).error).not.toBeNull();
  // Explicit anonymous context: no browser cookies, bearer token or saved state.
  const anonymous = await apiRequest.newContext({ extraHTTPHeaders: {} });
  try {
    for (const route of ['public', 'authenticated']) {
      const response = await anonymous.get(`http://127.0.0.1:54321/storage/v1/object/${route}/growth-resources/${path}`, { maxRedirects: 0 });
      expect(response.ok(), `Anonymous ${route} storage access must fail`).toBe(false);
    }
  } finally { await anonymous.dispose(); }
  await readOwner(); // Denied foreign overwrite did not change the original bytes.
});
