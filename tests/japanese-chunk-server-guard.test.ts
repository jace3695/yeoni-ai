import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { stableState } from '../app/data/cloudSync.ts';
import { mergeLanguageStateFromBase } from '../app/data/languageCloudSync.ts';
import { parseChunkReview } from '../utils/japaneseChunkReview.ts';
import {
  key, resetKey, event, review, marker, prototypeSql, createFixture, accessSnapshot,
  asUser, readState, writeState, type State,
} from './fixtures/japanese-chunk-server-guard/fixture.ts';

let db: PGlite;
const names = ['legacy','upsert','monotonic','collision','unknown','malformed','capacity','bytes','reset','oldreset','explicit','order1','order2','rollback','other','migration','shape','replay','retry','time'] as const;
const owners = Object.fromEntries(names.map(name => [name, randomUUID()])) as Record<typeof names[number], string>;
const initial: State = { [key]: review(['a']), japaneseAppSettings: '{"goal":1}' };
let beforeAccess: Awaited<ReturnType<typeof accessSnapshot>>;
before(async () => {
  const seeds = Object.fromEntries(names.map(name => [owners[name], { ...initial }]));
  seeds[owners.unknown] = { ...initial, [key]: '{"version":999,"future":["uninterpreted"]}' };
  seeds[owners.malformed] = { ...initial, [key]: '{invalid JSON' };
  db = await createFixture(seeds);
  beforeAccess = await accessSnapshot(db);
  await db.exec(prototypeSql);
});
after(async () => { await db?.close(); });
async function rejectUnchanged(owner: string, state: State, error: RegExp) {
  const row = async () => (await db.query('select user_id,state,updated_at from public.language_user_state where user_id=$1', [owner])).rows;
  const before = await row();
  await assert.rejects(writeState(db, owner, state), error);
  assert.deepEqual(await row(), before);
}

test('prototype is docs-only, invoker-only, guarded, and leaves existing ACL/RLS/reset body and data unchanged', async (t) => {
  t.diagnostic(String((await db.query<{ version: string }>('select version() as version')).rows[0].version));
  assert.doesNotMatch(prototypeSql, /^\s*(grant|revoke|alter\s+(table|role)|create\s+policy|security\s+definer)\b/im);
  assert.doesNotMatch(prototypeSql, /create or replace function public\.reset_my_app_records/i);
  assert.deepEqual(await accessSnapshot(db), beforeAccess);
  assert.deepEqual(await readState(db, owners.migration), initial);
  const functions = await db.query<{prosecdef: boolean}>("select prosecdef from pg_proc where proname='yeoni_japanese_chunk_guard_prototype'");
  assert.equal(functions.rows[0].prosecdef, false);
  await db.exec("set yeoni.chunk_guard_fixture=''");
  await assert.rejects(db.exec(prototypeSql), /disposable synthetic fixture/);
  await db.exec("set yeoni.chunk_guard_fixture='synthetic-pglite-only'");
});

test('legacy whole-state UPDATE omitting the new key is rejected atomically with ordinary changes unsaved', async () => {
  await asUser(db, owners.legacy);
  await rejectUnchanged(owners.legacy, { japaneseAppSettings: '{"goal":2}' }, /KEY_REMOVED/);
  assert.equal((await readState(db, owners.legacy))?.japaneseAppSettings, '{"goal":1}');
});

test('legacy UPSERT conflict-update cannot erase the key', async () => {
  await asUser(db, owners.upsert);
  await assert.rejects(db.query('insert into public.language_user_state(user_id,state) values($1,$2) on conflict(user_id) do update set state=excluded.state', [owners.upsert, { japaneseAppSettings: 'new' }]), /KEY_REMOVED/);
  assert.deepEqual(await readState(db, owners.upsert), initial);
});

test('same-generation event superset succeeds byte-exactly, retries are idempotent, deletion fails', async () => {
  await asUser(db, owners.monotonic);
  const next = { ...initial, [key]: review(['a','b']), japaneseAppSettings: 'changed' };
  await writeState(db, owners.monotonic, next);
  assert.equal(stableState(await readState(db, owners.monotonic) ?? {}), stableState(next));
  await writeState(db, owners.monotonic, next);
  assert.deepEqual(await readState(db, owners.monotonic), next);
  await rejectUnchanged(owners.monotonic, initial, /EVENT_REMOVED_OR_CHANGED/);
});

test('same event ID with conflicting answer or observation time is rejected, never merged', async () => {
  await asUser(db, owners.collision);
  for (const changes of [{correct:true}, {answeredAt:'2026-11-02T01:02:03.000Z'}]) {
    const changed = JSON.stringify({version:1,generation:null,events:{a:event('a',changes)}});
    await rejectUnchanged(owners.collision, {...initial,[key]:changed}, /EVENT_REMOVED_OR_CHANGED/);
  }
});

test('unknown versions and malformed legacy bytes remain opaque unless explicitly reset', async () => {
  for (const name of ['unknown','malformed'] as const) {
    await asUser(db, owners[name]);
    const current = (await readState(db, owners[name]))!;
    await writeState(db, owners[name], {...current, japaneseAppSettings:'safe-change'});
    await rejectUnchanged(owners[name], {japaneseAppSettings:'erase'}, /KEY_REMOVED/);
    await rejectUnchanged(owners[name], initial, /VERSION_OR_SHAPE|REVIEW_SHAPE/);
    await db.query("select public.reset_my_app_records('language',$1,'초기화')", [randomUUID()]);
    assert.equal((await readState(db, owners[name]))?.[key], undefined);
  }
});

test('new unknown version or malformed payload does not replace valid history', async () => {
  await asUser(db, owners.shape);
  for (const raw of ['{"version":2,"generation":null,"events":{}}','{broken',null,{},'[]']) {
    await rejectUnchanged(owners.shape, {...initial,[key]:raw}, /VERSION_OR_SHAPE|REVIEW_SHAPE/);
  }
});

test('6000 event boundary passes; 6001 rejects without pruning or partial updates', async () => {
  await asUser(db, owners.capacity);
  const ids = ['a', ...Array.from({length:5999},(_,i)=>`e${i}`)];
  const full = {...initial,[key]:review(ids)};
  await writeState(db, owners.capacity, full);
  assert.equal(Object.keys(parseChunkReview((await readState(db, owners.capacity))?.[key]).events).length, 6000);
  await rejectUnchanged(owners.capacity, {...full,[key]:review([...ids,'overflow'])}, /EVENT_CAP/);
});

test('2,000,000 raw UTF-8 byte boundary passes; extra ASCII or multibyte input is rejected', async () => {
  await asUser(db, owners.bytes);
  const raw = review(['a']);
  const exact = raw + ' '.repeat(2_000_000 - Buffer.byteLength(raw));
  assert.equal(Buffer.byteLength(exact), 2_000_000);
  await writeState(db, owners.bytes, {...initial,[key]:exact});
  await rejectUnchanged(owners.bytes, {...initial,[key]:exact+' '}, /BYTE_CAP/);
  await rejectUnchanged(owners.bytes, {...initial,[key]:raw+'あ'.repeat(666667)}, /BYTE_CAP/);
});

test('existing reset RPC removes key, preserves settings, accepts retry without erasing new-generation work', async () => {
  const owner = owners.reset, request = randomUUID();
  await asUser(db, owner);
  await assert.rejects(db.query("select public.reset_my_app_records('language',$1,'wrong')",[request]), /Invalid reset confirmation/);
  await db.query("select public.reset_my_app_records('language',$1,'초기화')",[request]);
  const reset = (await readState(db, owner))!;
  assert.equal(reset[key], undefined); assert.equal(reset.japaneseAppSettings, initial.japaneseAppSettings);
  const next = {...reset,[key]:review(['after-reset'],reset[resetKey] as string)};
  await writeState(db, owner, next);
  await db.query("select public.reset_my_app_records('language',$1,'초기화')",[request]);
  assert.deepEqual(await readState(db, owner), next);
  await rejectUnchanged(owner, initial, /RESET_ROLLBACK/);
  await rejectUnchanged(owner, {...next,[key]:review(['a'])}, /GENERATION_MISMATCH/);
});

test('explicit newer generation may clear records or initialize empty history; it never revives old events', async () => {
  const owner = owners.explicit, first = marker('03',1), second = marker('04',2);
  await asUser(db, owner);
  await writeState(db, owner, { [resetKey]:first, [key]:review([],first), japaneseAppSettings:'kept' });
  await writeState(db, owner, { [resetKey]:first, [key]:review(['fresh'],first), japaneseAppSettings:'kept' });
  await rejectUnchanged(owner, { [resetKey]:second, [key]:review(['fresh'],second) }, /RESET_NOT_EMPTY/);
  await rejectUnchanged(owner, { [resetKey]:second, savedWords:'["not-cleared"]' }, /RESET_NOT_EMPTY/);
  await writeState(db, owner, { [resetKey]:second, japaneseAppSettings:'kept' });
  assert.equal((await readState(db, owner))?.[key], undefined);
  await rejectUnchanged(owner, { [resetKey]:first, [key]:review(['fresh'],first) }, /RESET_ROLLBACK/);
});

test('serialized update/reset orders preserve the latest reset and block past-generation PATCH resurrection', async () => {
  for (const [name, updateFirst] of [['order1',true],['order2',false]] as const) {
    const owner = owners[name], reset = marker('05',updateFirst ? 11 : 12);
    await asUser(db, owner);
    if (updateFirst) await writeState(db, owner, {...initial,[key]:review(['a','before-reset'])});
    await writeState(db, owner, {[resetKey]:reset});
    await rejectUnchanged(owner, {...initial,[key]:review(['a','delayed'])}, /RESET_ROLLBACK/);
    await writeState(db, owner, {[resetKey]:reset,[key]:review(['current'],reset)});
    assert.deepEqual(Object.keys(parseChunkReview((await readState(db, owner))?.[key]).events), ['current']);
  }
});

test('different owners remain RLS-isolated and anon access remains denied', async () => {
  await asUser(db, owners.other);
  assert.equal(await readState(db, owners.monotonic), undefined);
  assert.equal((await writeState(db, owners.monotonic, {})).rows.length, 0);
  await assert.rejects(db.query('insert into public.language_user_state(user_id,state) values($1,$2) on conflict(user_id) do update set state=excluded.state',[owners.monotonic,{}]), /row-level security/);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select state from public.language_user_state'), /permission denied/);
  await assert.rejects(db.query("select public.reset_my_app_records('language',$1,'초기화')",[randomUUID()]), /permission denied/);
});

test('failed transaction rolls back earlier writes too; accepted write can also be explicitly rolled back', async () => {
  const owner = owners.rollback;
  await asUser(db, owner);
  await db.exec('begin');
  await writeState(db, owner,{...initial,japaneseAppSettings:'intermediate'});
  await assert.rejects(writeState(db, owner,{}), /KEY_REMOVED/);
  await db.exec('rollback');
  assert.deepEqual(await readState(db, owner),initial);
  await db.exec('begin'); await writeState(db,owner,{...initial,[key]:review(['a','b'])}); await db.exec('rollback');
  assert.deepEqual(await readState(db, owner),initial);
});

test('latest client can reread, union and retry a stale same-generation write without fabricated events', async () => {
  const owner = owners.retry;
  await asUser(db,owner);
  const remote = {...initial,[key]:review(['a','remote'])}, local = {...initial,[key]:review(['a','local'])};
  await writeState(db,owner,remote);
  await rejectUnchanged(owner,local,/EVENT_REMOVED_OR_CHANGED/);
  const merged = mergeLanguageStateFromBase(initial,(await readState(db,owner))!,local);
  await writeState(db,owner,merged);
  assert.deepEqual(Object.keys(parseChunkReview((await readState(db,owner))?.[key]).events),['a','local','remote']);
  assert.equal(stableState((await readState(db,owner))!),stableState(merged));
});

test('automatic merge would fail existing whole-state verification; rejection never reports a rewritten success', () => {
  const legacy = {japaneseAppSettings:'changed'};
  const rewritten = {...legacy,[key]:review(['a'])};
  assert.notEqual(stableState(legacy),stableState(rewritten));
  // The real component uses this exact stableState comparison after the GET.
  // This is a contract assertion, not a browser/PostgREST transport test.
});

test('known residual risk: replaying an old reset request after another reset executes again in unchanged RPC', async () => {
  const owner = owners.replay, first = randomUUID(), second = randomUUID();
  await asUser(db,owner);
  await db.query("select public.reset_my_app_records('language',$1,'초기화')",[first]);
  await db.query("select public.reset_my_app_records('language',$1,'초기화')",[second]);
  const current = (await readState(db,owner))!;
  await writeState(db,owner,{...current,[key]:review(['after-second'],current[resetKey] as string)});
  await db.query("select public.reset_my_app_records('language',$1,'초기화')",[first]);
  const replayed = (await readState(db,owner))!;
  assert.equal(replayed[key],undefined);
  assert.ok((replayed[resetKey] as string).endsWith(first));
  // A passing test documents existing data-clearing behavior, NOT protection.
});

test('millisecond marker ordering matches current JS tie breaker, not microsecond timestamp ordering', async () => {
  const owner = owners.time;
  const earlier = '2026-11-07T00:00:00.000100Z|00000000-0000-4000-8000-000000000001';
  const later = '2026-11-07T00:00:00.000900Z|00000000-0000-4000-8000-000000000002';
  await asUser(db,owner);
  await writeState(db,owner,{[resetKey]:earlier});
  await writeState(db,owner,{[resetKey]:later});
  await rejectUnchanged(owner,{[resetKey]:earlier},/RESET_ROLLBACK/);
});


test('new-row INSERT accepts complete current-generation snapshot; conflict UPSERT remains protected', async () => {
  const owner = randomUUID(), generation = marker('06',61);
  await db.exec('reset role'); await db.query('insert into auth.users values($1)',[owner]);
  await asUser(db,owner);
  const state = {[resetKey]:generation,[key]:review(['new-row'],generation),savedWords:'[]',japaneseAppSettings:'kept'};
  await db.query('insert into public.language_user_state(user_id,state) values($1,$2)',[owner,state]);
  assert.deepEqual(await readState(db,owner),state);
  await assert.rejects(db.query('insert into public.language_user_state(user_id,state) values($1,$2) on conflict(user_id) do update set state=excluded.state',[owner,{}]),/RESET_ROLLBACK/);
  assert.deepEqual(await readState(db,owner),state);
});

test('invalid timestamps, extra fields, generation mismatch and non-string markers fail closed', async () => {
  const owner = owners.shape;
  await asUser(db,owner);
  for (const invalidEvent of [event('a',{answeredAt:'2026-02-30T00:00:00.000Z'}),event('a',{answeredAt:'2026-01-01T24:00:00.000Z'}),event('a',{secret:'not-allowed'}),event('a',{attemptId:'different'})]) {
    await rejectUnchanged(owner,{...initial,[key]:JSON.stringify({version:1,generation:null,events:{a:invalidEvent}})},/EVENT_TIME|EVENT_SHAPE/);
  }
  for (const bad of [42,null,'not-a-time','2026-11-03T24:00:00.000Z|00000000-0000-4000-8000-000000000001']) {
    await rejectUnchanged(owner,{[resetKey]:bad},/RESET_SHAPE|RESET_ROLLBACK/);
  }
  await rejectUnchanged(owner,{...initial,[key]:review(['a'],marker('02',1))},/GENERATION_MISMATCH/);
});

test('prototype installation itself is transactional and rollback removes only its new objects', async () => {
  const transientOwner = randomUUID();
  const isolated = await createFixture({[transientOwner]:initial});
  try {
    const access = await accessSnapshot(isolated);
    await isolated.exec('begin'); await isolated.exec(prototypeSql); await isolated.exec('rollback');
    assert.equal((await isolated.query<{ n: number }>("select count(*)::integer n from pg_trigger where tgname='yeoni_japanese_chunk_guard_prototype'")).rows[0].n,0);
    assert.equal((await isolated.query<{ n: number }>("select count(*)::integer n from pg_proc where proname='yeoni_japanese_chunk_guard_prototype'")).rows[0].n,0);
    assert.deepEqual(await accessSnapshot(isolated),access);
    assert.deepEqual(await readState(isolated,transientOwner),initial);
  } finally {await isolated.close();}
});
