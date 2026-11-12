import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, login, Traffic, canonical, originalLanguage, type State } from './fixture';
import { RouteDrain } from './route-drain';
import { APP_RECORD_KEYS, RECORD_RESET_STORAGE_EVENT } from '../../app/data/appRecordReset';
import { JAPANESE_COURSE_GAP_CHUNKS } from '../../data/japaneseCourseGapChunks';
import { chunkLessonInfo } from '../../utils/japaneseChunkCatalog';
import { CHUNK_REVIEW_KEY, parseChunkReview } from '../../utils/japaneseChunkReview';
test('Japanese reset receipts survive genuine HTTP omission writes, concurrent retries and lost-response supersession with a new answer', async ({ page, context, browser, qa }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const other = await qa.createAccount();
  const otherSeed = await other.client.from('language_user_state').update({ state: { ...originalLanguage, [levelKey]: practiceState('ci-other-owner') } }).eq('user_id', other.id).select('*').single();
  expect(otherSeed.error).toBeNull();
  const originalOther = await readRow(other.client, other.id);
  const ownerFitness = await qa.read(), otherFitness = await qa.read(other);
  // Complete non-default settings are byte-stable under the real page initializer.
  // The original two fixture strings are retained exactly, without a UI save.
  const common = { ttsRate: 0.8, repeatCount: 2, repeatDelayMs: 300 };
  const detailed = { ...common, showKoreanPronunciation: false, showReading: false };
  const initial = { ...originalLanguage, [levelKey]: practiceState('ci-before-reset'),
    japaneseAppSettings: JSON.stringify({ sections: {
      kana: common, words: detailed, sentences: detailed, speaking: detailed, conversation: detailed,
    } }),
  };
  const seeded = await qa.account.client.from('language_user_state').update({ state: initial }).eq('user_id', qa.account.id).select('*').single();
  expect(seeded.error).toBeNull(); expect(seeded.data.state).toEqual(initial);
  expect(seeded.data[ledgerKey]).toEqual({}); expect(initial).not.toHaveProperty(CHUNK_REVIEW_KEY);
  const wire: Wire[] = [];
  const client = observedClient(wire);
  const auth = await client.auth.signInWithPassword({ email: qa.account.email, password: qa.account.password });
  expect(auth.error).toBeNull(); expect(auth.data.user?.id).toBe(qa.account.id);
  const rpcRoutes = new RouteDrain(), secondRoutes = new RouteDrain();
  const secondTraffic = new Traffic('receipt-second-context');
  const calls: RpcCall[] = [], secondCalls: RpcCall[] = [];
  let second: BrowserContext | undefined, tearingDown = false, navigations = 0;
  const onNavigation = (frame: ReturnType<Page['mainFrame']>) => { if (frame === page.mainFrame()) navigations++; };
  // The real RPC executes first. Only delivery of the first two successful A
  // responses is lost. Later errors are forwarded unchanged from PostgreSQL.
  await context.route(rpcUrl, route => rpcRoutes.run(async () => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    const response = await route.fetch({ maxRetries: 0, timeout: 10_000 });
    const request = route.request().postDataJSON() as ResetRequest;
    const body = await response.json();
    calls.push({ request, status: response.status(), body });
    if (calls.length <= 2) {
      assertReceipt(body, request.p_request_id, qa.account.id);
      expect(response.status()).toBe(200);
      if (!tearingDown) qa.traffic.failReads = true;
      await route.abort('failed');
    } else await route.fulfill({ response });
  }));
  try {
    await login(page, qa.account, '/language/settings'); await languageSynced(page);
    await assertSettingsBeforeReset(page, client, qa.account.id, initial, qa.traffic);
    await qa.traffic.drain(); await installAudit(page);
    page.on('framenavigated', onNavigation);
    const originalLocal = await localSnapshot(page, qa.account.id);
    const writesStart = qa.traffic.entries.length;
    const panel = await openReset(page);
    const submit = panel.getByRole('button', { name: '일본어 기록 영구 삭제', exact: true });
    await submit.click(); await expect(panel.getByRole('status')).toHaveText(uncertain);
    await expect(submit).toBeEnabled(); await rpcRoutes.wait(); expect(calls).toHaveLength(1);
    const requestA = calls[0].request.p_request_id; expect(requestA).toMatch(uuid);
    const markerA = calls[0].body.marker as string;
    const committedA = await readRow(client, qa.account.id);
    expect(committedA.state[markerKey]).toBe(markerA);
    expect(committedA[ledgerKey]).toEqual({ [requestA]: markerA });
    expect(settings(committedA.state)).toEqual(settings(initial));
    for (const key of APP_RECORD_KEYS.language) expect(committedA.state).not.toHaveProperty(key);
    // Exercise the app's existing focus-driven sync once while the labelled
    // read fault is armed, so failure isolation is observed rather than assumed.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => qa.traffic.entries.some(entry => entry.table === 'language_user_state' && entry.synthetic && entry.status === 503)).toBe(true);
    await assertFailedLocally(page, qa.account.id, originalLocal, 1); expect(navigations).toBe(0);

    // Actual concurrent HTTP retries, not serialized SQL calls or a forged RPC.
    const concurrent = await Promise.all([reset(client, requestA), reset(client, requestA)]);
    for (const result of concurrent) {
      expect(result.error).toBeNull(); expect(result.status).toBe(200);
      assertReceipt(result.data, requestA, qa.account.id); expect(result.data.marker).toBe(markerA);
    }
    expect(await readRow(client, qa.account.id)).toEqual(committedA);
    const receipts = committedA[ledgerKey];
    const stateWithWork = (label: string): State => ({ ...committedA.state, [levelKey]: practiceState(label) });
    const patchState = stateWithWork('ci-http-patch');
    let at = wire.length;
    const patch = await client.from('language_user_state').update({ state: patchState }).eq('user_id', qa.account.id).select('*').single();
    expect(patch.error).toBeNull(); assertWrite(wire.slice(at), 'PATCH', { state: patchState }, false);
    expect(await readRow(client, qa.account.id)).toEqual(patch.data);
    expect(patch.data.state).toEqual(patchState); expect(patch.data[ledgerKey]).toEqual(receipts);
    // All three real SDK conflict UPSERT body/Prefer shapes omit the ledger.
    for (const shape of ['object-default', 'object-missing-default', 'array-default'] as const) {
      const state = stateWithWork(`ci-${shape}`), row = { user_id: qa.account.id, state };
      const body = shape === 'array-default' ? [row] : row;
      at = wire.length;
      const result = await client.from('language_user_state').upsert(body, {
        onConflict: 'user_id', ...(shape === 'object-missing-default' ? { defaultToNull: false } : {}),
      }).select('*').single();
      expect(result.error).toBeNull(); assertWrite(wire.slice(at), 'POST', body, shape === 'object-missing-default');
      expect(result.data.state).toEqual(state); expect(result.data[ledgerKey]).toEqual(receipts);
      expect(result.data.state).not.toHaveProperty(ledgerKey);
      expect(await readRow(client, qa.account.id)).toEqual(result.data);
    }
    const afterWork = await readRow(client, qa.account.id);
    const latestA = await reset(client, requestA);
    expect(latestA.error).toBeNull(); expect(latestA.data.marker).toBe(markerA);
    expect(await readRow(client, qa.account.id)).toEqual(afterWork);
    const concurrentState = stateWithWork('ci-concurrent-patch');
    const pair = await Promise.all([
      reset(client, requestA),
      client.from('language_user_state').update({ state: concurrentState }).eq('user_id', qa.account.id).select('*').single(),
    ]);
    expect(pair[0].error).toBeNull(); expect(pair[0].data.marker).toBe(markerA);
    expect(pair[1].error).toBeNull(); expect(pair[1].data.state).toEqual(concurrentState);
    expect(pair[1].data[ledgerKey]).toEqual(receipts);
    expect(await readRow(client, qa.account.id)).toEqual(pair[1].data);
    // One observed concurrent ordering, not deterministic lock scheduling. The
    // client has no verification proof: lose its latest-A retry response too.
    await submit.click(); await expect(panel.getByRole('status')).toHaveText(uncertain);
    await expect(submit).toBeEnabled(); await rpcRoutes.wait();
    expect(calls).toHaveLength(2); expect(calls[1].request).toEqual(calls[0].request);
    expect(calls[1].body).toEqual(calls[0].body);
    expect(await readRow(client, qa.account.id)).toEqual(pair[1].data);
    await assertFailedLocally(page, qa.account.id, originalLocal, 2); expect(navigations).toBe(0);

    // Same-context tabs receive RecordResetListener and reload away pending A.
    // Do not suppress that listener: use another authenticated BrowserContext.
    second = await browser.newContext({ baseURL: appUrl, viewport: { width: 320, height: 740 },
      timezoneId: 'Asia/Seoul', locale: 'ko-KR', serviceWorkers: 'block' });
    await secondTraffic.install(second);
    await second.route(rpcUrl, route => secondRoutes.run(async () => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      const response = await route.fetch({ maxRetries: 0, timeout: 10_000 });
      const request = route.request().postDataJSON() as ResetRequest;
      const body = await response.json();
      secondCalls.push({ request, status: response.status(), body });
      assertReceipt(body, request.p_request_id, qa.account.id); expect(response.status()).toBe(200);
      await route.fulfill({ response });
    }));
    const pageB = await second.newPage();
    await login(pageB, qa.account, '/language/settings'); await languageSynced(pageB);
    await assertSettingsBeforeReset(pageB, client, qa.account.id, concurrentState, secondTraffic);
    const panelB = await openReset(pageB);
    await panelB.getByRole('button', { name: '일본어 기록 영구 삭제', exact: true }).click();
    await expect(pageB.getByText(success, { exact: true })).toBeVisible(); await languageSynced(pageB);
    await secondRoutes.wait(); expect(secondCalls).toHaveLength(1);
    const requestB = secondCalls[0].request.p_request_id, markerB = secondCalls[0].body.marker as string;
    expect(requestB).toMatch(uuid); expect(requestB).not.toBe(requestA);
    const committedB = await readRow(client, qa.account.id);
    expect(committedB.state[markerKey]).toBe(markerB);
    expect(committedB[ledgerKey]).toEqual({ ...receipts, [requestB]: markerB });
    expect(settings(committedB.state)).toEqual(settings(initial));
    for (const key of APP_RECORD_KEYS.language) expect(committedB.state).not.toHaveProperty(key);
    expect(await pageB.evaluate(keys => keys.every(key => localStorage.getItem(key) === null), [...APP_RECORD_KEYS.language])).toBe(true);

    // The only new chunk answer is entered through real preparation and choices.
    await pageB.goto('/language/chunk-review'); await languageSynced(pageB);
    await expect(pageB.getByRole('button', { name: '저장한 전체 0문제', exact: true })).toBeVisible();
    const lesson = JAPANESE_COURSE_GAP_CHUNKS[0], question = lesson.questions[0];
    expect(question.kind).toBe('meaning');
    await pageB.getByRole('button', { name: '자유 재연습', exact: true }).click();
    await pageB.getByRole('button', { name: `${chunkLessonInfo(lesson.lessonId).title} 표현부터 자유 연습`, exact: true }).click();
    const practice = pageB.getByRole('region', { name: '표현 조각 보충연습', exact: true });
    await practice.getByRole('button', { name: '조각별 뜻과 역할 보기', exact: true }).click();
    await practice.getByRole('button', { name: '단어·시제 바꾼 예문 보기', exact: true }).click();
    await practice.getByRole('button', { name: '선택 문제 시작', exact: true }).click();
    const answeredAt = Date.now();
    await practice.getByRole('button', { name: question.choices[question.answer], exact: true }).click();
    await expect(practice.getByText('맞게 골랐어요.', { exact: true })).toBeVisible();
    await expect(practice.getByText('이 답을 이 기기의 보충복습 기록에 저장했어요.', { exact: true })).toBeVisible();
    await expect.poll(async () => Object.values(parseChunkReview((await qa.readLanguage())[CHUNK_REVIEW_KEY]).events).length).toBe(1);
    await languageSynced(pageB); await secondTraffic.drain();
    const saved = await readRow(client, qa.account.id);
    const review = parseChunkReview(saved.state[CHUNK_REVIEW_KEY]), answers = Object.values(review.events);
    expect(review.generation).toBe(markerB); expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ lessonId: lesson.lessonId, questionId: question.id, correct: true, neededHelp: true, mode: 'choice' });
    expect(answers[0].attemptId).toMatch(uuid);
    expect(Date.parse(answers[0].answeredAt)).toBeGreaterThanOrEqual(answeredAt);
    expect(Date.parse(answers[0].answeredAt)).toBeLessThanOrEqual(Date.now());
    secondTraffic.assertLanguageConfirmed(saved.state);
    expect(saved[ledgerKey]).toEqual(committedB[ledgerKey]); expect(saved.state[markerKey]).toBe(markerB);
    expect(settings(saved.state)).toEqual(settings(initial)); expect(saved.state).not.toHaveProperty(ledgerKey);
    expect(await readRow(other.client, other.id)).toEqual(originalOther);
    expect(await qa.read()).toEqual(ownerFitness); expect(await qa.read(other)).toEqual(otherFitness);
    await practice.getByRole('button', { name: '닫고 보충복습 목록으로', exact: true }).click();
    const firstLocal = await localSnapshot(page, qa.account.id), secondLocal = await localSnapshot(pageB, qa.account.id);
    expect(firstLocal).toEqual(originalLocal);
    const beforeRefusal = navigations;
    // Two manual retries prove A is retained, not rotated to a new delete.
    for (let attempt = 0; attempt < 2; attempt++) {
      await submit.click(); await expect(panel.getByRole('status')).toHaveText(superseded);
      await expect(submit).toBeEnabled(); await rpcRoutes.wait(); expect(calls).toHaveLength(3 + attempt);
      const rejected = calls[2 + attempt]; expect(rejected.request).toEqual(calls[0].request);
      expect(rejected.status).toBe(400);
      expect(rejected.body).toMatchObject({ code: '22023', message: 'YEONI_RESET_REQUEST_SUPERSEDED' });
      expect(rejected.body).not.toHaveProperty('marker');
      expect(await readRow(client, qa.account.id)).toEqual(saved);
      await assertFailedLocally(page, qa.account.id, firstLocal, 3 + attempt);
      expect(await localSnapshot(pageB, qa.account.id)).toEqual(secondLocal); expect(navigations).toBe(beforeRefusal);
      expect(await qa.read()).toEqual(ownerFitness); expect(await qa.read(other)).toEqual(otherFitness);
      expect(await readRow(other.client, other.id)).toEqual(originalOther);
    }
    for (const control of [panel.getByRole('status'), panel.getByRole('checkbox'), panel.getByLabel('확인을 위해 ‘초기화’를 입력해 주세요.', { exact: true }), panel.getByRole('button', { name: '취소', exact: true }), submit]) {
      await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport();
      const box = await control.boundingBox(); expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await qa.traffic.drain();
    expect(qa.traffic.entries.slice(writesStart).filter(entry => entry.table === 'language_user_state' && ['PATCH', 'POST'].includes(entry.method))).toEqual([]);
    expect(calls).toHaveLength(4); expect(secondCalls).toHaveLength(1);
    expect(qa.traffic.failReads).toBe(true);
    expect(qa.traffic.entries.some(entry => entry.table === 'language_user_state' && entry.synthetic && entry.status === 503)).toBe(true);
    // Release injected reads before explicit reload. Server latest-A idempotence
    // above never substitutes for an unverified client's success after new work.
    qa.traffic.failReads = false; page.off('framenavigated', onNavigation);
    await page.reload(); await languageSynced(page);
    expect(await page.evaluate(key => localStorage.getItem(key), CHUNK_REVIEW_KEY)).toBe(saved.state[CHUNK_REVIEW_KEY]);
    await page.goto('/language/chunk-review');
    const restored = async () => {
      await languageSynced(page);
      await page.getByRole('button', { name: '저장한 전체 1문제', exact: true }).click();
      const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: `${chunkLessonInfo(lesson.lessonId).title} · 뜻 고르기`, exact: true }) });
      await expect(card.getByText('저장된 응답 1회 · 오답 0회 · 도움 포함 1회', { exact: true })).toBeVisible();
      expect(await page.evaluate(key => localStorage.getItem(key), CHUNK_REVIEW_KEY)).toBe(saved.state[CHUNK_REVIEW_KEY]);
      expect(await page.evaluate(key => localStorage.getItem(key), markerKey)).toBe(markerB);
      expect(await readRow(client, qa.account.id)).toEqual(saved);
    };
    await restored(); await page.reload(); await restored();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), CHUNK_REVIEW_KEY)).toBeNull();
    await login(page, qa.account, '/language/chunk-review'); await restored();

    // Same UUID under another owner creates a separate receipt, never owner A's.
    const otherReset = await reset(other.client, requestA);
    expect(otherReset.error).toBeNull(); assertReceipt(otherReset.data, requestA, other.id);
    const otherAfter = await readRow(other.client, other.id);
    expect(otherAfter[ledgerKey]).toEqual({ [requestA]: otherReset.data.marker });
    expect(otherAfter.state[markerKey]).toBe(otherReset.data.marker);
    expect(otherAfter.state).not.toHaveProperty(levelKey);
    expect(originalOther.state).toHaveProperty(levelKey);
    expect(settings(otherAfter.state)).toEqual(settings(originalOther.state));
    const forbiddenRead = await other.client.from('language_user_state').select('*').eq('user_id', qa.account.id);
    expect(forbiddenRead.error).toBeNull(); expect(forbiddenRead.data).toEqual([]);
    const forbiddenWrite = await other.client.from('language_user_state').update({ state: {} }).eq('user_id', qa.account.id).select('*');
    expect(forbiddenWrite.error).toBeNull(); expect(forbiddenWrite.data).toEqual([]);
    const forbiddenInsert = await other.client.from('language_user_state').insert({ user_id: qa.account.id, state: {} });
    expect(forbiddenInsert.error?.code).toBe('42501');
    const anonymous = observedClient([]), denied = await reset(anonymous, requestA);
    expect(denied.error?.code).toBe('42501'); expect(denied.data).toBeNull();
    expect(await readRow(client, qa.account.id)).toEqual(saved);
    expect(await readRow(other.client, other.id)).toEqual(otherAfter);
    expect(await qa.read()).toEqual(ownerFitness); expect(await qa.read(other)).toEqual(otherFitness);
  } finally {
    tearingDown = true; page.off('framenavigated', onNavigation);
    qa.traffic.releaseAll(); secondTraffic.releaseAll();
    // Drain with routing installed; close extra writers before fixture deletion.
    await Promise.all([rpcRoutes.wait(), secondRoutes.wait(), qa.traffic.drain(), secondTraffic.drain()]);
    await context.unroute(rpcUrl);
    if (second) { await second.unrouteAll({ behavior: 'wait' }); await second.close(); }
    expect(secondTraffic.blockedOrigins.size).toBe(0);
  }
});

const apiUrl = 'http://127.0.0.1:54321', appUrl = 'http://127.0.0.1:3000';
const rpcUrl = `${apiUrl}/rest/v1/rpc/reset_my_app_records`;
const markerKey = 'languageRecordResetV1', ledgerKey = 'language_reset_receipts_v1', levelKey = 'japaneseLevelJourneyV1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uncertain = '초기화 완료 여부를 확인하지 못했어요. 같은 버튼을 눌러 다시 확인해 주세요.';
const success = '일본어 기록을 초기화했어요. 유지되는 항목은 아래에서 확인해 주세요.';
const superseded = '더 최근의 일본어 초기화가 있어 이전 요청을 중단했어요. 이 요청으로 서버나 이 기기의 기록을 지우지 않았습니다. 화면을 새로고침해 현재 기록을 확인해 주세요. 다시 초기화하려면 필요한 기록을 먼저 보관하고, 다른 기기와 탭의 학습을 끝낸 뒤 체크박스와 ‘초기화’ 입력으로 새 삭제 요청을 확인해 주세요. 새 요청은 이후에 만든 기록도 모두 삭제합니다.';
type Row = { user_id: string; state: State; updated_at: string; language_reset_receipts_v1: Record<string, string> };
type ResetRequest = { p_app: string; p_request_id: string; p_confirmation: string };
type RpcCall = { request: ResetRequest; status: number; body: Record<string, unknown> };
type Wire = { path: string; method: string; body: unknown; prefer: string; status: number };
type Audit = { lifecycle: string[]; successStorageWrites: number; sessionReceiptWrites: number; relevantRemovals: number; storageClears: number };
const practiceState = (unit: string) => JSON.stringify({ version: 1, selectedLevel: 'beginner', answers: {}, practicedUnits: { [unit]: '2001-01-02T00:00:00.000Z' } });
const settings = (state: State) => Object.fromEntries(['learningSettings', 'integratedLearningSettingsV1', 'japaneseAppSettings'].map(key => [key, state[key]]));
const languageSynced = (page: Page) => expect(page.getByText('학습 기록 · 서버 저장 확인', { exact: true })).toBeVisible();
const reset = (client: SupabaseClient, requestId: string) => client.rpc('reset_my_app_records', { p_app: 'language', p_request_id: requestId, p_confirmation: '초기화' });
async function readRow(client: SupabaseClient, userId: string): Promise<Row> {
  const result = await client.from('language_user_state').select('*').eq('user_id', userId).single();
  expect(result.error).toBeNull(); expect(result.data.user_id).toBe(userId);
  expect(Number.isFinite(Date.parse(result.data.updated_at))).toBe(true);
  expect(result.data.state).not.toHaveProperty(ledgerKey);
  return result.data as Row;
}
function assertReceipt(body: Record<string, unknown>, requestId: string, userId: string) {
  expect(body).toMatchObject({ app: 'language', user_id: userId }); expect(typeof body.marker).toBe('string');
  expect((body.marker as string).split('|')[1]).toBe(requestId);
  expect(Number.isFinite(Date.parse((body.marker as string).split('|')[0]))).toBe(true);
}
function observedClient(wire: Wire[]): SupabaseClient {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== apiUrl || !key) throw new Error('Disposable ordinary client required');
  return createClient(apiUrl, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url);
      if (url.origin !== apiUrl) throw new Error('Non-disposable HTTP refused');
      // Only method/body/Prefer in private memory; no credentials or Auth bodies.
      const track = url.pathname === '/rest/v1/language_user_state' && ['POST', 'PATCH'].includes(request.method);
      const body = track ? JSON.parse(await request.clone().text()) : undefined;
      const response = await fetch(request, { redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]) });
      if (track) wire.push({ path: url.pathname, method: request.method, body, prefer: request.headers.get('prefer') ?? '', status: response.status });
      return response;
    },
  } });
}
function assertWrite(entries: Wire[], method: 'PATCH' | 'POST', body: unknown, missingDefault: boolean) {
  expect(entries).toHaveLength(1); const entry = entries[0];
  expect(entry.method).toBe(method); expect(entry.path).toBe('/rest/v1/language_user_state');
  expect(canonical(entry.body)).toBe(canonical(body)); expect(entry.status).toBeGreaterThanOrEqual(200); expect(entry.status).toBeLessThan(300);
  expect(entry.prefer).toContain('return=representation'); expect(entry.prefer.includes('missing=default')).toBe(missingDefault);
  if (method === 'POST') expect(entry.prefer).toContain('resolution=merge-duplicates');
  for (const row of Array.isArray(entry.body) ? entry.body : [entry.body]) {
    expect(row).not.toHaveProperty(ledgerKey); expect(row.state).not.toHaveProperty(ledgerKey);
    expect(Object.keys(row).sort()).toEqual(method === 'PATCH' ? ['state'] : ['state', 'user_id']);
  }
}
async function assertSettingsBeforeReset(page: Page, client: SupabaseClient, userId: string, expectedState: State, traffic: Traffic) {
  const expected = settings(expectedState);
  for (const value of Object.values(expected)) expect(typeof value).toBe('string');
  // Both original fixture strings stay exact. The third field is fixed above,
  // not learned from a post-reset row or silently accepted after normalization.
  expect(expected.learningSettings).toBe(originalLanguage.learningSettings);
  expect(expected.integratedLearningSettingsV1).toBe(originalLanguage.integratedLearningSettingsV1);
  const learning = JSON.parse(expected.learningSettings as string);
  const integrated = JSON.parse(expected.integratedLearningSettingsV1 as string);
  const app = JSON.parse(expected.japaneseAppSettings as string);
  await expect(page.getByRole('button', { name: new RegExp(`^${learning.dailyGoalCount}\\s*개$`) })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#daily-goal-count')).toHaveValue(String(learning.dailyGoalCount));
  for (const section of ['kana', 'words', 'sentences']) {
    const value = app.sections[section];
    for (const [id, field] of [['tts-rate', 'ttsRate'], ['repeat-count', 'repeatCount'], ['repeat-delay', 'repeatDelayMs']]) {
      await expect(page.locator(`#${section}-${id}`)).toHaveValue(String(value[field]));
    }
    if (section !== 'kana') for (const [id, field] of [['show-reading', 'showReading'], ['show-korean-pronunciation', 'showKoreanPronunciation']]) {
      if (value[field]) await expect(page.locator(`#${section}-${id}`)).toBeChecked();
      else await expect(page.locator(`#${section}-${id}`)).not.toBeChecked();
    }
  }
  for (const [label, field] of [['글자·문제 도움', 'learnerMode'], ['하루 학습 시간', 'dailyMinutes'], ['우선 학습 과정', 'preferredTrack'], ['기본 음성 속도', 'audioRate']]) {
    await expect(page.getByLabel(label)).toHaveValue(String(integrated[field]));
  }
  for (const [label, field] of [['수업의 한글 발음 보조 표시', 'showKoreanHint'], ['읽는 법 표시', 'showReading'], ['한국어 뜻 표시', 'showMeaning']]) {
    if (integrated[field]) await expect(page.getByLabel(label, { exact: true })).toBeChecked();
    else await expect(page.getByLabel(label, { exact: true })).not.toBeChecked();
  }
  await expect.poll(() => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(expected))).toEqual(expected);
  await languageSynced(page); await traffic.drain();
  expect((await readRow(client, userId)).state).toEqual(expectedState);
  // The seed is an ordinary SDK PATCH above. A byte-stable mount need not PATCH;
  // require its genuine delivered GET, not an invented browser mutation.
  expect(traffic.entries.some(entry => entry.table === 'language_user_state' && entry.method === 'GET'
    && entry.status === 200 && !entry.synthetic && entry.delivered && entry.receivedState
    && canonical(entry.receivedState) === canonical(expectedState))).toBe(true);
}
async function openReset(page: Page) {
  const panel = page.getByRole('region', { name: '일본어 기록 초기화', exact: true });
  await panel.getByRole('button', { name: '일본어 기록 초기화하기', exact: true }).click();
  await panel.getByRole('checkbox').check();
  await panel.getByLabel('확인을 위해 ‘초기화’를 입력해 주세요.', { exact: true }).fill('초기화'); return panel;
}
async function localSnapshot(page: Page, userId: string) {
  return page.evaluate(({ keys, event, owner }) => ({
    local: Object.fromEntries([...new Set([...keys, ...Object.keys(localStorage).filter(key => key.startsWith('ai-fitness-'))])].sort().map(key => [key, localStorage.getItem(key)])),
    successEvent: localStorage.getItem(event),
    sessionReceipts: Object.fromEntries(Object.keys(sessionStorage).filter(key => key.startsWith('record-reset-receipt:')).sort().map(key => [key, sessionStorage.getItem(key)])),
    ownerReceipt: sessionStorage.getItem(`record-reset-receipt:${owner}:language`),
  }), { keys: [...APP_RECORD_KEYS.language, markerKey, 'learningSettings', 'integratedLearningSettingsV1', 'japaneseAppSettings',
    'language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch'], event: RECORD_RESET_STORAGE_EVENT, owner: userId });
}
async function installAudit(page: Page) {
  await page.evaluate(({ event, keys }) => {
    const audit: Audit = { lifecycle: [], successStorageWrites: 0, sessionReceiptWrites: 0, relevantRemovals: 0, storageClears: 0 };
    (window as unknown as { receiptAudit: Audit }).receiptAudit = audit;
    window.addEventListener('ai-yeoni-record-reset', () => audit.lifecycle.push(document.documentElement.dataset.recordReset ?? ''));
    const protectedKeys = new Set([...keys, event]);
    const { setItem, removeItem, clear } = Storage.prototype;
    Storage.prototype.setItem = function (...args: Parameters<Storage['setItem']>) {
      const [key, value] = args;
      if (this === localStorage && key === event) audit.successStorageWrites++;
      if (this === sessionStorage && typeof key === 'string' && key.startsWith('record-reset-receipt:')) audit.sessionReceiptWrites++;
      if (args.length === 2) return setItem.call(this, key, value);
      return Reflect.apply(setItem, this, args);
    };
    Storage.prototype.removeItem = function (...args: Parameters<Storage['removeItem']>) {
      const [key] = args;
      // Match the snapshot scope, not unrelated transactional-journal cleanup.
      // Non-string keys are conservatively counted without extra coercion; the
      // native method alone performs conversion and preserves its own throws.
      if (this === localStorage && (typeof key !== 'string' || protectedKeys.has(key) || key.startsWith('ai-fitness-'))
        || this === sessionStorage && (typeof key !== 'string' || key.startsWith('record-reset-receipt:'))) audit.relevantRemovals++;
      return Reflect.apply(removeItem, this, args);
    };
    Storage.prototype.clear = function (...args: Parameters<Storage['clear']>) {
      if (this === localStorage || this === sessionStorage) audit.storageClears++;
      return Reflect.apply(clear, this, args);
    };
  }, { event: RECORD_RESET_STORAGE_EVENT, keys: [...APP_RECORD_KEYS.language, markerKey, 'learningSettings', 'integratedLearningSettingsV1', 'japaneseAppSettings',
    'language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch'] });
}
async function assertFailedLocally(page: Page, userId: string, before: Awaited<ReturnType<typeof localSnapshot>>, attempts: number) {
  expect(await localSnapshot(page, userId)).toEqual(before);
  const audit = await page.evaluate(() => (window as unknown as { receiptAudit: Audit }).receiptAudit);
  // Start/stop lifecycle events are legitimate on errors; success effects are not.
  expect(audit.lifecycle).toEqual(Array.from({ length: attempts }, () => ['running', '']).flat());
  expect(audit.successStorageWrites).toBe(0); expect(audit.sessionReceiptWrites).toBe(0);
  expect(audit.relevantRemovals).toBe(0); expect(audit.storageClears).toBe(0);
  await expect(page.getByText(success, { exact: true })).toHaveCount(0);
}
