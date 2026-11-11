import '../qa-private-lifecycle.test.mjs';
import './system-chrome-readiness.test.mjs';
// Synthetic processes, reports and collection only. No browser, Auth or DB starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inventory, browserCommand, stages, totalTimeoutMs } from './plan.mjs';
import { supervise } from './supervisor.mjs';
import { runStages } from '../qa-private-orchestrator.mjs';
import { PrivateDiagnostics, diagnosticInvocations, parseDiagnosticJournal, readDiagnosticJournal, emitDiagnosticJournal } from '../qa-private-diagnostics.mjs';
import { guardEnvironment, childEnvironment, RUNNER_TEMP, STACK_ORIGIN } from '../isolated-auth-api/boundary.mjs';
import { sources } from '../qa-private-source-ids.mjs';

const token = 'a'.repeat(64), stale = 'b'.repeat(64);
const canary = 'SYNTHETIC_PRIVATE_eyJtoken.sb_secret_FAKE.https://private.invalid/session?secret=CANARY\r\n::error::PRIVATE';
const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.synthetic`;
const environment = () => ({ PATH: process.env.PATH, GITHUB_ACTIONS: 'true', RUNNER_TEMP, YEONI_E2E: '1',
  GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/agent/yeoni-japanese-ci-20261110',
  NEXT_PUBLIC_SUPABASE_URL: STACK_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), CI: 'true', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
  RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'ubuntu24', ImageVersion: '20261101.360.1',
  GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com' });
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
const receiptTestHash = 'ced11900b839f50e01afc4f51e5992d25ab5849fb7fa633a55bda01d6259b8f2';
const readingHashes = {
  "tests/e2e/japanese-reading-flow.ts": "ad7899a23d6d818be0c739e9848a5a3fbce37e0d3f5643c9ee64ad86701f9bc3",
  "tests/e2e/japanese-middle-reading.spec.ts": "0d69eeb78446e64c92ac37f4bfa2acf3c683066e61e13ac1b4c9380faf7ca22a",
  "tests/e2e/japanese-upper-reading.spec.ts": "c7a6234b96690727fa083e7d9f819fc0076ae39c4d51329637121b44af28229f"
};
const levelFlowHashes = {
  "tests/e2e/japanese-level-flow-state.ts": "b2bc9bff77c248bb46be6c0481335a89861818bb9b83b2c02ef50deec2e67c3c",
  "tests/e2e/japanese-level-choice.spec.ts": "5049de6219c95026284430dc845f3fd9b759262aea648cbb1bc98e5efc000d6f",
  "tests/e2e/japanese-due-review.spec.ts": "a6eb4d8782137152668bb11ccd8a8c24588440e424a19758cbca8b83d4232c38"
};
const workflowHash = 'c65190845968db7077198840dbdeb9d9a42ae4e57038f1dcfbcdcbc3bd0e5bf6';

test('exact command, fixed project/source inventory, readiness and ceilings stay narrow', async () => {
  assert.equal(browserCommand, 'node node_modules/@playwright/test/cli.js test tests/e2e/auth.spec.ts:3 tests/e2e/sync.spec.ts:3 tests/e2e/language-sync.spec.ts:8 tests/e2e/language-reset.spec.ts:39 tests/e2e/japanese-answer-persistence.spec.ts:8 tests/e2e/daily-review-completion.spec.ts:3 tests/e2e/language-reset-receipts.spec.ts:9 tests/e2e/japanese-middle-reading.spec.ts:3 tests/e2e/japanese-upper-reading.spec.ts:3 tests/e2e/japanese-level-choice.spec.ts:3 tests/e2e/japanese-due-review.spec.ts:3 tests/e2e/curriculum-corruption.spec.ts:3 tests/e2e/curriculum-terminal.spec.ts:3 --config playwright.chromium-smoke.config.ts --project chromium-app-smoke');
  assert.deepEqual(inventory, [{ source: 19, line: 3, column: 5, project: 5 }, { source: 38, line: 3, column: 5, project: 5 },
    { source: 33, line: 8, column: 5, project: 5 }, { source: 32, line: 39, column: 5, project: 5 }, { source: 46, line: 8, column: 5, project: 5 }, { source: 47, line: 3, column: 5, project: 5 }, { source: 48, line: 9, column: 5, project: 5 }, { source: 49, line: 3, column: 5, project: 5 }, { source: 50, line: 3, column: 5, project: 5 }, { source: 51, line: 3, column: 5, project: 5 }, { source: 52, line: 3, column: 5, project: 5 }, { source: 53, line: 3, column: 5, project: 5 }, { source: 54, line: 3, column: 5, project: 5 }]);
  assert.deepEqual(inventory.map(item => sources[item.source - 1]), ['tests/e2e/auth.spec.ts', 'tests/e2e/sync.spec.ts', 'tests/e2e/language-sync.spec.ts', 'tests/e2e/language-reset.spec.ts', 'tests/e2e/japanese-answer-persistence.spec.ts', 'tests/e2e/daily-review-completion.spec.ts', 'tests/e2e/language-reset-receipts.spec.ts', 'tests/e2e/japanese-middle-reading.spec.ts', 'tests/e2e/japanese-upper-reading.spec.ts', 'tests/e2e/japanese-level-choice.spec.ts', 'tests/e2e/japanese-due-review.spec.ts', 'tests/e2e/curriculum-corruption.spec.ts', 'tests/e2e/curriculum-terminal.spec.ts']);
  assert.equal(stages[0].command, 'node --test scripts/isolated-chromium-smoke/safety.test.mjs');
  assert.equal(stages[1].command, 'system-google-chrome-readiness');
  assert.equal(stages[1].lifecycleDiagnostics, true);
  assert.ok(stages.filter(stage => stage.lifecycleDiagnostics).every(stage => stage.id === 'stage-02'));
  assert.equal(stages[2].command, browserCommand); assert.equal(stages[2].diagnosticInventory, inventory);
  assert.deepEqual(stages.map(stage => stage.timeoutMs), [60000, 240000, 465000]);
  assert.equal(totalTimeoutMs, 775000); assert.ok(totalTimeoutMs + 5000 <= 13 * 60000);
  assert.ok(stages.reduce((sum, stage) => sum + stage.timeoutMs, 0) + 3 * 5000 <= 13 * 60000);
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(lock.packages['node_modules/@playwright/test'].version, '1.63.0');
  assert.equal(lock.packages['node_modules/playwright'].version, '1.63.0');
  assert.equal(diagnosticInvocations(browserCommand), 1);
  for (const changed of [browserCommand.replace('tests/e2e/curriculum-corruption.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/curriculum-terminal.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/japanese-level-choice.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/japanese-due-review.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/japanese-middle-reading.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/japanese-upper-reading.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/language-reset-receipts.spec.ts:9 ', ''), browserCommand.replace('tests/e2e/daily-review-completion.spec.ts:3 ', ''), browserCommand + ' --list', browserCommand + ' --grep .*', browserCommand.replace(':39', ':119'),
    browserCommand.replace('--project chromium-app-smoke', '--project chromium'), stages[1].command, 'echo ' + browserCommand]) {
    assert.equal(diagnosticInvocations(changed), 0);
  }
});

test('existing tests, fixtures, WebKit guards, dependencies, schema and stack are byte-preserved', async () => {
  for (const [path, hash] of Object.entries(preserved)) {
    let bytes = await readFile(path);
    if (path === 'tests/e2e/reporter.ts') {
      const before = '    this.diagnostics.onTestEnd(test, result);\n';
      const after = '    this.diagnostics.onTestEnd(test, result, failure);\n';
      const anchor = '    // Only known source coordinates and fixed categories, never error content.\n';
      const extraction = '    let failure: SafeFailureDiagnostics | undefined;\n'
        + '    try { failure = failureDiagnostics(test.location, result, this.root, this.allowedSources); }\n'
        + '    catch { /* Optional evidence must never suppress the native result status. */ }';
      const original = '    const failure = failureDiagnostics(test.location, result, this.root, this.allowedSources);';
      const text = bytes.toString('utf8');
      assert.equal(text.split(after).length, 2); assert.equal(text.split(anchor).length, 2);
      assert.equal(text.split(extraction).length, 2);
      bytes = Buffer.from(text.replace(after, '').replace(anchor, before + anchor).replace(extraction, original));
    }
    if (path === 'scripts/qa-private-source-ids.mjs') {
      let text = bytes.toString('utf8');
      for (const addition of ["  'tests/e2e/japanese-answer-persistence.spec.ts', // 46\n", "  'tests/e2e/daily-review-completion.spec.ts', // 47\n", "  'tests/e2e/language-reset-receipts.spec.ts', // 48\n", "  'tests/e2e/japanese-middle-reading.spec.ts', // 49\n", "  'tests/e2e/japanese-upper-reading.spec.ts', // 50\n", "  'tests/e2e/japanese-level-choice.spec.ts', // 51\n", "  'tests/e2e/japanese-due-review.spec.ts', // 52\n", "  'tests/e2e/curriculum-corruption.spec.ts', // 53\n", "  'tests/e2e/curriculum-terminal.spec.ts', // 54\n"]) {
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
  assert.equal(files.filter(file => file.endsWith('.test.ts')).length, 345);
  const workflow = await readFile('.github/workflows/japanese-candidate-ci.yml', 'utf8');
  const addition = "      - name: Verify thirteen authenticated app flows in SYSTEM GOOGLE CHROME privately\n        if: matrix.compiler == 'default'\n        run: node scripts/isolated-chromium-smoke/supervisor.mjs\n";
  assert.equal(workflow.split(addition).length, 2);
  assert.equal(workflow.split('len(tests) == 345').length, 2);
  assert.equal(createHash('sha256').update(workflow.replace(addition, '').replace('len(tests) == 345', 'len(tests) == 343')).digest('hex'), workflowHash);
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
  assert.equal(result.stdout, 'chromium-app-smoke failed browser=system-google-chrome realBrowser=unverified fixtureCleanup=unverified\n');
});

test('config contains only Chromium, strict deadlines, private media settings and real loopback Next start', () => {
  const source = `const {default: config} = await import(${JSON.stringify('file://' + resolve('playwright.chromium-smoke.config.ts'))}); process.stdout.write(JSON.stringify(config));`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
    env: environment(), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0); const config = JSON.parse(result.stdout);
  assert.deepEqual(config.projects, [{ name: 'chromium-app-smoke' }]);
  assert.deepEqual(config.testMatch, ['auth.spec.ts', 'sync.spec.ts', 'language-sync.spec.ts', 'language-reset.spec.ts', 'japanese-answer-persistence.spec.ts', 'daily-review-completion.spec.ts', 'language-reset-receipts.spec.ts', 'japanese-middle-reading.spec.ts', 'japanese-upper-reading.spec.ts', 'japanese-level-choice.spec.ts', 'japanese-due-review.spec.ts', 'curriculum-corruption.spec.ts', 'curriculum-terminal.spec.ts']);
  assert.equal(config.fullyParallel, false); assert.equal(config.workers, 1); assert.equal(config.retries, 0);
  assert.equal(config.forbidOnly, true); assert.equal(config.repeatEach, 1); assert.equal(config.timeout, 90000);
  assert.equal(config.expect.timeout, 15000); assert.equal(config.use.browserName, 'chromium'); assert.equal(config.use.headless, true);
  assert.equal(config.use.channel, 'chrome');
  assert.equal(config.use.launchOptions, undefined);
  assert.equal(config.use.connectOptions, undefined);
  assert.deepEqual(config.use.viewport, { width: 1280, height: 720 });
  assert.equal(config.use.actionTimeout, 15000); assert.equal(config.use.navigationTimeout, 30000);
  assert.equal(config.use.baseURL, 'http://127.0.0.1:3000'); assert.equal(config.use.locale, 'ko-KR');
  assert.equal(config.use.timezoneId, 'Asia/Seoul'); assert.equal(config.use.serviceWorkers, 'block');
  for (const setting of ['trace', 'screenshot', 'video']) assert.equal(config.use[setting], 'off');
  assert.deepEqual(config.reporter, [['./tests/e2e/reporter.ts']]);
  assert.deepEqual(config.webServer, { command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000/diet/settings', reuseExistingServer: false, timeout: 120000 });
});

test('Playwright list-only collection resolves exactly thirteen titles and coordinates without fixtures', () => {
  // --list does not start webServer, browsers, test bodies or fixture hooks.
  const args = browserCommand.split(' ').slice(1).concat(['--list', '--reporter=json']);
  const result = spawnSync(process.execPath, args, { env: environment(), encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0); const report = JSON.parse(result.stdout);
  assert.deepEqual(report.errors, []);
  const specs = suite => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specs)];
  const selected = report.suites.flatMap(specs);
  assert.equal(selected.length, 13);
  const expected = new Map([
    ['auth.spec.ts:3', 'login, logout and same-account relogin preserve all 17 original keys without PATCH'],
    ['sync.spec.ts:3', 'first GET delivery delayed while a real form saves: originals and new input survive'],
    ['language-sync.spec.ts:8', 'language settings save immediately, preserve an edit during PATCH, and survive relogin'],
    ['language-reset.spec.ts:39', 'Japanese reset uses the real settings UI, clears both new keys and preserves settings and another owner after reload and relogin'],
    ['japanese-answer-persistence.spec.ts:8', 'seven Japanese chunk answers persist through real preparation UI, reload and relogin without changing unrelated records'],
    ['daily-review-completion.spec.ts:3', 'three distinct reviews save one daily completion and hide the stale warning across reload and relogin'],
    ['language-reset-receipts.spec.ts:9', 'Japanese reset receipts survive genuine HTTP omission writes, concurrent retries and lost-response supersession with a new answer'],
    ['japanese-middle-reading.spec.ts:3', 'all 18 new intermediate reading answers and three completion stamps persist through real UI, reload and relogin'],
    ['japanese-upper-reading.spec.ts:3', 'all 18 new advanced reading answers and three completion stamps persist through real UI, reload and relogin'],
    ['japanese-level-choice.spec.ts:3', 'explicit Japanese level choices and preview backtracking preserve earlier records through real save, reload and relogin'],
    ['japanese-due-review.spec.ts:3', 'synthetic overdue reading subset keeps its queue and saves helped repeats without completing the full unit'],
    ['curriculum-corruption.spec.ts:3', 'corrupt curriculum bytes survive attempted UI writes and reload until explicit synthetic fixture correction'],
    ['curriculum-terminal.spec.ts:3', 'terminal beginner f12 completes twice through silent meaning UI with real saves and manual intermediate choice'],
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
  for (const invalid of [[], {}, inventory.slice(0, 7), inventory.slice(0, 8), inventory.slice(0, 9), inventory.slice(0, 10), inventory.slice(0, 11), inventory.slice(0, 12), [...inventory, inventory[0]], inventory.map(() => inventory[0]),
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

test('three-stage sequencing propagates safety/readiness/browser failures, cancellation and exact timeout settings', async () => {
  for (const failure of [-1, 0, 1, 2]) {
    const options = await fresh(), calls = [];
    const code = await supervise({ ...options, readiness: async config => {
      calls.push('stage-02'); assert.equal(config.timeoutMs, 240000);
      return calls.length - 1 === failure ? 1 : 0;
    }, run: async (items, config) => {
      const stage = items[0]; calls.push(stage.id); assert.equal(config.timeoutMs, stage.timeoutMs);
      return calls.length - 1 === failure ? 1 : 0;
    } });
    assert.equal(code, failure < 0 ? 0 : 1); assert.equal(calls.length, failure < 0 ? 3 : failure + 1);
    privateOutput(options.output);
    assert.equal(options.output.at(-1).includes('realBrowser=true'), failure < 0);
    if (failure < 0) assert.equal(options.output.at(-1), 'chromium-app-smoke passed tests=13 browser=system-google-chrome realBrowser=true fixtureCleanup=passed');
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


test('independently reviewed seventh receipt scenario is pinned while IDs 49–52 append reading, level choice and review coverage', async () => {
  assert.equal(createHash('sha256').update(await readFile('tests/e2e/language-reset-receipts.spec.ts')).digest('hex'), receiptTestHash);
  const sourceMap = await readFile('scripts/qa-private-source-ids.mjs', 'utf8');
  const originalMap = sourceMap.replace("  'tests/e2e/japanese-level-choice.spec.ts', // 51\n", '').replace("  'tests/e2e/japanese-due-review.spec.ts', // 52\n", '').replace("  'tests/e2e/curriculum-corruption.spec.ts', // 53\n", '').replace("  'tests/e2e/curriculum-terminal.spec.ts', // 54\n", '');
  assert.equal(createHash('sha256').update(originalMap).digest('hex'), 'eadd83cc376147d355cf907670980a94166d57f16daf3365dda367e1a9d141c5');
  assert.equal(sources.length, 54);
  assert.deepEqual(sources.slice(48), ['tests/e2e/japanese-middle-reading.spec.ts', 'tests/e2e/japanese-upper-reading.spec.ts', 'tests/e2e/japanese-level-choice.spec.ts', 'tests/e2e/japanese-due-review.spec.ts', 'tests/e2e/curriculum-corruption.spec.ts', 'tests/e2e/curriculum-terminal.spec.ts']);
});

test('reading scenarios retain all 36 source-mapped questions, UI writes and exact local-before-DB confirmation', async () => {
  for (const [path, hash] of Object.entries(readingHashes)) {
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash);
  }
  for (const [file, level] of [['middle', 'intermediate'], ['upper', 'advanced']]) {
    const source = await readFile(`tests/e2e/japanese-${file}-reading.spec.ts`, 'utf8');
    assert.equal(source.match(/test\('/g)?.length, 1);
    assert.ok(source.includes(`await verifyReadingLessons(page, qa, '${level}', {`));
    assert.ok(source.split('\n')[2].startsWith('test('));
  }
  const source = await readFile('tests/e2e/japanese-reading-flow.ts', 'utf8');
  for (const required of ['JAPANESE_COURSE_GAP_LESSONS.filter', 'lessons.entries()', 'lesson.questions.entries()',
    'await phases.setup(async () => {', 'await phases.lessons[lessonIndex](async () => {', 'await phases.restoration(async () => {', 'await phases.repeat(async () => {', 'attempts: 2, intervalDays: 1, successDates: []', 'repeated.journey.practicedUnits).toEqual(expectedUnits)', 'sum + answer.attempts, 0)).toBe(19)', 'repeatedUpdatedAt).toBeGreaterThanOrEqual(startedAt)', 'repeatedUpdatedAt).toBeLessThanOrEqual(repeated.at)', 'answers: expectedAnswers, updatedAt: repeated.journey.updatedAt',
    'toHaveLength(3)', '.size).toBe(18)', 'question.choices[chosen]', 'question.explanation', 'enhancement.evidence.find',
    'toHaveText(evidence.quotes)', 'questionIndex < 4', "name: '새 상황의 근거'", "name: '본문 정답 근거'",
    "level === 'intermediate' && lessonIndex === 0 && questionIndex === 1", "level === 'intermediate' && lessonIndex === 0 && questionIndex === 2",
    'attempts: 1, intervalDays: 1', 'Date.parse(answer.lastAnsweredAt)', 'answer.successDates', 'sessions.size).toBe(4)',
    "expect(journey.selectedLevel).toBe('beginner')", "not.toHaveProperty('selectionUpdatedAt')", 'expectedAnswers', 'expectedUnits',
    'const completed = await local()', 'saved = { ...before, [LEVEL_JOURNEY_KEY]: completed.raw }',
    'qa.traffic.assertLanguageConfirmed(saved)', "entry.method === 'GET'", 'entry.delivered', 'canonical(await qa.readLanguage())',
    "name: '이번 단원 연습 기록 저장'", 'toBeDisabled()', 'toBeEnabled()', 'page.reload()', 'await restored()',
    "localStorage.getItem(key)", 'toBeNull()', 'await unchangedLocal()', 'beforeFitness', 'width: 320', 'await narrow()',
    'scroll).toBeLessThanOrEqual(size.width)', "url.pathname === '/api/language/tts'", 'expect(ttsRequests', ').toBe(0)']) assert.ok(source.includes(required), required);
  for (const forbidden of ['localStorage.setItem', 'sessionStorage.setItem', 'addInitScript', 'page.route', 'route.fulfill',
    'rememberUpperAnswer(', 'writeLevelJourney(', 'audio.play', 'speakJapanese', 'waitForTimeout', 'test.setTimeout',
    'test.skip', 'test.fixme', 'timeout:', 'qa.createAccount(', 'process.env.']) assert.ok(!source.includes(forbidden), forbidden);
  assert.equal(source.match(/client\.from\('language_user_state'\)\.update/g)?.length, 1);
  assert.ok(source.indexOf('.update({ state: before })') < source.indexOf('await login('));
  assert.ok(source.indexOf('const completed = await local()') < source.indexOf('expect.poll(async () => canonical(await qa.readLanguage()))'));
  assert.ok(source.indexOf('saved = { ...before, [LEVEL_JOURNEY_KEY]: completed.raw }') < source.indexOf('expect.poll(async () => canonical(await qa.readLanguage()))'));
  const { JAPANESE_COURSE_GAP_LESSONS: lessons } = await import('../../data/japaneseCourseGapLessons.ts');
  let correct = 0, wrong = 0, helped = 0, passage = 0, transfer = 0;
  for (const level of ['intermediate', 'advanced']) {
    const selected = lessons.filter(lesson => lesson.level === level); assert.equal(selected.length, 3);
    assert.equal(selected.flatMap(lesson => lesson.questions).length, 18);
    for (const [lessonIndex, lesson] of selected.entries()) for (const [questionIndex, question] of lesson.questions.entries()) {
      assert.equal(question.id, `${lesson.id}-q${questionIndex + 1}`); assert.ok(question.choices[question.answer]);
      if (level === 'intermediate' && lessonIndex === 0 && questionIndex === 1) wrong++; else correct++;
      if (level === 'intermediate' && lessonIndex === 0 && questionIndex === 2) helped++;
      if (questionIndex < 4) passage++; else transfer++;
    }
  }
  assert.deepEqual({ correct, wrong, helped, passage, transfer }, { correct: 35, wrong: 1, helped: 1, passage: 24, transfer: 12 });
});

test('each literal reading phase preserves a native same-spec coordinate for external helper failures without leaking content', async () => {
  const repository = process.cwd();
  const root = await mkdtemp(join(tmpdir(), 'reading-native-phase-'));
  const paths = ['tests/e2e/japanese-middle-reading.spec.ts', 'tests/e2e/japanese-upper-reading.spec.ts'];
  const phaseLines = new Map();
  try {
    await mkdir(join(root, 'tests/e2e'), { recursive: true });
    for (const path of paths) {
      const source = await readFile(path, 'utf8');
      const positions = source.split('\n').flatMap((line, index) => line.includes('test.step(') ? [index + 1] : []);
      assert.deepEqual(positions, [5, 7, 8, 9, 11, 12]); phaseLines.set(path, positions);
      // Reuse the actual literal phase callbacks. Replace only imports and remove
      // the page/qa fixture request; the offline helper never uses either value.
      const synthetic = source.replace("import { test } from './fixture';", `import { test } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))};`)
        .replace("from './japanese-reading-flow'", "from './offline-reading-helper'")
        .replace('async ({ page, qa }) => {', 'async () => { const page = null, qa = null;');
      assert.ok(!synthetic.includes("from './fixture'")); assert.ok(!synthetic.includes('async ({ page, qa })'));
      await writeFile(join(root, path), synthetic);
    }
    await writeFile(join(root, 'tests/e2e/offline-reading-helper.ts'), `
import { expect } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))};
export async function verifyReadingLessons(_page, _qa, _level, phases) {
  for (const [index, phase] of [phases.setup, ...phases.lessons, phases.repeat, phases.restoration].entries()) {
    await phase(async () => {
      if (index === Number(process.env.QA_READING_FAILURE_PHASE)) expect(${JSON.stringify(canary)}).toBe('PRIVATE_EXPECTED');
    });
  }
}
`);
    await writeFile(join(root, 'offline.config.mjs'), `export default ${JSON.stringify({
      testDir: './tests/e2e', workers: 1, retries: 0, projects: [{ name: 'chromium-app-smoke' }],
      reporter: [[join(repository, 'tests/e2e/reporter.ts')]],
    })};\n`);
    // Pure native runner only: no browser/page/context/request fixture, webServer,
    // network URL, real app body, Auth/DB seed, stack or installation is involved.
    for (let phase = 0; phase < 6; phase++) {
      const path = join(root, `journal-${phase}.jsonl`); await writeFile(path, '', { mode: 0o600 });
      const child = spawnSync(process.execPath, [join(repository, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'offline.config.mjs'], {
        cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', QA_READING_FAILURE_PHASE: String(phase),
          QA_PRIVATE_DIAGNOSTIC_FILE: path, QA_PRIVATE_DIAGNOSTIC_TOKEN: token, GITHUB_STEP_SUMMARY: join(root, 'summary.md') },
      });
      assert.equal(child.error, undefined); assert.equal(child.status, 1);
      const output = [];
      const report = await emitDiagnosticJournal({ path, token, expected: 1, stage: 'stage-03', termination: 'none', emit: line => output.push(line) });
      assert.equal(report.report, 'complete'); assert.equal(report.invocations.length, 1);
      assert.equal(report.invocations[0].counts.failed, 2); assert.equal(report.invocations[0].runnerErrors, 0);
      assert.equal(report.invocations[0].details.length, 2);
      for (const detail of report.invocations[0].details) {
        assert.ok([49, 50].includes(detail.source)); assert.equal(detail.line, 3); assert.equal(detail.column, 5);
        assert.equal(detail.project, 5); assert.equal(detail.status, 'failed'); assert.equal(detail.failure.category, 1);
        assert.deepEqual(detail.failure.errors, []); assert.deepEqual(detail.failure.failedOperations, []);
        assert.equal(detail.failure.failedSteps.length, 1);
        const step = detail.failure.failedSteps[0];
        assert.equal(step.source, detail.source); assert.equal(step.line, phaseLines.get(paths[detail.source - 49])[phase]);
        assert.ok(Number.isInteger(step.column) && step.column > 0); assert.equal(detail.failure.stepScanTruncated, 0);
      }
      const text = output.join('\n'), journalText = await readFile(path, 'utf8');
      privateOutput(output);
      for (const secret of [canary, 'PRIVATE_EXPECTED', 'reading setup', 'reading lesson', 'reading restoration', 'reading immediate repeat', 'offline-reading-helper', ...paths, root]) {
        assert.ok(!text.includes(secret)); assert.ok(!journalText.includes(secret));
      }
      assert.ok(output.some(line => line.includes(`phase=1 source=49 line=${phaseLines.get(paths[0])[phase]} `)));
      assert.ok(output.some(line => line.includes(`phase=1 source=50 line=${phaseLines.get(paths[1])[phase]} `)));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('level-choice and due-review source bodies and shared state helper remain strictly pinned', async () => {
  for (const [path, hash] of Object.entries(levelFlowHashes)) {
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash, path);
  }
  for (const file of ['japanese-level-choice.spec.ts', 'japanese-due-review.spec.ts']) {
    const source = await readFile(`tests/e2e/${file}`, 'utf8');
    assert.equal(source.match(/test\('/g)?.length, 1);
    assert.ok(source.split('\n')[2].startsWith('test('));
    for (const forbidden of ['localStorage.setItem', 'sessionStorage.setItem', 'page.route', 'route.fulfill', 'waitForTimeout', 'test.setTimeout', 'test.skip', 'test.fixme']) assert.ok(!source.includes(forbidden), forbidden);
  }
});

test('each new literal phase maps external helper failure only to its exact private spec coordinate', async () => {
  const repository = process.cwd();
  for (const [file, sourceId, expectedLines] of [
    ['japanese-level-choice.spec.ts', 51, [33, 41, 50, 58, 84]],
    ['japanese-due-review.spec.ts', 52, [66, 76, 87, 97, 98, 102]],
    ['curriculum-corruption.spec.ts', 53, [22, 28, 41, 46]],
    ['curriculum-terminal.spec.ts', 54, [12, 17, 21, 30, 37]],
  ]) {
    const root = await mkdtemp(join(tmpdir(), 'level-native-phase-'));
    try {
      const path = `tests/e2e/${file}`, source = await readFile(path, 'utf8');
      const lines = source.split('\n');
      const positions = lines.flatMap((line, index) => line.includes('await test.step(') ? [index + 1] : []);
      assert.deepEqual(positions, expectedLines);
      // Offline coordinate fixture: retain each actual literal step call prefix at
      // its original line, replacing app bodies with a throwing external helper.
      // This checks native attribution only, not application execution.
      const synthetic = Array(lines.length).fill('');
      synthetic[0] = `import { test } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))};`;
      synthetic[1] = "import { fail } from './offline-phase-helper';";
      synthetic[2] = "test('synthetic private phase', async () => {";
      for (const [index, line] of positions.entries()) {
        const prefix = lines[line - 1].split('async () => {')[0];
        assert.ok(prefix.includes('await test.step('));
        synthetic[line - 1] = `${prefix}async () => { await fail(${index}); });`;
      }
      synthetic[positions.at(-1)] = '});';
      await mkdir(join(root, 'tests/e2e'), { recursive: true });
      await writeFile(join(root, path), synthetic.join('\n'));
      await writeFile(join(root, 'tests/e2e/offline-phase-helper.ts'), `import { expect } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))};\nexport async function fail(index) { if (index === Number(process.env.QA_LEVEL_FAILURE_PHASE)) expect(${JSON.stringify(canary)}).toBe('PRIVATE_EXPECTED'); }\n`);
      await writeFile(join(root, 'offline.config.mjs'), `export default ${JSON.stringify({ testDir: './tests/e2e', workers: 1, retries: 0, projects: [{ name: 'chromium-app-smoke' }], reporter: [[join(repository, 'tests/e2e/reporter.ts')]] })};\n`);
      for (const [phase, line] of positions.entries()) {
        const journalPath = join(root, `journal-${phase}.jsonl`); await writeFile(journalPath, '', { mode: 0o600 });
        const child = spawnSync(process.execPath, [join(repository, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'offline.config.mjs'], {
          cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
          env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', QA_LEVEL_FAILURE_PHASE: String(phase), QA_PRIVATE_DIAGNOSTIC_FILE: journalPath, QA_PRIVATE_DIAGNOSTIC_TOKEN: token },
        });
        assert.equal(child.error, undefined); assert.equal(child.status, 1);
        const output = [];
        const report = await emitDiagnosticJournal({ path: journalPath, token, expected: 1, stage: 'stage-03', termination: 'none', emit: value => output.push(value) });
        assert.equal(report.report, 'complete'); assert.equal(report.invocations.length, 1);
        const invocation = report.invocations[0]; assert.equal(invocation.counts.failed, 1); assert.equal(invocation.runnerErrors, 0);
        assert.equal(invocation.details.length, 1);
        const detail = invocation.details[0];
        assert.equal(detail.source, sourceId); assert.equal(detail.line, 3); assert.equal(detail.column, 5); assert.equal(detail.project, 5);
        assert.equal(detail.failure.category, 1); assert.deepEqual(detail.failure.errors, []); assert.deepEqual(detail.failure.failedOperations, []);
        assert.equal(detail.failure.failedSteps.length, 1);
        assert.equal(detail.failure.failedSteps[0].source, sourceId); assert.equal(detail.failure.failedSteps[0].line, line);
        assert.equal(detail.failure.stepScanTruncated, 0); privateOutput(output);
        const text = output.join('\n'), bytes = await readFile(journalPath, 'utf8');
        for (const secret of [canary, 'PRIVATE_EXPECTED', file, 'offline-phase-helper', root, 'synthetic private phase']) {
          assert.ok(!text.includes(secret)); assert.ok(!bytes.includes(secret));
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

// Exercise the exact expectation block against the real storage utility's stamp,
// not an in-memory component double that omits updatedAt. No browser or DB.
test('repeat assertion accepts the real saver timestamp and rejects stale future or unrelated changes', async () => {
  const { expect } = await import('@playwright/test');
  const { emptyLevelJourney, LEVEL_JOURNEY_KEY, writeLevelJourney, learningOwner, rememberUpperAnswer } = await import('../../utils/japaneseLevelJourney.ts');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const owner = learningOwner(storage); const id = 'middle-core-03-q1';
  storage.setItem(LEVEL_JOURNEY_KEY, JSON.stringify(emptyLevelJourney()));
  const earlier = new Date('2026-11-11T12:00:00.000Z'); const now = new Date('2026-11-11T12:00:01.000Z');
  writeLevelJourney(storage, owner, latest => rememberUpperAnswer(latest, {
    lessonId: 'middle-core-03', questionId: id, attemptId: 'first', correct: true, neededHelp: false,
  }, earlier), earlier);
  const beforeRepeat = { journey: JSON.parse(storage.getItem(LEVEL_JOURNEY_KEY)) };
  const repeated = { journey: writeLevelJourney(storage, owner, latest => rememberUpperAnswer(latest, {
    lessonId: 'middle-core-03', questionId: id, attemptId: 'repeat', correct: true, neededHelp: true,
  }, now), now), at: now.getTime() + 25 };
  const expectedAnswers = { ...beforeRepeat.journey.answers, [id]: repeated.journey.answers[id] };
  assert.throws(() => assert.deepEqual(repeated.journey, { ...beforeRepeat.journey, answers: expectedAnswers }));
  const source = await readFile('tests/e2e/japanese-reading-flow.ts', 'utf8');
  assert.ok(source.includes('const startedAt = await page.evaluate(() => Date.now());'));
  const begin = '            const repeatedUpdatedAt = Date.parse(repeated.journey.updatedAt!);';
  const finish = '            expect(repeated.journey.practicedUnits).toEqual(expectedUnits);';
  assert.equal(source.split(begin).length, 2); assert.equal(source.split(finish).length, 2);
  const block = (begin + source.split(begin)[1].split(finish)[0]).replaceAll('updatedAt!', 'updatedAt');
  const check = new Function('expect', 'repeated', 'beforeRepeat', 'expectedAnswers', 'startedAt', block);
  check(expect, repeated, beforeRepeat, expectedAnswers, now.getTime());
  for (const changes of [
    { updatedAt: undefined }, { updatedAt: 'invalid' }, { updatedAt: earlier.toISOString() },
    { updatedAt: new Date(repeated.at + 1).toISOString() }, { selectedLevel: 'advanced' },
    { practicedUnits: { unexpected: now.toISOString() } }, { answers: beforeRepeat.journey.answers },
  ]) assert.throws(() => check(expect, { ...repeated, journey: { ...repeated.journey, ...changes } }, beforeRepeat, expectedAnswers, now.getTime()));
});


test('reviewed curriculum repair and bounded real-UI scenarios retain exact source contracts', async () => {
  const hashes = {
  "app/data/japaneseLearningStorage.test.ts": "b387b4c3110708c0d851425c896c40f5c37e8529d839cfe534141882d85a9d86",
  "app/data/languageCloudSync.ts": "d42082e3ead11e14059a325bc3cef12b9ad74e51e03320824734e6d309f1f48b",
  "app/language/learn/page.tsx": "8bd9a15aa3ff4fa271646ac1257291691d8e092159268632e835142e9a9ee3b0",
  "app/language/progress/page.tsx": "0face1d240b8c6fc3d799ba32f89142040ecf6c0a798229ad9d08fdb426b6773",
  "components/LanguageCloudSync.tsx": "530ad50e9ade9673ab565a0b8a67f5b0ebe4577480bc24a236cd7a0a2b8ad6db",
  "components/language/FocusedLesson.tsx": "638447ef4f8592a5571ea1656f079d8b5a8488a001ebcff222048a207739e8e6",
  "components/language/KanaStarter.tsx": "5bf3defa4650c2ad80f0318402bb2a9308ea3e22e72b2f6e966585175aaf2e62",
  "components/language/LearningWelcome.tsx": "c695eb46ce075faceb1d9298593863dc8195bde8f2bd8a746ee93aa63085aa4e",
  "components/language/LevelLearningWorkspace.tsx": "3c725ef37d35b10c17d8962897f25ee756cb0b9090000706a6b1b366bbf412b2",
  "tests/fixtures/curriculumUiHarness.ts": "cc0b1bedc39e32cf82232e6a630f85cd9e87aa8e17e9ee0ff5774e4df0a521ce",
  "tests/language-storage-compatibility-ui.test.ts": "bf9db8fc45832aafb8c1480fab71a7bab6ef530625a35dca1ef30ccdb9aa83c5",
  "utils/curriculumProgress.ts": "c9ce21e1c5e3be1deb15fe97f681169fc6a5a1364c766cc44c1940514b1912ef",
  "utils/learningSession.ts": "b672566336eca17ce5ba4017b6c32a25cd0a50a8c191a93b431fc113c1eef528",
  "tests/e2e/curriculum-corruption.spec.ts": "77d9bcccc9f3bf3e285dc2f97a5cda9ff2af9c01eb7dfbf342fb9225ac0f91af",
  "tests/e2e/curriculum-terminal.spec.ts": "9d7becc76a7cb1fceb07475368b68987b7d3247149d1902dd66d2d4b44cac908",
  "tests/e2e/curriculum-browser-state.ts": "276908fe0cc7b095cf34ad530b4cfa04c51271c3ee8402a885caca42fe3d0a7b"
};
  for (const [path, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash, path);
  const helper = await readFile('tests/e2e/curriculum-browser-state.ts', 'utf8');
  const corruption = await readFile('tests/e2e/curriculum-corruption.spec.ts', 'utf8');
  const terminal = await readFile('tests/e2e/curriculum-terminal.spec.ts', 'utf8');
  for (const source of [helper, corruption, terminal]) for (const forbidden of ['page.route', 'route.fulfill', 'addInitScript', 'waitForTimeout', 'test.setTimeout', 'test.skip', 'test.fixme', 'audio.play', 'speakJapanese', 'qa.createAccount(', 'process.env.']) assert.ok(!source.includes(forbidden), forbidden);
  for (const source of [helper, terminal]) assert.ok(!source.includes('localStorage.setItem'));
  assert.equal(helper.match(/client\.from\('language_user_state'\)\.update/g)?.length, 1);
  assert.equal(corruption.match(/localStorage\.setItem/g)?.length, 1);
  for (const source of [corruption, terminal]) { assert.equal(source.match(/test\('/g)?.length, 1); assert.ok(source.split('\n')[2].startsWith('test(')); }
  for (const required of ['await answerTerminal(page)', 'await preserved(malformed)', 'await preserved(invalidShape)', 'await fixtureReplace(saved[CURRICULUM_PROGRESS_KEY] as string)', "expect(progress.completedLessonIds).toEqual(['f01'])", 'expect(writeCount(qa)).toBe(writes)', 'await persisted(page, qa, saved, fitness)']) assert.ok(corruption.includes(required), required);
  for (const required of ['terminalPath', 'await answerTerminal(page)', 'sessions.push(completed.sessionId)', 'new Set(sessions).size).toBe(2)', "name: '중급 선택하기'", 'await persisted(page, qa, saved, fitness)', "name: '로그아웃'"]) assert.ok(terminal.includes(required), required);
  for (const required of ['getSessionQuizIndices(terminal, 5)', 'for (const [index, word] of terminal.words.entries())', 'for (const [cursor, index] of indices.entries())', "not.toBe('listening')", "name: '오늘 연습 저장하기'", '...priorAttempts, { score: 100, completedAt: attempt.completedAt, sessionId: draft.id }', "lastModality: 'meaning'", 'await persisted(page, qa, saved, fitness)', 'historicalDraft', 'historicalReview']) assert.ok(helper.includes(required), required);
});

// Execute the exact terminal assertion function, not a hand-copied equivalent.
// Synthetic wrappers test assertion sensitivity only; they never run the app,
// browser, Auth, database, server, network, installation or a successful reply.
test('terminal assertions reject prior-history loss and require independently bounded Seoul activity dates', async () => {
  const ts = (await import('typescript')).default;
  const { expect: realExpect } = await import('@playwright/test');
  const { CURRICULUM } = await import('../../data/curriculum.ts');
  const { getSessionQuizIndices } = await import('../../utils/learningSession.ts');
  const source = await readFile('tests/e2e/curriculum-browser-state.ts', 'utf8');
  const toJs = text => ts.transpileModule(text.replaceAll('export ', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const oldTime = '2001-01-02T00:00:00.000Z';
  const values = new Function('oldTime', toJs(source.slice(source.indexOf('export const historicalDraft'),
    source.indexOf('export async function seedCurriculum'))) + '; return { historicalDraft, historicalProgress, historicalReview };')(oldTime);
  const { historicalDraft, historicalProgress, historicalReview } = values;
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const indices = getSessionQuizIndices(CURRICULUM.find(item => item.id === 'f12'), 5);
  assert.deepEqual(indices, [2, 4, 6]);
  const progressKey = 'japaneseCurriculumProgressV1', reviewKey = 'japaneseCurriculumReviewV1', journeyKey = 'japaneseLevelJourneyV1';
  const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const clone = value => JSON.parse(JSON.stringify(value));
  const expect = value => value?.syntheticLocator ? {
    async toBeVisible() { assert.equal(value.count, 1); },
    async toHaveCount(count) { assert.equal(value.count, count); },
    async toHaveAttribute(name, expected) { assert.equal(value[name], expected); },
  } : realExpect(value);
  const functionSource = toJs(source.slice(source.indexOf('export async function completeTerminal')));
  async function run(mutate = () => {}, options = {}) {
    const { repeat = false, start = Date.parse('2026-11-12T01:00:00.000Z'), end = start + 10,
      day = '2026-11-12', completion = start + 1 } = options;
    const previousIds = repeat ? [ids[0]] : [], id = repeat ? ids[1] : ids[0];
    const beforeProgress = clone(historicalProgress);
    if (repeat) {
      beforeProgress.completedLessonIds.push('f12');
      beforeProgress.lessonAttempts.f12 = [{ score: 100, completedAt: new Date(start - 60_000).toISOString(), sessionId: ids[0] }];
      beforeProgress.activityDates.push('2026-11-12');
    }
    const fitness = { synthetic: 'unrelated-fitness' }, before = { unrelated: 'synthetic-language',
      [progressKey]: JSON.stringify(beforeProgress), [journeyKey]: JSON.stringify({ selectedLevel: 'beginner', practicedUnits: { 'retired-unit': oldTime } }) };
    const progress = { ...clone(beforeProgress), completedLessonIds: ['f01', 'f12'], quizScores: { f01: 67, f12: 100 },
      lessonAttempts: { f01: clone(beforeProgress.lessonAttempts.f01),
        f12: [...clone(beforeProgress.lessonAttempts.f12 ?? []), { score: 100, completedAt: new Date(completion).toISOString(), sessionId: id }] },
      lessonDrafts: { [historicalDraft.lessonId]: clone(historicalDraft) }, activeSession: clone(historicalDraft),
      activityDates: [...new Set([...beforeProgress.activityDates, day])].sort() };
    const reviews = [clone(historicalReview), ...indices.map(index => ({ id: `f12:${index}`, lessonId: 'f12',
      lastSessionId: id, lastSessionResult: true, wrongCount: 0, lastModality: 'meaning' }))];
    mutate(progress, reviews);
    let savedClicked = false, persistedCalls = 0;
    const page = { evaluate: async () => start, getByRole: (role, options) => ({ syntheticLocator: true,
      count: role === 'link' && options.name === '다음 수업 보기' ? 0 : 1, href: '/language/levels?level=beginner',
      click: async () => { assert.equal(options.name, '오늘 연습 저장하기'); savedClicked = true; } }),
      getByText: () => ({ syntheticLocator: true, count: 1 }) };
    const curriculumSnapshot = async () => ({ raw: JSON.stringify(savedClicked ? progress : { activeSession: { id } }),
      reviewRaw: JSON.stringify(reviews), at: end });
    const persisted = async (_page, _qa, saved, givenFitness) => {
      assert.equal(savedClicked, true); assert.equal(givenFitness, fitness); persistedCalls++;
      assert.equal(canonical(saved), canonical({ ...before, [progressKey]: JSON.stringify(progress), [reviewKey]: JSON.stringify(reviews) }));
    };
    const names = ['expect', 'curriculumSnapshot', 'CURRICULUM_PROGRESS_KEY', 'CURRICULUM_REVIEW_KEY', 'LEVEL_JOURNEY_KEY',
      'historicalProgress', 'historicalDraft', 'historicalReview', 'indices', 'uuid', 'persisted', 'canonical'];
    const verify = new Function(...names, functionSource + '; return completeTerminal;')(expect, curriculumSnapshot,
      progressKey, reviewKey, journeyKey, historicalProgress, historicalDraft, historicalReview, indices,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, persisted, canonical);
    try { await verify(page, { read: async () => fitness }, before, fitness, previousIds); }
    catch (error) { assert.equal(persistedCalls, 0, 'Invalid local evidence must fail before persistence confirmation'); throw error; }
    assert.equal(persistedCalls, 1);
  }
  const midnight = Date.parse('2026-11-12T14:59:59.995Z');
  for (const [name, options] of [
    ['first completion', {}], ['repeat completion', { repeat: true }],
    ['Seoul day differs from UTC', { start: Date.parse('2026-11-12T16:00:00.000Z'), day: '2026-11-13' }],
    ['midnight save before boundary', { start: midnight, day: '2026-11-12' }],
    ['midnight save after boundary', { start: midnight, day: '2026-11-13', completion: midnight + 7 }],
    ['repeat crosses midnight', { repeat: true, start: midnight, day: '2026-11-13', completion: midnight + 7 }],
  ]) await assert.doesNotReject(() => run(undefined, options), name);
  for (const [name, mutate, options = {}] of [
    ['old f01 attempt loss', progress => { progress.lessonAttempts.f01 = []; }],
    ['wrong new score', progress => { progress.lessonAttempts.f12.at(-1).score = 0; }],
    ['stale completion time', progress => { progress.lessonAttempts.f12.at(-1).completedAt = oldTime; }],
    ['future completion time', progress => { progress.lessonAttempts.f12.at(-1).completedAt = '2099-01-01T00:00:00.000Z'; }],
    ['lost special own-key draft', progress => { progress.lessonDrafts = {}; }],
    ['lost extension', progress => { delete progress.extension; }],
    ['changed unrelated review', (_progress, reviews) => { reviews[0].wrongCount = 99; }],
    ['lost historical activity date', progress => { progress.activityDates = ['2026-11-12']; }],
    ['changed prior f12 score', progress => { progress.lessonAttempts.f12[0].score = 0; }, { repeat: true }],
    ['changed prior f12 timestamp', progress => { progress.lessonAttempts.f12[0].completedAt = oldTime; }, { repeat: true }],
    ['lost prior f12 attempt', progress => { progress.lessonAttempts.f12.shift(); }, { repeat: true }],
    ['missing current local day', progress => { progress.activityDates = ['2001-01-02']; }],
    ['duplicated current day', progress => { progress.activityDates.push('2026-11-12'); }],
    ['unrelated future date', progress => { progress.activityDates.push('2099-01-01'); }],
    ['UTC date substituted for Seoul', progress => { progress.activityDates = ['2001-01-02', '2026-11-12']; },
      { start: Date.parse('2026-11-12T16:00:00.000Z'), day: '2026-11-13' }],
    ['both boundary days added', progress => { progress.activityDates = ['2001-01-02', '2026-11-12', '2026-11-13']; }, { start: midnight }],
    ['unexpected new attempt field', progress => { progress.lessonAttempts.f12.at(-1).syntheticExtra = true; }],
  ]) await assert.rejects(() => run(mutate, options), undefined, name);
});
