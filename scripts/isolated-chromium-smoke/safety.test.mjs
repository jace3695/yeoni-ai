import '../qa-private-lifecycle.test.mjs';
import './bundled-readiness.test.mjs';
import './bundled-driver.test.mjs';
// Synthetic processes, reports and collection only. No browser, Auth or DB starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir, constants } from 'node:os';
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
  RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'ubuntu24', ImageVersion: '20261111.370.1',
  GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com',
  PLAYWRIGHT_BROWSERS_PATH: '/home/runner/work/_temp/yeoni-chromium-1-63' });
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
const preserved = { 'tests/e2e/budget-delete-undo.spec.ts': '25061946cb8b7391444f51146d636f230a0493bf16ea93ec2bb81d4da5995296', 'tests/e2e/workout-times.spec.ts': '7a56514a18d2df512e1bca488f112baeabbc9f317222a1ba3ee24372177b26e8', 'tests/e2e/workout-core-state.ts': 'caeb59d96e3e4dbaf7aaa675ca05ee4ecdf43e34c788667b7157269b40676b43', 'tests/e2e/workout-progression.spec.ts': '360709a14c2e3920b12ab710162781e41e476bee0779d602991d9c8ff2778f96', 'tests/e2e/budget-first-manual-state.ts': '5d3a50d56dbdca79b422a46ef6c75e7f509603c8b2c8251d9747acd8122afaf8', 'tests/e2e/budget-first-manual.spec.ts': 'cc4a677ae7f3cbc79d39c110140ff0d75a924e8714a204312483ff50bf478152',
  "playwright.config.ts": "3ce090d0a97f0632ded5aa75e8b041d7ca0c46b803a82281cb1271d4e9997e0f",
  "scripts/qa-playwright.mjs": "38e8cc6623aaaa343e9f15e9e69930c17ed7ebb20199acf9aed8067c41be4d6c",
  "tests/e2e/fixture.ts": "3fa0ffcbd57a35dfa12c5d26d71b3c608561d34da48d4bdb14e0f8b358dd2595",
  "tests/e2e/route-drain.ts": "f3044b0c5a85053ec0056abf38dcfb75d815ff87bc419e2ae23a65c713cbf59c",
  "tests/e2e/reporter.ts": "6b5b2ec8ac81ad76f3babd0f26c715a9efa498970352cd1f6fc06be7e54a992e",
  "tests/e2e/auth.spec.ts": "496b7c23eafea848cbc638226f881f5a3107bc1f912fabc5ff13a8c51ae16c56",
  "tests/e2e/sync.spec.ts": "67596bc7db4cb04c834942e6642790e2fd1ae25540da61eb3095b6095959aedd",
  "tests/e2e/language-sync.spec.ts": "102ed75da283dcbd0b054b08ec14a11745b2b18eb5adeb83c565662b681e46eb",
  "tests/e2e/language-reset.spec.ts": "5e3727a730de4b44a84f80415b06a910f2bed81d152abd79b158983815fb2d4c",
  "tests/e2e/schema.sql": "4842f96fa1d606441538121152ddea3961fe7c01cabb09f20bcb7f59d064f632",
  "package.json": "502cc1e358c43ded2b7b4d815809f1e233d64099c7878be009e0a3b2c1a3355f",
  "package-lock.json": "3bc89c20e99857839872981b4cb45070ad24fef68b2d0545a80da91b3fa5a338",
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
  "tests/e2e/japanese-level-flow-state.ts": "042da540d19db5b7f7df5d499545c1dfe9318353eb9267a0ddf31f8448847eb3",
  "tests/e2e/japanese-level-choice.spec.ts": "2b4b3055876f0b3b36aabfccfdfed1d08010d51a8bcd3102fec49a7f00d225e2",
  "tests/e2e/japanese-due-review.spec.ts": "d3aafce7665dff67a74e0a8a379d7e8fd87117e8027fd45447f6efb35183d988"
};
const workflowHash = 'c65190845968db7077198840dbdeb9d9a42ae4e57038f1dcfbcdcbc3bd0e5bf6';

test('exact command, fixed project/source inventory, readiness and ceilings stay narrow', async () => {
  assert.equal(browserCommand, 'node node_modules/@playwright/test/cli.js test tests/e2e/auth.spec.ts:3 tests/e2e/sync.spec.ts:3 tests/e2e/language-sync.spec.ts:8 tests/e2e/language-reset.spec.ts:39 tests/e2e/japanese-answer-persistence.spec.ts:8 tests/e2e/daily-review-completion.spec.ts:3 tests/e2e/language-reset-receipts.spec.ts:9 tests/e2e/japanese-middle-reading.spec.ts:3 tests/e2e/japanese-upper-reading.spec.ts:3 tests/e2e/japanese-level-choice.spec.ts:3 tests/e2e/japanese-due-review.spec.ts:3 tests/e2e/curriculum-corruption.spec.ts:3 tests/e2e/curriculum-terminal.spec.ts:3 tests/e2e/japanese-settings-recovery.spec.ts:3 tests/e2e/japanese-grammar-chunk.spec.ts:3 tests/e2e/japanese-reference-routine.spec.ts:3 tests/e2e/budget-first-manual.spec.ts:3 tests/e2e/workout-progression.spec.ts:37 tests/e2e/budget-delete-undo.spec.ts:10 tests/e2e/workout-times.spec.ts:43 --config playwright.chromium-smoke.config.ts --project chromium-app-smoke');
  assert.deepEqual(inventory, [{ source: 19, line: 3, column: 5, project: 5 }, { source: 38, line: 3, column: 5, project: 5 },
    { source: 33, line: 8, column: 5, project: 5 }, { source: 32, line: 39, column: 5, project: 5 }, { source: 46, line: 8, column: 5, project: 5 }, { source: 47, line: 3, column: 5, project: 5 }, { source: 48, line: 9, column: 5, project: 5 }, { source: 49, line: 3, column: 5, project: 5 }, { source: 50, line: 3, column: 5, project: 5 }, { source: 51, line: 3, column: 5, project: 5 }, { source: 52, line: 3, column: 5, project: 5 }, { source: 53, line: 3, column: 5, project: 5 }, { source: 54, line: 3, column: 5, project: 5 }, { source: 55, line: 3, column: 5, project: 5 }, { source: 56, line: 3, column: 5, project: 5 }, { source: 57, line: 3, column: 5, project: 5 }, { source: 58, line: 3, column: 5, project: 5 }, { source: 41, line: 37, column: 5, project: 5 }, { source: 20, line: 10, column: 5, project: 5 }, { source: 42, line: 43, column: 5, project: 5 }]);
  assert.deepEqual(inventory.map(item => sources[item.source - 1]), ['tests/e2e/auth.spec.ts', 'tests/e2e/sync.spec.ts', 'tests/e2e/language-sync.spec.ts', 'tests/e2e/language-reset.spec.ts', 'tests/e2e/japanese-answer-persistence.spec.ts', 'tests/e2e/daily-review-completion.spec.ts', 'tests/e2e/language-reset-receipts.spec.ts', 'tests/e2e/japanese-middle-reading.spec.ts', 'tests/e2e/japanese-upper-reading.spec.ts', 'tests/e2e/japanese-level-choice.spec.ts', 'tests/e2e/japanese-due-review.spec.ts', 'tests/e2e/curriculum-corruption.spec.ts', 'tests/e2e/curriculum-terminal.spec.ts', 'tests/e2e/japanese-settings-recovery.spec.ts', 'tests/e2e/japanese-grammar-chunk.spec.ts', 'tests/e2e/japanese-reference-routine.spec.ts', 'tests/e2e/budget-first-manual.spec.ts', 'tests/e2e/workout-progression.spec.ts', 'tests/e2e/budget-delete-undo.spec.ts', 'tests/e2e/workout-times.spec.ts']);
  assert.equal(stages[0].command, 'node --test --test-reporter=./scripts/qa-private-safety-reporter.mjs scripts/isolated-chromium-smoke/safety.test.mjs');
  assert.equal(stages[1].command, 'pinned-bundled-chromium-readiness');
  assert.equal(stages[1].lifecycleDiagnostics, true);
  assert.equal(stages[0].lifecycleDiagnostics, true);
  assert.deepEqual(stages.filter(stage => stage.lifecycleDiagnostics).map(stage => stage.id), ['stage-01', 'stage-02']);
  assert.equal(stages[2].command, browserCommand); assert.equal(stages[2].diagnosticInventory, inventory);
  assert.deepEqual(stages.map(stage => stage.timeoutMs), [120000, 240000, 405000]);
  assert.equal(totalTimeoutMs, 775000); assert.ok(totalTimeoutMs + 5000 <= 13 * 60000);
  assert.ok(stages.reduce((sum, stage) => sum + stage.timeoutMs, 0) + 3 * 5000 <= 13 * 60000);
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(lock.packages['node_modules/@playwright/test'].version, '1.63.0');
  assert.equal(lock.packages['node_modules/playwright'].version, '1.63.0');
  assert.equal(diagnosticInvocations(browserCommand), 1);
  for (const changed of [browserCommand.replace('tests/e2e/budget-delete-undo.spec.ts:10 ', ''), browserCommand.replace('budget-delete-undo.spec.ts:10', 'budget-delete-undo.spec.ts:11'), browserCommand.replace('tests/e2e/workout-times.spec.ts:43 ', ''), browserCommand.replace('workout-times.spec.ts:43', 'workout-times.spec.ts:20'), browserCommand.replace('tests/e2e/workout-progression.spec.ts:37 ', ''), browserCommand.replace('workout-progression.spec.ts:37', 'workout-progression.spec.ts:38'), browserCommand.replace('tests/e2e/budget-first-manual.spec.ts:3 ', ''), browserCommand.replace('budget-first-manual.spec.ts:3', 'budget-first-manual.spec.ts:4'), browserCommand.replace('tests/e2e/japanese-reference-routine.spec.ts:3 ', ''), browserCommand.replace('japanese-reference-routine.spec.ts:3', 'japanese-reference-routine.spec.ts:4'), browserCommand.replace('tests/e2e/japanese-grammar-chunk.spec.ts:3 ', ''), browserCommand.replace('japanese-grammar-chunk.spec.ts:3', 'japanese-grammar-chunk.spec.ts:4'), browserCommand.replace('tests/e2e/japanese-settings-recovery.spec.ts:3 ', ''), browserCommand.replace('japanese-settings-recovery.spec.ts:3', 'japanese-settings-recovery.spec.ts:4'), browserCommand.replace('tests/e2e/curriculum-corruption.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/curriculum-terminal.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/japanese-level-choice.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/japanese-due-review.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/japanese-middle-reading.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/japanese-upper-reading.spec.ts:3 ', ''), browserCommand.replace('tests/e2e/language-reset-receipts.spec.ts:9 ', ''), browserCommand.replace('tests/e2e/daily-review-completion.spec.ts:3 ', ''), browserCommand + ' --list', browserCommand + ' --grep .*', browserCommand.replace(':39', ':119'),
    browserCommand.replace('--project chromium-app-smoke', '--project chromium'), stages[1].command, 'echo ' + browserCommand]) {
    assert.equal(diagnosticInvocations(changed), 0);
  }
});

test('stage one lifecycle opt-in distinguishes native exit and timeout without exposing captured content', async () => {
  const context = await fresh();
  try {
    for (const mode of ['exit', 'timeout']) {
      const script = join(context.root, `${mode}.mjs`);
      await writeFile(script, `import { writeFileSync } from 'node:fs';
console.log(${JSON.stringify(canary)}); console.error(${JSON.stringify(canary)});
for (const key of ['GITHUB_OUTPUT', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY', 'GITHUB_PATH']) writeFileSync(process.env[key], ${JSON.stringify(canary)});
${mode === 'exit' ? 'process.exitCode = 7;' : 'setTimeout(() => process.exit(9), 2000);'}
`);
      const output = []; let runs = 0, readinessCalls = 0;
      const code = await supervise({ ...context, emit: value => output.push(value),
        readiness: async () => { readinessCalls++; return 0; },
        run: async (items, options) => {
          runs++; assert.deepEqual(items, [stages[0]]); assert.equal(options.timeoutMs, 120000);
          // Only the finite synthetic command and its short test deadline differ.
          // The real caller's unchanged plan and actual lifecycle path are checked.
          return runStages([{ ...items[0], command: `${JSON.stringify(process.execPath)} ${JSON.stringify(script)}` }], {
            ...options, timeoutMs: mode === 'exit' ? 1000 : 250,
          });
        },
      });
      assert.equal(code, 1); assert.equal(runs, 1); assert.equal(readinessCalls, 0);
      assert.equal(output.length, 5);
      assert.match(output[0], new RegExp(`^stage-01 lifecycle reason=${mode === 'exit' ? 'none code=7 signal=0' : 'timeout code=-1 signal=15'} `));
      assert.match(output[0], /leader=exited capture=drained processCleanup=unverified/);
      assert.deepEqual(output.slice(1), ['stage-01 failed', 'stage-02 not-run', 'stage-03 not-run',
        'chromium-app-smoke failed browser=playwright-chromium-headless-shell realBrowser=unverified fixtureCleanup=unverified']);
      privateOutput(output);
      for (const value of [canary, script, context.root]) assert.ok(!output.join('\n').includes(value));
    }
  } finally { await rm(context.root, { recursive: true, force: true }); }
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
      for (const addition of ["  'tests/e2e/japanese-answer-persistence.spec.ts', // 46\n", "  'tests/e2e/daily-review-completion.spec.ts', // 47\n", "  'tests/e2e/language-reset-receipts.spec.ts', // 48\n", "  'tests/e2e/japanese-middle-reading.spec.ts', // 49\n", "  'tests/e2e/japanese-upper-reading.spec.ts', // 50\n", "  'tests/e2e/japanese-level-choice.spec.ts', // 51\n", "  'tests/e2e/japanese-due-review.spec.ts', // 52\n", "  'tests/e2e/curriculum-corruption.spec.ts', // 53\n", "  'tests/e2e/curriculum-terminal.spec.ts', // 54\n", "  'tests/e2e/japanese-settings-recovery.spec.ts', // 55\n", "  'tests/e2e/japanese-grammar-chunk.spec.ts', // 56\n", "  'tests/e2e/japanese-reference-routine.spec.ts', // 57\n", "  'tests/e2e/budget-first-manual.spec.ts', // 58\n"]) {
        assert.equal(text.split(addition).length, 2); text = text.replace(addition, '');
      }
      bytes = Buffer.from(text);
    }
    if (path === 'scripts/e2e-stack.mjs') {
      const addition = "    appendFileSync(`${workdir}/supabase/seed.sql`, '\\n' + readFileSync('supabase/migrations/20261111000000_add_language_reset_replay_receipts.sql', 'utf8'));\n";
      const text = bytes.toString('utf8');
      assert.equal(text.split(addition).length, 2);
      const proteinAddition = "    appendFileSync(`${workdir}/supabase/seed.sql`, '\\n' + readFileSync('supabase/migrations/20261113055000_diet_protein_response_marker.sql', 'utf8'));\n";
      assert.equal(text.split(proteinAddition).length, 2);
      bytes = Buffer.from(text.replace(addition, '').replace(proteinAddition, ''));
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `Preserved source changed: ${path}`);
  }
  const walk = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true }))
    .map(async item => item.isDirectory() ? walk(join(directory, item.name)) : [join(directory, item.name)]))).flat();
  const files = (await Promise.all(['app', 'lib', 'tests'].map(walk))).flat();
  assert.equal(files.filter(file => file.endsWith('.test.ts')).length, 357);
  const workflow = await readFile('.github/workflows/japanese-candidate-ci.yml', 'utf8');
  const addition = "      - name: Verify twenty authenticated app flows in PINNED PLAYWRIGHT CHROMIUM privately\n        if: matrix.compiler == 'default'\n        run: node scripts/isolated-chromium-smoke/supervisor.mjs\n";
  assert.equal(workflow.split(addition).length, 2);
  const dietAddition = "      - name: Verify four diet calendar and lesson regressions in isolated Chromium\n        if: matrix.compiler == 'webpack'\n        run: node scripts/isolated-diet-regression/supervisor.mjs\n";
  assert.equal(workflow.split(dietAddition).length, 2);
  assert.ok(workflow.indexOf('run: node scripts/isolated-chromium-smoke/supervisor.mjs') < workflow.indexOf(dietAddition));
  assert.ok(workflow.indexOf(dietAddition) < workflow.indexOf('      - name: Remove disposable fixture\n        if: always()'));
  assert.equal(workflow.split('len(tests) == 357').length, 2);
  assert.equal(createHash('sha256').update(workflow.replace(dietAddition, '').replace(addition, '').replace('len(tests) == 357', 'len(tests) == 343')).digest('hex'), workflowHash);
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
  assert.equal(result.stdout, 'chromium-app-smoke admission failed category=fixture\nchromium-app-smoke failed browser=playwright-chromium-headless-shell realBrowser=unverified fixtureCleanup=unverified\n');
});

test('config contains only Chromium, strict deadlines, private media settings and real loopback Next start', () => {
  const source = `const {default: config} = await import(${JSON.stringify('file://' + resolve('playwright.chromium-smoke.config.ts'))}); process.stdout.write(JSON.stringify(config));`;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
    env: environment(), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0); const config = JSON.parse(result.stdout);
  assert.deepEqual(config.projects, [{ name: 'chromium-app-smoke' }]);
  assert.deepEqual(config.testMatch, ['auth.spec.ts', 'sync.spec.ts', 'language-sync.spec.ts', 'language-reset.spec.ts', 'japanese-answer-persistence.spec.ts', 'daily-review-completion.spec.ts', 'language-reset-receipts.spec.ts', 'japanese-middle-reading.spec.ts', 'japanese-upper-reading.spec.ts', 'japanese-level-choice.spec.ts', 'japanese-due-review.spec.ts', 'curriculum-corruption.spec.ts', 'curriculum-terminal.spec.ts', 'japanese-settings-recovery.spec.ts', 'japanese-grammar-chunk.spec.ts', 'japanese-reference-routine.spec.ts', 'budget-first-manual.spec.ts', 'workout-progression.spec.ts', 'budget-delete-undo.spec.ts', 'workout-times.spec.ts']);
  assert.equal(config.fullyParallel, false); assert.equal(config.workers, 1); assert.equal(config.retries, 0);
  assert.equal(config.forbidOnly, true); assert.equal(config.repeatEach, 1); assert.equal(config.timeout, 90000);
  assert.equal(config.expect.timeout, 15000); assert.equal(config.use.browserName, 'chromium'); assert.equal(config.use.headless, true);
  assert.equal(config.use.channel, undefined);
  assert.equal(config.use.executablePath, undefined);
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

test('Playwright list-only collection resolves exactly twenty titles and coordinates without fixtures', () => {
  // --list does not start webServer, browsers, test bodies or fixture hooks.
  const args = browserCommand.split(' ').slice(1).concat(['--list', '--reporter=json']);
  const result = spawnSync(process.execPath, args, { env: environment(), encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0); const report = JSON.parse(result.stdout);
  assert.deepEqual(report.errors, []);
  const specs = suite => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specs)];
  const selected = report.suites.flatMap(specs);
  assert.equal(selected.length, 20);
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
    ['japanese-settings-recovery.spec.ts:3', 'active settings preserve extensions and reject stale partial or uncertain saves through explicit recovery and reentry'],
    ['japanese-grammar-chunk.spec.ts:3', 'grammar expression chunks and silent listening fallback preserve wrong-answer history through real saves and relogin'],
    ['japanese-reference-routine.spec.ts:3', 'kana and word ordinary quizzes retry exact daily completion once and preserve records through invalidation boards settings and relogin'], ['budget-first-manual.spec.ts:3', 'first budget profile and manual expense require review and preserve both owners through authentic save and reload'], ['workout-progression.spec.ts:37', 'authenticated workout review requires confirmation before applying one load step'], ['budget-delete-undo.spec.ts:10', 'expense, income and saving deletion can each restore the exact server row'], ['workout-times.spec.ts:43', 'actual workout times protect later changes and reject invalid intervals without touching app state'],
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
    if (failure < 0) assert.equal(options.output.at(-1), 'chromium-app-smoke passed tests=20 browser=playwright-chromium-headless-shell realBrowser=true fixtureCleanup=passed');
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
  const originalMap = sourceMap.replace("  'tests/e2e/japanese-level-choice.spec.ts', // 51\n", '').replace("  'tests/e2e/japanese-due-review.spec.ts', // 52\n", '').replace("  'tests/e2e/curriculum-corruption.spec.ts', // 53\n", '').replace("  'tests/e2e/curriculum-terminal.spec.ts', // 54\n", '').replace("  'tests/e2e/japanese-settings-recovery.spec.ts', // 55\n", '').replace("  'tests/e2e/japanese-grammar-chunk.spec.ts', // 56\n", '').replace("  'tests/e2e/japanese-reference-routine.spec.ts', // 57\n", '').replace("  'tests/e2e/budget-first-manual.spec.ts', // 58\n", '');
  assert.equal(createHash('sha256').update(originalMap).digest('hex'), 'eadd83cc376147d355cf907670980a94166d57f16daf3365dda367e1a9d141c5');
  assert.equal(sources.length, 58);
  assert.deepEqual(sources.slice(48), ['tests/e2e/japanese-middle-reading.spec.ts', 'tests/e2e/japanese-upper-reading.spec.ts', 'tests/e2e/japanese-level-choice.spec.ts', 'tests/e2e/japanese-due-review.spec.ts', 'tests/e2e/curriculum-corruption.spec.ts', 'tests/e2e/curriculum-terminal.spec.ts', 'tests/e2e/japanese-settings-recovery.spec.ts', 'tests/e2e/japanese-grammar-chunk.spec.ts', 'tests/e2e/japanese-reference-routine.spec.ts', 'tests/e2e/budget-first-manual.spec.ts']);
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
      const terminalHelpers = sourceId === 54 ? [
        { name: 'preservationSync', line: 8, column: 5, returnLine: 62, title: 'terminal sync confirmation' },
        { name: 'preservationLocal', line: 8, column: 49, returnLine: 65, title: 'terminal local preservation' },
        { name: 'preservationServer', line: 9, column: 5, returnLine: 68, title: 'terminal server preservation' },
        { name: 'preservationFitness', line: 9, column: 115, returnLine: 71, title: 'terminal fitness preservation' },
      ] : [];
      // Offline coordinate fixture: retain each actual literal step call prefix at
      // its original line, replacing app bodies with a throwing external helper.
      // This checks native attribution only, not application execution.
      const synthetic = Array(lines.length).fill('');
      synthetic[0] = `import { test, expect } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))}; import { fail } from './offline-phase-helper'; for (let phase = 0; phase < ${positions.length}; phase++) {`;
      synthetic[2] = "test('synthetic private phase ' + phase, async () => {";
      if (terminalHelpers.length) {
        // Actual unchanged() calls, byte-for-byte at their native source lines.
        // Only external dependencies are synthetic. Failure is injected before
        // a dependency returns, never by changing the owning spec's assertions.
        synthetic[3] = 'const page = {}, saved = {}, fitness = {}; const canonical = value => JSON.stringify(value);';
        synthetic[4] = 'const synced = async () => { await fail(phase, 0); }; const localMatches = async () => { await fail(phase, 1); };';
        synthetic[5] = 'const qa = { readLanguage: async () => { await fail(phase, 2); return saved; }, read: async () => { await fail(phase, 3); return fitness; } };';
        assert.equal(lines[6], '  const unchanged = async () => {'); assert.equal(lines[9], '  };');
        for (const index of [6, 7, 8, 9]) synthetic[index] = lines[index];
      }
      for (const [index, line] of positions.entries()) {
        const prefix = lines[line - 1].split('async () => {')[0];
        assert.ok(prefix.includes('await test.step('));
        const helper = terminalHelpers[index];
        synthetic[line - 1] = `${prefix}async () => { ${helper ? `if (phase === ${index}) await unchanged()` : `await fail(phase, ${index})`}; });`;
      }
      synthetic[positions.at(-1)] = '});';
      // All five terminal phase identities keep their nested checkpoint failures.
      // Playwright attributes these returned steps to the unchanged() callsite,
      // not the return statement. Keep both the real callers and wrappers.
      for (const helper of terminalHelpers) {
        assert.equal(lines[helper.line - 1].indexOf('await ' + helper.name) + 1, helper.column);
        assert.equal(lines[helper.returnLine - 2], `function ${helper.name}(action: () => Promise<void>) {`);
        assert.equal(lines[helper.returnLine - 1], `  return test.step('${helper.title}', action);`);
        assert.equal(lines[helper.returnLine], '}');
        for (const index of [helper.returnLine - 2, helper.returnLine - 1, helper.returnLine]) synthetic[index] = lines[index];
      }
      synthetic.push('}');
      await mkdir(join(root, 'tests/e2e'), { recursive: true });
      await writeFile(join(root, path), synthetic.join('\n'));
      await writeFile(join(root, 'tests/e2e/offline-phase-helper.ts'), `import { expect } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))};\nexport async function fail(selected, current) { if (selected === current) expect(${JSON.stringify(canary)}).toBe('PRIVATE_EXPECTED'); }\n`);
      await writeFile(join(root, 'offline.config.mjs'), `export default ${JSON.stringify({ testDir: './tests/e2e', workers: 1, retries: 0, projects: [{ name: 'chromium-app-smoke' }], reporter: [[join(repository, 'tests/e2e/reporter.ts')]] })};\n`);
      // Share only CLI/config startup. Each phase is a unique native test at 3:5;
      // workers=1 and retries=0 are unchanged, and failures still restart workers.
      const journalPath = join(root, 'journal.jsonl'); await writeFile(journalPath, '', { mode: 0o600 });
      const child = spawnSync(process.execPath, [join(repository, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'offline.config.mjs'], {
        cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', QA_PRIVATE_DIAGNOSTIC_FILE: journalPath, QA_PRIVATE_DIAGNOSTIC_TOKEN: token },
      });
      assertNativePhaseExit(sourceId - 50, sourceId, child);
      const output = [];
      // This coordinate-only fixture is not the official 18-case app inventory.
      const report = await emitDiagnosticJournal({ path: journalPath, token, expected: 1, stage: 'stage-03', termination: 'none', emit: value => output.push(value) });
      assert.equal(report.report, 'complete'); assert.equal(report.invocations.length, 1);
      const invocation = report.invocations[0];
      assert.deepEqual(invocation.counts, { passed: 0, failed: positions.length, timedOut: 0, skipped: 0, interrupted: 0, unknown: 0 });
      assert.equal(invocation.status, 'failed'); assert.deepEqual(invocation.active, []); assert.equal(invocation.omitted, 0);
      assert.equal(invocation.runnerErrors, 0); assert.equal(invocation.details.length, positions.length);
      assert.deepEqual(invocation.details.map(detail => detail.test), positions.map((_, index) => index + 1));
      const actualLines = [];
      for (const [phase, detail] of invocation.details.entries()) {
        const line = positions[phase];
        assert.equal(detail.status, 'failed');
        assert.equal(detail.source, sourceId); assert.equal(detail.line, 3); assert.equal(detail.column, 5); assert.equal(detail.project, 5);
        assert.equal(detail.failure.category, 1); assert.deepEqual(detail.failure.errors, []); assert.deepEqual(detail.failure.failedOperations, []);
        const helper = terminalHelpers[phase];
        assert.equal(detail.failure.failedSteps.length, helper ? 2 : 1);
        assert.equal(detail.failure.failedSteps[0].source, sourceId); assert.equal(detail.failure.failedSteps[0].line, line);
        assert.equal(detail.failure.failedSteps[0].column, 5);
        if (helper) assert.deepEqual(detail.failure.failedSteps[1], { source: sourceId, line: helper.line, column: helper.column });
        assert.equal(detail.failure.stepScanTruncated, 0); actualLines.push(detail.failure.failedSteps[0].line);
      }
      assert.equal(new Set(actualLines).size, positions.length); assert.deepEqual(actualLines, expectedLines); privateOutput(output);
      const text = output.join('\n'), bytes = await readFile(journalPath, 'utf8');
      for (const secret of [canary, 'PRIVATE_EXPECTED', file, 'offline-phase-helper', root, 'synthetic private phase',
        ...positions.map(line => lines[line - 1]), ...terminalHelpers.map(helper => helper.title)]) {
        assert.ok(!text.includes(secret)); assert.ok(!bytes.includes(secret));
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
  "tests/e2e/curriculum-terminal.spec.ts": "18847114d43198589168f95303a44b770325e46278acc921515c68834f33420a",
  "tests/e2e/curriculum-browser-state.ts": "276908fe0cc7b095cf34ad530b4cfa04c51271c3ee8402a885caca42fe3d0a7b"
};
  for (const [path, hash] of Object.entries(hashes)) {
    let bytes = await readFile(path);
    if (path === 'app/language/progress/page.tsx') {
      let text = bytes.toString('utf8');
      const displayOnly = [
        ["{ key: \"wrongKana\", label: \"가나 오답 기록\",", "{ key: \"wrongKana\", label: \"헷갈린 글자\","],
        ["{obj.type === \"hiragana\" ? \"히라가나\" : obj.type === \"katakana\" ? \"가타카나\" : obj.type}", "{obj.type}"],
        ["{obj.mode === \"quiz\" ? \"퀴즈 오답\" : obj.mode === \"confusing\" ? \"헷갈리는 글자 연습 오답\" : obj.mode}", "{obj.mode}"],
        ["wrongKana: \"가나 오답 기록을 모두 삭제할까요?\",", "wrongKana: \"헷갈린 글자 오답을 모두 삭제할까요?\","],
      ];
      for (const [after, before] of displayOnly) {
        assert.equal(text.split(after).length, 2);
        assert.equal(text.split(before).length, 1);
        text = text.replace(after, before);
      }
      bytes = Buffer.from(text);
    }
    if (path === 'components/language/FocusedLesson.tsx' || path === 'utils/learningSession.ts') {
      const reviewedChanges = {
        "components/language/FocusedLesson.tsx": [
          [
            "  const finishing = useRef(false);\n  const audio = useLearningAudio();\n  const { stop, play } = audio;\n  const quizIndices = getSessionQuizIndices(lesson, session.minutes, session.quizPlanVersion);\n  const questionIndex = quizIndices[session.quizCursor];\n  const result = getSessionResult(lesson, session);\n  const word = lesson.words[session.wordIndex];\n",
            "  const finishing = useRef(false);\n  const audio = useLearningAudio();\n  const { stop, play } = audio;\n  const quizIndices = getSessionQuizIndices(lesson, session.minutes);\n  const questionIndex = quizIndices[session.quizCursor];\n  const result = getSessionResult(lesson, session);\n  const word = lesson.words[session.wordIndex];\n"
          ]
        ],
        "utils/learningSession.ts": [
          [
            "export type LearningMinutes = 5 | 10 | 20;\nexport type LearningSession = {\n  version: 1;\n  quizPlanVersion?: 2;\n  id: string;\n  lessonId: string;\n  minutes: LearningMinutes;\n",
            "export type LearningMinutes = 5 | 10 | 20;\nexport type LearningSession = {\n  version: 1;\n  id: string;\n  lessonId: string;\n  minutes: LearningMinutes;\n"
          ],
          [
            "};\n\nexport function createLearningSession(lessonId: string, minutes: LearningMinutes, mode: LearnerMode): LearningSession {\n  return { version: 1, ...(/^[fwt](1[3-9]|20)$/.test(lessonId) ? { quizPlanVersion: 2 as const } : {}), id: globalThis.crypto.randomUUID(), lessonId, minutes, mode, stage: 0, wordIndex: 0, quizCursor: 0, answers: {}, firstAnswers: {}, responses: {}, speakingChecks: [false, false, false] };\n}\n\nexport function getSessionQuizIndices(lesson: CurriculumLesson, minutes: LearningMinutes, quizPlanVersion?: 2): number[] {\n  if (quizPlanVersion !== undefined && quizPlanVersion !== 2) throw new Error(\"지원하지 않는 학습 문항 버전이에요.\");\n  if (quizPlanVersion === 2 && /^[fwt](1[3-9]|20)$/.test(lesson.id)) {\n    if (lesson.quiz.length < 10) throw new Error(\"문형 연습 자료가 없어 기록을 안전하게 이어갈 수 없어요.\");\n    // Immutable V2 plans: new identities 8/9, legacy identities 0–7 unchanged.\n    if (minutes === 5) return [2, 8, 9];\n    if (minutes === 10) return [2, 4, 6, 8, 9];\n    return [0, 2, 4, 6, 3, 5, 8, 9];\n  }\n  const indices = lesson.quiz.slice(0, 8).map((_, index) => index);\n  // The generated vocabulary checks cover all three words, even in a short\n  // session. Preserve their source indices so existing review IDs stay valid.\n  const vocabulary = indices.filter((index) => index >= 2 && lesson.quiz[index].kind !== \"input\" && lesson.quiz[index].kind !== \"listening\");\n",
            "};\n\nexport function createLearningSession(lessonId: string, minutes: LearningMinutes, mode: LearnerMode): LearningSession {\n  return { version: 1, id: globalThis.crypto.randomUUID(), lessonId, minutes, mode, stage: 0, wordIndex: 0, quizCursor: 0, answers: {}, firstAnswers: {}, responses: {}, speakingChecks: [false, false, false] };\n}\n\nexport function getSessionQuizIndices(lesson: CurriculumLesson, minutes: LearningMinutes): number[] {\n  const indices = lesson.quiz.map((_, index) => index);\n  // The generated vocabulary checks cover all three words, even in a short\n  // session. Preserve their source indices so existing review IDs stay valid.\n  const vocabulary = indices.filter((index) => index >= 2 && lesson.quiz[index].kind !== \"input\" && lesson.quiz[index].kind !== \"listening\");\n"
          ],
          [
            "  const draft = value as Partial<LearningSession>;\n  if (draft.version !== 1 || draft.lessonId !== lesson.id || ![5, 10, 20].includes(draft.minutes ?? 0)) return;\n  if (draft.mode !== \"starter\" && draft.mode !== \"reader\") return;\n  if (draft.quizPlanVersion !== undefined && draft.quizPlanVersion !== 2) throw new Error(\"지원하지 않는 학습 문항 버전이에요. 기록을 덮어쓰지 않고 중단했어요.\");\n  // The storage reader validates before opting into lossless saved fields.\n  // Other callers retain the existing defensive normalization contract.\n  const clean = { ...(preserveStoredFields ? draft : {}), ...createLearningSession(lesson.id, draft.minutes as LearningMinutes, draft.mode) };\n  // Never upgrade a saved legacy draft merely by loading it.\n  delete clean.quizPlanVersion;\n  if (draft.quizPlanVersion === 2) clean.quizPlanVersion = 2;\n  if (typeof draft.id === \"string\" && draft.id.length <= 100 && draft.id.length > 0) clean.id = draft.id;\n  const bounded = (number: unknown, max: number) => typeof number === \"number\" && Number.isInteger(number) ? Math.max(0, Math.min(number, max)) : 0;\n  clean.stage = bounded(draft.stage, 4);\n  clean.wordIndex = bounded(draft.wordIndex, lesson.words.length - 1);\n  clean.quizCursor = bounded(draft.quizCursor, getSessionQuizIndices(lesson, clean.minutes, clean.quizPlanVersion).length - 1);\n  const answerMap = (map: unknown): Record<number, boolean> => !map || typeof map !== \"object\" ? {} : Object.fromEntries(Object.entries(map).filter(([key, result]) => /^\\d+$/.test(key) && (preserveStoredFields || Number(key) < lesson.quiz.length) && typeof result === \"boolean\"));\n  clean.answers = answerMap(draft.answers);\n  clean.firstAnswers = answerMap(draft.firstAnswers);\n",
            "  const draft = value as Partial<LearningSession>;\n  if (draft.version !== 1 || draft.lessonId !== lesson.id || ![5, 10, 20].includes(draft.minutes ?? 0)) return;\n  if (draft.mode !== \"starter\" && draft.mode !== \"reader\") return;\n  // The storage reader validates before opting into lossless saved fields.\n  // Other callers retain the existing defensive normalization contract.\n  const clean = { ...(preserveStoredFields ? draft : {}), ...createLearningSession(lesson.id, draft.minutes as LearningMinutes, draft.mode) };\n  if (typeof draft.id === \"string\" && draft.id.length <= 100 && draft.id.length > 0) clean.id = draft.id;\n  const bounded = (number: unknown, max: number) => typeof number === \"number\" && Number.isInteger(number) ? Math.max(0, Math.min(number, max)) : 0;\n  clean.stage = bounded(draft.stage, 4);\n  clean.wordIndex = bounded(draft.wordIndex, lesson.words.length - 1);\n  clean.quizCursor = bounded(draft.quizCursor, getSessionQuizIndices(lesson, clean.minutes).length - 1);\n  const answerMap = (map: unknown): Record<number, boolean> => !map || typeof map !== \"object\" ? {} : Object.fromEntries(Object.entries(map).filter(([key, result]) => /^\\d+$/.test(key) && (preserveStoredFields || Number(key) < lesson.quiz.length) && typeof result === \"boolean\"));\n  clean.answers = answerMap(draft.answers);\n  clean.firstAnswers = answerMap(draft.firstAnswers);\n"
          ],
          [
            "}\n\nexport function getSessionResult(lesson: CurriculumLesson, session: LearningSession) {\n  const indices = getSessionQuizIndices(lesson, session.minutes, session.quizPlanVersion);\n  const answered = indices.filter((index) => typeof session.answers[index] === \"boolean\").length;\n  const correct = indices.filter((index) => session.answers[index] === true).length;\n  const firstCorrect = indices.filter((index) => session.firstAnswers[index] === true).length;\n",
            "}\n\nexport function getSessionResult(lesson: CurriculumLesson, session: LearningSession) {\n  const indices = getSessionQuizIndices(lesson, session.minutes);\n  const answered = indices.filter((index) => typeof session.answers[index] === \"boolean\").length;\n  const correct = indices.filter((index) => session.answers[index] === true).length;\n  const firstCorrect = indices.filter((index) => session.firstAnswers[index] === true).length;\n"
          ],
          [
            "\nexport function updateSessionReviews(existing: CurriculumReviewItem[], lesson: CurriculumLesson, session: LearningSession, now: Date): CurriculumReviewItem[] {\n  const updated = new Map(existing.map((item) => [item.id, item]));\n  for (const index of getSessionQuizIndices(lesson, session.minutes, session.quizPlanVersion)) {\n    if (session.answers[index] === undefined) continue;\n    const id = lesson.id + \":\" + index;\n    const previous = updated.get(id);\n",
            "\nexport function updateSessionReviews(existing: CurriculumReviewItem[], lesson: CurriculumLesson, session: LearningSession, now: Date): CurriculumReviewItem[] {\n  const updated = new Map(existing.map((item) => [item.id, item]));\n  for (const index of getSessionQuizIndices(lesson, session.minutes)) {\n    if (session.answers[index] === undefined) continue;\n    const id = lesson.id + \":\" + index;\n    const previous = updated.get(id);\n"
          ]
        ]
      };
      let text = bytes.toString('utf8');
      for (const [after, before] of reviewedChanges[path]) {
        assert.equal(text.split(after).length, 2);
        text = text.replace(after, before);
      }
      bytes = Buffer.from(text);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, path);
  }
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

// This source-only preparation adds one actual app scenario, not a mounted UI
// double. These checks run only synthetic helpers/collection/fixtureless workers.
test('active settings coverage pins its reviewed product overlay and narrowly scoped failure injection', async () => {
  const hashes = {
  "app/language/settings/page.tsx": "b6242717b70eff28322f6f64641ffae302f4525b129d5b0f7773140ded2e6b50",
  "utils/languageSettingsPage.ts": "6093eecb8f0857251c5b97034fd9033d0b0a3e948ef1b4ef1830add5c2635b5a",
  "tests/japanese-preview-session-options.test.ts": "ca017c35715ee180e704dc59d7ccbebef17df7b1ed73f8f87e68f1d0b8d57877",
  "tests/e2e/japanese-settings-recovery.spec.ts": "c31ef5d36e208378ccacd23d58f47547fcf687a5780c1d6934180a788394b1ba",
  "tests/e2e/japanese-settings-state.ts": "005613b394514b151d8b134325c19fe637f37c31fd86b605fb5b5277dc697878"
};
  for (const [path, hash] of Object.entries(hashes)) {
    let bytes = await readFile(path);
    if (path === 'app/language/settings/page.tsx') {
      const before = "<option value=\"reader\">글자를 읽어요 · 20분 학습에 직접 입력 포함</option>";
      const after = "<option value=\"reader\">글자를 읽어요 · 선택형으로 연습</option>";
      const text = bytes.toString('utf8');
      assert.equal(text.split(after).length, 2);
      assert.equal(text.split(before).length, 1);
      bytes = Buffer.from(text.replace(after, before));
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, path);
  }
  const source = await readFile('tests/e2e/japanese-settings-recovery.spec.ts', 'utf8');
  const helper = await readFile('tests/e2e/japanese-settings-state.ts', 'utf8');
  // Nested select options are part of Playwright's exact label text, not its accessible name.
  // Keep exact role/name matching; do not broaden to substring labels or hide ambiguity.
  for (const [name, count] of Object.entries({ '하루 학습 시간': 9, '글자·문제 도움': 2, '우선 학습 과정': 2, '기본 음성 속도': 2 })) {
    assert.equal(source.split(`getByRole('combobox', { name: '${name}', exact: true })`).length - 1, count);
    assert.ok(!source.includes(`getByLabel('${name}'`));
  }
  assert.equal(source.match(/test\('/g)?.length, 1); assert.ok(source.split('\n')[2].startsWith('test('));
  for (const text of [source, helper]) for (const forbidden of ['page.route', 'route.fulfill', 'addInitScript', 'waitForTimeout',
    'test.setTimeout', 'test.skip', 'test.fixme', 'audio.play', 'speakJapanese', 'qa.createAccount(', 'process.env.', 'saveLanguageSettingsPage(', 'readLanguageSettingsPage(', 'createRoot(']) assert.ok(!text.includes(forbidden), forbidden);
  for (const required of ["await login(page, qa.account, '/language')", 'peer = await context.newPage()', "peer.goto('/language/settings')",
    'await confirmedSettings(page, qa, saved, fitness)', 'await confirmedSettings(peer!, qa, saved, fitness)', 'await noSuccess(page)',
    "await settingsError(page, 'stale')", "await settingsError(page, 'write')", "await settingsError(page, 'confirmation')",
    "await settingsError(page, 'invalid')", 'await rereadSettings(page, false)', 'await rereadSettings(page, true)',
    "'japaneseAppSettings', 'before-write'", "'learningSettings', 'before-write'", "'integratedLearningSettingsV1', 'before-write'",
    "'integratedLearningSettingsV1', 'readback'", 'await localSettings(page, partial)', 'await localSettings(page, uncertain)',
    'await page.reload()', 'await page.goBack()', 'await page.goForward()', 'await restoredEditor()', 'width: 320', 'expect(size.scroll).toBeLessThanOrEqual(size.width)',
    "holdNext('PATCH', 'response', 'language_user_state')", 'finally { hold.release(); }', 'await qa.traffic.drain()',
    'qa.traffic.releaseAll()', 'await restoreSettingsFault(page)', 'await closeSettingsPeer(peerContext, peer, qa.traffic, onRequest)', "context.off('request', onRequest)",
    'await replaceSyntheticSettings(page, key, saved[key] as string)', 'expect(ttsRequests', 'planned accounts']) {
    assert.ok(source.toLowerCase().includes(required.toLowerCase()), required);
  }
  for (const required of ['hasSettingsAcknowledgement(qa.traffic.entries.slice(confirmedThrough.get(qa) ?? 0), expected)',
    'confirmedThrough.set(qa, qa.traffic.entries.length)', 'qa.traffic.assertLanguageConfirmed(expected)',
    'await localSettings(page, expected)', 'canonical(await qa.readLanguage())', 'expect(await qa.read()).toEqual(fitness)',
    'futureRoot', 'futureSection', 'futureGoal', 'futureIntegrated', "Object.fromEntries([['__proto__'", '...ownFuture', 'Object.getOwnPropertyDescriptor(prototype,',
    "this !== storage || name !== key || mode === 'observe' || stats.hits !== 0", 'set.call(this, name, value); armedRead = true;',
    "Object.defineProperty(prototype, 'getItem', getDescriptor)", "Object.defineProperty(prototype, 'setItem', setDescriptor)",
    'delete target.__qaSettingsFault', "page.off('dialog', handler)"]) assert.ok(helper.includes(required), required);
  assert.equal(helper.match(/client\.from\('language_user_state'\)\.update/g)?.length, 1);
  assert.equal(helper.match(/localStorage\.setItem/g)?.length, 1);
  assert.ok(!source.includes('localStorage.setItem'));
  for (const required of ['browser.newContext(', "await qa.traffic.install(peerContext)", "peerContext.on('request', onRequest)",
    "await login(peer, qa.account, '/language/settings')", "name: '기록을 안전하게 열고 있어요', exact: true",
    "await page.evaluate(() => window.dispatchEvent(new Event('focus')))",
    'await expect.poll(async () => canonical(await settingsState(page))).toBe(canonical(saved))',
    'await synced(page); await qa.traffic.drain()', 'await page.bringToFront(); await qa.traffic.drain(); await synced(page)', "await expect(selectedGoal(page, 4)).toHaveAttribute('aria-pressed', 'true')",
    "if (peerContext) await peerContext.unrouteAll({ behavior: 'wait' })", "if (peerContext) await peerContext.close()", "peerContext?.off('request', onRequest)", "viewport: page.viewportSize()", "await navigator.locks.query()", "toEqual({ held: 1, pending: 1 })"])
    assert.ok(source.includes(required), required);
  assert.ok(source.indexOf('await qa.traffic.install(peerContext)') < source.indexOf('peer = await peerContext.newPage()'));
  assert.ok(source.indexOf('await expect.poll(async () => canonical(await settingsState(page)))') < source.indexOf("const observe = await installSettingsFault"));
  assert.equal(source.match(/window\.dispatchEvent/g)?.length, 1);
  for (const forbidden of ['setOffline(', 'storageState:', 'newCDPSession', 'setFocusEmulationEnabled', 'navigator.locks.request', 'localStorage.removeItem']) assert.ok(!source.includes(forbidden), forbidden);

});

test('actual settings fault helper preserves unrelated storage and restores original descriptors in every mode', async () => {
  const ts = (await import('typescript')).default;
  const source = await readFile('tests/e2e/japanese-settings-state.ts', 'utf8');
  const begin = source.indexOf('export async function installSettingsFault');
  const end = source.indexOf('// Explicit corruption/correction');
  const js = ts.transpileModule(source.slice(begin, end).replaceAll('export ', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  for (const key of ['japaneseAppSettings', 'learningSettings', 'integratedLearningSettingsV1']) {
    for (const mode of ['observe', 'before-write', 'readback']) {
      class SyntheticStorage {
        values = new Map();
        getItem(key) { return this.values.get(key) ?? null; }
        setItem(key, value) { this.values.set(key, String(value)); }
      }
      const storage = new SyntheticStorage(), other = new SyntheticStorage(), window = { localStorage: storage };
      storage.setItem(key, 'before');
      const descriptors = Object.getOwnPropertyDescriptors(SyntheticStorage.prototype);
      const install = new Function('window', 'Storage', 'DOMException', js + '; return installSettingsFault;')(window, SyntheticStorage, DOMException);
      const page = { evaluate: async (callback, args) => callback(args), isClosed: () => false };
      const fault = await install(page, key, mode);
      try {
        await assert.rejects(() => install(page, key, mode));
        storage.setItem('language-cloud-sync-user', 'unrelated-owner'); other.setItem(key, 'other-storage');
        assert.equal(storage.getItem('language-cloud-sync-user'), 'unrelated-owner'); assert.equal(other.getItem(key), 'other-storage');
        if (mode === 'before-write') { assert.throws(() => storage.setItem(key, 'after')); assert.equal(storage.getItem(key), 'before'); }
        else {
          storage.setItem(key, 'after');
          if (mode === 'readback') assert.throws(() => storage.getItem(key));
          assert.equal(storage.getItem(key), 'after');
        }
        const stats = await fault.stats();
        assert.equal(stats.hits, mode === 'observe' ? 0 : 1); assert.equal(stats.failedReads, mode === 'readback' ? 1 : 0);
        assert.deepEqual(stats.writes, { japaneseAppSettings: 0, learningSettings: 0, integratedLearningSettingsV1: 0, [key]: 1 });
        storage.setItem(key, 'retry'); assert.equal(storage.getItem(key), 'retry'); assert.equal(stats.hits, mode === 'observe' ? 0 : 1);
      } finally { await fault.restore(); }
      assert.deepEqual(Object.getOwnPropertyDescriptors(SyntheticStorage.prototype), descriptors);
      assert.equal(window.__qaSettingsFault, undefined);
      storage.setItem(key, 'restored'); assert.equal(storage.getItem(key), 'restored');
    }
  }
});

test('settings acknowledgement rejects undelivered synthetic stale and mismatched write or read evidence', async () => {
  const ts = (await import('typescript')).default;
  const source = await readFile('tests/e2e/japanese-settings-state.ts', 'utf8');
  const js = ts.transpileModule(source.slice(source.indexOf('export function hasSettingsAcknowledgement'), source.indexOf('const confirmedThrough'))
    .replaceAll('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const canonical = value => JSON.stringify(value);
  const check = new Function('canonical', js + '; return hasSettingsAcknowledgement;')(canonical);
  const expected = { learningSettings: '{"dailyGoalCount":3,"future":{"keep":true}}' };
  const patch = { table: 'language_user_state', method: 'PATCH', status: 200, matched: true, cas: true, delivered: true, sent: expected, received: 20 };
  const get = { table: 'language_user_state', method: 'GET', status: 200, delivered: true, receivedState: expected, started: 21 };
  assert.equal(check([patch, get], expected), true);
  for (const entries of [[], [patch], [get], [{ ...patch, delivered: false }, get], [{ ...patch, synthetic: true }, get],
    [{ ...patch, matched: false }, get], [{ ...patch, cas: false }, get], [{ ...patch, sent: {} }, get],
    [{ ...patch, status: 503 }, get], [{ ...patch, table: 'user_app_state' }, get],
    [patch, { ...get, delivered: false }], [patch, { ...get, synthetic: true }], [patch, { ...get, receivedState: {} }],
    [patch, { ...get, status: 503 }], [patch, { ...get, started: 19 }], [patch, { ...get, table: 'user_app_state' }]]) {
    assert.equal(check(entries, expected), false);
  }
});

test('settings eight literal phases retain unique native test identities in one private fixtureless invocation', async () => {
  const repository = process.cwd(), root = await mkdtemp(join(tmpdir(), 'settings-native-phases-'));
  const file = 'tests/e2e/japanese-settings-recovery.spec.ts';
  const expectedLines = [29, 38, 67, 119, 142, 157, 180, 192];
  const checkpointLines = [68, 79, 87, 92, 103, 111];
  try {
    const source = await readFile(file, 'utf8'), lines = source.split('\n');
    const positions = lines.flatMap((line, index) => line.startsWith('    await test.step(') ? [index + 1] : []);
    assert.deepEqual(positions, expectedLines);
    const nested = lines.flatMap((line, index) => /^      await test.step\('0[1-6]',/.test(line) ? [index + 1] : []);
    assert.deepEqual(nested, checkpointLines);
    const { failureDiagnostics } = await import('../../tests/e2e/failure-diagnostics.ts');
    for (const [index, line] of nested.entries()) {
      assert.ok(lines[line - 1].startsWith(`      await test.step('0${index + 1}', async () => {`));
      const location = { file, line: 3, column: 5 }, at = { file, line, column: 7 };
      const details = failureDiagnostics(location, { status: 'failed', errors: [], steps: [
        { category: 'test.step', error: {}, location: { file, line: 67, column: 5 }, steps: [
          { category: 'test.step', error: {}, location: at, steps: [] },
        ] },
      ] }, repository, new Set([file]));
      assert.deepEqual(details.failedSteps, [{ file, line: 67, column: 5 }, at]);
      assert.equal(details.stepScanTruncated, undefined);
    }
    const synthetic = Array(lines.length).fill('');
    // Eight unique native test identities share the actual definition at 3:5.
    // Only CLI/config startup is shared; native failures may restart workers.
    synthetic[0] = `import { test } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))}; import { fail } from './offline-settings-helper'; for (let phase = 0; phase < 8; phase++) {`;
    synthetic[2] = "test('synthetic settings phase ' + phase, async () => {";
    for (const [index, line] of positions.entries()) {
      const prefix = lines[line - 1].split('async () => {')[0];
      assert.ok(prefix.includes('await test.step('));
      if (index === 2) {
        // The existing peer failure also proves a real nested coordinate without
        // adding a native test, CLI startup or worker restart to the safety lane.
        synthetic[line - 1] = `${prefix}async () => {`;
        const nestedLine = checkpointLines[4], nestedPrefix = lines[nestedLine - 1].split('async () => {')[0];
        synthetic[nestedLine - 1] = `${nestedPrefix}async () => { await fail(phase, ${index}); });`;
        synthetic[nestedLine] = '    });';
      } else synthetic[line - 1] = `${prefix}async () => { await fail(phase, ${index}); });`;
    }
    synthetic[positions.at(-1)] = '}); }';
    await mkdir(join(root, 'tests/e2e'), { recursive: true });
    await writeFile(join(root, file), synthetic.join('\n'));
    await writeFile(join(root, 'tests/e2e/offline-settings-helper.ts'), `import { expect } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))};\nexport async function fail(selected, current) { if (selected === current) expect(${JSON.stringify(canary)}).toBe('PRIVATE_EXPECTED'); }\n`);
    await writeFile(join(root, 'offline.config.mjs'), `export default ${JSON.stringify({ testDir: './tests/e2e', workers: 1, retries: 0, projects: [{ name: 'chromium-app-smoke' }], reporter: [[join(repository, 'tests/e2e/reporter.ts')]] })};\n`);
    const journalPath = join(root, 'journal.jsonl'); await writeFile(journalPath, '', { mode: 0o600 });
    const child = spawnSync(process.execPath, [join(repository, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'offline.config.mjs'], {
      cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', QA_PRIVATE_DIAGNOSTIC_FILE: journalPath, QA_PRIVATE_DIAGNOSTIC_TOKEN: token },
    });
    assert.equal(child.error, undefined); assert.equal(child.status, 1);
    const output = [];
    // This diagnostic-only invocation is not the official 15-item app inventory.
    const report = await emitDiagnosticJournal({ path: journalPath, token, expected: 1, stage: 'stage-03', termination: 'none', emit: value => output.push(value) });
    assert.equal(report.report, 'complete'); assert.equal(report.invocations.length, 1);
    const invocation = report.invocations[0];
    assert.deepEqual(invocation.counts, { passed: 0, failed: 8, timedOut: 0, skipped: 0, interrupted: 0, unknown: 0 });
    assert.equal(invocation.status, 'failed'); assert.deepEqual(invocation.active, []); assert.equal(invocation.omitted, 0);
    assert.equal(invocation.runnerErrors, 0); assert.equal(invocation.details.length, 8);
    assert.deepEqual(invocation.details.map(detail => detail.test), [1, 2, 3, 4, 5, 6, 7, 8]);
    const actualLines = [];
    for (const [index, detail] of invocation.details.entries()) {
      assert.equal(detail.source, 55); assert.equal(detail.line, 3); assert.equal(detail.column, 5); assert.equal(detail.project, 5);
      assert.equal(detail.failure.category, 1); assert.deepEqual(detail.failure.errors, []); assert.deepEqual(detail.failure.failedOperations, []);
      assert.equal(detail.failure.failedSteps.length, index === 2 ? 2 : 1); assert.equal(detail.failure.failedSteps[0].source, 55);
      if (index === 2) assert.deepEqual(detail.failure.failedSteps[1], { source: 55, line: checkpointLines[4], column: 7 });
      assert.equal(detail.failure.stepScanTruncated, 0); actualLines.push(detail.failure.failedSteps[0].line);
    }
    assert.equal(new Set(actualLines).size, 8); assert.deepEqual(actualLines, expectedLines); privateOutput(output);
    const text = output.join('\n'), bytes = await readFile(journalPath, 'utf8');
    for (const secret of [canary, 'PRIVATE_EXPECTED', file, 'offline-settings-helper', root, 'synthetic settings phase', ...[...positions, ...checkpointLines].map(line => lines[line - 1])]) {
      assert.ok(!text.includes(secret)); assert.ok(!bytes.includes(secret));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('valid journey restoration accepts only serialization differences and rebases after fresh exact server confirmation', async () => {
  const { expect } = await import('@playwright/test');
  const { readLevelJourney, LEVEL_JOURNEY_KEY, emptyLevelJourney } = await import('../../utils/japaneseLevelJourney.ts');
  const ts = (await import('typescript')).default;
  const source = await readFile('tests/e2e/japanese-level-flow-state.ts', 'utf8');
  const body = source.slice(source.indexOf('export async function journeySnapshot'), source.indexOf('export function observeSilentReading'));
  const compiled = ts.transpileModule(body.replaceAll('export ', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const helpers = new Function('expect', 'readLevelJourney', 'LEVEL_JOURNEY_KEY', 'canonical', 'synced',
    compiled + '; return { restoredLevelJourney, localMatches, persisted };')(
    expect, readLevelJourney, LEVEL_JOURNEY_KEY, canonical, async () => {});
  const stamp = '2026-11-12T00:00:00.000Z';
  const original = { ...emptyLevelJourney(), selectedLevel: 'intermediate', selectionUpdatedAt: stamp, updatedAt: stamp,
    answers: { q: { lessonId: 'middle-core-01', questionId: 'q', lastAttemptId: 'synthetic:q', lastAnsweredAt: stamp,
      correct: true, neededHelp: false, attempts: 2, intervalDays: 3, nextReviewAt: '2026-11-15T00:00:00.000Z', successDates: ['2026-11-11', '2026-11-12'] } },
    practicedUnits: { old: stamp }, future: { array: [7, '8'], nested: { keep: null, constructor: { keep: 9 } } },
    ...JSON.parse('{"__proto__":{"keep":7},"constructor":{"keep":8}}') };
  const before = { [LEVEL_JOURNEY_KEY]: JSON.stringify(original), unrelated: '{"keep": 7}' };
  const normalized = JSON.stringify(Object.fromEntries(Object.entries(original).reverse()), null, 2);
  const after = { ...before, [LEVEL_JOURNEY_KEY]: normalized }, fitness = { unrelated: { keep: 7 } };
  const clone = value => JSON.parse(JSON.stringify(value));
  const fixture = ({ local = after, remote = local, workout = fitness, afterRead } = {}) => {
    const state = { local: { ...local }, reads: 0 };
    const page = { evaluate: async (_callback, keys) => Array.isArray(keys)
      ? Object.fromEntries(keys.map(key => [key, state.local[key] ?? null]))
      : { raw: state.local[keys] ?? null, at: Date.now() } };
    const qa = { readLanguage: async () => { state.reads++; afterRead?.(state); return remote; }, read: async () => workout };
    return { page, qa, state };
  };
  const check = async (options, expected = before) => {
    const f = fixture(options), preserved = clone(expected);
    const result = await helpers.restoredLevelJourney(f.page, f.qa, expected, fitness);
    assert.deepEqual(expected, preserved); assert.equal(f.state.reads, 1); return result;
  };
  assert.deepEqual(await check({}), after);
  assert.deepEqual(await check({ local: before }), before);
  const f = fixture();
  await assert.rejects(helpers.localMatches(f.page, before));
  await assert.rejects(helpers.persisted(f.page, f.qa, before, fitness));
  assert.equal(f.state.reads, 0, 'ordinary raw-byte/save checks still reject changed bytes first');
  const changes = [
    value => { value.selectedLevel = 'advanced'; },
    value => { value.selectionUpdatedAt = '2026-11-11T00:00:00.000Z'; },
    value => { value.updatedAt = '2026-11-11T00:00:00.000Z'; },
    value => { delete value.answers.q; }, value => { delete value.practicedUnits.old; },
    value => { value.answers.q.lastAttemptId = 'stale:q'; },
    value => { value.answers.q.lastAnsweredAt = '2026-11-11T00:00:00.000Z'; },
    value => { value.answers.q.nextReviewAt = '2026-11-16T00:00:00.000Z'; },
    value => { value.answers.q.attempts = 3; }, value => { value.answers.q.correct = false; },
    value => { value.answers.q.neededHelp = true; }, value => { value.answers.q.intervalDays = 7; },
    value => { value.answers.q.lessonId = 'other'; }, value => { value.answers.q.attempts = '2'; },
    value => { value.answers.q.successDates.reverse(); },
    value => { value.future.array.reverse(); }, value => { value.future.array[0] = '7'; },
    value => { value.future.nested.keep = false; }, value => { delete value.future; },
    value => { delete value.future.nested.constructor; }, value => { value.future.array = { 0: 7, 1: '8' }; },
    value => { delete value.__proto__; }, value => { delete value.constructor; },
    value => { value.extra = 1; }, value => { delete value.selectionUpdatedAt; },
  ];
  for (const change of changes) {
    const value = clone(original); change(value);
    await assert.rejects(check({ local: { ...after, [LEVEL_JOURNEY_KEY]: JSON.stringify(value) } }));
  }
  for (const raw of [null, '{broken', 'null', '[]', '7', before[LEVEL_JOURNEY_KEY].replace('\"keep\":null', '\"keep\":1e400'), JSON.stringify({ ...original, version: 2 }), JSON.stringify({ ...original, answers: [] })]) {
    await assert.rejects(check({ local: { ...after, [LEVEL_JOURNEY_KEY]: raw } }));
    await assert.rejects(check({}, { ...before, [LEVEL_JOURNEY_KEY]: raw }));
  }
  await assert.rejects(check({ local: { ...after, unrelated: '{"keep":7}' } }));
  await assert.rejects(check({ remote: before }), 'semantic equality cannot replace fresh server byte equality');
  await assert.rejects(check({ remote: { ...after, unrelated: 'stale' } }));
  await assert.rejects(check({ remote: { ...after, unexpected: 'new' } }));
  await assert.rejects(check({ workout: { unrelated: { keep: 8 } } }));
  await assert.rejects(check({ afterRead: state => { state.local[LEVEL_JOURNEY_KEY] = before[LEVEL_JOURNEY_KEY]; } }));
});

test('settings reentry permits only the actual accessible Next announcer and rejects every extra application alert', async () => {
  // Actual pinned Next construction and Playwright injected role/CSS engines.
  // DOM nodes, computed style and primitive native CSS matching are modeled;
  // this is no browser, React scheduler, rendering or real DOM inspection.
  const { Script } = await import('node:vm');
  const ts = (await import('typescript')).default;
  const nextPath = 'node_modules/next/dist/client/components/app-router-announcer.js';
  const next = await readFile(nextPath, 'utf8');
  const router = await readFile('node_modules/next/dist/client/components/app-router.js', 'utf8');
  assert.ok(router.includes('_approuterannouncer.AppRouterAnnouncer'));
  assert.equal(JSON.parse(await readFile('node_modules/next/package.json', 'utf8')).version, '16.4.6');
  assert.equal(JSON.parse(await readFile('node_modules/playwright-core/package.json', 'utf8')).version, '1.63.0');
  assert.ok(next.includes("mode: 'open'")); assert.ok(next.includes("announcer.role = 'alert'"));
  assert.ok(next.includes("announcer.ariaLive = 'assertive'"));
  assert.ok(next.includes('getAnnouncerNode()')); assert.ok(next.includes("useState)('')"));
  const bundle = await readFile('node_modules/playwright-core/lib/coreBundle.js', 'utf8');
  const packed = bundle.match(/^    source4 = ('(?:\\.|[^'\\])*');$/m);
  assert.ok(packed);
  const injected = new Script(packed[1]).runInNewContext();
  const source = await readFile('tests/e2e/japanese-settings-recovery.spec.ts', 'utf8');
  const start = source.indexOf('async function noApplicationAlerts('); assert.ok(start >= 0);
  const body = ts.transpileModule(source.slice(start), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  assert.ok(source.split('\n')[25].includes('await noApplicationAlerts(page); await noSuccess(page); await localSettings(page, saved)'));
  for (const forbidden of ['hasText', 'filter(', 'includeHidden', 'toBeLessThan', 'toBeGreaterThan', '.first()', '.nth(']) assert.ok(!body.includes(forbidden), forbidden);
  const expectedSelector = 'next-route-announcer > div#__next-route-announcer__[role="alert"][aria-live="assertive"]';

  class ElementModel {
    nodeType = 1; childNodes = []; attributes = new Map(); parentNode = null; shadowRoot = null;
    constructor(tag, document) { this.nodeName = this.tagName = tag.toUpperCase(); this.localName = tag; this.ownerDocument = document;
      this.namespaceURI = 'http://www.w3.org/1999/xhtml'; this.style = { cssText: '', display: 'block', visibility: 'visible' }; }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get firstChild() { return this.childNodes[0] ?? null; }
    get nextSibling() { const siblings = this.parentNode?.childNodes ?? []; return siblings[siblings.indexOf(this) + 1] ?? null; }
    get children() { return this.childNodes; }
    get isConnected() { return true; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
    removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; }
    attachShadow({ mode }) { assert.equal(mode, 'open'); const shadow = new ElementModel('shadow-root', this.ownerDocument);
      shadow.nodeType = 11; shadow.host = this; this.shadowRoot = shadow; return shadow; }
    matches(selector) {
      if (selector === '*') return true;
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      const tag = selector.match(/^[a-z][a-z0-9-]*/i)?.[0];
      if (tag && this.localName !== tag.toLowerCase()) return false;
      const id = selector.match(/#([a-zA-Z0-9_-]+)/)?.[1];
      if (id && this.getAttribute('id') !== id) return false;
      for (const match of selector.matchAll(/\[([a-z-]+)="([^"]*)"\]/g)) if (this.getAttribute(match[1]) !== match[2]) return false;
      assert.ok(/^(?:[a-z][a-z0-9-]*)?(?:#[a-zA-Z0-9_-]+)?(?:\[[a-z-]+="[^"]*"\])*$/i.test(selector), 'Only modeled native simple CSS permitted');
      return true;
    }
    querySelectorAll(selector) { const result = []; for (const child of this.childNodes) {
      if (child.nodeType === 1 && child.matches(selector)) result.push(child); result.push(...child.querySelectorAll(selector));
    } return result; }
    closest(selector) { for (let item = this; item; item = item.parentElement) if (item.matches(selector)) return item; return null; }
    checkVisibility() { for (let item = this; item; item = item.parentElement ?? item.parentNode?.host) if (item.style.display === 'none') return false; return true; }
  }
  for (const [property, attribute] of Object.entries({ id: 'id', role: 'role', ariaLive: 'aria-live' })) Object.defineProperty(ElementModel.prototype, property, {
    get() { return this.getAttribute(attribute); }, set(value) { this.setAttribute(attribute, value); },
  });
  async function run(mutate = () => {}, oldAssertion = false) {
    const document = new ElementModel('document'); document.nodeType = 9; document.ownerDocument = document;
    document.createElement = tag => new ElementModel(tag, document);
    document.body = document.appendChild(document.createElement('body')); document.documentElement = document.body;
    document.getElementsByName = () => [];
    document.defaultView = { getComputedStyle: element => element.style };
    const nextExports = {};
    const construct = new Script(`(function(exports, module, require) { ${next}\nreturn getAnnouncerNode; })`).runInNewContext({ document });
    const announcer = construct(nextExports, { exports: nextExports }, () => ({}))();
    const host = document.body.childNodes[0];
    assert.equal(announcer.getAttribute('role'), 'alert'); assert.equal(announcer.getAttribute('aria-live'), 'assertive');
    assert.equal(announcer.parentNode, host.shadowRoot); assert.match(announcer.style.cssText, /clip:rect\(0 0 0 0\)/);
    assert.equal(announcer.getAttribute('aria-hidden'), null);
    mutate({ document, host, announcer });
    const engine = new Script(injected + '\n({ queryRole, SelectorEvaluatorImpl, parseCSS });').runInNewContext({
      module: { exports: {} }, Element: ElementModel, Node: { ELEMENT_NODE: 1, DOCUMENT_NODE: 9, DOCUMENT_FRAGMENT_NODE: 11 },
      document, window: document.defaultView, console,
    });
    const roles = () => engine.queryRole(document, { role: 'alert' }, true);
    const css = selector => new engine.SelectorEvaluatorImpl().query({ scope: document, pierceShadow: true }, engine.parseCSS(selector).selector);
    const locator = query => ({ query, and(other) { return locator(() => query().filter(element => other.query().includes(element))); } });
    const page = { getByRole(role) { assert.equal(role, 'alert'); return locator(roles); }, locator(selector) { assert.equal(selector, expectedSelector); return locator(() => css(selector)); } };
    let stage = 0;
    const expect = subject => ({ async toHaveCount(count) { assert.equal(subject.query().length, count, `alert-count-stage-${++stage}`); } });
    const verify = new Function('expect', body + '; return noApplicationAlerts;')(expect);
    if (oldAssertion) await expect(page.getByRole('alert')).toHaveCount(0); else await verify(page);
    return { frameworkCount: css(expectedSelector).length, globalCount: roles().length };
  }
  const countFailure = (stage, actual, expected = 1) => error => error instanceof assert.AssertionError
    && error.code === 'ERR_ASSERTION' && error.actual === actual && error.expected === expected
    && error.message.startsWith(`alert-count-stage-${stage}\n`);
  await assert.rejects(() => run(undefined, true), countFailure(1, 1, 0), 'Old global-zero rejects the genuine framework alert');
  const positive = await run(); assert.equal(positive.frameworkCount, 1); assert.equal(positive.globalCount, 1);
  const extraAlert = ({ document }, attributes = {}) => { const alert = document.createElement('p'); alert.role = 'alert';
    for (const [key, value] of Object.entries(attributes)) alert.setAttribute(key, value); document.body.appendChild(alert); };
  const controls = [
    ['Settings read error', value => extraAlert(value)],
    ['Settings save error', value => extraAlert(value)],
    ['Settings detail error', value => extraAlert(value)],
    ['LanguageCloudSync needsAttention', value => extraAlert(value, { class: 'yeoni-sync-notice' })],
    ['other application alert', value => extraAlert(value)],
    ['same ID outside host', value => extraAlert(value, { id: '__next-route-announcer__', 'aria-live': 'assertive' })],
    ['missing framework with spoof instead', value => { value.document.body.removeChild(value.host); extraAlert(value, { id: '__next-route-announcer__', 'aria-live': 'assertive' }); }],
    ['missing announcer', ({ host, announcer }) => host.shadowRoot.removeChild(announcer)],
    ['aria-hidden announcer', ({ announcer }) => announcer.setAttribute('aria-hidden', 'true')],
    ['display-hidden announcer', ({ announcer }) => { announcer.style.display = 'none'; }],
    ['visibility-hidden announcer', ({ announcer }) => { announcer.style.visibility = 'hidden'; }],
    ['hidden announcer with application alert', value => { value.announcer.setAttribute('aria-hidden', 'true'); extraAlert(value); }],
    ['duplicate announcer', ({ document, host }) => { const extra = document.createElement('div'); extra.id = '__next-route-announcer__'; extra.role = 'alert'; extra.ariaLive = 'assertive'; host.shadowRoot.appendChild(extra); }],
    ['hidden duplicate announcer', ({ document, host }) => { const extra = document.createElement('div'); extra.id = '__next-route-announcer__'; extra.role = 'alert'; extra.ariaLive = 'assertive'; extra.setAttribute('aria-hidden', 'true'); host.shadowRoot.appendChild(extra); }],
    ['wrong announcement tag', ({ announcer }) => { announcer.localName = 'p'; announcer.nodeName = announcer.tagName = 'P'; }],
    ['aria-hidden host', ({ host }) => host.setAttribute('aria-hidden', 'true')],
    ['wrong live semantics', ({ announcer }) => { announcer.ariaLive = 'polite'; }],
    ['wrong role', ({ announcer }) => { announcer.role = 'status'; }],
    ['wrong host', ({ host }) => { host.localName = 'app-error-host'; host.nodeName = host.tagName = 'APP-ERROR-HOST'; }],
    ['wrong shadow-child structure', ({ document, host, announcer }) => { host.shadowRoot.removeChild(announcer); const wrapper = document.createElement('section'); wrapper.appendChild(announcer); host.shadowRoot.appendChild(wrapper); }],
  ];
  const failures = [[3, 2], [3, 2], [3, 2], [3, 2], [3, 2], [3, 2], [1, 0], [1, 0], [2, 0], [2, 0],
    [2, 0], [2, 0], [1, 2], [1, 2], [1, 0], [2, 0], [1, 0], [1, 0], [1, 0], [1, 0]];
  assert.equal(failures.length, controls.length);
  for (const [index, [name, mutate]] of controls.entries()) await assert.rejects(() => run(mutate), countFailure(...failures[index]), name);
  // Engine paths explicitly exercise shadow traversal and default accessible-role
  // filtering. No text from an actual browser/page is read or written here.
  assert.equal(controls.length, 20);
});

// Grammar coverage preparation only: no browser/Auth/DB/server is launched here.
test('grammar source 56 preserves the actual route graph and failure-only audio boundary', async () => {
  const hashes = {
  "app/language/layout.tsx": "237104dcc80d6763454d69fd2a8b1e0e12dae9bebac1b91e6bc5424cf80666df",
  "app/language/grammar/page.tsx": "9c29bf86e670aca8950198ec308e247245f471a30c73fcdac44b7f3a5f53a8a3",
  "app/language/chunk-review/page.tsx": "aa4bd476a183504a1d6c905f880a621d3259baf672500e47bfe73c4e58b48e02",
  "components/language/JapaneseChunkPractice.tsx": "ea126f8eca3bd5bd6e661d1335565490b63d0f8bb35f78d340878fb2ca294360",
  "components/language/ChunkReviewWorkspace.tsx": "643310701503852acc2804782ec86680b479f4830714121dc55e0f8831841ccb",
  "components/language/useChunkReview.ts": "51bbcbc5a1db0ec51789dec1fdc08111ba5306a0fa05a594f034a77fbbdf7c83",
  "components/language/useLearningAudio.ts": "b06dd5e6a66410f5d5b6f755da4654b03524b61abd1b9f7a63b92e8413229067",
  "utils/speakJapanese.ts": "2840f5790e2732e08b340500bdffb7043a672526ddab6adff44144280d9a3b0d",
  "utils/japaneseTts.ts": "b657c14ff7e715c9cb253b2e5bc08c1ef45f08e71016b70215e6d0f861242ec8",
  "lib/free-mode.ts": "ee34f97f5a5b4e45c3378c06e795ab12d54c0af2f575a0ada1b021c68da8195f",
  "app/api/language/tts/route.ts": "11538edfcd5df175d7170028d3488365255d13e5033f9bfa3c1ab75452576a59",
  "utils/japaneseChunkReview.ts": "f125c626a286263c9925e72fdd080872008fd0af9e129cca2061b07e45c05ec2",
  "utils/japaneseChunkCatalog.ts": "d09cdd6b62d9c63d1f7d7c2dea0d4319d11f779bec1f1e8ef27c8f851a000007",
  "data/japaneseGrammarFoundationChunks.ts": "f47b509fb083148281d9b2a6828e2f257a987f0361d21981d20900481e913a80",
  "tests/e2e/japanese-grammar-chunk.spec.ts": "cfcfd38d5ed696def47a55f6a2c99ed1205637dbba74070b9744566387db17bb",
  "tests/e2e/japanese-grammar-chunk-state.ts": "f12507f7c772f9f3f32b37127904206f7994f272f5b80b097aa57bdcca7cb51e"
};
  for (const [path, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash, path);
  const source = await readFile('tests/e2e/japanese-grammar-chunk.spec.ts', 'utf8');
  const helper = await readFile('tests/e2e/japanese-grammar-chunk-state.ts', 'utf8');
  assert.equal(source.match(/test\('/g)?.length, 1); assert.ok(source.split('\n')[2].startsWith('test('));
  for (const required of ["getChunkLesson('grammar:desu')", "expect(FREE_MODE).toBe(true)", 'width: 320', "name: '2. 예문'", "level: 2, name: info.title, exact: true",
    "name: '짧은 표현부터 조각으로 배우기'", 'lesson.chunks', 'lesson.variations', "answer(0, false, true, 'choice')",
    "answer(1, true, true, 'choice')", "answer(2, true, true, 'reading')", "answer(0, true, false, 'choice')",
    'assertChunkDelta(saved[CHUNK_REVIEW_KEY]', 'await confirmedSettings(page, qa, saved, fitness)',
    'await settingsState(page)', 'await qa.readLanguage()', 'await qa.read()',
    "route.abort('blockedbyclient')", 'await page.route(ttsRoute, blockTts)', 'await page.unroute(ttsRoute, blockTts)',
    'const restore = await unavailableSpeech(page)', 'finally { expect(await restore()).toBeGreaterThan(0); }',
    "name: '문제 소리 듣기'", "name: '문장 보기로 대신하기'", 'expect(ttsRequests).toBe(0)',
    'await restored(true); await page.reload(); await restored(true)', "name: '로그아웃'",
    'localStorage.getItem(key), CHUNK_REVIEW_KEY)).toBeNull()', "await login(page, qa.account, '/language/chunk-review')",
    "name: '본수업 보기'", '86_400_000', 'repaired ? 4 : 3', 'toHaveLength(3)']) assert.ok(source.includes(required), required);
  assert.ok(source.indexOf('await page.route(ttsRoute, blockTts)') < source.indexOf("name: '문제 소리 듣기'"));
  assert.ok(source.indexOf('const restore = await unavailableSpeech(page)') < source.indexOf("name: '문제 소리 듣기'"));
  assert.equal(source.match(/client\.from\('language_user_state'\)\.update/g)?.length, 1);
  assert.ok(source.indexOf('.update({ state: saved })') < source.indexOf('await login('));
  for (const forbidden of ['localStorage.setItem', 'localStorage.removeItem', 'sessionStorage.setItem', 'addInitScript', 'route.fulfill',
    '.speak(', 'new SpeechSynthesisUtterance', 'page.clock', 'Date.now =', 'newCDPSession', 'storageState:']) {
    assert.ok(!source.includes(forbidden), forbidden); assert.ok(!helper.includes(forbidden), forbidden);
  }
  for (const required of ["Object.getOwnPropertyDescriptor(window, 'speechSynthesis')", 'return undefined;',
    "Object.defineProperty(window, 'speechSynthesis', descriptor)", "Reflect.deleteProperty(window, 'speechSynthesis')",
    'delete target.__qaUnavailableSpeech']) assert.ok(helper.includes(required), required);
});

test('grammar delta assertions reject invented results lost wrong history and stale event times', async () => {
  const ts = (await import('typescript')).default;
  const { expect } = await import('@playwright/test');
  const { parseChunkReview } = await import('../../utils/japaneseChunkReview.ts');
  const source = await readFile('tests/e2e/japanese-grammar-chunk-state.ts', 'utf8');
  const fn = source.slice(source.indexOf('export function assertChunkDelta'), source.indexOf('// Failure-only'));
  const js = ts.transpileModule(fn.replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const verify = new Function('expect', 'parseChunkReview', 'uuid', js + '; return assertChunkDelta;')(expect, parseChunkReview,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const id1 = '00000000-0000-4000-8000-000000000001', id2 = '00000000-0000-4000-8000-000000000002';
  const start = Date.parse('2026-11-12T01:00:00.000Z');
  const previous = { version: 1, generation: null, events: { [id1]: { lessonId: 'grammar:desu', questionId: 'grammar:desu:meaning',
    attemptId: id1, answeredAt: new Date(start - 5000).toISOString(), correct: false, neededHelp: true, mode: 'choice' } } };
  const input = { lessonId: 'grammar:desu', questionId: 'grammar:desu:meaning', correct: true, neededHelp: false, mode: 'choice' };
  const run = (mutate = () => {}, bounds = {}) => {
    const current = JSON.parse(JSON.stringify(previous));
    current.events[id2] = { ...input, attemptId: id2, answeredAt: new Date(start + 1).toISOString() };
    mutate(current);
    return verify(JSON.stringify(previous), JSON.stringify(current), input, bounds.start ?? start, bounds.end ?? start + 10);
  };
  assert.equal(run().attemptId, id2);
  for (const [name, change, bounds = {}] of [
    ['dropped wrong event', value => { delete value.events[id1]; }],
    ['rewritten wrong event', value => { value.events[id1].correct = true; }],
    ['rewritten help history', value => { value.events[id1].neededHelp = false; }],
    ['rewritten prior timestamp', value => { value.events[id1].answeredAt = new Date(start).toISOString(); }],
    ['missing new event', value => { delete value.events[id2]; }],
    ['extra fabricated event', value => { value.events['extra'] = { ...value.events[id2], attemptId: 'extra' }; }],
    ['wrong lesson', value => { value.events[id2].lessonId = 'grammar:masu'; }],
    ['wrong question', value => { value.events[id2].questionId = 'grammar:desu:blank'; }],
    ['wrong result', value => { value.events[id2].correct = false; }],
    ['wrong help flag', value => { value.events[id2].neededHelp = true; }],
    ['false audio claim', value => { value.events[id2].mode = 'audio'; }],
    ['stale event', value => { value.events[id2].answeredAt = new Date(start - 1).toISOString(); }],
    ['future event', value => { value.events[id2].answeredAt = new Date(start + 11).toISOString(); }],
    ['invalid UUID', value => { value.events.extra = { ...value.events[id2], attemptId: 'extra' }; delete value.events[id2]; }],
    ['invented generation', value => { value.generation = '2026-11-12T00:00:00.000Z|synthetic'; }],
    ['unknown event field', value => { value.events[id2].heard = true; }],
    ['inverted observation bounds', () => {}, { end: start - 1 }],
    ['unbounded observation', () => {}, { end: start + 90_000 }],
  ]) {
    const matcher = {
      'dropped wrong event': 'toBe', 'rewritten wrong event': 'toEqual', 'rewritten help history': 'toEqual',
      'rewritten prior timestamp': 'toEqual', 'missing new event': 'toBe', 'extra fabricated event': 'toBe',
      'wrong lesson': 'toEqual', 'wrong question': 'toEqual', 'wrong result': 'toEqual', 'wrong help flag': 'toEqual',
      'false audio claim': 'toEqual', 'stale event': 'toBeGreaterThanOrEqual', 'future event': 'toBeLessThanOrEqual',
      'invalid UUID': 'toMatch', 'invented generation': 'toBe', 'inverted observation bounds': 'toBeGreaterThanOrEqual',
      'unbounded observation': 'toBeLessThan',
    }[name];
    const stage = {
      'dropped wrong event': 'event-count', 'rewritten wrong event': `history:${id1}`, 'rewritten help history': `history:${id1}`,
      'rewritten prior timestamp': `history:${id1}`, 'missing new event': 'event-count', 'extra fabricated event': 'event-count',
      'wrong lesson': 'new-event', 'wrong question': 'new-event', 'wrong result': 'new-event', 'wrong help flag': 'new-event',
      'false audio claim': 'new-event', 'stale event': 'earliest-answer', 'future event': 'latest-answer',
      'invalid UUID': 'attempt-id', 'invented generation': 'generation', 'inverted observation bounds': 'clock-order',
      'unbounded observation': 'observation-window',
    }[name];
    assert.throws(() => run(change, bounds), error => error instanceof Error && (name === 'unknown event field'
      ? error.message === '보충 오답 기록의 형식을 확인해 주세요. 기존 기록은 덮어쓰지 않고 보존합니다.'
      : error.matcherResult?.name === matcher && error.message.startsWith(`chunk-delta-${stage}\n`)
        && (stage !== 'event-count' || error.matcherResult.expected === 2
          && error.matcherResult.actual === (name === 'extra fabricated event' ? 3 : 1))), name);
  }
});

test('grammar unavailable speech fault never calls native capability and restores exact own or inherited descriptors', async () => {
  const ts = (await import('typescript')).default;
  const source = await readFile('tests/e2e/japanese-grammar-chunk-state.ts', 'utf8');
  const js = ts.transpileModule(source.slice(source.indexOf('export async function unavailableSpeech')).replace('export ', ''),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  for (const kind of ['own', 'inherited', 'absent']) {
    let nativeReads = 0;
    const prototype = {}, window = Object.create(prototype);
    if (kind !== 'absent') Object.defineProperty(kind === 'own' ? window : prototype, 'speechSynthesis', {
      configurable: true, enumerable: true, get() { nativeReads++; throw new Error('Native capability must not be invoked'); },
    });
    const descriptor = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
    const install = new Function('window', js + '; return unavailableSpeech;')(window);
    const page = { evaluate: async callback => callback() };
    const restore = await install(page);
    assert.equal(window.speechSynthesis, undefined);
    assert.equal(nativeReads, 0);
    await assert.rejects(() => install(page), /already installed/);
    await assert.rejects(async () => {
      try { assert.equal(window.speechSynthesis, undefined); throw new Error('Synthetic UI failure'); }
      finally { assert.equal(await restore(), 2); }
    }, /Synthetic UI failure/);
    assert.deepEqual(Object.getOwnPropertyDescriptor(window, 'speechSynthesis'), descriptor);
    assert.equal(Object.hasOwn(window, '__qaUnavailableSpeech'), false); assert.equal(nativeReads, 0);
    await assert.rejects(() => restore(), /missing/);
  }
  const window = {};
  Object.defineProperty(window, 'speechSynthesis', { configurable: false, value: {} });
  const install = new Function('window', js + '; return unavailableSpeech;')(window);
  await assert.rejects(() => install({ evaluate: async callback => callback() }), TypeError);
  assert.equal(Object.hasOwn(window, '__qaUnavailableSpeech'), false);
});

test('grammar four literal phases retain source 56 native failure coordinates in one private fixtureless invocation', async () => {
  const repository = process.cwd(), root = await mkdtemp(join(tmpdir(), 'grammar-native-phases-'));
  const file = 'tests/e2e/japanese-grammar-chunk.spec.ts', expectedLines = [89, 106, 122, 145];
  try {
    const source = await readFile(file, 'utf8'), lines = source.split('\n');
    const positions = lines.flatMap((line, index) => line.startsWith('    await test.step(') ? [index + 1] : []);
    assert.deepEqual(positions, expectedLines);
    const synthetic = Array(lines.length).fill('');
    // Four native identities share the actual 3:5 definition and exact literal
    // phase coordinates. No real case body, fixture, page or context is imported.
    synthetic[0] = `import { test } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))}; import { fail } from './offline-grammar-helper'; for (let phase = 0; phase < 4; phase++) {`;
    synthetic[2] = "test('synthetic grammar phase ' + phase, async () => {";
    for (const [index, line] of positions.entries()) {
      const prefix = lines[line - 1].split('async () => {')[0];
      assert.ok(prefix.includes('await test.step('));
      synthetic[line - 1] = `${prefix}async () => { await fail(phase, ${index}); });`;
    }
    synthetic[positions.at(-1)] = '}); }';
    await mkdir(join(root, 'tests/e2e'), { recursive: true });
    await writeFile(join(root, file), synthetic.join('\n'));
    await writeFile(join(root, 'tests/e2e/offline-grammar-helper.ts'), `import { expect } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))};\nexport async function fail(selected, current) { if (selected === current) expect(${JSON.stringify(canary)}).toBe('PRIVATE_EXPECTED'); }\n`);
    await writeFile(join(root, 'offline.config.mjs'), `export default ${JSON.stringify({ testDir: './tests/e2e', workers: 1, retries: 0, projects: [{ name: 'chromium-app-smoke' }], reporter: [[join(repository, 'tests/e2e/reporter.ts')]] })};\n`);
    const journalPath = join(root, 'journal.jsonl'); await writeFile(journalPath, '', { mode: 0o600 });
    const child = spawnSync(process.execPath, [join(repository, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'offline.config.mjs'], {
      cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', NODE_OPTIONS: '--max-old-space-size=192 --max-semi-space-size=4',
        QA_PRIVATE_DIAGNOSTIC_FILE: journalPath, QA_PRIVATE_DIAGNOSTIC_TOKEN: token },
    });
    assert.equal(child.error, undefined); assert.equal(child.status, 1);
    const output = [];
    // Diagnostic-only intentionally failed tests, not the twenty-case app lane.
    const report = await emitDiagnosticJournal({ path: journalPath, token, expected: 1, stage: 'stage-03', termination: 'none', emit: value => output.push(value) });
    assert.equal(report.report, 'complete'); assert.equal(report.invocations.length, 1);
    const invocation = report.invocations[0];
    assert.deepEqual(invocation.counts, { passed: 0, failed: 4, timedOut: 0, skipped: 0, interrupted: 0, unknown: 0 });
    assert.equal(invocation.status, 'failed'); assert.deepEqual(invocation.active, []); assert.equal(invocation.omitted, 0);
    assert.equal(invocation.runnerErrors, 0); assert.equal(invocation.details.length, 4);
    assert.deepEqual(invocation.details.map(detail => detail.test), [1, 2, 3, 4]);
    const actualLines = [];
    for (const [index, detail] of invocation.details.entries()) {
      assert.equal(detail.source, 56); assert.equal(detail.line, 3); assert.equal(detail.column, 5); assert.equal(detail.project, 5);
      assert.equal(detail.failure.category, 1); assert.deepEqual(detail.failure.errors, []); assert.deepEqual(detail.failure.failedOperations, []);
      assert.deepEqual(detail.failure.failedSteps, [{ source: 56, line: expectedLines[index], column: 5 }]);
      assert.equal(detail.failure.stepScanTruncated, 0); actualLines.push(detail.failure.failedSteps[0].line);
    }
    assert.equal(new Set(actualLines).size, 4); assert.deepEqual(actualLines, expectedLines); privateOutput(output);
    const text = output.join('\n'), bytes = await readFile(journalPath, 'utf8');
    for (const secret of [canary, 'PRIVATE_EXPECTED', file, 'offline-grammar-helper', root, 'synthetic grammar phase', ...positions.map(line => lines[line - 1])]) {
      assert.ok(!text.includes(secret)); assert.ok(!bytes.includes(secret));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Diagnostic-only adapter for the existing source51–54 fixtureless children.
// Keep spawn configuration and exit expectations unchanged. Only closed scalar
// data may reach assertion messages, never raw spawn errors or output streams.
function nativePhaseExitDiagnostic(invocation, source, child) {
  const unknown = Symbol('unreadable');
  const own = (value, key) => {
    try {
      if (value === null || typeof value !== 'object') return unknown;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor === undefined ? undefined : 'value' in descriptor ? descriptor.value : unknown;
    } catch { return unknown; }
  };
  let plain = false;
  try { plain = child !== null && typeof child === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(child)); }
  catch { /* Unknown object behavior cannot enter diagnostics or pass assertions. */ }
  const error = plain ? own(child, 'error') : unknown;
  const status = plain ? own(child, 'status') : unknown;
  const signal = plain ? own(child, 'signal') : unknown;
  const integer = (value, min, max, fallback) => Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
  const signalNumber = signal === null || signal === undefined ? 0
    : typeof signal === 'string' && Object.hasOwn(constants.signals, signal) ? integer(constants.signals[signal], 1, 64, 99) : 99;
  const errorCode = own(error, 'code');
  const allowedErrors = ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS', 'ENOMEM', 'EAGAIN', 'EMFILE', 'ENFILE', 'EINVAL'];
  const spawnError = error === undefined ? 'none' : allowedErrors.includes(errorCode) ? errorCode : 'unknown';
  return {
    spawnOk: error === undefined, exitOk: status === 1,
    line: `source=${integer(source, 51, 54, 0)} invocation=${integer(invocation, 1, 4, 0)}`
      + ` status=${integer(status, 0, 255, null)} signal=${signalNumber} spawnError=${spawnError}`,
  };
}
function assertNativePhaseExit(invocation, source, child) {
  const safe = nativePhaseExitDiagnostic(invocation, source, child);
  // Original order and outcome: require absent spawn error, then exit exactly1.
  // Boolean actual values prevent node:assert from inspecting a raw Error.
  assert.equal(safe.spawnOk, true, `native-phase check=spawn ${safe.line}`);
  assert.equal(safe.exitOk, true, `native-phase check=exit ${safe.line}`);
}

test('native phase diagnostics expose only closed scalar lifecycle fields and never inspect private canaries', () => {
  const good = { error: undefined, status: 1, signal: null };
  assert.deepEqual(nativePhaseExitDiagnostic(1, 51, good), {
    spawnOk: true, exitOk: true, line: 'source=51 invocation=1 status=1 signal=0 spawnError=none',
  });
  for (const [signal, number] of [['SIGKILL', 9], ['SIGTERM', 15], ['SIGABRT', 6]]) {
    assert.equal(nativePhaseExitDiagnostic(3, 53, { status: null, signal }).line,
      `source=53 invocation=3 status=null signal=${number} spawnError=none`);
  }
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS', 'ENOMEM', 'EAGAIN', 'EMFILE', 'ENFILE', 'EINVAL']) {
    const error = Object.assign(new Error(canary), { code, path: canary, spawnargs: [canary] });
    const safe = nativePhaseExitDiagnostic(4, 54, { error, status: null, signal: 'SIGTERM', stdout: canary, stderr: canary, output: [canary] });
    assert.equal(safe.line, `source=54 invocation=4 status=null signal=15 spawnError=${code}`);
    assert.equal(safe.spawnOk, false); assert.equal(safe.exitOk, false); privateOutput([safe.line]);
  }
  let reads = 0;
  const hostile = { toString() { reads++; throw new Error(canary); } };
  const accessor = {}; Object.defineProperty(accessor, 'code', { get() { reads++; throw new Error(canary); } });
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(canary); }, getPrototypeOf() { throw new Error(canary); } });
  const samples = [
    { error: Object.assign(new Error(canary), { code: canary }), status: canary, signal: canary },
    { error: accessor, status: NaN, signal: 'constructor' },
    { error: hostile, status: Infinity, signal: hostile },
    { error: null, status: -1, signal: 9 },
    { error: {}, status: 256, signal: 'SIGKILL' + canary },
    proxy, Object.create({ error: canary }),
  ];
  const propertyGetters = {};
  for (const key of ['error', 'status', 'signal', 'stdout', 'stderr', 'output', 'path', 'spawnargs']) {
    Object.defineProperty(propertyGetters, key, { get() { reads++; throw new Error(canary); } });
  }
  samples.push(propertyGetters);
  for (const child of samples) {
    const safe = nativePhaseExitDiagnostic(canary, hostile, child);
    assert.equal(safe.line, 'source=0 invocation=0 status=null signal=99 spawnError=unknown');
    assert.equal(safe.spawnOk, false); assert.equal(safe.exitOk, false); privateOutput([safe.line]);
  }
  assert.equal(reads, 0);
  for (const status of [0, 1, 255]) {
    const safe = nativePhaseExitDiagnostic(2, 52, { status, signal: null });
    assert.equal(safe.line, `source=52 invocation=2 status=${status} signal=0 spawnError=none`);
    assert.equal(safe.exitOk, status === 1);
  }
});

test('native phase exit assertions preserve error-first exact exit-one outcomes without raw error serialization', () => {
  assert.doesNotThrow(() => assertNativePhaseExit(1, 51, { status: 1, signal: null }));
  const matches = (check, line) => error => error instanceof assert.AssertionError && error.code === 'ERR_ASSERTION'
    && error.actual === false && error.expected === true && error.operator === 'strictEqual'
    && [`native-phase check=${check} ${line}`, `native-phase check=${check} ${line}\n\nfalse !== true\n`].includes(error.message)
    && !error.message.includes(canary);
  for (const status of [1, 0, null]) {
    const error = Object.assign(new Error(canary), { code: 'ENOENT', path: canary, spawnargs: [canary] });
    assert.throws(() => assertNativePhaseExit(2, 52, { error, status, signal: null, stdout: canary, stderr: canary }),
      matches('spawn', `source=52 invocation=2 status=${status} signal=0 spawnError=ENOENT`));
  }
  for (const status of [0, 2, 255, null, undefined, '1']) {
    assert.throws(() => assertNativePhaseExit(3, 53, { status, signal: status === null ? 'SIGKILL' : null }),
      matches('exit', `source=53 invocation=3 status=${Number.isSafeInteger(status) ? status : 'null'} signal=${status === null ? 9 : 0} spawnError=none`));
  }
  assert.throws(() => assertNativePhaseExit(4, 54, { error: null, status: 1, signal: null }),
    matches('spawn', 'source=54 invocation=4 status=1 signal=0 spawnError=unknown'));
});

// Reference addition. Preserve all existing fifteen cases and safety tests.
// No app/browser/Auth/DB execution occurs in the source/helper controls below.
test('reference source 57 pins the finite route graph and six exact source mutations', async () => {
  const hashes = {
  "public/kana-strokes.json": "32ba7a804d8ba53958f18c7a9a00db59d24f14df16a5501683deffce152e211c",
  "lib/kana-stroke-timeline.ts": "40067ef48168fa1793da82135b5b9c75f0e8c078d0828e26e14e3d8d4bd52d05",
  "app/language/page.tsx": "29f2a6742ceb6f9fbcf8a223bbcc7ad0ff453bbe77b311418895fc8454c1d723",
  "components/TopNav.tsx": "e2e1505847a2c580d0c8274466d9059a0cca804063bfa293cf4b3eb0a227457c",
  "app/language/kana/page.tsx": "7615fbfd7dfee52b241a00d307d6e697ef494dfa8209ea15245f4c1a28e29501",
  "app/language/words/page.tsx": "a2dc2799532a8dcf82e4af8817d6957c56e92000f3e9c9eaf620341ed1e3b064",
  "app/language/settings/page.tsx": "b6242717b70eff28322f6f64641ffae302f4525b129d5b0f7773140ded2e6b50",
  "app/language/language.css": "277792ede06d2b5f2446ef5728b8ce60a81599c8685a78849cc9a1257cc94095",
  "components/language/useDailyRoutineCompletion.ts": "e5c0c70aadb314d1f7ac08ead6ce3cd0ca2eac8ff4c400f970d61da4a2cd6402",
  "components/language/DailyRoutineSaveNotice.tsx": "5713f95993ae4e798307726ab3dca279df2275c02dffa697311a40efb8dad000",
  "utils/dailyRoutineProgress.ts": "0c606fa1ae5b7825622b510b94396a4f560537f0b51f4c8445831d2395c123f5",
  "utils/routineCompletionQueue.ts": "58b99f22ff97025f038b42061f7d2a595e709bc8f4302625ab032495e7b337a3",
  "app/data/languageStorageLock.ts": "0eb7851f997480a10a2e5c7093a73463f0760e73b9cae6577bc2f46c5683674d",
  "components/language/KanaStrokeAnimation.tsx": "deb7074b9576262b719232ef9217e1a3dc92626594308d12954055176d726474",
  "components/language/LanguageCompanion.tsx": "eefebd1a28f97fb5f2f01f207f11a1ce6fa480c3f91feacf841d7a90c7dcf38d",
  "lib/yeoni/common-host-policy.ts": "11e1adecee9511078bac970b50b6376c0f5f272e0417f2b4cd04b557a57e4a30",
  "data/words.ts": "ab984077f4b670e46c924cd79b465887df5190e1dff28cb5c331984140b7466b",
  "utils/wordQuiz.ts": "4875491cadd0966f5322c862ec54a521eaf0ded4b855ebdce137cf603049bb20",
  "tests/e2e/fixture.ts": "3fa0ffcbd57a35dfa12c5d26d71b3c608561d34da48d4bdb14e0f8b358dd2595",
  "tests/e2e/japanese-settings-state.ts": "005613b394514b151d8b134325c19fe637f37c31fd86b605fb5b5277dc697878",
  "tests/e2e/japanese-level-flow-state.ts": "042da540d19db5b7f7df5d499545c1dfe9318353eb9267a0ddf31f8448847eb3",
  "app/language/layout.tsx": "237104dcc80d6763454d69fd2a8b1e0e12dae9bebac1b91e6bc5424cf80666df",
  "components/language/LanguageShell.tsx": "1eb4f2d273344225cacfef0bb9449fbdc61177c70a2d0a5c1de0f47f97c8aed3",
  "app/components/AuthGate.tsx": "d69c6d0cdf4fe093194a52fe7e9e6dd02df602673259119010bd809d29b5dbc2",
  "components/LanguageCloudSync.tsx": "530ad50e9ade9673ab565a0b8a67f5b0ebe4577480bc24a236cd7a0a2b8ad6db",
  "app/data/languageCloudSync.ts": "d42082e3ead11e14059a325bc3cef12b9ad74e51e03320824734e6d309f1f48b",
  "app/data/cloudSync.ts": "2914761cdb48f0a0cd1bf8e082bb0711c3ed764833c5141029e0122022e5ff95",
  "utils/japaneseLevelJourney.ts": "18601b6e775a3a5adb3069be7493aa376f7e56fb4359d90bbe806a9d3967973d",
  "utils/dateKey.ts": "ae6a9d079c0d7fc8f288080c5bd3f45018843bca988487fcc55541a98b63e634",
  "components/language/useLearningAudio.ts": "b06dd5e6a66410f5d5b6f755da4654b03524b61abd1b9f7a63b92e8413229067",
  "utils/speakJapanese.ts": "2840f5790e2732e08b340500bdffb7043a672526ddab6adff44144280d9a3b0d",
  "utils/japaneseTts.ts": "b657c14ff7e715c9cb253b2e5bc08c1ef45f08e71016b70215e6d0f861242ec8",
  "lib/free-mode.ts": "ee34f97f5a5b4e45c3378c06e795ab12d54c0af2f575a0ada1b021c68da8195f",
  "data/learningDataExpansion.ts": "c026bcf412c235bb43ef6ce46c6bdb89f2dce1e4e3941c8484b3dc448fb43fea",
  "data/recommendedDataExpansion.ts": "415ea40da82cbf5f930e416a22f41fb02e206127c86bed7c2358cd125b7e58c3",
  "data/japaneseLearningQuality.ts": "f63ae35d76f8b4ba97fa525d92bdd78bad1bff973fa99e3b85f4914a0234949a",
  "components/yeoni/CommonCharacterHost.tsx": "6b4d0c125c033d37d45835801a56b02157eb26367ef0248458df31543142477a",
  "components/AppCompanion.tsx": "d1c667c4c06fa5a2684f67ba4ad945f04e28cf3c397873860a334e6945f4e1b6",
  "tests/e2e/reporter.ts": "21a52f1e73ca9e116284cd578bf0ea5a3a67900d5ba0b5ec3c1dd3e7be7faeef",
  "tests/e2e/japanese-reference-routine-state.ts": "a76d81adee68e628e9f5ff4aecd458662ea8ac0b603d6bfaac9d9fc293f00786", "scripts/isolated-chromium-smoke/reference-pin-status-controls.mjs": "67279b42d96db44ce5514f3e5573841c778fcbea64ed717088f11f902d10f8a7",
  "tests/e2e/japanese-reference-routine.spec.ts": "ccb82681f55264bfd61fff496150a393ca717ea5b7e1a6e3712a46512c4897cc"
};
  for (const [file, hash] of Object.entries(hashes)) {
    let bytes = await readFile(file);
    if (file === 'app/language/settings/page.tsx') {
      const before = "<option value=\"reader\">글자를 읽어요 · 20분 학습에 직접 입력 포함</option>";
      const after = "<option value=\"reader\">글자를 읽어요 · 선택형으로 연습</option>";
      const text = bytes.toString('utf8');
      assert.equal(text.split(after).length, 2);
      assert.equal(text.split(before).length, 1);
      bytes = Buffer.from(text.replace(after, before));
    }
    if (file === 'components/language/useDailyRoutineCompletion.ts' || file === 'utils/routineCompletionQueue.ts') {
      const reviewedChanges = {
        "components/language/useDailyRoutineCompletion.ts": [
          [
            "    queue.current?.complete(date ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);\n  }, []);\n  const retry = useCallback(() => queue.current?.retry(), []);\n  const isDateSaved = useCallback((date: string) => current.current() && (queue.current?.isSaved(date) ?? false), []);\n  const isCurrent = useCallback(() => current.current(), []);\n  // Event handlers only: render and state updaters must use the pure predicate.\n  const ensureCurrent = useCallback(() => {\n",
            "    queue.current?.complete(date ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);\n  }, []);\n  const retry = useCallback(() => queue.current?.retry(), []);\n  const isCurrent = useCallback(() => current.current(), []);\n  // Event handlers only: render and state updaters must use the pure predicate.\n  const ensureCurrent = useCallback(() => {\n"
          ],
          [
            "    setStatus({ pending: false, saved: false, error: ACTION_SCOPE_ERROR });\n    return false;\n  }, []);\n  return { ...status, complete, retry, isDateSaved, isCurrent, ensureCurrent };\n}\n",
            "    setStatus({ pending: false, saved: false, error: ACTION_SCOPE_ERROR });\n    return false;\n  }, []);\n  return { ...status, complete, retry, isCurrent, ensureCurrent };\n}\n"
          ]
        ],
        "utils/routineCompletionQueue.ts": [
          [
            "    } finally { publish(); }\n  };\n  return {\n    isSaved(date: string) { return entries.get(date)?.state === 'done'; },\n    complete(date: string) {\n      if (!options.isCurrent()) return;\n      let entry = entries.get(date);\n",
            "    } finally { publish(); }\n  };\n  return {\n    complete(date: string) {\n      if (!options.isCurrent()) return;\n      let entry = entries.get(date);\n"
          ]
        ]
      };
      let text = bytes.toString('utf8');
      for (const [after, before] of reviewedChanges[file]) {
        assert.equal(text.split(after).length, 2);
        text = text.replace(after, before);
      }
      bytes = Buffer.from(text);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
  }
  const spec = await readFile('tests/e2e/japanese-reference-routine.spec.ts', 'utf8');
  const helper = await readFile('tests/e2e/japanese-reference-routine-state.ts', 'utf8');
const checks = [
 ['reference-case-declaration', s => s.split('\n')[2].startsWith("test('kana and word ordinary quizzes")],
 ['reference-four-real-answers', s => s.includes('count <= 4') && s.includes('correctChoice(page, id, kana)).click()')],
 ['reference-failure-stats', s => s.includes('{ hits: 1, dailyWrites: 0, otherJournals: 0 }')],
 ['reference-restore-finally', s => s.includes('finally { await restoreJournal(page); }')],
 ['reference-retry-ui', s => s.includes('await retryButton(page).click()')],
 ['reference-independent-delta', s => s.includes('saved = assertDailyDelta(saved, current, id, day, started, observed)')],
 ['reference-real-ack', s => s.includes('await confirmed(page, qa, saved, fitness, since)')],
 ['reference-invalidation', s => s.includes("window.dispatchEvent(new Event('ai-yeoni-record-reset'))") && s.includes('await unchanged(page, qa, saved, fitness, snapshot, writes)')],
 ['reference-relogin', s => s.includes("await login(page, qa.account, '/language/words'); await restored()")],
 ['reference-speech-cleanup', s => s.includes("finally { await test.step('reference silent guard restoration', () => silence.restore()); }")],
];
for (const [stage, check] of checks) assert(check(spec), stage);
let negatives = 0;
for (const [stage, token] of [
 ['reference-failure-stats', '{ hits: 1, dailyWrites: 0, otherJournals: 0 }'],
 ['reference-restore-finally', 'finally { await restoreJournal(page); }'],
 ['reference-retry-ui', 'await retryButton(page).click()'],
 ['reference-independent-delta', 'saved = assertDailyDelta(saved, current, id, day, started, observed)'],
 ['reference-real-ack', 'await confirmed(page, qa, saved, fitness, since)'],
 ['reference-speech-cleanup', "finally { await test.step('reference silent guard restoration', () => silence.restore()); }"],
]) {
 const altered = spec.replace(token, 'REMOVED_FOR_PRIVATE_NEGATIVE_CONTROL');
 const failed = checks.filter(([, check]) => !check(altered)).map(([name]) => name);
 assert.deepEqual(failed, [stage]); negatives++;
}
assert(helper.includes("'http://127.0.0.1:3000/api/**'"), 'reference-api-block');
assert(helper.includes("throw new Error('Reference case forbids native speech')"), 'reference-native-speech-block');
assert(helper.includes('hasSettingsAcknowledgement(qa.traffic.entries.slice(since), state)'), 'reference-non-stale-real-ack');
assert(helper.includes("await expect(alerts).toHaveCount(1)"), 'reference-framework-only-alert');
assert(helper.includes('assertBoards(geometry, selectedGlyph)'), 'reference-visible-selection-anchor');
assert(!/page\.(?:route|request)|\.fulfill\(|setTimeout\(|waitForTimeout\(|\.skip\(|\.only\(/.test(spec + helper), 'reference-no-success-mock-or-sleep');
assert.equal((spec.match(/^test\('/gm) || []).length, 1);

  assert.equal(negatives, 6);
});

test('reference exact helper controls retain seven positives and seventeen intended failures without browser services', async () => {
  const ts = (await import('typescript')).default;
  const { expect } = await import('@playwright/test');
  const vm = await import('node:vm');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
class SyntheticStorage {
  #entries = new Map();
  getItem(key) { return this.#entries.has(key) ? this.#entries.get(key) : null; }
  setItem(key, value) { this.#entries.set(String(key), String(value)); }
  removeItem(key) { this.#entries.delete(key); }
}
const localStorage = new SyntheticStorage();
const realm = { exports: {}, window: {}, Storage: SyntheticStorage, localStorage, console: { log() { throw Error('Unexpected console'); } }, require(name) {
  if (name === './fixture') return { expect, canonical };
  if (name === '../../app/data/languageStorageLock') return { LANGUAGE_DATA_KEYS: [] };
  if (name === '../../data/words') return { WORDS: [] };
  if (name === './japanese-settings-state') return {};
  if (name === './japanese-level-flow-state') return {};
  throw Error('Unexpected helper import: ' + name);
} };
vm.createContext(realm);
const source = await readFile('tests/e2e/japanese-reference-routine-state.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, strict: true } });
vm.runInContext(compiled.outputText, realm, { filename: 'private-reference-helper.js', timeout: 2000 });
const helper = realm.exports; await (await import('./reference-pin-status-controls.mjs')).verifyReferencePinStatusGuard(helper);
let positives = 0, negatives = 0;
function rejected(stage, action, matcher) {
  let error; try { action(); } catch (caught) { error = caught; }
  assert(error, 'Expected intended failure: ' + stage);
  assert(String(error.message).startsWith(stage), 'Wrong failure stage: ' + String(error.message));
  if (matcher) {
    assert.equal(error.matcherResult?.name, matcher.name, 'Wrong matcher: ' + stage);
    for (const field of ['actual', 'expected']) if (Object.hasOwn(matcher, field)) assert.equal(canonical(error.matcherResult[field]), canonical(matcher[field]), 'Wrong ' + field + ': ' + stage);
  } else assert.equal(error.message, stage, 'Wrong explicit refusal');
  negatives++;
}
const day = '2026-11-12', now = Date.parse('2026-11-12T05:00:00.000Z');
const special = JSON.parse('{"__proto__":{"keep":["own",7]},"constructor":{"keep":true}}');
const before = { learningSettings: JSON.stringify({ dailyGoalCount: 5, ...special }),
  dailyRoutineProgress: JSON.stringify({ date: '2001-01-02', completedIds: ['review'], ...special }),
  dailyLearningHistory: JSON.stringify({ '2001-01-02': { completedIds: ['review'], completedCount: 1, totalCount: 5 }, ...special }) };
const progress = JSON.parse(before.dailyRoutineProgress), history = JSON.parse(before.dailyLearningHistory);
const saved = { ...before, dailyRoutineProgress: JSON.stringify({ ...progress, date: day, completedIds: ['kana'] }),
  dailyLearningHistory: JSON.stringify({ ...history, [day]: { completedIds: ['kana'], completedCount: 1, totalCount: 5, updatedAt: new Date(now).toISOString() } }) };
helper.assertDailyDelta(before, saved, 'kana', day, now - 1, now + 1); positives++;
const clone = x => JSON.parse(JSON.stringify(x));
for (const mutate of [
  s => { const v = JSON.parse(s.dailyRoutineProgress); v.completedIds.push('kana'); s.dailyRoutineProgress = JSON.stringify(v); },
  s => { const v = JSON.parse(s.dailyLearningHistory); delete v.__proto__; s.dailyLearningHistory = JSON.stringify(v); },
  s => { const v = JSON.parse(s.dailyRoutineProgress); delete v.constructor; s.dailyRoutineProgress = JSON.stringify(v); },
  s => { const v = JSON.parse(s.dailyLearningHistory); v[day].completedCount = 2; s.dailyLearningHistory = JSON.stringify(v); },
  s => { s.learningSettings = '{}'; },
  s => { s.wrongWords = '[]'; },
]) { const bad = clone(saved); mutate(bad); rejected('reference-exact-daily-delta', () => helper.assertDailyDelta(before, bad, 'kana', day, now - 1, now + 1), { name: 'toBe', actual: canonical(bad), expected: canonical(saved) }); }
const badTime = clone(saved), badHistory = JSON.parse(badTime.dailyLearningHistory); badHistory[day].updatedAt = new Date(now + 1000).toISOString(); badTime.dailyLearningHistory = JSON.stringify(badHistory);
rejected('reference-completion-timestamp', () => helper.assertDailyDelta(before, badTime, 'kana', day, now - 1, now + 1), { name: 'toBe', actual: false, expected: true });
const secondHistory = JSON.parse(saved.dailyLearningHistory), secondProgress = JSON.parse(saved.dailyRoutineProgress);
const both = { ...saved, dailyRoutineProgress: JSON.stringify({ ...secondProgress, completedIds: ['kana', 'words'] }),
  dailyLearningHistory: JSON.stringify({ ...secondHistory, [day]: { ...secondHistory[day], completedIds: ['kana', 'words'], completedCount: 2, updatedAt: new Date(now + 10).toISOString() } }) };
helper.assertDailyDelta(saved, both, 'words', day, now + 9, now + 11); positives++;
const board = { x: 25, y: 200, width: 240, height: 240, background: 'rgb(255, 255, 255)', image: 'linear-gradient(to right, white, gray)',
  guide: { x: 1, y: 1, width: 238, height: 238 }, glyph: 'あ', paths: 3 };
helper.assertBoards([board, { ...board, y: 500 }], 'あ'); positives++;
for (const [stage, mutate] of [
  ['reference-identical-board-background-glyph', b => { b.background = 'rgb(0, 0, 0)'; }],
  ['reference-guide-alignment', b => { b.guide.x = 8; }],
  ['reference-stacked-board-alignment', b => { b.x = 30; }],
  ['reference-loaded-glyph', b => { b.paths = 0; }],
]) { const bad = clone(board); mutate(bad); rejected(stage, () => helper.assertBoards([board, bad], 'あ'), stage === 'reference-loaded-glyph' ? { name: 'toBe', actual: false, expected: true } : stage === 'reference-identical-board-background-glyph' ? { name: 'toEqual', actual: [bad.background, bad.image, bad.glyph], expected: [board.background, board.image, board.glyph] } : { name: 'toBe', actual: false, expected: true }); }
for (const [glyphs, selected, stage, actual, expected] of [
  [[undefined, undefined], 'あ', 'reference-nonempty-board-glyph', false, true],
  [['', 'あ'], 'あ', 'reference-nonempty-board-glyph', false, true],
  [['あ', 'い'], 'あ', 'reference-board-matches-selected-glyph', 'い', 'あ'],
  [['あ', 'あ'], 'い', 'reference-board-matches-selected-glyph', 'あ', 'い'],
  [['あ', 'あ'], '', 'reference-selected-writing-glyph', false, true],
]) {
  const items = glyphs.map((glyph, i) => ({ ...clone(board), y: 200 + i * 300, glyph }));
  rejected(stage, () => helper.assertBoards(items, selected), { name: 'toBe', actual, expected });
}
const P = 'dailyRoutineProgress', H = 'dailyLearningHistory', J = 'language-storage-transaction-v1';
const expected = { [P]: before[P], [H]: before[H] };
for (const [key, value] of Object.entries(expected)) localStorage.setItem(key, value);
const native = Object.getOwnPropertyDescriptor(SyntheticStorage.prototype, 'setItem');
helper.installJournalHarness({ expected, fail: true });
try {
  const control = realm.window.__qaReferenceJournal;
  // Wrong journal key sets, stale raw values and another Storage realm pass
  // through untouched and cannot consume the single intended failure.
  for (const raw of [JSON.stringify({ [P]: before[P] }), JSON.stringify({ ...expected, wrongWords: null }), JSON.stringify({ ...expected, [P]: 'stale' }), 'not-json']) {
    localStorage.setItem(J, raw); assert.equal(localStorage.getItem(J), raw); localStorage.removeItem(J);
  }
  const other = new SyntheticStorage(); other.setItem(J, JSON.stringify(expected));
  assert.equal(control.stats.hits, 0); assert.equal(control.stats.otherJournals, 4); positives++;
  rejected('CI synthetic daily journal pre-write failure', () => localStorage.setItem(J, JSON.stringify(expected)));
  assert.equal(localStorage.getItem(J), null); assert.equal(localStorage.getItem(P), before[P]); assert.equal(localStorage.getItem(H), before[H]);
  assert.deepEqual(JSON.parse(JSON.stringify(control.stats)), { hits: 1, dailyWrites: 0, otherJournals: 4 }); positives++;
  localStorage.setItem(J, JSON.stringify(expected)); assert.equal(localStorage.getItem(J), JSON.stringify(expected));
  assert.equal(control.stats.hits, 1); positives++;
} finally {
  assert.equal(realm.window.__qaReferenceJournal.restore(), true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(SyntheticStorage.prototype, 'setItem'), native);
  assert.equal(Object.hasOwn(realm.window, '__qaReferenceJournal'), false);
}
// A thrown assertion after injection must still restore the native descriptor.
try { helper.installJournalHarness({ expected, fail: true }); throw Error('private-exit-control'); }
catch (error) { assert.equal(error.message, 'private-exit-control'); }
finally { assert.equal(realm.window.__qaReferenceJournal.restore(), true); assert.deepEqual(Object.getOwnPropertyDescriptor(SyntheticStorage.prototype, 'setItem'), native); positives++; }
assert.equal(positives, 7); assert.equal(negatives, 17);

});

// Twenty distinct source positions, NOT proof of assignment/finally execution.
// Whitespace-only prefixes prove native call attribution; actual browser CI remains required.
test('reference twenty literal phases retain source 57 numeric native attribution without fixtures', async () => {
  const repository = process.cwd(), root = await mkdtemp(join(tmpdir(), 'reference-native-phases-'));
  const file = 'tests/e2e/japanese-reference-routine.spec.ts';
  const expectedCoordinates = [{"source": 57, "line": 4, "column": 19}, {"source": 57, "line": 6, "column": 33}, {"source": 57, "line": 7, "column": 5}, {"source": 57, "line": 8, "column": 5}, {"source": 57, "line": 9, "column": 5}, {"source": 57, "line": 10, "column": 27}, {"source": 57, "line": 12, "column": 7}, {"source": 57, "line": 32, "column": 7}, {"source": 57, "line": 64, "column": 7}, {"source": 57, "line": 82, "column": 26}, {"source": 57, "line": 87, "column": 5}, {"source": 57, "line": 98, "column": 5}, {"source": 57, "line": 116, "column": 15}, {"source": 57, "line": 120, "column": 69}, {"source": 57, "line": 121, "column": 85}, {"source": 57, "line": 122, "column": 70}, {"source": 57, "line": 123, "column": 71}, {"source": 57, "line": 124, "column": 88}, {"source": 57, "line": 125, "column": 97}, {"source": 57, "line": 126, "column": 79}];







  try {
    assert.equal(sources[56], file); assert.equal(sources.length, 58);
    const source = await readFile(file, 'utf8'), lines = source.split('\n');
    const positions = lines.flatMap((line, index) => line.includes('await test.step(')
      ? [{ source: 57, line: index + 1, column: line.indexOf('await test.step(') + 1 }] : []);
    assert.deepEqual(positions, expectedCoordinates);
    const synthetic = Array(lines.length).fill('');
    // Match every original await column using inert whitespace, not source prefixes.
    // Synthetic labels and sequential calls do not execute assignment/finally control flow. None of
    // the real case body/helper/fixture, page/context/qa or services is imported.
    synthetic[0] = `import { test } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))}; import { fail } from './offline-reference-helper'; for (let phase = 0; phase < 20; phase++) {`;
    synthetic[2] = "test('synthetic reference phase ' + phase, async () => { if (phase < 19) test.fail();";
    for (const [index, position] of positions.entries()) {
      const prefix = ' '.repeat(position.column - 1) + `await test.step('synthetic phase ${index}', `;
      assert.equal(prefix.indexOf('await test.step(') + 1, position.column);
      synthetic[position.line - 1] = `${prefix}async () => { await fail(phase, ${index}); });`;
    }
    synthetic[positions.at(-1).line] = '}); }';
    await mkdir(join(root, 'tests/e2e'), { recursive: true });
    await writeFile(join(root, file), synthetic.join('\n'));
    await writeFile(join(root, 'tests/e2e/offline-reference-helper.ts'), `import { expect } from ${JSON.stringify(join(repository, 'node_modules/@playwright/test/index.js'))};\nexport async function fail(selected, current) { if (selected === current) expect(${JSON.stringify(canary)}).toBe('PRIVATE_EXPECTED'); }\n`);
    await writeFile(join(root, 'offline.config.mjs'), `export default ${JSON.stringify({ testDir: './tests/e2e', workers: 1, retries: 0, projects: [{ name: 'chromium-app-smoke' }], reporter: [[join(repository, 'tests/e2e/reporter.ts')]] })};\n`);
    const journalPath = join(root, 'journal.jsonl'); await writeFile(journalPath, '', { mode: 0o600 });
    const child = spawnSync(process.execPath, [join(repository, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'offline.config.mjs'], {
      cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', NODE_OPTIONS: '--max-old-space-size=192 --max-semi-space-size=4',
        QA_PRIVATE_DIAGNOSTIC_FILE: journalPath, QA_PRIVATE_DIAGNOSTIC_TOKEN: token },
    });
    // Safe boolean actuals cannot serialize a raw spawn Error or stream.
    assert.equal(child.error === undefined, true, 'reference-native-child-error');
    assert.equal(child.signal === null, true, 'reference-native-child-signal');
    assert.equal(child.status === 1, true, 'reference-native-twenty-intended-failures');
    const output = [];
    // One diagnostic-only invocation containing twenty intentional failures.
    // It is unrelated to the actual twenty-case application lane inventory.
    const report = await emitDiagnosticJournal({ path: journalPath, token, expected: 1, stage: 'stage-03', termination: 'none', emit: value => output.push(value) });
    assert.equal(report.report, 'complete'); assert.equal(report.invocations.length, 1);
    const invocation = report.invocations[0];
    assert.deepEqual(invocation.counts, { passed: 0, failed: 20, timedOut: 0, skipped: 0, interrupted: 0, unknown: 0 });
    assert.equal(invocation.status, 'failed'); assert.deepEqual(invocation.active, []); assert.equal(invocation.omitted, 0);
    assert.equal(invocation.runnerErrors, 0); assert.equal(invocation.details.length, 20);
    assert.deepEqual(invocation.details.map(detail => detail.test), Array.from({ length: 20 }, (_, index) => index + 1));
    const actual = [];
    for (const [index, detail] of invocation.details.entries()) {
      assert.equal(detail.source, 57); assert.equal(detail.line, 3); assert.equal(detail.column, 5); assert.equal(detail.project, 5);
      assert.equal(detail.failure.category, 1); assert.deepEqual(detail.failure.errors, []); assert.deepEqual(detail.failure.failedOperations, []);
      assert.deepEqual(detail.failure.failedSteps, [expectedCoordinates[index]]);
      assert.equal(detail.failure.stepScanTruncated, 0); actual.push(detail.failure.failedSteps[0]);
    }
    assert.equal(new Set(actual.map(item => `${item.line}:${item.column}`)).size, 20);
    assert.deepEqual(actual, expectedCoordinates); privateOutput(output);
    // Raw child streams are private lifecycle capture, not public diagnostic output.
    const { SafetyEventCollector } = await import('../qa-private-safety-diagnostics.mjs');
    const events = [], collector = new SafetyEventCollector(value => events.push(value), repository);
    const emitted = events.length; let dataReads = 0;
    for (const type of ['test:stdout', 'test:stderr']) {
      collector.accept({ type, get data() { dataReads++; throw new Error('private-stream-data-access'); } });
      assert.equal(dataReads, 0); assert.equal(events.length, emitted);
    }
    const text = output.join('\n'), bytes = await readFile(journalPath, 'utf8');
    for (const secret of [canary, 'PRIVATE_EXPECTED', file, 'offline-reference-helper', root, 'synthetic reference phase', ...positions.map(item => lines[item.line - 1])]) {
      assert.ok(!text.includes(secret)); assert.ok(!bytes.includes(secret));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Append-only import preserves original declaration coordinates. ESM registers these after prior imports, before this module's controls.
import '../qa-private-safety-diagnostics.test.mjs';
