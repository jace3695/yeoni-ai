import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as languageGate from '../app/data/languageStorageLock.ts';
import * as resetData from '../app/data/appRecordReset.ts';
import { compareChunkGenerations } from '../utils/japaneseChunkReview.ts';
import { memoryStorage, withChunkBrowser } from './fixtures/chunkReviewStorage.ts';

const code = ts.transpileModule(readFileSync(new URL('../app/lib/resetAppRecords.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const marker = '2026-11-10T12:00:00.000Z|synthetic-reset';
const owner = { 'language-cloud-sync-user': 'A', 'fitness-cloud-sync-user': 'A' };

type Scenario = {
  remote?: unknown; readError?: unknown; localMarker?: string; nextUser?: string;
  afterRead?: (entries: Map<string, string>) => void;
  rpcError?: { message: string; code?: string }; rpcMarker?: string; firstUser?: string;
};
async function run(scenario: Scenario, check: (result: {
  reset: () => Promise<unknown>; entries: Map<string, string>; session: ReturnType<typeof memoryStorage>;
  reads: string[]; idb: { trace: string[] }; events: string[]; rpcRequests: string[]; uuidCalls: () => number;
}) => Promise<void>) {
  return withChunkBrowser(async ({ api, entries, idb, locks, events }) => {
    const navigator = { onLine: true, locks };
    const session = memoryStorage();
    let authCalls = 0, uuidCalls = 0;
    const rpcRequests: string[] = [];
    const reads: string[] = [];
    const modules: Record<string, unknown> = {
      '../../utils/japaneseChunkReview': { compareChunkGenerations },
      '../data/languageStorageLock': languageGate, '../data/appRecordReset': resetData,
      '../data/growthRoutines': {}, '../budget/lib/pending-save': {},
      './supabase': { supabase: {
        auth: { getUser: async () => ({ data: { user: { id: ++authCalls > 1 ? scenario.nextUser ?? 'A' : scenario.firstUser ?? 'A' } }, error: null }) },
        rpc: async (_name: string, params: { p_request_id: string }) => {
          rpcRequests.push(params.p_request_id);
          return { data: { app: 'language', user_id: 'A', marker: scenario.rpcMarker ?? marker }, error: scenario.rpcError ?? null };
        },
        from: (table: string) => { reads.push(table); return { select: (fields: string) => {
          reads.push(fields); return { eq: (field: string, value: string) => {
            reads.push(`${field}:${value}`); return { maybeSingle: async () => {
              scenario.afterRead?.(entries);
              return { data: scenario.remote === null ? null : { state: scenario.remote ?? { languageRecordResetV1: marker } }, error: scenario.readError ?? null };
            } };
          } };
        } }; },
      } },
    };
    const exports: { resetAppRecords?: (app: string, requestId: string, expectedUser: string) => Promise<unknown> } = {};
    vm.runInNewContext(code, { exports, navigator, crypto: { randomUUID: () => { uuidCalls++; return 'unexpected-rotation'; } }, window: { localStorage: api, sessionStorage: session.api }, require: (name: string) => {
      assert.ok(name in modules, `unexpected import ${name}`); return modules[name];
    } });
    entries.set('savedWords', '["synthetic"]');
    entries.set('japaneseLevelJourneyV1', '{"synthetic":"level"}');
    entries.set('japaneseChunkReviewV1', '{"synthetic":"chunk"}');
    entries.set('japaneseAppSettings', '{"volume":1}');
    if (scenario.localMarker) entries.set('languageRecordResetV1', scenario.localMarker);
    await check({ reset: () => exports.resetAppRecords!('language', 'synthetic-reset', 'A'), entries, session, reads, idb, events, rpcRequests, uuidCalls: () => uuidCalls });
  }, owner);
}

for (const remaining of ['japaneseLevelJourneyV1', 'japaneseChunkReviewV1', 'savedWords']) {
  test(`old/partial server retaining ${remaining} cannot clear local records or show success`, async () => run({
    remote: { languageRecordResetV1: marker, [remaining]: 'synthetic-old' },
  }, async ({ reset, entries, session, reads }) => {
    const before = new Map(entries);
    await assert.rejects(reset(), (error: unknown) => {
      // A remaining-record failure needs a new, explicitly confirmed reset,
      // not an automatic request-ID rotation or an unsafe same-request retry.
      const message = (error as { message: string }).message;
      assert.match(message, /^서버에 일본어 학습 기록이 남아 있어/);
      assert.match(message, /이 기기의 기록은 지우지 않았습니다/);
      assert.match(message, /서버 업데이트 상태/);
      assert.match(message, /필요한 기록을 먼저 보관/);
      assert.match(message, /다른 기기와 탭의 학습을 끝낸 뒤/);
      assert.match(message, /화면을 새로고침/);
      assert.match(message, /체크박스와 ‘초기화’ 입력으로 다시 확인/);
      assert.match(message, /새로운 삭제 요청/);
      assert.match(message, /이후에 새로 만든 기록도 모두 삭제/);
      return true;
    });
    assert.deepEqual(entries, before);
    assert.equal(session.api.length, 0);
    assert.deepEqual(reads, ['language_user_state', 'state', 'user_id:A']);
  }));
}
for (const [name, scenario] of Object.entries({
  'read error': { readError: { message: 'synthetic unavailable' } },
  'missing row': { remote: null },
  'missing marker': { remote: {} },
  'newer marker': { remote: { languageRecordResetV1: '2026-11-11T00:00:00.000Z|newer' } },
  'invalid state': { remote: [] },
})) {
  test(`${name} fails closed before local deletion`, async () => run(scenario, async ({ reset, entries, session }) => {
    const before = new Map(entries);
    await assert.rejects(reset(), /서버의 일본어 초기화 결과를 확인하지 못/);
    assert.deepEqual(entries, before);
    assert.equal(session.api.length, 0);
  }));
}
test('verified empty server generation clears owned keys, preserves settings and writes receipt', async () => run({}, async ({ reset, entries, session, reads }) => {
  await reset();
  for (const key of resetData.APP_RECORD_KEYS.language) assert.equal(entries.has(key), false);
  assert.equal(entries.get('japaneseAppSettings'), '{"volume":1}');
  assert.equal(entries.get('languageRecordResetV1'), marker);
  assert.equal(session.api.getItem('record-reset-receipt:A:language'), '1');
  assert.deepEqual(reads, ['language_user_state', 'state', 'user_id:A']);
}));
test('synced or legacy marker cannot certify a partial reset', async () => run({
  localMarker: marker, remote: { languageRecordResetV1: marker, japaneseChunkReviewV1: 'synthetic-new' },
}, async ({ reset, entries, session }) => {
  const before = new Map(entries);
  await assert.rejects(reset(), /서버에 일본어 학습 기록이 남아/);
  assert.deepEqual(entries, before);
  assert.equal(session.api.length, 0);
}));
test('this client verified receipt retry preserves learning created after reset', async () => {
  const remote: Record<string, string> = { languageRecordResetV1: marker };
  await run({ remote }, async ({ reset, entries, session }) => {
    await reset();
    entries.set('japaneseChunkReviewV1', 'synthetic-new');
    remote.japaneseChunkReviewV1 = 'synthetic-new';
    await reset();
    assert.equal(entries.get('japaneseChunkReviewV1'), 'synthetic-new');
    assert.equal(session.api.getItem('record-reset-receipt:A:language'), '1');
  });
});
test('failed reset followed by sync and retry still cannot certify remaining server keys', async () => {
  const remote = { languageRecordResetV1: marker, japaneseLevelJourneyV1: 'synthetic-old' };
  await run({ remote }, async ({ reset, entries, session }) => {
    await assert.rejects(reset(), /서버에 일본어 학습 기록이 남아/);
    entries.set('languageRecordResetV1', marker);
    await assert.rejects(reset(), /서버에 일본어 학습 기록이 남아/);
    assert.equal(entries.get('japaneseLevelJourneyV1'), '{"synthetic":"level"}');
    assert.equal(session.api.length, 0);
  });
});
test('account change during readback preserves local records and does not show success', async () => run({ nextUser: 'B' }, async ({ reset, entries, session }) => {
  const before = new Map(entries);
  await assert.rejects(reset(), /계정이 바뀌었어요/);
  assert.deepEqual(entries, before);
  assert.equal(session.api.length, 0);
}));
test('session epoch change during readback stops local deletion', async () => run({
  afterRead: entries => { entries.set('language-cloud-sync-epoch', 'new-session'); },
}, async ({ reset, entries, session }) => {
  await assert.rejects(reset(), /계정 세션이 바뀌었어요/);
  assert.equal(entries.get('savedWords'), '["synthetic"]');
  assert.equal(entries.get('japaneseLevelJourneyV1'), '{"synthetic":"level"}');
  assert.equal(session.api.length, 0);
}));


for (const [name, scenario, expected] of [
  ['superseded UUID', { rpcError: { message: 'YEONI_RESET_REQUEST_SUPERSEDED', code: '22023' } }, /더 최근의 일본어 초기화/],
  ['wrong receipt UUID despite matching remote marker', { rpcMarker: '2026-11-10T12:00:00.000Z|unrelated', remote: { languageRecordResetV1: '2026-11-10T12:00:00.000Z|unrelated' } }, /이 요청과 일치하지 않아/],
  ['extra receipt separator', { rpcMarker: `${marker}|extra` }, /이 요청과 일치하지 않아/],
  ['older same-request marker than local', { localMarker: '2026-11-11T00:00:00.000Z|newer' }, /더 최근의 일본어 초기화/],
  ['account changed during readback', { nextUser: 'B' }, /계정이 바뀌었어요/],
  ['account changed before RPC', { firstUser: 'B' }, /계정이 바뀌었어요/],
] as const) {
  test(`${name}: no clearing, receipt, reset event, UUID rotation or automatic retry`, async () => run(scenario, async ({ reset, entries, session, events, rpcRequests, uuidCalls }) => {
    const before = new Map(entries);
    await assert.rejects(reset(), expected);
    assert.deepEqual(entries, before);
    assert.equal(entries.has(resetData.RECORD_RESET_STORAGE_EVENT), false);
    assert.equal(session.api.length, 0); assert.deepEqual(events, []);
    assert.equal(uuidCalls(), 0);
    assert.deepEqual(rpcRequests, 'firstUser' in scenario && scenario.firstUser === 'B' ? [] : ['synthetic-reset']);
  }));
}
test('superseded request retains its ID for a manual retry without presenting success', async () => run({
  rpcError: { message: 'YEONI_RESET_REQUEST_SUPERSEDED', code: '22023' },
}, async ({ reset, entries, session, rpcRequests, uuidCalls }) => {
  const before = new Map(entries);
  for (let index = 0; index < 2; index++) await assert.rejects(reset(), (error: unknown) => {
    const message = (error as Error).message;
    assert.match(message, /이 요청으로 서버나 이 기기의 기록을 지우지 않았습니다/);
    assert.match(message, /화면을 새로고침/); assert.match(message, /체크박스와 ‘초기화’ 입력/);
    assert.match(message, /이후에 만든 기록도 모두 삭제/);
    assert.doesNotMatch(message, /같은 버튼/); return true;
  });
  assert.deepEqual(entries, before); assert.equal(session.api.length, 0);
  assert.deepEqual(rpcRequests, ['synthetic-reset', 'synthetic-reset']); assert.equal(uuidCalls(), 0);
}));
test('other RPC errors retain the existing generic retry guidance', async () => run({
  rpcError: { message: 'synthetic unrecognized server error' },
}, async ({ reset, entries, session }) => {
  const before = new Map(entries);
  await assert.rejects(reset(), /초기화 완료 여부를 확인하지 못했어요. 같은 버튼/);
  assert.deepEqual(entries, before); assert.equal(session.api.length, 0);
}));
test('reset panel error path does not rotate request IDs, retry automatically or reload', () => {
  const source = readFileSync(new URL('../app/components/RecordResetPanel.tsx', import.meta.url), 'utf8');
  const submit = source.slice(source.indexOf('  const reset = async () =>'), source.indexOf('  return <section'));
  const errorPath = submit.slice(submit.indexOf('    } catch (error)'));
  assert.match(submit, /requestId.current \|\|= crypto.randomUUID\(\)/);
  assert.equal((submit.match(/resetAppRecords\(/g) ?? []).length, 1);
  assert.doesNotMatch(errorPath, /requestId.current\s*=|randomUUID|resetAppRecords|location.reload|receipt|localStorage/);
});
