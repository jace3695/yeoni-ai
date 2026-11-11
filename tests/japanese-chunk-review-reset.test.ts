import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20261108132759_add_japanese_chunk_review_reset_key.sql');
const previous = read('../supabase/migrations/20261108040658_add_japanese_level_reset_key.sql');
const body = (sql: string) => sql.slice(sql.indexOf('create or replace function public.reset_my_app_records')).split('$$;')[0] + '$$;';

test('new reset migration changes only the new language key, preserving the latest reset behavior and permissions', () => {
  assert.equal(body(migration).replace(",'japaneseChunkReviewV1'", ''), body(previous));
  assert.doesNotMatch(migration, /^(grant|revoke|alter|drop|delete|update) /im);
});

test('synthetic DB reset includes chunk review records, preserves settings and other owners, and retry cannot erase new work', async () => {
  const db = new PGlite();
  const owner = randomUUID(), other = randomUUID(), resetId = randomUUID();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_user',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(read('./e2e/schema.sql'));
    await db.exec(read('../supabase/migrations/20260901125340_add_fitness_ai_review_history.sql'));
    await db.exec(read('../supabase/migrations/20260906141943_add_app_record_resets.sql'));
    await db.exec(read('../supabase/migrations/20260915034857_assistant_task_command_history.sql'));
    await db.exec(previous);
    await db.exec(`insert into auth.users values('${owner}'),('${other}');`);
    const original = { japaneseChunkReviewV1: '{"synthetic":"old"}', japaneseCurriculumProgressV1: '{"synthetic":"old"}', japaneseAppSettings: '{"volume":1}' };
    await db.query('insert into public.language_user_state(user_id,state) values($1,$3),($2,$3)', [owner, other, original]);
    const aclBefore = (await db.query('select proacl::text,prosecdef from pg_proc where oid=\'public.reset_my_app_records(text,uuid,text)\'::regprocedure')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select proacl::text,prosecdef from pg_proc where oid=\'public.reset_my_app_records(text,uuid,text)\'::regprocedure')).rows, aclBefore);
    assert.deepEqual((await db.query<{state: typeof original}>('select state from public.language_user_state where user_id=$1', [owner])).rows[0].state, original);
    await db.exec(`set app.test_user='${owner}'; set role authenticated;`);
    const readOwner = async () => (await db.query<{state: Record<string, string>}>('select state from public.language_user_state')).rows[0].state;
    await assert.rejects(db.query("select public.reset_my_app_records('language',$1,'wrong')", [resetId]), /Invalid reset confirmation/);
    assert.deepEqual(await readOwner(), original);
    await db.query("select public.reset_my_app_records('language',$1,'초기화')", [resetId]);
    const after = await readOwner();
    assert.equal(after.japaneseChunkReviewV1, undefined);
    assert.equal(after.japaneseCurriculumProgressV1, undefined);
    assert.equal(after.japaneseAppSettings, original.japaneseAppSettings);
    assert.match(after.languageRecordResetV1, new RegExp(resetId));
    await db.query('update public.language_user_state set state=state||$1::jsonb', [{ japaneseChunkReviewV1: '{"synthetic":"new"}' }]);
    await db.query("select public.reset_my_app_records('language',$1,'초기화')", [resetId]);
    assert.equal((await readOwner()).japaneseChunkReviewV1, '{"synthetic":"new"}');
    await db.exec('reset role');
    assert.deepEqual((await db.query<{state: typeof original}>('select state from public.language_user_state where user_id=$1', [other])).rows[0].state, original);
    await db.exec('set role anon');
    await assert.rejects(db.query("select public.reset_my_app_records('language',$1,'초기화')", [randomUUID()]), /permission denied/);
  } finally { await db.close(); }
});

// Receipt candidate tests intentionally run without the docs-only chunk guard.
// Existing historical-migration assertions above are preserved verbatim.
const receiptMigration = read('../supabase/migrations/20261111000000_add_language_reset_replay_receipts.sql');
type ResetRow = { state: Record<string, unknown>; receipts: Record<string, string>; updated_at: string };
type ResetReceipt = { app: string; user_id: string; marker: string };
const receiptAccess = async (db: PGlite) => ({
  tables: (await db.query("select relname,relowner,relacl::text,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows,
  policies: (await db.query("select * from pg_policies where schemaname='public' order by tablename,policyname")).rows,
  function: (await db.query("select proowner,proacl::text,prosecdef,proconfig,proargtypes::text,proargnames,prorettype,prokind,provolatile,proparallel from pg_proc where oid='public.reset_my_app_records(text,uuid,text)'::regprocedure")).rows,
});
const readResetRow = async (db: PGlite, owner: string) => (await db.query<ResetRow>(
  'select state,language_reset_receipts_v1 as receipts,updated_at::text from public.language_user_state where user_id=$1', [owner],
)).rows[0];
const setOwner = async (db: PGlite, owner: string) => {
  await db.exec('reset role');
  await db.query("select set_config('app.test_user',$1,false)", [owner]);
  await db.exec('set role authenticated');
};
const invokeReset = async (db: PGlite, request: string, app = 'language') => (await db.query<{ receipt: ResetReceipt }>(
  "select public.reset_my_app_records($1,$2,'초기화') as receipt", [app, request],
)).rows[0].receipt;

// Full disposable table fixture plus the reset's relevant command-history
// trigger. This executes SQL in memory, not Auth/PostgREST or a browser stack.
async function receiptFixture() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_user',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(read('./e2e/schema.sql'));
  for (const path of [
    '20260901125340_add_fitness_ai_review_history.sql', '20260906141943_add_app_record_resets.sql',
    '20260914113147_budget_category_history.sql', '20260915034857_assistant_task_command_history.sql',
    '20260916043619_assistant_language_commands.sql', '20260916045546_language_history_reset_triggers.sql',
  ]) await db.exec(read(`../supabase/migrations/${path}`));
  await db.exec(migration);
  return db;
}

test('receipt candidate preserves the entire record-key/delete case and all non-language paths', () => {
  const cases = (sql: string) => sql.slice(sql.indexOf('  case p_app'), sql.indexOf('  end case;') + '  end case;'.length);
  assert.equal(cases(receiptMigration), cases(migration));
  assert.doesNotMatch(receiptMigration, /^\s*(grant|revoke|create\s+policy|alter\s+(role|policy)|security\s+definer)\b/im);
  assert.match(receiptMigration, /returns jsonb language plpgsql security invoker set search_path = ''/);
  assert.match(receiptMigration, /pg_advisory_xact_lock\(hashtextextended\('app-record-reset:' \|\| owner_id::text, 0\)\)/);
  assert.match(receiptMigration, /select state, language_reset_receipts_v1 into current_state, reset_receipts\s+from public.language_user_state where user_id = owner_id for update/);
});

test('receipt candidate protects future resets in synthetic PostgreSQL without the optional guard', async (t) => {
  const db = await receiptFixture();
  const original = { savedWords: '["synthetic"]', japaneseChunkReviewV1: '{"synthetic":"old"}', japaneseAppSettings: '{"volume":1}' };
  const seed = async () => {
    const owner = randomUUID();
    await db.exec('reset role'); await db.query('insert into auth.users values($1)', [owner]);
    await db.query('insert into public.language_user_state(user_id,state) values($1,$2)', [owner, original]);
    await setOwner(db, owner); return owner;
  };
  const write = async (owner: string, state: Record<string, unknown>) => db.query('update public.language_user_state set state=$2,updated_at=clock_timestamp() where user_id=$1', [owner, state]);
  const rejectUnchanged = async (owner: string, request: string, error: RegExp) => {
    const before = await readResetRow(db, owner);
    await assert.rejects(invokeReset(db, request), error);
    assert.deepEqual(await readResetRow(db, owner), before);
  };
  try {
    const historicalOwner = await seed(), historicalRequest = randomUUID();
    const historicalReceipt = await invokeReset(db, historicalRequest);
    await write(historicalOwner, { japaneseAppSettings: 'historical', languageRecordResetV1: historicalReceipt.marker, savedWords: '["after-historical"]' });
    const unrecoverableOwner = await seed(), forgotten = randomUUID(), visible = randomUUID();
    await invokeReset(db, forgotten); const visibleReceipt = await invokeReset(db, visible);
    await write(unrecoverableOwner, { languageRecordResetV1: visibleReceipt.marker, savedWords: '["after-pre-upgrade-B"]' });
    await db.exec('reset role');
    const access = await receiptAccess(db);
    const beforeRows = (await db.query('select user_id,state,updated_at::text from public.language_user_state order by user_id')).rows;
    const oldDefinition = (await db.query("select pg_get_functiondef('public.reset_my_app_records(text,uuid,text)'::regprocedure) as source")).rows;

    await t.test('installation and rollback preserve data, table/function ownership, ACL, RLS, policies and signature', async () => {
      await db.exec('begin'); await db.exec(receiptMigration);
      assert.deepEqual(await receiptAccess(db), access);
      await db.exec('rollback');
      assert.deepEqual((await db.query("select pg_get_functiondef('public.reset_my_app_records(text,uuid,text)'::regprocedure) as source")).rows, oldDefinition);
      assert.equal((await db.query("select 1 from information_schema.columns where table_schema='public' and table_name='language_user_state' and column_name='language_reset_receipts_v1'")).rows.length, 0);
      await db.exec(receiptMigration);
      assert.deepEqual(await receiptAccess(db), access);
      assert.deepEqual((await db.query('select user_id,state,updated_at::text from public.language_user_state order by user_id')).rows, beforeRows);
      assert.deepEqual((await readResetRow(db, historicalOwner)).receipts, {});
      assert.equal((await db.query("select 1 from pg_trigger where tgname='yeoni_japanese_chunk_guard_prototype'")).rows.length, 0);
    });

    await t.test('A, B, new records, replay A rejects with no state, marker, receipt or timestamp mutation', async () => {
      const owner = await seed(), a = randomUUID(), b = randomUUID();
      const ra = await invokeReset(db, a), rb = await invokeReset(db, b);
      const state = { ...(await readResetRow(db, owner)).state, savedWords: '["after-B"]', japaneseChunkReviewV1: '{"synthetic":"after-B"}' };
      await write(owner, state);
      const before = await readResetRow(db, owner);
      await assert.rejects(invokeReset(db, a), (error: unknown) => {
        assert.equal((error as { code: string }).code, '22023');
        assert.equal((error as Error).message, 'YEONI_RESET_REQUEST_SUPERSEDED'); return true;
      });
      assert.deepEqual(await readResetRow(db, owner), before);
      assert.deepEqual(before.receipts, { [a]: ra.marker, [b]: rb.marker });
      assert.equal(before.state.languageRecordResetV1, rb.marker);
      assert.equal(Object.hasOwn(before.state, 'language_reset_receipts_v1'), false);
    });

    await t.test('latest retry and lost response return original marker while preserving new work exactly', async () => {
      const owner = await seed(), a = randomUUID();
      const first = await invokeReset(db, a); // Treat its response as lost to the client.
      await write(owner, { ...(await readResetRow(db, owner)).state, savedWords: '["new-work"]' });
      const before = await readResetRow(db, owner);
      assert.deepEqual(await invokeReset(db, a), first);
      assert.deepEqual(await invokeReset(db, a), first);
      assert.deepEqual(await readResetRow(db, owner), before);
      assert.equal(before.state.japaneseAppSettings, original.japaneseAppSettings);
    });

    await t.test('ordinary state-only UPDATE and UPSERT omit metadata and preserve exact state readback', async () => {
      const owner = await seed(), a = randomUUID(), b = randomUUID();
      await invokeReset(db, a); await invokeReset(db, b);
      const receipts = (await readResetRow(db, owner)).receipts;
      const state = { ...(await readResetRow(db, owner)).state, savedWords: '["state-update"]', japaneseAppSettings: 'updated' };
      await write(owner, state);
      assert.deepEqual((await readResetRow(db, owner)).state, state);
      assert.deepEqual((await readResetRow(db, owner)).receipts, receipts);
      const upserted = { ...state, savedWords: '["state-upsert"]' };
      await db.query('insert into public.language_user_state(user_id,state,updated_at) values($1,$2,clock_timestamp()) on conflict(user_id) do update set state=excluded.state,updated_at=excluded.updated_at', [owner, upserted]);
      assert.deepEqual((await readResetRow(db, owner)).state, upserted);
      assert.deepEqual((await readResetRow(db, owner)).receipts, receipts);
      await rejectUnchanged(owner, a, /YEONI_RESET_REQUEST_SUPERSEDED/);
    });

    await t.test('metadata survives legacy marker omission; recorded requests still fail closed', async () => {
      const owner = await seed(), a = randomUUID(); await invokeReset(db, a);
      await write(owner, { savedWords: '["legacy-without-marker"]' });
      await rejectUnchanged(owner, a, /YEONI_RESET_REQUEST_SUPERSEDED/);
      // This permits the legacy state write itself. It is not general old-client protection.
    });

    await t.test('current pre-upgrade marker seeds only metadata, with state, timestamp and command history unchanged', async () => {
      await setOwner(db, historicalOwner);
      await db.query("insert into public.assistant_language_command_history(user_id,id,routine_id,record_date,payload_hash,before_values,after_values) values($1,$2,'kana','2026-11-01','synthetic','{}','{}')", [historicalOwner, randomUUID()]);
      const before = await readResetRow(db, historicalOwner);
      const history = (await db.query('select * from public.assistant_language_command_history')).rows;
      assert.deepEqual(await invokeReset(db, historicalRequest), historicalReceipt);
      const after = await readResetRow(db, historicalOwner);
      assert.deepEqual(after.state, before.state); assert.equal(after.updated_at, before.updated_at);
      assert.deepEqual(after.receipts, { [historicalRequest]: historicalReceipt.marker });
      assert.deepEqual((await db.query('select * from public.assistant_language_command_history')).rows, history);
      await invokeReset(db, randomUUID());
      assert.equal((await db.query('select * from public.assistant_language_command_history')).rows.length, 0);
      await rejectUnchanged(historicalOwner, historicalRequest, /YEONI_RESET_REQUEST_SUPERSEDED/);
    });

    await t.test('new reset records both recoverable current historical marker and new receipt atomically', async () => {
      const owner = await seed(), oldId = randomUUID(), newId = randomUUID();
      const oldMarker = `2026-11-01T12:00:00.123Z|${oldId}`;
      await write(owner, { ...original, languageRecordResetV1: oldMarker });
      const next = await invokeReset(db, newId);
      assert.deepEqual((await readResetRow(db, owner)).receipts, { [oldId]: oldMarker, [newId]: next.marker });
      await rejectUnchanged(owner, oldId, /YEONI_RESET_REQUEST_SUPERSEDED/);
    });

    await t.test('unrecoverable historical negative control: pre-upgrade A overwritten by B is not reconstructed', async () => {
      await setOwner(db, unrecoverableOwner);
      assert.deepEqual((await readResetRow(db, unrecoverableOwner)).receipts, {});
      const replay = await invokeReset(db, forgotten);
      const after = await readResetRow(db, unrecoverableOwner);
      assert.equal(after.state.savedWords, undefined);
      assert.equal(after.state.languageRecordResetV1, replay.marker);
      assert.deepEqual(after.receipts, { [visible]: visibleReceipt.marker, [forgotten]: replay.marker });
      // Passing means the known historical gap is reproduced, NOT protected.
    });

    await t.test('reset and metadata roll back together, including triggered ledger deletes', async () => {
      const owner = await seed(), a = randomUUID();
      await db.query("insert into public.assistant_language_command_history(user_id,id,routine_id,record_date,payload_hash,before_values,after_values) values($1,$2,'kana','2026-11-01','synthetic','{}','{}')", [owner, randomUUID()]);
      const before = await readResetRow(db, owner), history = (await db.query('select * from public.assistant_language_command_history')).rows;
      await db.exec('begin'); await invokeReset(db, a); await db.exec('rollback');
      assert.deepEqual(await readResetRow(db, owner), before);
      assert.deepEqual((await db.query('select * from public.assistant_language_command_history')).rows, history);
      await db.exec('begin'); await invokeReset(db, a); await invokeReset(db, randomUUID());
      await assert.rejects(invokeReset(db, a), /YEONI_RESET_REQUEST_SUPERSEDED/);
      await db.exec('rollback'); assert.deepEqual(await readResetRow(db, owner), before);
      assert.deepEqual((await db.query('select * from public.assistant_language_command_history')).rows, history);
    });

    await t.test('malformed receipt values, keys, marker times and mismatched current evidence fail before deletion', async () => {
      const owner = await seed(), a = randomUUID(), b = randomUUID(), valid = `2026-11-01T00:00:00.000000Z|${a}`;
      for (const receipts of [{ bad: valid }, { [a]: null }, { [a]: 12 }, { [a]: {} }, { [a]: `${valid}|extra` }, { [b]: valid }, { [a]: `2026-02-30T00:00:00.000Z|${a}` }, { [a]: `2026-11-01T24:00:00.000Z|${a}` }]) {
        await db.query('update public.language_user_state set language_reset_receipts_v1=$2 where user_id=$1', [owner, receipts]);
        await rejectUnchanged(owner, randomUUID(), /YEONI_RESET_RECEIPTS_INVALID/);
      }
      for (const bad of [null, 4, [], 'invalid', `2026-02-30T00:00:00.000Z|${a}`, `${valid}|extra`]) {
        await db.query('update public.language_user_state set language_reset_receipts_v1=\'{}\',state=$2 where user_id=$1', [owner, { ...original, languageRecordResetV1: bad }]);
        await rejectUnchanged(owner, randomUUID(), /YEONI_RESET_RECEIPTS_INVALID/);
      }
      await db.query('update public.language_user_state set language_reset_receipts_v1=$2,state=$3 where user_id=$1', [owner, { [a]: valid }, { ...original, languageRecordResetV1: `2026-11-02T00:00:00.000Z|${a}` }]);
      await rejectUnchanged(owner, a, /YEONI_RESET_RECEIPTS_INVALID/);
      for (const bad of ['[]', 'null', '3', '"bad"']) {
        const before = await readResetRow(db, owner);
        await assert.rejects(db.query('update public.language_user_state set language_reset_receipts_v1=$2::jsonb where user_id=$1', [owner, bad]), /language_reset_receipts_v1_object/);
        assert.deepEqual(await readResetRow(db, owner), before);
      }
      await assert.rejects(db.query('update public.language_user_state set language_reset_receipts_v1=null where user_id=$1', [owner]), /not-null constraint/);
    });

    await t.test('same request UUID across two owners stays isolated; anon, missing auth and bad confirmation are rejected', async () => {
      const first = await seed(), request = randomUUID(); await invokeReset(db, request);
      const row = await readResetRow(db, first), second = await seed();
      const secondReceipt = await invokeReset(db, request);
      assert.equal(secondReceipt.user_id, second);
      assert.equal(await readResetRow(db, first), undefined);
      assert.equal((await db.query('update public.language_user_state set language_reset_receipts_v1=\'{}\' where user_id=$1 returning user_id', [first])).rows.length, 0);
      await assert.rejects(db.query('insert into public.language_user_state(user_id,state) values($1,\'{}\') on conflict(user_id) do update set state=excluded.state', [first]), /row-level security/);
      const before = await readResetRow(db, second);
      await assert.rejects(db.query("select public.reset_my_app_records('language',$1,'wrong')", [request]), /Invalid reset confirmation/);
      await assert.rejects(db.query("select public.reset_my_app_records('language',null,'초기화')"), /Invalid reset confirmation/);
      assert.deepEqual(await readResetRow(db, second), before);
      await setOwner(db, ''); await assert.rejects(invokeReset(db, request), /Authentication required/);
      await db.exec('reset role; set role anon');
      await assert.rejects(db.query('select language_reset_receipts_v1 from public.language_user_state'), /permission denied/);
      await assert.rejects(invokeReset(db, request), /permission denied/);
      await setOwner(db, first); assert.deepEqual(await readResetRow(db, first), row);
    });

    await t.test('non-language branches still clear their records, preserve settings, and retry without receipts', async () => {
      const owner = await seed();
      const state = { 'ai-fitness-weight-records': '[1]', 'ai-fitness-water-intake': '2', settings: 'kept' };
      await db.query('insert into public.user_app_state(user_id,state) values($1,$2)', [owner, state]);
      const language = await readResetRow(db, owner);
      const tableSeeds: [string, string][] = [
        ['fitness_ai_review_history', "(user_id,analysis_type,analysis_label,source) values($1,'latest','synthetic','local')"],
        ['growth_sessions', "(user_id,session_date,status) values($1,'2026-11-01','completed')"],
        ['growth_ai_reviews', "(user_id,period_start,period_end,source) values($1,'2026-11-01','2026-11-01','local')"],
        ['assistant_projects', "(user_id,name) values($1,'synthetic')"],
        ['assistant_items', "(user_id,title) values($1,'synthetic')"],
        ['assistant_memories', "(user_id,topic,content) values($1,'synthetic','synthetic')"],
        ['assistant_chat_messages', "(user_id,role,content) values($1,'user','synthetic')"],
        ['assistant_task_command_history', "(user_id,id,operation,item_id,payload_hash,after_record) values($1,gen_random_uuid(),'create',gen_random_uuid(),'synthetic','{}')"],
        ['budget_transactions', "(user_id,date,amount,place,category) values($1,'2026-11-01',1,'synthetic','synthetic')"],
        ['budget_income', "(user_id,date,amount,name) values($1,'2026-11-01',1,'synthetic')"],
        ['budget_savings', "(user_id,date,amount,goal_name) values($1,'2026-11-01',1,'synthetic')"],
        ['budget_category_changes', "(user_id,id,payload_hash,entry_count,category) values($1,gen_random_uuid(),'synthetic',1,'synthetic')"],
      ];
      for (const [table, insert] of tableSeeds) await db.query(`insert into public.${table}${insert}`, [owner]);
      for (const app of ['fitness', 'diet', 'growth', 'assistant', 'budget']) {
        const id = randomUUID(), receipt = await invokeReset(db, id, app);
        assert.equal(receipt.app, app);
        assert.equal(receipt.user_id, owner);
        const before = (await db.query('select state,updated_at::text from public.user_app_state')).rows;
        assert.deepEqual(await invokeReset(db, id, app), receipt);
        assert.deepEqual((await db.query('select state,updated_at::text from public.user_app_state')).rows, before);
      }
      const after = (await db.query<{state: Record<string, unknown>}>('select state from public.user_app_state')).rows[0].state;
      assert.equal(after['ai-fitness-weight-records'], undefined); assert.equal(after['ai-fitness-water-intake'], undefined);
      assert.equal(after.settings, 'kept'); assert.deepEqual(await readResetRow(db, owner), language);
      for (const [table] of tableSeeds) assert.equal((await db.query(`select 1 from public.${table} where user_id=$1`, [owner])).rows.length, 0, table);
    });

    await t.test('new owner row uses metadata default and no receipt pruning occurs across successive resets', async () => {
      const owner = randomUUID(); await db.exec('reset role'); await db.query('insert into auth.users values($1)', [owner]); await setOwner(db, owner);
      const receipts: Record<string, string> = {};
      for (let index = 0; index < 24; index++) { const request = randomUUID(); receipts[request] = (await invokeReset(db, request)).marker; }
      assert.deepEqual((await readResetRow(db, owner)).receipts, receipts);
      await rejectUnchanged(owner, Object.keys(receipts)[0], /YEONI_RESET_REQUEST_SUPERSEDED/);
    });
  } finally { await db.close(); }
});


test('optional compatibility only: receipt rejection also works with the unchanged docs-only guard installed locally', async () => {
  const db = await receiptFixture();
  try {
    await db.exec(receiptMigration);
    await db.exec("set yeoni.chunk_guard_fixture='synthetic-pglite-only'");
    await db.exec(read('../docs/japanese-chunk-server-guard/local-prototype.sql'));
    const owner = randomUUID(), a = randomUUID(), b = randomUUID();
    await db.query('insert into auth.users values($1)', [owner]); await setOwner(db, owner);
    await invokeReset(db, a); await db.query('select pg_sleep(0.003)');
    const rb = await invokeReset(db, b);
    const state = { languageRecordResetV1: rb.marker, savedWords: '["synthetic-new"]' };
    await db.query('update public.language_user_state set state=$2,updated_at=clock_timestamp() where user_id=$1', [owner, state]);
    const before = await readResetRow(db, owner);
    await assert.rejects(invokeReset(db, a), /YEONI_RESET_REQUEST_SUPERSEDED/);
    assert.deepEqual(await readResetRow(db, owner), before);
    assert.deepEqual(await invokeReset(db, b), rb);
    assert.deepEqual(await readResetRow(db, owner), before);
  } finally { await db.close(); }
});
