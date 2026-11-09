import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const key = 'japaneseChunkReviewV1';
export const resetKey = 'languageRecordResetV1';
export const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
export const prototypeSql = read('../../../docs/japanese-chunk-server-guard/local-prototype.sql');
export type State = Record<string, unknown>;
export const event = (attemptId: string, changes: Record<string, unknown> = {}) => ({
  lessonId: 'synthetic.lesson', questionId: 'synthetic.question', attemptId,
  correct: false, neededHelp: false, mode: 'choice', answeredAt: '2026-11-01T01:02:03.000Z', ...changes,
});
export const review = (ids: string[] = [], generation: string | null = null) => JSON.stringify({
  version: 1, generation, events: Object.fromEntries(ids.map(id => [id, event(id)])),
});
export const marker = (day: string, id: number) => `2026-11-${day}T00:00:00.000000Z|00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;

/** Only ephemeral memory. No network, secrets, Supabase client, file-backed DB. */
export async function createFixture(seeds: Record<string, State>) {
  const db = new PGlite();
  // Baseline ACL/RLS mirrors the existing disposable e2e fixture. These are
  // fixture provisioning statements, never part of the protection prototype.
  await db.exec(`create role authenticated; create role anon; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_user',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  const baseline = read('../../e2e/schema.sql');
  await db.exec(baseline.slice(baseline.indexOf('create table public.language_user_state'), baseline.indexOf('create table public.budget_user_settings')));
  const reset = read('../../../supabase/migrations/20261108132759_add_japanese_chunk_review_reset_key.sql');
  await db.exec(reset);
  const oldReset = read('../../../supabase/migrations/20260906141943_add_app_record_resets.sql');
  await db.exec(oldReset.split('\n').filter(line => /^(revoke all|grant execute) on function public\.reset_my_app_records/.test(line)).join('\n'));
  for (const [id, state] of Object.entries(seeds)) {
    await db.query('insert into auth.users values ($1)', [id]);
    await db.query('insert into public.language_user_state(user_id,state) values ($1,$2)', [id, state]);
  }
  await db.exec("set yeoni.chunk_guard_fixture='synthetic-pglite-only'");
  return db;
}

export const accessSnapshot = async (db: PGlite) => ({
  relation: (await db.query("select relowner, relacl::text, relrowsecurity, relforcerowsecurity from pg_class where oid='public.language_user_state'::regclass")).rows,
  policies: (await db.query("select * from pg_policies where schemaname='public' and tablename='language_user_state' order by policyname")).rows,
  reset: (await db.query("select proowner, proacl::text, prosecdef, pg_get_functiondef(oid) as definition from pg_proc where oid='public.reset_my_app_records(text,uuid,text)'::regprocedure")).rows,
});
export const asUser = async (db: PGlite, owner: string) => {
  await db.exec('reset role');
  await db.query("select set_config('app.test_user',$1,false)", [owner]);
  await db.exec('set role authenticated');
};
export const readState = async (db: PGlite, owner: string) => (await db.query<{state: State}>('select state from public.language_user_state where user_id=$1', [owner])).rows[0]?.state;
export const writeState = async (db: PGlite, owner: string, state: State) => db.query('update public.language_user_state set state=$2,updated_at=clock_timestamp() where user_id=$1 returning state', [owner, state]);
