import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { RouteDrain } from './e2e/route-drain.ts';
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const previous = 'supabase/migrations/20260915034857_assistant_task_command_history.sql';
const level = 'supabase/migrations/20261108040658_add_japanese_level_reset_key.sql';
const chunk = 'supabase/migrations/20261108132759_add_japanese_chunk_review_reset_key.sql';
const body = (sql: string) => sql.slice(sql.indexOf('create or replace function public.reset_my_app_records')).split('$$;')[0] + '$$;';

test('disposable stack appends both current reset migrations after existing schema and ACL, before startup', () => {
  const launcher = read('scripts/e2e-stack.mjs');
  const append = (path: string) => launcher.indexOf("appendFileSync(`${workdir}/supabase/seed.sql`, '\\n' + readFileSync('" + path + "', 'utf8'));");
  assert.ok(append(previous) >= 0);
  assert.ok(append(level) > append(previous));
  assert.ok(append(chunk) > append(level));
  assert.ok(launcher.indexOf("run('start', '--exclude'") > append(chunk));
  assert.match(launcher, /process\.env\.GITHUB_ACTIONS !== 'true' \|\| !process\.env\.RUNNER_TEMP/);
  assert.match(launcher, /status\.API_URL !== 'http:\/\/127\.0\.0\.1:54321'/);
});

test('new reset seed functions add only language keys and preserve existing schema dependencies and ACL', () => {
  const oldSql = read(previous), levelSql = read(level), chunkSql = read(chunk);
  assert.equal(body(levelSql).replace(",'japaneseLevelJourneyV1'", ''), body(oldSql));
  assert.equal(body(chunkSql).replace(",'japaneseChunkReviewV1'", ''), body(levelSql));
  for (const sql of [levelSql, chunkSql]) {
    assert.doesNotMatch(sql, /^(grant|revoke|alter|drop|delete|update|create table) /im);
    assert.match(sql, /returns jsonb language plpgsql security invoker set search_path = ''/);
  }
  assert.match(oldSql, /revoke all on function public\.reset_my_app_records\(text, uuid, text\) from public, anon;/);
  assert.match(oldSql, /grant execute on function public\.reset_my_app_records\(text, uuid, text\) to authenticated;/);
  const schema = read('tests/e2e/schema.sql');
  assert.match(schema, /create table public\.language_user_state/);
  assert.match(schema, /alter table public\.language_user_state enable row level security/);
});

test('real Japanese reset regression is included in small WebKit coverage', () => {
  const config = read('playwright.config.ts');
  const webkit = config.slice(config.indexOf("name: 'webkit-small'"));
  assert.match(webkit, /testMatch: \[[^\]]*'\*\*\/language-reset\.spec\.ts'/);
  assert.match(webkit, /testMatch: \[[^\]]*'\*\*\/language-sync\.spec\.ts'/);
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
test('failed reset test cleanup drains real RouteDrain before removing interception and cannot rearm read failure', async () => {
  const routes = new RouteDrain(), fetch = deferred(), fulfill = deferred();
  let tearingDown = false, failReads = false, detached = false;
  const callback = routes.run(async () => {
    await fetch.promise;
    if (!tearingDown) failReads = true;
    await fulfill.promise;
    throw new Error('synthetic route failure');
  });
  const rejected = assert.rejects(callback, /synthetic route failure/);
  const failedTest = (async () => {
    try { throw new Error('synthetic test timeout'); }
    finally { tearingDown = true; failReads = false; await routes.wait(); detached = true; }
  })();
  const testRejected = assert.rejects(failedTest, /synthetic test timeout/);
  assert.equal(detached, false);
  fetch.resolve(); await Promise.resolve();
  assert.equal(failReads, false); assert.equal(detached, false);
  fulfill.resolve(); await rejected; await testRejected;
  assert.equal(detached, true); assert.equal(failReads, false);
});
test('actual reset spec wires its RPC callback through RouteDrain with failure cleanup before returning', () => {
  const source = read('tests/e2e/language-reset.spec.ts');
  assert.match(source, /import \{ RouteDrain \} from '\.\/route-drain'/);
  assert.match(source, /context\.route\(rpcUrl, route => rpcRoutes\.run\(async \(\) =>/);
  assert.match(source, /calls\.length === 1 && !tearingDown/);
  assert.match(source, /finally \{[\s\S]*tearingDown = true;\s*qa\.traffic\.failReads = false;\s*await rpcRoutes\.wait\(\);\s*await context\.unroute\(rpcUrl\);/);
});
