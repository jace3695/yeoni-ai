import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as languageGate from '../app/data/languageStorageLock.ts';
import * as resetData from '../app/data/appRecordReset.ts';
import { compareChunkGenerations } from '../utils/japaneseChunkReview.ts';
import { memoryStorage, withChunkBrowser } from './fixtures/chunkReviewStorage.ts';
const source = readFileSync(new URL('../app/lib/resetAppRecords.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
for (const shape of ['absent', 'undefined', 'missing-request'] as const) {
  test(`language reset with ${shape} WebLocks passes IDB preflight and keeps existing reset semantics`, async () => withChunkBrowser(async ({ api, entries, idb }) => {
    const navigator = { onLine: true, ...(shape === 'absent' ? {} : { locks: shape === 'undefined' ? undefined : {} }) };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator });
    let requests = 0;
    const marker = '2026-11-08T12:00:00.000Z|synthetic-reset';
    const modules: Record<string, unknown> = {
      '../../utils/japaneseChunkReview': { compareChunkGenerations },
      '../data/languageStorageLock': languageGate, '../data/appRecordReset': resetData,
      '../data/growthRoutines': {}, '../budget/lib/pending-save': {},
      './supabase': { supabase: {
        auth: { getUser: async () => ({ data: { user: { id: 'A' } }, error: null }) },
        rpc: async () => { requests++; return { data: { app: 'language', user_id: 'A', marker }, error: null }; },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { state: { languageRecordResetV1: marker } }, error: null }) }) }) }),
      } },
    };
    const exports: { resetAppRecords?: (app: string, requestId: string, expectedUser: string) => Promise<unknown> } = {};
    const session = memoryStorage();
    vm.runInNewContext(code, { exports, navigator, window: { localStorage: api, sessionStorage: session.api }, require: (name: string) => { if (!(name in modules)) throw new Error(name); return modules[name]; } });
    entries.set('savedWords', '["synthetic"]'); entries.set('unrelated', 'keep');
    await exports.resetAppRecords!('language', 'synthetic-reset', 'A');
    assert.equal(requests, 1); assert.equal(entries.has('savedWords'), false);
    assert.equal(entries.get('languageRecordResetV1'), marker); assert.equal(entries.get('unrelated'), 'keep');
    assert.equal(session.api.getItem('record-reset-receipt:A:language'), '1');
    assert.ok(idb.trace.filter(event => event.startsWith('complete:')).length >= 2);
  }, { 'language-cloud-sync-user': 'A', 'fitness-cloud-sync-user': 'A' }));
}
