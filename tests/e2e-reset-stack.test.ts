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

test('receipt integration appends only the exact reviewed migration and preserves every earlier launcher byte', async () => {
  const { createHash } = await import('node:crypto');
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const receipt = 'supabase/migrations/20261111000000_add_language_reset_replay_receipts.sql';
  const exact = "    appendFileSync(`${workdir}/supabase/seed.sql`, '\\n' + readFileSync('" + receipt + "', 'utf8'));\n";
  const launcher = read('scripts/e2e-stack.mjs');
  assert.equal(launcher.split(exact).length, 2);
  assert.equal(sha(launcher.replace(exact, '')), 'd7fc44ec6775a1924bdeada67f50faeaff50a67d5968da8c2719e6abd95b8966');
  assert.ok(launcher.indexOf(exact) > launcher.indexOf(chunk));
  assert.ok(launcher.indexOf(exact) < launcher.indexOf("run('start', '--exclude'"));
  assert.equal(sha(read(receipt)), 'cb1b93c4679e8ccfe4784bcc0e0775df760ed99ba6bbbc0a174f6b201494e0a5');
  assert.doesNotMatch(launcher, /japanese-chunk-state-guard|readdirSync|migrations\/\*/);
});

test('receipt browser candidate uses genuine RPCs, independent contexts and drained cleanup without success fabrication', () => {
  const source = read('tests/e2e/language-reset-receipts.spec.ts');
  assert.match(source.split('\n')[8], /^test\('Japanese reset receipts survive genuine HTTP omission writes, concurrent retries and lost-response supersession with a new answer'/);
  assert.equal((source.match(/^test\(/gm) ?? []).length, 1);
  assert.match(source, /Promise\.all\(\[reset\(client, requestA\), reset\(client, requestA\)\]\)/);
  assert.match(source, /\['object-default', 'object-missing-default', 'array-default'\]/);
  assert.match(source, /defaultToNull: false/);
  assert.match(source, /calls\.length <= 2[\s\S]*route\.abort\('failed'\)/);
  assert.match(source, /route\.fetch\(\{ maxRetries: 0, timeout: 10_000 \}\)/);
  assert.match(source, /rejected\.status\)\.toBe\(400\)/);
  assert.match(source, /code: '22023', message: 'YEONI_RESET_REQUEST_SUPERSEDED'/);
  assert.match(source, /rejected\.request\)\.toEqual\(calls\[0\]\.request\)/);
  assert.match(source, /attempt < 2/);
  assert.ok(source.indexOf('await secondTraffic.install(second)') < source.indexOf('await second.newPage()'));
  assert.ok(source.indexOf('await second.newPage()') < source.indexOf("await login(pageB, qa.account, '/language/settings')"));
  assert.match(source, /secondTraffic\.assertLanguageConfirmed\(saved\.state\)/);
  assert.match(source, /review\.generation\)\.toBe\(markerB\)/);
  assert.match(source, /Object\.values\(parseChunkReview\(\(await qa\.readLanguage\(\)\)\[CHUNK_REVIEW_KEY\]\)/);
  assert.match(source, /audit\.lifecycle\)\.toEqual\(Array\.from\(\{ length: attempts \}, \(\) => \['running', ''\]\)\.flat\(\)\)/);
  assert.match(source, /return setItem\.call\(this, key, value\)/);
  assert.match(source, /qa\.traffic\.failReads = false; page\.off[\s\S]*await page\.reload\(\)/);
  assert.match(source, /finally \{[\s\S]*tearingDown = true;[\s\S]*qa\.traffic\.releaseAll\(\); secondTraffic\.releaseAll\(\);[\s\S]*Promise\.all\(\[rpcRoutes\.wait\(\), secondRoutes\.wait\(\), qa\.traffic\.drain\(\), secondTraffic\.drain\(\)\]\);[\s\S]*context\.unroute\(rpcUrl\);[\s\S]*second\.unrouteAll\(\{ behavior: 'wait' \}\); await second\.close\(\)/);
  assert.doesNotMatch(source, /test\.(?:skip|only|fixme)|setTimeout|waitForTimeout|setDefaultTimeout|setTimeout\(|test\.setTimeout|storageState|service_role|SERVICE_ROLE|\.rpc\([^\n]*,\s*\{[^\n]*p_owner/);
  assert.doesNotMatch(source, /route\.fulfill\(\{\s*(?:status|body)|removeEventListener\(['"]storage|addInitScript|console\.|attach\(|screenshot\(|tracing\./);
});

test('real installed SDK produces the four omission payload shapes expected by the receipt browser assertions', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sent: { method: string; body: unknown; prefer: string }[] = [];
  // Synthetic transport only. This does not prove PostgREST metadata retention.
  const client = createClient('http://127.0.0.1:54321', 'synthetic-no-access', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      sent.push({ method: request.method, body: JSON.parse(await request.text()), prefer: request.headers.get('prefer') ?? '' });
      return new Response(JSON.stringify({ state: { synthetic: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  const state = { synthetic: true }, user_id = '11111111-1111-4111-8111-111111111111';
  await client.from('language_user_state').update({ state }).eq('user_id', user_id).select('*').single();
  await client.from('language_user_state').upsert({ user_id, state }, { onConflict: 'user_id' }).select('*').single();
  await client.from('language_user_state').upsert({ user_id, state }, { onConflict: 'user_id', defaultToNull: false }).select('*').single();
  await client.from('language_user_state').upsert([{ user_id, state }], { onConflict: 'user_id' }).select('*').single();
  assert.deepEqual(sent.map(entry => entry.method), ['PATCH', 'POST', 'POST', 'POST']);
  assert.deepEqual(sent.map(entry => entry.body), [{ state }, { user_id, state }, { user_id, state }, [{ user_id, state }]]);
  assert.deepEqual(sent.map(entry => entry.prefer.includes('missing=default')), [false, false, true, false]);
  for (const entry of sent) {
    assert.ok(entry.prefer.includes('return=representation'));
    if (entry.method === 'POST') assert.ok(entry.prefer.includes('resolution=merge-duplicates'));
    assert.ok(!JSON.stringify(entry.body).includes('language_reset_receipts_v1'));
  }
});
