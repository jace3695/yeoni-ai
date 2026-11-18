import { test, expect, login, synced } from './fixture';
import { RouteDrain } from './route-drain';
test('resource upload preserves private files through response loss and reload with read-only confirmation', async ({ page, qa }) => {
  const owner = qa.account.id;
  const api = 'http://127.0.0.1:54321';
  const metadataPath = '/rest/v1/growth_resources';
  const routePattern = `${api}${metadataPath}*`;
  const journalKey = `ai-yeoni-resource-upload-v1:${owner}`;
  const firstBytes = Buffer.from('Synthetic resource one.\n', 'utf8');
  const secondBytes = Buffer.from('Synthetic resource two.\n', 'utf8');
  const firstTitle = 'QA synthetic resource one';
  const secondTitle = 'QA synthetic resource two';
  const drain = new RouteDrain();
  let faultReads = false, committedId = '', committedPath = '';
  let injectedPosts = 0, failedReads = 0, inserts = 0, uploads = 0, deletes = 0;
  let interceptionError: unknown = null;
  const observe = (request: import('@playwright/test').Request) => {
    const url = new URL(request.url());
    if (url.origin !== api) return;
    if (url.pathname === metadataPath && request.method() === 'POST') inserts++;
    if (url.pathname.startsWith(`/storage/v1/object/growth-resources/${owner}/`) && request.method() === 'POST') uploads++;
    if (request.method() === 'DELETE' && (url.pathname === metadataPath || url.pathname.startsWith('/storage/v1/object/'))) deletes++;
  };
  const journal = () => page.evaluate(key => sessionStorage.getItem(key), journalKey);
  const rows = async () => {
    const result = await qa.account.client.from('growth_resources').select('*').eq('user_id', owner).order('id');
    expect(result.error).toBeNull();
    return result.data!;
  };
  const files = async () => {
    const result = await qa.account.client.storage.from('growth-resources').list(owner);
    expect(result.error).toBeNull();
    return result.data!.map(file => `${owner}/${file.name}`).sort();
  };
  const assertFile = async (path: string, bytes: Buffer) => {
    expect(path.startsWith(`${owner}/resource-`)).toBe(true);
    const result = await qa.account.client.storage.from('growth-resources').download(path);
    expect(result.error).toBeNull();
    expect(result.data!.type.split(';')[0]).toBe('text/plain');
    expect(Buffer.from(await result.data!.arrayBuffer()).equals(bytes)).toBe(true);
  };
  page.on('request', observe);
  try {
    await test.step('QA_STAGE_1', async () => {});
    await login(page, qa.account, '/growth/resources'); await synced(page);
    const before = await qa.read(), languageBefore = await qa.readLanguage();
    await expect(page.getByRole('button', { name: '자료 새로고침', exact: true })).toBeEnabled();
    expect(await rows()).toHaveLength(0); expect(await files()).toEqual([]);
    // Use the browser File constructor directly: Playwright infers MIME for empty payload types.
    const firstPicker = await page.locator('#growth-resource-file').elementHandle();
    expect(firstPicker).not.toBeNull();
    await firstPicker!.evaluate((input: HTMLInputElement, bytes: number[]) => {
      const selected = new File([Uint8Array.from(bytes)], 'synthetic-one.txt', { type: '' });
      if (selected.type !== '') throw new Error('SYNTHETIC_FILE_TYPE_NOT_EMPTY');
      const transfer = new DataTransfer(); transfer.items.add(selected);
      input.files = transfer.files;
      if (input.files.length !== 1 || input.files[0].type !== '') throw new Error('SYNTHETIC_PICKER_TYPE_NOT_EMPTY');
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, Array.from(firstBytes));
    // Separate coordinates classify remount/reset failures without printing file contents.
    expect(await firstPicker!.evaluate(input => input.isConnected)).toBe(true);
    expect(await page.locator('#growth-resource-file').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(1);
    expect(await page.locator('#growth-resource-file').evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('synthetic-one.txt');
    expect(await page.locator('#growth-resource-file').evaluate((input: HTMLInputElement) => input.files?.[0]?.size)).toBe(firstBytes.length);
    expect(await page.locator('#growth-resource-file').evaluate(async (input: HTMLInputElement) => Array.from(new Uint8Array(await input.files![0].arrayBuffer())))).toEqual(Array.from(firstBytes));
    await firstPicker!.dispose();
    // A genuinely empty picker MIME exercises the app's filename fallback.
    expect(await page.locator('#growth-resource-file').evaluate((input: HTMLInputElement) => input.files?.[0]?.type)).toBe('');
    await page.getByPlaceholder('자료 이름', { exact: true }).fill(firstTitle);
    await page.getByPlaceholder('메모(선택)', { exact: true }).fill('Synthetic normal save');
    await page.getByRole('button', { name: '비공개 자료 저장', exact: true }).click();
    await expect(page.getByText('파일과 자료 정보의 저장을 확인했어요.', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: firstTitle, exact: true })).toBeVisible();
    expect(await journal()).toBeNull();
    const firstRows = await rows(); expect(firstRows).toHaveLength(1);
    expect(firstRows[0]).toMatchObject({ user_id: owner, title: firstTitle, notes: 'Synthetic normal save', mime_type: 'text/plain', size_bytes: firstBytes.length, routine_id: null, classification: 'reference', category: 'reference' });
    const firstPath = firstRows[0].storage_path as string;
    expect(firstPath).toBe(`${owner}/resource-${firstRows[0].id}.txt`);
    expect(await files()).toEqual([firstPath]); await assertFile(firstPath, firstBytes);
    expect({ inserts, uploads, deletes }).toEqual({ inserts: 1, uploads: 1, deletes: 0 });
    await page.reload();
    await expect(page.getByRole('article', { name: firstTitle, exact: true })).toBeVisible();
    expect(await rows()).toEqual(firstRows); expect(await journal()).toBeNull();
    await test.step('QA_STAGE_2', async () => {});
    await page.route(routePattern, route => drain.run(async () => {
      const request = route.request(), url = new URL(request.url());
      // fetch bypasses context routing: admit only this exact disposable endpoint,
      // generated owner and known synthetic insert. All other requests fall back.
      if (url.origin !== api || url.pathname !== metadataPath) { await route.fallback(); return; }
      try {
        if (request.method() === 'POST') {
          expect(injectedPosts).toBe(0);
          const body: Record<string, unknown> = request.postDataJSON();
          expect(body).toMatchObject({ user_id: owner, title: secondTitle, notes: 'Synthetic lost response', mime_type: 'text/plain', size_bytes: secondBytes.length, routine_id: null, category: 'reference', classification: 'reference' });
          expect(Object.keys(body).sort()).toEqual(['category', 'classification', 'id', 'mime_type', 'notes', 'routine_id', 'size_bytes', 'storage_path', 'title', 'user_id']);
          expect(typeof body.id).toBe('string');
          expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
          expect(body.storage_path).toBe(`${owner}/resource-${body.id}.txt`);
          const response = await route.fetch({ maxRedirects: 0, timeout: 15000 });
          expect(response.ok()).toBe(true);
          const committed: Record<string, unknown> = await response.json();
          expect(committed).toMatchObject(body);
          committedId = body.id as string; committedPath = body.storage_path as string;
          injectedPosts++; faultReads = true;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic committed response unavailable"}' });
          return;
        }
        if (faultReads && request.method() === 'GET' && url.searchParams.get('user_id') === `eq.${owner}` && url.searchParams.get('id') === `eq.${committedId}`) {
          failedReads++;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic confirmation unavailable"}' });
          return;
        }
        await route.fallback();
      } catch (error) { interceptionError = error; await route.abort('failed'); }
    }));
    await page.locator('#growth-resource-file').setInputFiles({ name: 'synthetic-two.txt', mimeType: 'text/plain', buffer: secondBytes });
    await page.getByPlaceholder('자료 이름', { exact: true }).fill(secondTitle);
    await page.getByPlaceholder('메모(선택)', { exact: true }).fill('Synthetic lost response');
    await page.getByRole('button', { name: '비공개 자료 저장', exact: true }).click();
    const confirm = page.getByRole('button', { name: '저장 결과만 확인', exact: true });
    await expect(confirm).toBeEnabled();
    expect(interceptionError).toBeNull(); expect(injectedPosts).toBe(1); expect(failedReads).toBeGreaterThan(0);
    await expect(page.getByText(`미확인 업로드: ${secondTitle}`, { exact: true })).toBeVisible();
    await expect(page.getByText('이 탭의 확인 정보는 탭을 닫으면 사라질 수 있어요. 다른 탭·기기에서 새로 올리면 중복될 수 있어요.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '비공개 자료 저장', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '같은 자료 저장 재시도', exact: true })).toBeDisabled();
    const pendingText = await journal(); expect(pendingText).not.toBeNull();
    const pending = JSON.parse(pendingText!);
    const { createHash } = await import('node:crypto');
    expect(pending).toMatchObject({ version: 1, owner, sha256: createHash('sha256').update(secondBytes).digest('hex'), row: { id: committedId, user_id: owner, storage_path: committedPath, title: secondTitle, mime_type: 'text/plain', size_bytes: secondBytes.length } });
    const committedRows = await rows(); expect(committedRows).toHaveLength(2);
    expect(committedRows.find(row => row.id === committedId)).toMatchObject(pending.row);
    expect(committedRows.find(row => row.id === firstRows[0].id)).toEqual(firstRows[0]);
    expect(await files()).toEqual([firstPath, committedPath].sort());
    await assertFile(committedPath, secondBytes);
    expect({ inserts, uploads, deletes }).toEqual({ inserts: 2, uploads: 2, deletes: 0 });
    await test.step('QA_STAGE_3', async () => {});
    await page.setViewportSize({ width: 320, height: 844 });
    await page.reload();
    await expect(confirm).toBeEnabled();
    await expect(page.getByRole('article', { name: secondTitle, exact: true })).toBeVisible();
    expect(await journal()).toBe(pendingText);
    await expect(page.getByRole('button', { name: '비공개 자료 저장', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    faultReads = false;
    await confirm.click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByText('파일과 자료 정보의 저장을 확인했어요.', { exact: true })).toBeVisible();
    expect(await journal()).toBeNull();
    await page.reload();
    await expect(page.getByRole('article', { name: firstTitle, exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: secondTitle, exact: true })).toBeVisible();
    await drain.wait();
    expect(interceptionError).toBeNull();
    expect(await journal()).toBeNull(); expect(await rows()).toEqual(committedRows);
    expect(await files()).toEqual([firstPath, committedPath].sort());
    await assertFile(firstPath, firstBytes); await assertFile(committedPath, secondBytes);
    expect({ inserts, uploads, deletes }).toEqual({ inserts: 2, uploads: 2, deletes: 0 });
    expect(await qa.read()).toEqual(before); expect(await qa.readLanguage()).toEqual(languageBefore);
    await test.step('QA_STAGE_4', async () => {});
  } finally {
    faultReads = false;
    await drain.wait();
    await page.unroute(routePattern);
    page.off('request', observe);
  }
});
