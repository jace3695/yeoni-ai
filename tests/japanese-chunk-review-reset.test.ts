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
