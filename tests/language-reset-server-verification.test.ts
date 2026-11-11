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
};
async function run(scenario: Scenario, check: (result: {
  reset: () => Promise<unknown>; entries: Map<string, string>; session: ReturnType<typeof memoryStorage>;
  reads: string[]; idb: { trace: string[] };
}) => Promise<void>) {
  return withChunkBrowser(async ({ api, entries, idb, locks }) => {
    const navigator = { onLine: true, locks };
    const session = memoryStorage();
    let authCalls = 0;
    const reads: string[] = [];
    const modules: Record<string, unknown> = {
      '../../utils/japaneseChunkReview': { compareChunkGenerations },
      '../data/languageStorageLock': languageGate, '../data/appRecordReset': resetData,
      '../data/growthRoutines': {}, '../budget/lib/pending-save': {},
      './supabase': { supabase: {
        auth: { getUser: async () => ({ data: { user: { id: ++authCalls > 1 ? scenario.nextUser ?? 'A' : 'A' } }, error: null }) },
        rpc: async () => ({ data: { app: 'language', user_id: 'A', marker }, error: null }),
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
    vm.runInNewContext(code, { exports, navigator, window: { localStorage: api, sessionStorage: session.api }, require: (name: string) => {
      assert.ok(name in modules, `unexpected import ${name}`); return modules[name];
    } });
    entries.set('savedWords', '["synthetic"]');
    entries.set('japaneseLevelJourneyV1', '{"synthetic":"level"}');
    entries.set('japaneseChunkReviewV1', '{"synthetic":"chunk"}');
    entries.set('japaneseAppSettings', '{"volume":1}');
    if (scenario.localMarker) entries.set('languageRecordResetV1', scenario.localMarker);
    await check({ reset: () => exports.resetAppRecords!('language', 'synthetic-reset', 'A'), entries, session, reads, idb });
  }, owner);
}

for (const remaining of ['japaneseLevelJourneyV1', 'japaneseChunkReviewV1', 'savedWords']) {
  test(`old/partial server retaining ${remaining} cannot clear local records or show success`, async () => run({
    remote: { languageRecordResetV1: marker, [remaining]: 'synthetic-old' },
  }, async ({ reset, entries, session, reads }) => {
    const before = new Map(entries);
    await assert.rejects(reset(), /서버에 일본어 학습 기록이 남아/);
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
