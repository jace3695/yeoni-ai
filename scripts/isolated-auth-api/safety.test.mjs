// Synthetic protocol/supervisor tests only. No Next server, real Auth or database is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { guardEnvironment, validateFixture, childEnvironment, createBoundaryFetch, loadContext, readPrivateFile, STACK_ORIGIN, RUNNER_TEMP } from './boundary.mjs';
import { createAdminAdapter, userTransport, assertRows, assertEmpty } from './adapters.mjs';
import { generateAccounts, runScenarios } from './scenarios.mjs';
import { emptyReport, parseReport, reportPassed } from './report.mjs';
import { supervise } from './supervisor.mjs';
import { boundedClose } from './runner.mjs';
const canary = 'SYNTHETIC_PRIVATE_CANARY';
const token = 'a'.repeat(64);
const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.synthetic`;
const fixture = { API_URL: STACK_ORIGIN, ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role') };
const goodEnv = () => ({ GITHUB_ACTIONS: 'true', RUNNER_TEMP, YEONI_E2E: '1', GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/agent/yeoni-japanese-ci-20261110', NEXT_PUBLIC_SUPABASE_URL: STACK_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: fixture.ANON_KEY });
const context = { url: STACK_ORIGIN, anon: fixture.ANON_KEY, service: fixture.SERVICE_ROLE_KEY };
const json = (body, status = 200, headers) => new Response(JSON.stringify(body), { status, headers });
const successReport = () => ({ ...emptyReport(), scenarios: Array(6).fill('passed'), created: 2, removed: 2, cleanupVerified: true });

test('guard accepts only exact disposable context and matching local anonymous key', () => {
  assert.doesNotThrow(() => validateFixture(goodEnv(), fixture));
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'false', RUNNER_TEMP: '/tmp', YEONI_E2E: '0',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role'), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixture.ANON_KEY, VERCEL_ENV: 'production' })) {
    let calls = 0;
    assert.throws(() => { validateFixture({ ...goodEnv(), [key]: value }, fixture); calls++; }); assert.equal(calls, 0);
  }
  for (const changed of [{ ...fixture, API_URL: 'https://invalid.example.test' }, { ...fixture, ANON_KEY: `${fixture.ANON_KEY}x` },
    { ...fixture, SERVICE_ROLE_KEY: fixture.ANON_KEY }]) assert.throws(() => validateFixture(goodEnv(), changed));
});
test('bad environment rejects before filesystem lookup or any real runtime side effect', async () => {
  await assert.rejects(loadContext({}, '/nonexistent/synthetic-location'));
  const result = spawnSync(process.execPath, [new URL('./supervisor.mjs', import.meta.url).pathname], {
    env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1); assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'isolated-auth-api failed\nisolated-auth-api browserRun=false\n');
});
test('child allowlist strips command files, credentials, preload hooks and proxies', () => {
  const env = childEnvironment({ ...goodEnv(), GITHUB_OUTPUT: canary, GITHUB_ENV: canary, GITHUB_PATH: canary,
    GITHUB_STATE: canary, GITHUB_STEP_SUMMARY: canary, GITHUB_SECRET_FILE: canary, NODE_OPTIONS: canary,
    SUPABASE_SERVICE_ROLE_KEY: canary, HTTP_PROXY: canary, HTTPS_PROXY: canary, CUSTOM_SECRET: canary });
  assert.ok(!Object.values(env).includes(canary)); assert.equal(env.NODE_ENV, 'production');
  assert.doesNotThrow(() => guardEnvironment(env));
});
test('private file reads reject symlinks, public modes, oversized files and FIFOs without blocking', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auth-api-read-test-')), path = join(dir, 'private');
  await writeFile(path, canary, { mode: 0o600 }); assert.ok((await readPrivateFile(path)).includes(canary));
  await symlink(path, join(dir, 'link')); await assert.rejects(readPrivateFile(join(dir, 'link')));
  await writeFile(join(dir, 'public'), canary, { mode: 0o644 }); await assert.rejects(readPrivateFile(join(dir, 'public')));
  await assert.rejects(readPrivateFile(path, 1)); await assert.rejects(readPrivateFile('/dev/null'));
  assert.equal(spawnSync('mkfifo', ['-m', '600', join(dir, 'fifo')]).status, 0);
  await assert.rejects(readPrivateFile(join(dir, 'fifo')));
});
test('origin, path, method and anonymous-key rejection occur before transport', async () => {
  let calls = 0;
  const request = createBoundaryFetch({ fetchImpl: async () => { calls++; return json({}); }, origins: new Set([STACK_ORIGIN, 'http://127.0.0.1:12345']) });
  for (const [url, method] of [['https://invalid.example.test/auth/v1/user', 'GET'], ['http://localhost:54321/auth/v1/user', 'GET'],
    ['http://127.0.0.1:54322/auth/v1/user', 'GET'], ['http://user:password@127.0.0.1:54321/auth/v1/user', 'GET'],
    [STACK_ORIGIN + '/functions/v1/paid', 'POST'], ['http://127.0.0.1:12345/api/ai', 'POST'],
    ['http://127.0.0.1:12345/api/transactions?redirect=1', 'GET'], [STACK_ORIGIN + '/auth/v1/user', 'PUT']]) {
    await assert.rejects(request(url, { method }));
  }
  const ordinary = userTransport(request, context.anon, context.service);
  await assert.rejects(ordinary(STACK_ORIGIN + '/auth/v1/user', { headers: { apikey: canary } }));
  await assert.rejects(ordinary(STACK_ORIGIN + '/auth/v1/user', { headers: { apikey: context.anon, Authorization: `Bearer ${context.service}` } }));
  assert.equal(calls, 0);
});
test('redirects, unexpected response origins, oversized bodies and request overflow fail closed', async () => {
  for (const response of [new Response(null, { status: 302 }), Object.defineProperty(json({}), 'redirected', { value: true }),
    Object.defineProperty(json({}), 'url', { value: 'https://invalid.example.test/' }), json('x'.repeat(1024 * 1024 + 1))]) {
    const request = createBoundaryFetch({ fetchImpl: async (_input, init) => { assert.equal(init.redirect, 'error'); return response; }, origins: new Set([STACK_ORIGIN]) });
    await assert.rejects(request(STACK_ORIGIN + '/auth/v1/user'));
  }
  let calls = 0;
  const request = createBoundaryFetch({ fetchImpl: async () => { calls++; return json({}); }, origins: new Set([STACK_ORIGIN]), maxRequests: 1 });
  await request(STACK_ORIGIN + '/auth/v1/user'); await assert.rejects(request(STACK_ORIGIN + '/auth/v1/user')); assert.equal(calls, 1);
});
test('transport and close deadlines terminate synthetic hangs', async () => {
  const request = createBoundaryFetch({ origins: new Set([STACK_ORIGIN]), timeoutMs: 20,
    fetchImpl: (_input, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('Timed out')), { once: true })) });
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(request(STACK_ORIGIN + '/auth/v1/user')); await assert.rejects(boundedClose(() => new Promise(() => {}), 20)); }
  finally { clearTimeout(keepAlive); }
});
test('raw admin adapter binds create to generated ID and scopes all cleanup operations', async () => {
  const accounts = generateAccounts(), [account] = accounts, calls = []; let present = true;
  const admin = createAdminAdapter(context, accounts, async (url, init) => {
    calls.push({ url: new URL(url), method: init.method });
    assert.equal(init.headers['X-Supabase-Api-Version'], '2024-01-01');
    if (init.method === 'POST') { const body = JSON.parse(init.body); assert.ok(body.id === account.id && body.email === account.email && body.password === account.password); }
    if (init.method === 'DELETE') { present = false; return json({}); }
    if (init.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
    return present ? json({ id: account.id, email: account.email, app_metadata: { isolated_auth_api: account.nonce } }) : json({ code: 'user_not_found' }, 404);
  });
  await admin.create(account); assert.equal(await admin.inspect(account), true); await admin.remove(account);
  assert.equal(await admin.inspect(account), false); await admin.verifyRows(account);
  assert.equal(calls.filter(c => c.method === 'HEAD').length, 3);
  assert.ok(calls.filter(c => c.method === 'HEAD').every(c => c.url.searchParams.get('user_id') === `eq.${account.id}`));
  const before = calls.length; await assert.rejects(admin.remove({ ...account })); assert.equal(calls.length, before);
});
test('raw admin mismatches and generic absence/errors cannot authorize deletion or cleanup success', async () => {
  const accounts = generateAccounts(), [account] = accounts;
  for (const response of [json({ id: accounts[1].id, email: account.email, app_metadata: { isolated_auth_api: account.nonce } }),
    json({ id: account.id, email: account.email, app_metadata: { isolated_auth_api: 'unrelated' } }),
    json({ code: 'other' }, 404), json({ code: 'user_not_found' }, 500)]) {
    let deletes = 0;
    const admin = createAdminAdapter(context, accounts, async (_url, init) => { if (init.method === 'DELETE') deletes++; return response; });
    await assert.rejects(admin.remove(account)); assert.equal(deletes, 0);
  }
  const admin = createAdminAdapter(context, accounts, async () => new Response(null, { status: 200, headers: { 'content-range': '*/1' } }));
  await assert.rejects(admin.verifyRows(account));
});
test('ownership assertions reject vacuous successes and response errors', () => {
  assert.throws(() => assertRows({ status: 200, data: [] }, 'owner', {}, '2001-01-02'));
  assert.throws(() => assertRows({ status: 200, data: [{ user_id: 'other', state: {}, updated_at: '2001-01-02' }] }, 'owner', {}, '2001-01-02'));
  assert.throws(() => assertEmpty({ status: 500, data: [] })); assert.throws(() => assertEmpty({ status: 200, data: null }));
});

function syntheticBackend(mode = '') {
  const accounts = generateAccounts(), users = new Map(), rows = new Map(), transactions = [], calls = { create: 0, login: 0, removed: 0, count: 0, signOut: 0 };
  const accountByToken = tokenValue => accounts.find(account => tokenValue === `synthetic-${account.id}`);
  const deps = { accounts, admin: {
    async create(account) { calls.create++; users.set(account.id, account); if ((mode === 'partial-create' || mode === 'uncertain-create') && calls.create === 2) { if (mode === 'partial-create') users.delete(account.id); throw new Error(canary); } },
    async inspect(account) { return users.has(account.id); },
    async remove(account) { if (mode === 'cleanup-failure' && account === accounts[0]) throw new Error(canary); users.delete(account.id); for (const key of rows.keys()) if (key.endsWith(account.id)) rows.delete(key); for (let i = transactions.length - 1; i >= 0; i--) if (transactions[i].user_id === account.id) transactions.splice(i, 1); calls.removed++; },
    async verifyRows(account) { calls.count++; assert.ok(![...rows.keys()].some(key => key.endsWith(account.id))); assert.ok(!transactions.some(row => row.user_id === account.id)); },
  }, newUser() {
    let current;
    return {
      async login(account) { calls.login++; current = account; if (mode === 'login-failure') throw new Error(canary); return `synthetic-${account.id}`; },
      async getUser() { return { id: current.id, email: current.email }; },
      async signOut() { calls.signOut++; current = null; },
      async state(method, table, owner, state, expectedTime, nextTime) {
        const key = `${table}:${owner}`, old = rows.get(key), own = current.id === owner;
        if (method === 'insert') {
          if (!own) return { status: mode === 'duplicate-not-rls' ? 409 : 403, error: { code: mode === 'duplicate-not-rls' ? '23505' : '42501' } };
          rows.set(key, { user_id: owner, state, updated_at: nextTime }); return { status: 201, data: [structuredClone(rows.get(key))] };
        }
        if (!own && mode === 'cross-update' && method === 'update') rows.set(key, { ...old, state });
        if (!own && mode === 'cross-delete' && method === 'delete') rows.delete(key);
        if (!own && !(mode === 'cross-read' && method === 'read')) return { status: 200, data: [] };
        if (method === 'update') { if (old?.updated_at !== expectedTime) return { status: 200, data: [] }; rows.set(key, { user_id: owner, state, updated_at: nextTime }); }
        if (method === 'delete') rows.delete(key);
        return { status: 200, data: rows.has(key) ? [structuredClone(rows.get(key))] : [] };
      },
    };
  }, async appRequest(method, accessToken, body) {
    const owner = accountByToken(accessToken); if (!owner) return { status: 401, body: {} };
    if (method === 'POST') {
      const row = { ...body, id: generateAccounts()[0].id, user_id: mode === 'forged-owner' && body.user_id ? body.user_id : owner.id };
      transactions.push(row); return { status: 200, body: { data: structuredClone(row) } };
    }
    if (method === 'DELETE') { if (mode === 'cross-transaction-delete') transactions.splice(0, 1); return { status: 200, body: { success: true } }; }
    return { status: 200, body: { data: structuredClone(transactions.filter(row => mode === 'cross-transaction-read' || row.user_id === owner.id)) } };
  } };
  return { deps, calls, users };
}
test('synthetic full protocol requires two accounts, fresh login, persistence, ownership and cleanup', async () => {
  const fake = syntheticBackend(), report = await runScenarios(fake.deps);
  assert.equal(reportPassed(report), true); assert.equal(fake.calls.create, 2); assert.equal(fake.calls.login, 3);
  assert.equal(fake.calls.removed, 2); assert.equal(fake.calls.count, 2); assert.equal(fake.calls.signOut, 3); assert.equal(fake.users.size, 0);
});
for (const mode of ['cross-read', 'cross-update', 'cross-delete', 'duplicate-not-rls', 'forged-owner', 'cross-transaction-read', 'cross-transaction-delete', 'login-failure']) {
  test(`synthetic protocol detects ${mode} and preserves failure after cleanup`, async () => {
    const fake = syntheticBackend(mode), report = await runScenarios(fake.deps);
    assert.equal(reportPassed(report), false); assert.ok(report.scenarios.includes('failed'));
    assert.equal(report.cleanupVerified, true); assert.equal(fake.users.size, 0);
  });
}
for (const mode of ['partial-create', 'uncertain-create']) {
  test(`synthetic ${mode} cleans only attempted generated accounts`, async () => {
    const fake = syntheticBackend(mode), report = await runScenarios(fake.deps);
    assert.equal(report.scenarios[0], 'failed'); assert.equal(report.cleanupVerified, true); assert.equal(fake.users.size, 0);
    assert.equal(report.created, mode === 'partial-create' ? 1 : 2); assert.equal(report.removed, report.created);
  });
}
test('cleanup failure is fatal and still attempts the other generated account', async () => {
  const fake = syntheticBackend('cleanup-failure'), report = await runScenarios(fake.deps);
  assert.equal(reportPassed(report), false); assert.equal(report.scenarios[5], 'failed'); assert.equal(report.cleanupVerified, false);
  assert.equal(fake.calls.removed, 1); assert.equal(fake.calls.count, 1);
});
test('server-close failure preserves failure while both generated accounts are cleaned', async () => {
  const fake = syntheticBackend();
  const report = await runScenarios({ ...fake.deps, beforeCleanup: () => boundedClose(() => new Promise(() => {}), 20) });
  assert.equal(reportPassed(report), false); assert.equal(report.scenarios[5], 'failed');
  assert.equal(fake.calls.removed, 2); assert.equal(fake.calls.count, 2); assert.equal(fake.users.size, 0);
});
test('mid-scenario cancellation retains cleanup for partial generated accounts', async () => {
  const fake = syntheticBackend(), controller = new AbortController();
  const create = fake.deps.admin.create;
  fake.deps.admin.create = async account => { await create(account); controller.abort(); throw new Error('Cancelled'); };
  const report = await runScenarios({ ...fake.deps, signal: controller.signal });
  assert.equal(report.scenarios[0], 'failed'); assert.equal(reportPassed(report), false);
  assert.equal(report.cleanupVerified, true); assert.equal(fake.calls.removed, 1); assert.equal(fake.users.size, 0);
});
test('cancellation skips scenario work while cleanup remains bounded and explicit', async () => {
  const fake = syntheticBackend(), controller = new AbortController(); controller.abort();
  const report = await runScenarios({ ...fake.deps, signal: controller.signal });
  assert.equal(reportPassed(report), false); assert.equal(fake.calls.create, 0); assert.equal(report.cleanupVerified, true);
});
test('report rejects hostile text, extra fields, unbounded counts, browser claims and false cleanup', () => {
  const good = { ...successReport(), token }; assert.equal(reportPassed(parseReport(JSON.stringify(good), token)), true);
  for (const bad of [{ ...good, token: canary }, { ...good, extra: canary }, { ...good, created: 10000 },
    { ...good, removed: -1 }, { ...good, scenarios: [canary] }, { ...good, browserRun: true }, { ...good, cleanupVerified: false },
    { ...good, created: 1, removed: 1 }]) assert.throws(() => parseReport(JSON.stringify(bad), token));
  assert.throws(() => parseReport(canary.repeat(1000), token));
});
async function supervisorFixture(runner, safety = '') {
  const directory = await mkdtemp(join(tmpdir(), 'auth-api-supervisor-test-'));
  await mkdir(join(directory, 'scripts/isolated-auth-api'), { recursive: true });
  await writeFile(join(directory, 'scripts/isolated-auth-api/safety.test.mjs'), safety);
  await writeFile(join(directory, 'scripts/isolated-auth-api/runner.mjs'), runner);
  const reportPath = join(directory, 'report.json'); await writeFile(reportPath, '', { mode: 0o600 });
  const output = []; const env = { PATH: process.env.PATH, ISOLATED_AUTH_API_REPORT: reportPath, ISOLATED_AUTH_API_TOKEN: token };
  return { cwd: directory, runnerTemp: directory, reportPath, token, env, emit: line => output.push(line), output };
}
test('supervisor captures hostile raw output and command files without forwarding canaries', async () => {
  const runner = `import {writeFileSync} from 'node:fs'; console.log('${canary}\\n::error::${canary}\\n::add-mask::${canary}'); console.error('${canary}'); process.stdout.write('x'.repeat(2*1024*1024)); for(const name of ['GITHUB_OUTPUT','GITHUB_STATE','GITHUB_STEP_SUMMARY','GITHUB_PATH'])writeFileSync(process.env[name],'${canary}'); writeFileSync(process.env.ISOLATED_AUTH_API_REPORT,JSON.stringify({...${JSON.stringify(successReport())},token:process.env.ISOLATED_AUTH_API_TOKEN}));`;
  const options = await supervisorFixture(runner); const outer = join(options.cwd, 'outer'); await writeFile(outer, 'unchanged'); options.env.GITHUB_OUTPUT = outer;
  assert.equal(await supervise(options), 0); assert.equal(await readFile(outer, 'utf8'), 'unchanged');
  assert.ok(!options.output.join('').includes(canary)); assert.ok(options.output.includes('isolated-auth-api browserRun=false'));
  const privateDirectory = (await readdir(options.cwd)).find(name => name.startsWith('private-verification-'));
  assert.equal((await readFile(join(options.cwd, privateDirectory, 'stage-02/stdout'))).length, 1024 * 1024);
});
test('supervisor preserves child failure despite a claimed success report', async () => {
  const options = await supervisorFixture(`import {writeFileSync} from 'node:fs';writeFileSync(process.env.ISOLATED_AUTH_API_REPORT,JSON.stringify({...${JSON.stringify(successReport())},token:process.env.ISOLATED_AUTH_API_TOKEN}));process.exitCode=9;`);
  assert.equal(await supervise(options), 1);
});
test('supervisor blocks real stage after safety failure and rejects missing or hostile reports', async () => {
  const options = await supervisorFixture(`throw new Error('${canary}');`, `throw new Error('${canary}');`);
  assert.equal(await supervise(options), 1); assert.ok(options.output.includes('stage-02 not-run')); assert.ok(!options.output.join('').includes(canary));
  const hostile = await supervisorFixture(`import {writeFileSync} from 'node:fs';writeFileSync(process.env.ISOLATED_AUTH_API_REPORT,'${canary}');`);
  assert.equal(await supervise(hostile), 1); assert.ok(!hostile.output.join('').includes(canary));
});
test('supervisor timeout cannot become success or expose raw output', async () => {
  const options = await supervisorFixture(`console.log('${canary}');setTimeout(()=>{},10000);`);
  assert.equal(await supervise({ ...options, timeoutMs: 300 }), 1); assert.ok(!options.output.join('').includes(canary));
});
test('workflow differs only by two default-only private steps and dependency pin remains unchanged', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/japanese-candidate-ci.yml', import.meta.url), 'utf8');
  const addition = "      - name: Verify disposable Auth and API persistence privately\n        if: matrix.compiler == 'default'\n        run: node scripts/isolated-auth-api/supervisor.mjs\n";
  const browserAddition = "      - name: Verify twenty authenticated app flows in PINNED PLAYWRIGHT CHROMIUM privately\n        if: matrix.compiler == 'default'\n        run: node scripts/isolated-chromium-smoke/supervisor.mjs\n";
  assert.equal(workflow.split(addition).length, 2);
  assert.equal(workflow.split(browserAddition).length, 2);
  assert.ok(workflow.indexOf(addition) < workflow.indexOf(browserAddition));
  assert.ok(workflow.indexOf(browserAddition) < workflow.indexOf('      - name: Remove disposable fixture\n        if: always()'));
  assert.equal(workflow.split('len(tests) == 349').length, 2);
  assert.equal(createHash('sha256').update(workflow.replace(addition, '').replace(browserAddition, '').replace('len(tests) == 349', 'len(tests) == 343')).digest('hex'), '241904839f93becc07d89ce3be920659f26f22be1840be4ac81abb2bbb914970');
  assert.ok(workflow.indexOf('node scripts/japanese-preview/http-check.mjs') < workflow.indexOf(addition));
  assert.ok(workflow.indexOf(addition) < workflow.indexOf('      - name: Remove disposable fixture\n        if: always()'));
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.devDependencies.supabase, '2.117.0');
});
