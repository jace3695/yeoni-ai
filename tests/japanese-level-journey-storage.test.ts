import test from 'node:test';
import assert from 'node:assert/strict';
import { withChunkBrowser } from './fixtures/chunkReviewStorage.ts';
import { LANGUAGE_TRANSACTION_KEY, LanguageStorageUnavailableError } from '../app/data/languageStorageLock.ts';
import { emptyLevelJourney, learningOwner, LEVEL_JOURNEY_KEY, readLevelJourney, writeLevelJourney } from '../utils/japaneseLevelJourney.ts';
import { readLevelJourneySafely, writeLevelJourneySafely } from '../utils/japaneseLevelJourneyStorage.ts';
const owner = { 'language-cloud-sync-user': 'synthetic-A', 'fitness-cloud-sync-user': 'synthetic-A' };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const withoutLocks = () => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
const date = '2026-11-08T00:00:00.000Z';

test('level journey new writers with mixed Web Locks capabilities preserve independent units through canonical IDB gate', async () => withChunkBrowser(async ({ api, locks, idb }) => {
  const tasks = [];
  for (let i = 0; i < 20; i++) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: i % 2 ? { locks } : {} });
    tasks.push(writeLevelJourneySafely(api, learningOwner(api), latest => ({ ...latest, practicedUnits: { ...latest.practicedUnits, [`unit-${i}`]: date } })));
  }
  await Promise.all(tasks);
  const result = await readLevelJourneySafely(api, learningOwner(api));
  assert.equal(Object.keys(result.practicedUnits).length, 20);
  assert.equal(idb.trace.filter(item => item.startsWith('complete:')).length, 21);
  assert.equal(writeLevelJourney(api, learningOwner(api), value => value).version, 1);
}, owner));

for (const key of ['language-cloud-sync-user', 'fitness-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-epoch', 'languageRecordResetV1']) {
  test(`level journey queued ${key} change cannot execute stale write`, async () => withChunkBrowser(async ({ api, entries, idb }) => {
    withoutLocks(); idb.pause(); let called = false;
    const pending = writeLevelJourneySafely(api, learningOwner(api), latest => { called = true; return latest; });
    await tick(); await tick(); entries.set(key, 'changed'); idb.resume();
    await assert.rejects(pending, /계정이나 기록/); assert.equal(called, false); assert.equal(entries.has(LEVEL_JOURNEY_KEY), false);
  }, owner));
}

test('level journey queued abort settles before grant; later healthy save remains available', async () => withChunkBrowser(async ({ api, entries, idb }) => {
  withoutLocks(); idb.pause(); const controller = new AbortController();
  const pending = writeLevelJourneySafely(api, learningOwner(api), () => assert.fail('cancelled callback'), { signal: controller.signal });
  await tick(); controller.abort(); await assert.rejects(pending, /abort/i);
  idb.resume(); await tick(); await tick(); assert.equal(entries.has(LEVEL_JOURNEY_KEY), false);
  await writeLevelJourneySafely(api, learningOwner(api), value => value); assert.equal(readLevelJourney(api).version, 1);
}, owner));

test('level journey reset guard after change prevents write and anonymous or mixed caches cannot be adopted', async () => withChunkBrowser(async ({ api, entries }) => {
  let reset = false;
  await assert.rejects(writeLevelJourneySafely(api, learningOwner(api), value => { reset = true; return value; }, { assertCurrent: () => { if (reset) throw new Error('reset running'); } }), /reset running/);
  assert.equal(entries.has(LEVEL_JOURNEY_KEY), false);
  for (const changed of [null, 'synthetic-B']) {
    if (changed === null) entries.delete('language-cloud-sync-user'); else entries.set('language-cloud-sync-user', changed);
    await assert.rejects(readLevelJourneySafely(api, learningOwner(api)), /계정이나 기록/);
    await assert.rejects(writeLevelJourneySafely(api, learningOwner(api), () => assert.fail()), /계정이나 기록/);
  }
}, owner));

test('level journey malformed bytes stay unchanged on read and write failure', async () => withChunkBrowser(async ({ api, entries }) => {
  for (const raw of ['{bad', JSON.stringify({ ...emptyLevelJourney(), version: 99 })]) {
    entries.set(LEVEL_JOURNEY_KEY, raw);
    await assert.rejects(readLevelJourneySafely(api, learningOwner(api)));
    await assert.rejects(writeLevelJourneySafely(api, learningOwner(api), () => assert.fail()));
    assert.equal(entries.get(LEVEL_JOURNEY_KEY), raw);
  }
}, owner));

test('level journey recovery participates in gate and rejects recovered owner change before applying callback', async () => withChunkBrowser(async ({ api, entries, idb }) => {
  withoutLocks(); idb.pause();
  entries.set(LANGUAGE_TRANSACTION_KEY, JSON.stringify({ 'language-cloud-sync-epoch': 'restored-epoch', [LEVEL_JOURNEY_KEY]: JSON.stringify(emptyLevelJourney()) }));
  const pending = writeLevelJourneySafely(api, learningOwner(api), () => assert.fail('recovered different owner'));
  await tick(); await tick(); assert.ok(entries.has(LANGUAGE_TRANSACTION_KEY)); idb.resume();
  await assert.rejects(pending, /계정이나 기록/); assert.equal(entries.has(LANGUAGE_TRANSACTION_KEY), false);
  assert.equal(entries.get('language-cloud-sync-epoch'), 'restored-epoch');
  assert.deepEqual(readLevelJourney(api), emptyLevelJourney());
}, owner));

for (const boundary of ['abortAfterCallback', 'closeAfterCallback'] as const) {
  test(`level journey ${boundary} reports uncertainty after exactly one persisted mutation`, async () => withChunkBrowser(async ({ api, idb }) => {
    withoutLocks(); idb.controls[boundary] = true; let calls = 0;
    await assert.rejects(writeLevelJourneySafely(api, learningOwner(api), latest => {
      calls++; return { ...latest, practicedUnits: { ...latest.practicedUnits, synthetic: date } };
    }), (error: unknown) => error instanceof LanguageStorageUnavailableError && error.mayHaveChanged);
    assert.equal(calls, 1); assert.equal(readLevelJourney(api).practicedUnits.synthetic, date);
    idb.controls[boundary] = false;
    assert.equal((await readLevelJourneySafely(api, learningOwner(api))).practicedUnits.synthetic, date);
  }, owner));
}
