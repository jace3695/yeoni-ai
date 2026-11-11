// Synthetic processes, reports and collection only. No browser, Auth or DB starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inventory, browserCommand, stages, totalTimeoutMs } from './plan.mjs';
import { supervise } from './supervisor.mjs';
import { runStages } from '../qa-private-orchestrator.mjs';
import { PrivateDiagnostics, diagnosticInvocations, parseDiagnosticJournal, readDiagnosticJournal } from '../qa-private-diagnostics.mjs';
import { guardEnvironment, childEnvironment, RUNNER_TEMP, STACK_ORIGIN } from '../isolated-auth-api/boundary.mjs';
import { sources } from '../qa-private-source-ids.mjs';

const token = 'a'.repeat(64), stale = 'b'.repeat(64);
const canary = 'SYNTHETIC_PRIVATE_eyJtoken.sb_secret_FAKE.https://private.invalid/session?secret=CANARY\r\n::error::PRIVATE';
const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.synthetic`;
const environment = () => ({ PATH: process.env.PATH, GITHUB_ACTIONS: 'true', RUNNER_TEMP, YEONI_E2E: '1',
  GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/agent/yeoni-japanese-ci-20261110',
  NEXT_PUBLIC_SUPABASE_URL: STACK_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), CI: 'true' });
const journal = events => events.map(event => JSON.stringify({ token, ...event }) + '\n').join('');
const events = (items = inventory, status = 'passed') => [
  { event: 'start' }, ...items.flatMap((item, index) => [
    { event: 'begin', test: index + 1, ...item }, { event: 'result', test: index + 1, status },
  ]), { event: 'end', status: 'passed' },
];
const parse = entries => parseDiagnosticJournal(journal(entries), token, 1, inventory);
const privateOutput = output => {
  const text = output.join('\n');
  for (const secret of ['PRIVATE', 'eyJ', 'sb_secret', 'https:', '::error::', token, stale]) assert.ok(!text.includes(secret));
  assert.match(text, /^[a-zA-Z0-9 =\-\n]*$/);
};
const fresh = async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-smoke-synthetic-')), output = [];
  return { root, cwd: root, runnerTemp: root, env: { PATH: process.env.PATH }, output, emit: line => output.push(line) };
};

// These hashes freeze the reused test bodies and guards without copying fixture values.
const preserved = {
  "playwright.config.ts": "3ce090d0a97f0632ded5aa75e8b041d7ca0c46b803a82281cb1271d4e9997e0f",
  "scripts/qa-playwright.mjs": "38e8cc6623aaaa343e9f15e9e69930c17ed7ebb20199acf9aed8067c41be4d6c",
  "tests/e2e/fixture.ts": "38c7ce2ce86dc009380336665a7afcde98271f8e45f93bc6d0cdfcdd02f448ec",
  "tests/e2e/route-drain.ts": "f3044b0c5a85053ec0056abf38dcfb75d815ff87bc419e2ae23a65c713cbf59c",
  "tests/e2e/reporter.ts": "6b5b2ec8ac81ad76f3babd0f26c715a9efa498970352cd1f6fc06be7e54a992e",
  "tests/e2e/auth.spec.ts": "496b7c23eafea848cbc638226f881f5a3107bc1f912fabc5ff13a8c51ae16c56",
  "tests/e2e/sync.spec.ts": "67596bc7db4cb04c834942e6642790e2fd1ae25540da61eb3095b6095959aedd",
  "tests/e2e/language-sync.spec.ts": "102ed75da283dcbd0b054b08ec14a11745b2b18eb5adeb83c565662b681e46eb",
  "tests/e2e/language-reset.spec.ts": "5e3727a730de4b44a84f80415b06a910f2bed81d152abd79b158983815fb2d4c",
  "tests/e2e/schema.sql": "4842f96fa1d606441538121152ddea3961fe7c01cabb09f20bcb7f59d064f632",
  "package.json": "6a107a1c2ef48d4914b508eb6cf7c0d884be0c5f7d7d412e659e818da8d6e459",
  "package-lock.json": "3de000f2da9993ce5dc5c1fb717afc0b5af8241ac96851c3da4d330e6f4786a6",
  "scripts/qa-private-source-ids.mjs": "3bcbdfc3380502191879a5fe46a462fb8f4b75ec62fa4d53c85fdf3285b9485f",
  "scripts/e2e-stack.mjs": "d7fc44ec6775a1924bdeada67f50faeaff50a67d5968da8c2719e6abd95b8966",
  "scripts/isolated-auth-api/boundary.mjs": "6a364bf60162b0ca81890d6cd631315d955008dc7ccc5dca48a9d2a68e178763"
};
const answerTestHash = '5e116c59e171b352a52c9c5297818b9080388bfda2706f9d9ccd3a31a6e10a93';
const reviewTestHash = 'd8e4e91ba78a95f26e4576f1f500f3d21097550298f7268993fc323a87b05eba';
const workflowHash = 'c65190845968db7077198840dbdeb9d9a42ae4e57038f1dcfbcdcbc3bd0e5bf6';

test('exact command, fixed project/source inventory, installer and ceilings stay narrow', async () => {
  assert.equal(browserCommand, 'node node_modules/@playwright/test/cli.js test tests/e2e/auth.spec.ts:3 tests/e2e/sync.spec.ts:3 tests/e2e/language-sync.spec.ts:8 tests/e2e/language-reset.spec.ts:39 tests/e2e/japanese-answer-persistence.spec.ts:8 tests/e2e/daily-review-completion.spec.ts:3 tests/e2e/language-reset-receipts.spec.ts:9 --config playwright.chromium-smoke.config.ts --project chromium-app-smoke');
  assert.deepEqual(inventory, [{ source: 19, line: 3, column: 5, project: 5 }, { source: 38, line: 3, column: 5, project: 5 },
    { source: 33, line: 8, column: 5, project: 5 }, { source: 32, line: 39, column: 5, project: 5 }, { source: 46, line: 8, column: 5, project: 5 }, { source: 47, line: 3, column: 5, project: 5 }, { source: 48, line: 9, column: 5, project: 5 }]);
  assert.deepEqual(inventory.map(item => sources[item.source - 1]), ['tests/e2e/auth.spec.ts', 'tests/e2e/sync.spec.ts', 'tests/e2e/language-sync.spec.ts', 'tests/e2e/language-reset.spec.ts', 'tests/e2e/japanese-answer-persistence.spec.ts', 'tests/e2e/daily-review-completion.spec.ts', 'tests/e2e/language-reset-receipts.spec.ts']);
  assert.equal(stages[0].command, 'node --test scripts/isolated-chromium-smoke/safety.test.mjs');
  assert.equal(stages[1].command, 'node node_modules/@playwright/test/cli.js install --with-deps --only-shell chromium');
  assert.equal(stages[2].command, browserCommand); assert.equal(stages[2].diagnosticInventory, inventory);
  assert.deepEqual(stages.map(stage => stage.timeoutMs), [60000, 240000, 465000]);
  assert.equal(totalTimeoutMs, 775000); assert.ok(totalTimeoutMs + 5000 <= 13 * 60000);
  assert.ok(stages.reduce((sum, stage) => sum + stage.timeoutMs, 0) + 3 * 5000 <= 13 * 60000);
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(lock.packages['node_modules/@playwright/test'].version, '1.63.0');
  assert.equal(lock.packages['node_modules/playwright'].version, '1.63.0');
  assert.equal(diagnosticInvocations(browserCommand), 1);
  for (const changed of [browserCommand.replace('tests/e2e/language-reset-receipts.spec.ts:9 ', ''), browserCommand.replace('tests/e2e/daily-review-completion.spec.ts:3 ', ''), browserCommand + ' --list', browserCommand + ' --grep .*', browserCommand.replace(':39', ':119'),
    browserCommand.replace('--project chromium-app-smoke', '--project chromium'), stages[1].command, 'echo ' + browserCommand]) {
    assert.equal(diagnosticInvocations(changed), 0);
  }
});

test('existing tests, fixtures, WebKit guards, dependencies, schema and stack are byte-preserved', async () => {
  for (const [path, hash] of Object.entries(preserved)) {
    let bytes = await readFile(path);
    if (path === 'scripts/qa-private-source-ids.mjs') {
      let text = bytes.toString('utf8');
      for (const addition of ["  'tests/e2e/japanese-answer-persistence.spec.ts', // 46\n", "  'tests/e2e/daily-review-completion.spec.ts', // 47\n", "  'tests/e2e/language-reset-receipts.spec.ts', // 48\n"]) {
        assert.equal(text.split(addition).length, 2); text = text.replace(addition, '');
      }
      bytes = Buffer.from(text);
    }
    if (path === 'scripts/e2e-stack.mjs') {
      const addition = "    appendFileSync(`${workdir}/supabase/seed.sql`, '\\n' + readFileSync('supabase/migrations/20261111000000_add_language_reset_replay_receipts.sql', 'utf8'));\n";
      const text = bytes.toString('utf8');
      assert.equal(text.split(addition).length, 2);
      bytes = Buffer.from(text.replace(addition, ''));
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `Preserved source changed: ${path}`);
  }
  const walk = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true }))
    .map(async item => item.isDirectory() ? walk(join(directory, item.name)) : [join(directory, item.name)]))).flat();
  const files = (await Promise.all(['app', 'lib', 'tests'].map(walk))).flat();
  assert.equal(files.filter(file => file.endsWith('.test.ts')).length, 344);
  const workflow = await readFile('.github/workflows/japanese-candidate-ci.yml', 'utf8');
  const addition = "      - name: Verify seven authenticated app flows in Chromium privately\n        if: matrix.compiler == 'default'\n        run: node scripts/isolated-chromium-smoke/supervisor.mjs\n";
  assert.equal(workflow.split(addition).length, 2);
  assert.equal(workflow.split('len(tests) == 344').length, 2);
  assert.equal(createHash('sha256').update(workflow.replace(addition, '').replace('len(tests) == 344', 'len(tests) == 343')).digest('hex'), workflowHash);
  assert.ok(workflow.indexOf('node scripts/isolated-auth-api/supervisor.mjs') < workflow.indexOf(addition));
  assert.ok(workflow.indexOf(addition) < workflow.indexOf('      - name: Remove disposable fixture\n        if: always()'));
});

test('standalone configuration rejects wrong Actions/ref/loopback context before runtime work', async () => {
  const config = resolve('playwright.chromium-smoke.config.ts');
  const source = `try { await import(${JSON.stringify('file://' + config)}); process.stdout.write('accepted'); } catch { process.stdout.write('rejected'); }`;
  for (const override of [{ CI: 'false' }, { GITHUB_ACTIONS: 'false' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REF: 'refs/heads/main' },
    { RUNNER_TEMP: '/tmp' }, { YEONI_E2E: '0' }, { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'invalid' }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: canary }, { VERCEL_ENV: 'production' }]) {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
      env: { ...environment(), ...override }, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
    });
    assert.equal(result.status, 0); assert.equal(result.stdout, 'rejected');
  }
  const result = spawnSync(process.execPath, [resolve('scripts/isolated-chromium-smoke/supervisor.mjs')], {
    env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1); assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'chromium-app-smoke failed browser=chromium realBrowser=unverified fixtureCleanup=unverified\n');
});

test('config contains only Chromium, strict deadlines, private media settings and real loopback Next start', () => {
  const source = `const {default: config} = await import(${JSON.stringify('file://' + resolve('playwright.chromium-smoke.config.ts'))}); process.stdout.write(JSON.stringify(config));`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
    env: environment(), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0); const config = JSON.parse(result.stdout);
  assert.deepEqual(config.projects, [{ name: 'chromium-app-smoke' }]);
  assert.deepEqual(config.testMatch, ['auth.spec.ts', 'sync.spec.ts', 'language-sync.spec.ts', 'language-reset.spec.ts', 'japanese-answer-persistence.spec.ts', 'daily-review-completion.spec.ts', 'language-reset-receipts.spec.ts']);
  assert.equal(config.fullyParallel, false); assert.equal(config.workers, 1); assert.equal(config.retries, 0);
  assert.equal(config.forbidOnly, true); assert.equal(config.repeatEach, 1); assert.equal(config.timeout, 90000);
  assert.equal(config.expect.timeout, 15000); assert.equal(config.use.browserName, 'chromium'); assert.equal(config.use.headless, true);
  assert.deepEqual(config.use.viewport, { width: 1280, height: 720 });
  assert.equal(config.use.actionTimeout, 15000); assert.equal(config.use.navigationTimeout, 30000);
  assert.equal(config.use.baseURL, 'http://127.0.0.1:3000'); assert.equal(config.use.locale, 'ko-KR');
  assert.equal(config.use.timezoneId, 'Asia/Seoul'); assert.equal(config.use.serviceWorkers, 'block');
  for (const setting of ['trace', 'screenshot', 'video']) assert.equal(config.use[setting], 'off');
  assert.deepEqual(config.reporter, [['./tests/e2e/reporter.ts']]);
  assert.deepEqual(config.webServer, { command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000/diet/settings', reuseExistingServer: false, timeout: 120000 });
});

test('Playwright list-only collection resolves exactly seven titles and coordinates without fixtures', () => {
  // --list does not start webServer, browsers, test bodies or fixture hooks.
  const args = browserCommand.split(' ').slice(1).concat(['--list', '--reporter=json']);
  const result = spawnSync(process.execPath, args, { env: environment(), encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0); const report = JSON.parse(result.stdout);
  assert.deepEqual(report.errors, []);
  const specs = suite => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specs)];
  const selected = report.suites.flatMap(specs);
  assert.equal(selected.length, 7);
  const expected = new Map([
    ['auth.spec.ts:3', 'login, logout and same-account relogin preserve all 17 original keys without PATCH'],
    ['sync.spec.ts:3', 'first GET delivery delayed while a real form saves: originals and new input survive'],
    ['language-sync.spec.ts:8', 'language settings save immediately, preserve an edit during PATCH, and survive relogin'],
    ['language-reset.spec.ts:39', 'Japanese reset uses the real settings UI, clears both new keys and preserves settings and another owner after reload and relogin'],
    ['japanese-answer-persistence.spec.ts:8', 'seven Japanese chunk answers persist through real preparation UI, reload and relogin without changing unrelated records'],
    ['daily-review-completion.spec.ts:3', 'three distinct reviews save one daily completion and hide the stale warning across reload and relogin'],
    ['language-reset-receipts.spec.ts:9', 'Japanese reset receipts survive genuine HTTP omission writes, concurrent retries and lost-response supersession with a new answer'],
  ]);
  for (const spec of selected) {
    const key = `${spec.file}:${spec.line}`;
    assert.equal(spec.title, expected.get(key)); assert.equal(spec.column, 5); expected.delete(key);
    assert.equal(spec.tests.length, 1); assert.equal(spec.tests[0].projectName, 'chromium-app-smoke');
    assert.equal(spec.tests[0].expectedStatus, 'passed'); assert.deepEqual(spec.tests[0].results, []);
  }
  assert.equal(expected.size, 0);
});

test('child allowlist excludes all command-file inputs, provider secrets, proxies and preload controls', () => {
  const env = childEnvironment({ ...environment(), GITHUB_ENV: canary, GITHUB_OUTPUT: canary, GITHUB_STATE: canary,
    GITHUB_STEP_SUMMARY: canary, GITHUB_PATH: canary, GITHUB_OTHER_FILE: canary, NODE_OPTIONS: canary, LD_PRELOAD: canary,
    HTTP_PROXY: canary, HTTPS_PROXY: canary, ALL_PROXY: canary, PLAYWRIGHT_DOWNLOAD_HOST: canary, PLAYWRIGHT_BROWSERS_PATH: canary,
    SUPABASE_SERVICE_ROLE_KEY: canary, OPENAI_API_KEY: canary, VERCEL_TOKEN: canary, QA_SOUP_LIBRARY: canary });
  assert.ok(!Object.values(env).includes(canary)); assert.equal(env.CI, 'true'); assert.equal(env.NODE_ENV, 'production');
  assert.doesNotThrow(() => guardEnvironment(env));
});

test('exact successful inventory is required in any order; zero, partial, skipped, wrong or duplicated tests fail', () => {
  for (const items of [inventory, [...inventory].reverse()]) assert.equal(parse(events(items)).report, 'complete');
  for (const entries of [events([]), ...inventory.map((_, omitted) => events(inventory.filter((_, index) => index !== omitted))), events(inventory, 'skipped'), events([...inventory, inventory[0]]),
    events([inventory[0], inventory[0], ...inventory.slice(2)]),
    events(inventory.map((item, index) => index ? item : { ...item, project: 1 })),
    events(inventory.map((item, index) => index ? item : { ...item, source: 0, line: 0, column: 0 })),
    events(inventory.map((item, index) => index ? item : { ...item, line: 15 })),
    events(inventory.map((item, index) => index ? item : { ...item, column: 2 })),
    events(inventory, 'failed'), events(inventory, 'unknown'), events(inventory, 'interrupted'), events(inventory, 'timedOut'),
    [...events().slice(0, -1), { event: 'error' }, { event: 'end', status: 'passed' }]]) assert.equal(parse(entries).report, 'invalid');
  assert.equal(parse(events().slice(0, -1)).report, 'incomplete');
  assert.equal(parse(events().slice(0, -2)).report, 'incomplete');
});

test('reports reject stale/missing tokens, malformed schema, injection, oversized bytes and invalid inventory', () => {
  for (const text of [journal(events()).replaceAll(token, stale), journal(events()).slice(0, -1), '{\n', 'null\n',
    journal(events()) + canary, journal(events()).replace('"source":19', `"source":${JSON.stringify(canary)}`),
    journal(events()).replace('"event":"start"', `"event":"start","title":${JSON.stringify(canary)}`), 'x'.repeat(1024 * 1024 + 1)]) {
    assert.equal(parseDiagnosticJournal(text, token, 1, inventory).report, 'invalid');
  }
  assert.equal(parseDiagnosticJournal('', token, 1, inventory).report, 'missing');
  for (const invalid of ['', undefined, canary]) assert.equal(parseDiagnosticJournal(journal(events()), invalid, 1, inventory).report, 'invalid');
  for (const invalid of [[], {}, inventory.slice(0, 6), [...inventory, inventory[0]], inventory.map(() => inventory[0]),
    inventory.map(item => ({ ...item, extra: canary })), inventory.map(item => ({ ...item, project: 0 }))]) {
    assert.equal(parseDiagnosticJournal(journal(events()), token, 1, invalid).report, 'invalid');
  }
  assert.equal(parseDiagnosticJournal(journal(events()), token, 2, inventory).report, 'invalid');
});

test('private journal rejects symlinks, nonfiles, public modes, oversized and stale content', async () => {
  const { root } = await fresh(), path = join(root, 'journal');
  await writeFile(path, journal(events()), { mode: 0o600 });
  assert.equal((await readDiagnosticJournal(path, token, 1, inventory)).report, 'complete');
  await chmod(path, 0o644); assert.equal((await readDiagnosticJournal(path, token, 1, inventory)).report, 'invalid');
  await chmod(path, 0o600); await symlink(path, join(root, 'link'));
  assert.equal((await readDiagnosticJournal(join(root, 'link'), token, 1, inventory)).report, 'missing');
  assert.equal((await readDiagnosticJournal(root, token, 1, inventory)).report, 'invalid');
  assert.equal((await readDiagnosticJournal(join(root, 'missing'), token, 1, inventory)).report, 'missing');
  assert.equal((await readDiagnosticJournal(path, stale, 1, inventory)).report, 'invalid');
  await writeFile(path, 'x'.repeat(1024 * 1024 + 1)); assert.equal((await readDiagnosticJournal(path, token, 1, inventory)).report, 'invalid');
});

test('project ID 5 is appended while all four existing project IDs remain stable', async () => {
  const { root } = await fresh(), path = join(root, 'journal'); await writeFile(path, '', { mode: 0o600 });
  const diagnostic = new PrivateDiagnostics({ root, env: { QA_PRIVATE_DIAGNOSTIC_FILE: path, QA_PRIVATE_DIAGNOSTIC_TOKEN: token } });
  for (const name of ['chromium', 'webkit-small', 'auth-preservation', 'webkit-diagnostic-denial', 'chromium-app-smoke']) {
    diagnostic.onTestEnd({ location: { file: 'tests/e2e/auth.spec.ts', line: 3, column: 5 }, parent: { project: () => ({ name }) },
      get title() { throw new Error(canary); } }, { status: 'failed', get errors() { throw new Error(canary); } });
  }
  diagnostic.onEnd({ status: 'failed' });
  const report = await readDiagnosticJournal(path, token, 1); assert.equal(report.report, 'complete');
  assert.deepEqual(report.invocations[0].details.map(item => item.project), [1, 2, 3, 4, 5]);
});

async function synthetic(body) {
  const options = await fresh(); await mkdir(join(options.root, 'node_modules/@playwright/test'), { recursive: true });
  await writeFile(join(options.root, 'node_modules/@playwright/test/cli.js'), `
import { writeFileSync } from 'node:fs';
import { PrivateDiagnostics } from ${JSON.stringify(new URL('../qa-private-diagnostics.mjs', import.meta.url).href)};
const inventory = ${JSON.stringify(inventory)};
const sources = ${JSON.stringify(inventory.map(item => sources[item.source - 1]))};
const canary = ${JSON.stringify(canary)};
${body}
`);
  return options;
}
const successBody = `const reporter = new PrivateDiagnostics();
for (const [index, item] of inventory.entries()) reporter.onTestEnd({ location: { file: sources[index], line: item.line, column: item.column }, parent: { project: () => ({ name: 'chromium-app-smoke' }) } }, { status: 'passed' });
reporter.onEnd({ status: 'passed' });`;

test('private supervisor accepts exact synthetic report and never forwards hostile raw streams or command files', async () => {
  const options = await synthetic(`console.log(canary + 'x'.repeat(1024 * 1024)); console.error(canary);
for (const key of ['GITHUB_OUTPUT', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY', 'GITHUB_PATH']) writeFileSync(process.env[key], canary);
${successBody}`);
  assert.equal(await runStages([stages[2]], options), 0); privateOutput(options.output);
  const directory = (await readdir(options.root)).find(name => name.startsWith('private-verification-'));
  const local = join(options.root, directory, 'stage-03');
  assert.equal((await stat(join(options.root, directory))).mode & 0o777, 0o700);
  assert.equal((await stat(local)).mode & 0o777, 0o700);
  assert.equal((await stat(join(local, 'stdout'))).size, 1024 * 1024);
  for (const name of ['stdout', 'stderr', 'GITHUB_ENV', 'GITHUB_OUTPUT', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY', 'GITHUB_PATH', 'diagnostic.jsonl']) {
    assert.equal((await stat(join(local, name))).mode & 0o777, 0o600);
  }
  for (const name of ['stdout', 'stderr', 'GITHUB_OUTPUT', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY', 'GITHUB_PATH']) {
    assert.ok((await readFile(join(local, name), 'utf8')).includes('SYNTHETIC_PRIVATE'));
  }
});

test('exit zero never substitutes for exact evidence, and failed exit never becomes successful', async () => {
  for (const body of ['', 'const reporter = new PrivateDiagnostics(); reporter.onEnd({status:"passed"});',
    successBody.replaceAll("status: 'passed'", "status: 'skipped'"), successBody + '\nprocess.exitCode = 9;',
    successBody.replace('reporter.onEnd({ status: \'passed\' });', ''),
    `process.env.QA_PRIVATE_DIAGNOSTIC_TOKEN=${JSON.stringify(stale)}; ${successBody}`]) {
    const options = await synthetic(body); assert.equal(await runStages([stages[2]], options), 1); privateOutput(options.output);
    assert.equal(options.output.at(-1), 'stage-03 failed');
  }
});

test('deadline and cancellation remain failed, preserve cleanup, and never certify interrupted fixture teardown', async () => {
  for (const cancellation of [false, true]) {
    const options = await synthetic(`const reporter = new PrivateDiagnostics(); reporter.onTestBegin({location:{file:sources[0],line:3,column:5},parent:{project:()=>({name:'chromium-app-smoke'})}}); setInterval(()=>{},10000);`);
    const controller = new AbortController();
    const timer = cancellation ? setTimeout(() => controller.abort(), 200) : undefined;
    try {
      assert.equal(await runStages([stages[2], { id: 'stage-04', command: 'touch cleaned', cleanup: true }], {
        ...options, signal: controller.signal, timeoutMs: cancellation ? 5000 : 200,
      }), 1);
    } finally { clearTimeout(timer); }
    await readFile(join(options.root, 'cleaned')); privateOutput(options.output);
    assert.ok(options.output.some(line => line.includes(`termination=${cancellation ? 'cancelled' : 'timeout'}`)));
    assert.ok(!options.output.includes('stage-03 passed'));
  }
  const options = await fresh();
  assert.equal(await runStages([{ id: 'stage-01', command: 'exit 1' }, { id: 'stage-02', command: 'exit 9', cleanup: true }], options), 1);
  assert.deepEqual(options.output, ['stage-01 failed', 'stage-02 failed']);
});

test('three-stage sequencing propagates safety/install/browser failures, cancellation and exact timeout settings', async () => {
  for (const failure of [-1, 0, 1, 2]) {
    const options = await fresh(), calls = [];
    const code = await supervise({ ...options, run: async (items, config) => {
      const stage = items[0]; calls.push(stage.id); assert.equal(config.timeoutMs, stage.timeoutMs);
      return calls.length - 1 === failure ? 1 : 0;
    } });
    assert.equal(code, failure < 0 ? 0 : 1); assert.equal(calls.length, failure < 0 ? 3 : failure + 1);
    privateOutput(options.output);
    assert.equal(options.output.at(-1).includes('realBrowser=true'), failure < 0);
    if (failure < 0) assert.equal(options.output.at(-1), 'chromium-app-smoke passed tests=7 browser=chromium realBrowser=true fixtureCleanup=passed');
  }
  const options = await fresh(), controller = new AbortController(); controller.abort();
  assert.equal(await supervise({ ...options, signal: controller.signal, run: () => { throw new Error(canary); } }), 1);
  assert.deepEqual(options.output.slice(0, 3), ['stage-01 not-run', 'stage-02 not-run', 'stage-03 not-run']);
  const deadline = await fresh(); let calls = 0;
  assert.equal(await supervise({ ...deadline, deadlineMs: 20, run: (_stages, options) => new Promise(resolve => {
    calls++; options.signal.addEventListener('abort', () => resolve(0), { once: true });
  }) }), 1);
  assert.equal(calls, 1); privateOutput(deadline.output);
});


test('an inventory without exactly one recognized invocation rejects before spawning any child', async () => {
  for (const command of ['touch should-not-run', `${browserCommand}\n${browserCommand}`]) {
    const options = await synthetic(`writeFileSync('should-not-run', 'unexpected'); ${successBody}`);
    assert.equal(await runStages([{ id: 'stage-03', command, diagnosticInventory: inventory }], options), 1);
    await assert.rejects(readFile(join(options.root, 'should-not-run')));
    assert.deepEqual(options.output, ['stage-03 failed']); privateOutput(options.output);
  }
});


test('fifth test retains real UI answer, database confirmation and read-only restoration assertions', async () => {
  const source = await readFile('tests/e2e/japanese-answer-persistence.spec.ts', 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), answerTestHash);
  for (const required of ["getChunkLesson('upper-01')", 'question.choices[question.answer]', 'qa.traffic.assertLanguageConfirmed(current)',
    'page.reload()', "localStorage.getItem(key)", 'toBeNull()', 'canonical(unrelated)', 'beforeFitness', 'neededHelp: true', 'JAPANESE_COURSE_GAP_CHUNKS', 'toHaveLength(7)', 'lessons.entries()']) assert.ok(source.includes(required));
  for (const forbidden of ['localStorage.setItem', 'sessionStorage.setItem', 'addInitScript', 'page.route', 'route.fulfill', '.apiKey', 'speakJapanese', 'audio.play']) assert.ok(!source.includes(forbidden));
  assert.equal(source.match(/client\.from\('language_user_state'\)\.update/g)?.length, 1);
  assert.ok(source.indexOf(".update({ state: before })") < source.indexOf('await login('));
  assert.equal(source.match(/test\('/g)?.length, 1);
});


test('sixth test requires the real notice fix and three distinct saved reviews without seeding completion', async () => {
  const source = await readFile('tests/e2e/daily-review-completion.spec.ts', 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), reviewTestHash);
  for (const required of ["'/language/review'", 'savedWords: JSON.stringify(words)', 'word:', 'meaning:', 'example:',
    "name: '복습 완료됨'", 'notComplete(1)', 'notComplete(2)', "toHaveAttribute('aria-hidden', 'true')",
    "toHaveCSS('visibility', 'hidden')", 'toBeDisabled()', "completedIds: ['review']", 'completedCount: 1, totalCount: 5',
    'qa.traffic.assertLanguageConfirmed(saved)', 'page.reload()', 'canonical(before)', 'beforeFitness']) assert.ok(source.includes(required));
  for (const forbidden of ['localStorage.setItem', 'sessionStorage.setItem', 'addInitScript', 'page.route', 'route.fulfill', 'audio.play']) assert.ok(!source.includes(forbidden));
  assert.equal(source.match(/client\.from\('language_user_state'\)\.update/g)?.length, 1);
  assert.ok(source.indexOf('.update({ state: before })') < source.indexOf('await login('));
  assert.equal(source.match(/test\('/g)?.length, 1);
});
