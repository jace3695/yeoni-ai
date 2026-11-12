import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrivateDiagnostics, diagnosticInvocations, parseDiagnosticJournal, readDiagnosticJournal, emitDiagnosticJournal } from './qa-private-diagnostics.mjs';
import { runStages } from './qa-private-orchestrator.mjs';
import { sources } from './qa-private-source-ids.mjs';
import { inventory, browserCommand } from './isolated-chromium-smoke/plan.mjs';

const token = 'a'.repeat(64), staleToken = 'b'.repeat(64);
const canary = 'PRIVATE_CANARY_eyJtoken.sb_secret_FAKE.https://private.invalid/session?secret=CANARY\r\n::error::PRIVATE';
const fresh = async () => {
  const root = await mkdtemp(join(tmpdir(), 'private-diagnostics-test-'));
  const path = join(root, 'diagnostic.jsonl');
  await writeFile(path, '', { mode: 0o600 });
  return { root, path, env: { QA_PRIVATE_DIAGNOSTIC_FILE: path, QA_PRIVATE_DIAGNOSTIC_TOKEN: token } };
};
const specimen = (location = { file: 'tests/browser-cloud/basic.spec.ts', line: 25, column: 1 }, project = 'webkit-small') => ({
  location, parent: { project: () => ({ name: project }) },
  get title() { throw new Error('Must not read private title'); },
  titlePath() { throw new Error('Must not read private title path'); },
});
const journal = events => events.map(entry => JSON.stringify({ token, ...entry }) + '\n').join('');
const begin = { event: 'begin', test: 1, source: 2, line: 25, column: 1, project: 2 };
const start = { event: 'start' }, end = { event: 'end', status: 'passed' };
const parse = (events, expected = 1) => parseDiagnosticJournal(journal(events), token, expected);
const emit = async (fixture, expected = 1) => {
  const output = [];
  const report = await emitDiagnosticJournal({ ...fixture, token, expected, stage: 'stage-05', termination: 'none', emit: line => output.push(line) });
  const text = output.join('\n');
  for (const privateValue of [token, staleToken, 'PRIVATE', 'eyJ', 'sb_secret', 'https:', '::error::', fixture.root]) assert.ok(!text.includes(privateValue));
  assert.match(text, /^[a-zA-Z0-9 =\-\n]+$/);
  return { report, output };
};

test('diagnostics uses fixed source/project IDs and never reads titles, errors or source contents', async () => {
  const fixture = await fresh();
  await mkdir(join(fixture.root, 'tests/browser-cloud'), { recursive: true });
  await writeFile(join(fixture.root, 'tests/browser-cloud/basic.spec.ts'), canary);
  const reporter = new PrivateDiagnostics(fixture);
  const item = specimen({ file: join(fixture.root, 'tests/browser-cloud/basic.spec.ts'), line: 25, column: 1 });
  reporter.onTestBegin(item);
  reporter.onTestEnd(item, { status: 'failed', get errors() { throw new Error('Must not read errors'); },
    get attachments() { throw new Error('Must not read attachments'); }, duration: Infinity });
  reporter.onEnd({ status: 'failed' });
  const text = await readFile(fixture.path, 'utf8');
  assert.ok(!text.includes(canary)); assert.ok(!text.includes('basic.spec.ts'));
  const { report, output } = await emit(fixture);
  assert.equal(report.report, 'complete');
  assert.deepEqual(report.invocations[0].details, [{ test: 1, source: 2, line: 25, column: 1, project: 2, status: 'failed' }]);
  assert.ok(output.includes('stage-05 invocation=1 test=1 source=2 line=25 column=1 project=2 status=failed'));
  assert.equal((await stat(fixture.path)).mode & 0o777, 0o600);
});

test('malicious URL, token, CRLF, traversal, unlisted and oversized paths are unknown IDs', async () => {
  const fixture = await fresh(), reporter = new PrivateDiagnostics(fixture);
  const badPaths = [canary, '../../tests/browser-cloud/basic.spec.ts', 'tests/browser-cloud/../browser-cloud/basic.spec.ts',
    'file:///tests/browser-cloud/basic.spec.ts', '//tests/browser-cloud/basic.spec.ts', 'tests/browser-cloud/not-allowlisted.spec.ts',
    'tests/browser-cloud/basic.spec.ts\r\n::error::injected', 'x'.repeat(20000)];
  for (const file of badPaths) reporter.onTestEnd(specimen({ file, line: 25, column: 1 }, canary), { status: 'failed', errors: [{ message: canary }] });
  for (const bad of [-1, 0, 1000001, Infinity, NaN, '25', canary]) reporter.onTestEnd(specimen({ file: sources[1], line: bad, column: 1 }), { status: 'failed' });
  reporter.onEnd({ status: 'failed' });
  const { report } = await emit(fixture);
  assert.equal(report.report, 'complete');
  for (const detail of report.invocations[0].details) assert.deepEqual([detail.source, detail.line, detail.column], [0, 0, 0]);
  for (const detail of report.invocations[0].details.slice(0, badPaths.length)) assert.equal(detail.project, 0);
});

test('unknown statuses become fixed unknown; unexpected test end still receives numeric identity', async () => {
  const fixture = await fresh(), reporter = new PrivateDiagnostics(fixture);
  reporter.onTestEnd(specimen(), { status: canary }); reporter.onEnd({ status: canary });
  const { report } = await emit(fixture);
  assert.equal(report.invocations[0].status, 'unknown'); assert.equal(report.invocations[0].counts.unknown, 1);
  assert.equal(report.invocations[0].details[0].status, 'unknown');
});

test('failure before test begin, runner error and global timeout are explicit and private', async () => {
  const fixture = await fresh(), reporter = new PrivateDiagnostics(fixture);
  reporter.onError({ message: canary, stack: canary }); reporter.onEnd({ status: 'failed' });
  let report = (await emit(fixture)).report;
  assert.equal(report.invocations[0].runnerErrors, 1); assert.equal(report.invocations[0].counts.failed, 0);
  const second = new PrivateDiagnostics(fixture);
  second.onTestBegin(specimen()); second.onError({ message: canary }); second.onEnd({ status: 'timedout' });
  report = (await emit(fixture, 2)).report;
  assert.equal(report.report, 'complete'); assert.equal(report.invocations[1].status, 'timedout');
  assert.equal(report.invocations[1].active[0].source, 2);
});

test('missing end retains failed and active test coordinates without asserting completion', () => {
  const report = parse([start, begin, { event: 'result', test: 1, status: 'failed' }, { ...begin, test: 2 }]);
  assert.equal(report.report, 'incomplete'); assert.equal(report.invocations[0].status, 'running');
  assert.equal(report.invocations[0].details[0].test, 1); assert.equal(report.invocations[0].active[0].test, 2);
});

test('completed earlier invocation cannot stand in for a later startup failure', () => {
  const events = [start, begin, { event: 'result', test: 1, status: 'passed' }, end];
  const report = parse(events, 2);
  assert.equal(report.report, 'partial'); assert.equal(report.invocations.length, 1);
  const both = parse([...events, start, { event: 'error' }, { event: 'end', status: 'failed' }], 2);
  assert.equal(both.report, 'complete'); assert.deepEqual(both.invocations.map(item => item.status), ['passed', 'failed']);
});

test('malformed, stale, extra-field, injected, duplicate and out-of-range journals fail closed', async () => {
  const bad = [
    journal([start, end]).replaceAll(token, staleToken),
    journal([start, end]) + canary,
    journal([start, { ...begin, title: canary }]),
    journal([start, { ...begin, source: canary }]),
    journal([start, { ...begin, source: sources.length + 1 }]),
    journal([start, { ...begin, line: 1000001 }]),
    journal([start, { ...begin, project: 6 }]),
    journal([start, { ...begin, test: 10001 }]),
    journal([start, { ...begin, source: 0 }]),
    journal([start, { ...begin, column: -1 }]),
    journal([start, begin, { event: 'result', test: 1, status: canary }]),
    journal([start, begin, { event: 'result', test: '1', status: 'passed' }]),
    journal([start, begin, { event: 'result', test: 1, status: 'passed' }, { event: 'result', test: 1, status: 'passed' }]),
    journal([start, start]), journal([start, end, end]), journal([end]),
    journal([start, end, start, end]), journal([start, begin, end]),
    journal([start, { event: 'error' }, end]),
    journal([start, begin, { event: 'result', test: 1, status: 'failed' }, end]),
    'null\n', '[]\n', '{\n', '\n', journal([start]).trimEnd(), 'x'.repeat(1024 * 1024 + 1),
  ];
  const fixture = await fresh();
  for (const text of bad) {
    assert.equal(parseDiagnosticJournal(text, token, 1).report, 'invalid');
    await writeFile(fixture.path, text);
    const { report } = await emit(fixture); assert.equal(report.report, 'invalid'); assert.deepEqual(report.invocations, []);
  }
});

test('missing, empty, oversized, symlink and directory channels never expose private contents', async () => {
  const fixture = await fresh();
  assert.equal((await emit(fixture)).report.report, 'missing');
  assert.equal((await readDiagnosticJournal(join(fixture.root, 'absent'), token, 1)).report, 'missing');
  await writeFile(fixture.path, canary.repeat(20000)); assert.equal((await emit(fixture)).report.report, 'invalid');
  const link = join(fixture.root, 'link'); await symlink(fixture.path, link);
  assert.equal((await readDiagnosticJournal(link, token, 1)).report, 'missing');
  assert.equal((await readDiagnosticJournal(fixture.root, token, 1)).report, 'invalid');
});

test('detail and event counters are bounded and omission is explicit', async () => {
  const fixture = await fresh(), reporter = new PrivateDiagnostics(fixture);
  for (let i = 0; i < 25; i++) reporter.onTestEnd(specimen(), { status: 'failed' });
  reporter.onEnd({ status: 'failed' });
  const { report, output } = await emit(fixture);
  assert.equal(report.invocations[0].counts.failed, 25); assert.equal(report.invocations[0].details.length, 20);
  assert.equal(report.invocations[0].omitted, 5); assert.equal(output.length, 22);
  assert.equal(parse([start, ...Array.from({ length: 10001 }, () => ({ event: 'error' }))]).report, 'invalid');
});

test('disabled reporter is inert and planned invocation count includes multi-command stages', async () => {
  const reporter = new PrivateDiagnostics({ env: {} });
  reporter.onTestBegin(undefined); reporter.onTestEnd(undefined, undefined); reporter.onError(); reporter.onEnd({ status: 'passed' });
  assert.equal(diagnosticInvocations('node scripts/qa-playwright.mjs a\nnode scripts/qa-playwright.mjs b\n'), 2);
  assert.equal(diagnosticInvocations('npx playwright test --config tests/browser-cloud/playwright.config.ts'), 1);
  assert.equal(diagnosticInvocations('npm test\necho node scripts/qa-playwright.mjs'), 0);
});

const syntheticStage = async body => {
  const root = await mkdtemp(join(tmpdir(), 'private-diagnostic-supervisor-'));
  await mkdir(join(root, 'scripts'));
  const source = `import { PrivateDiagnostics } from ${JSON.stringify(new URL('./qa-private-diagnostics.mjs', import.meta.url).href)};\n${body}`;
  await writeFile(join(root, 'scripts/qa-playwright.mjs'), source);
  const output = [];
  return { cwd: root, runnerTemp: root, env: { PATH: process.env.PATH }, output, emit: line => output.push(line) };
};
const stage = (command = 'node scripts/qa-playwright.mjs', id = 'stage-05', cleanup = false) => ({ command, id, cleanup });
const publicCanaryCheck = output => {
  for (const privateValue of ['PRIVATE', 'eyJ', 'sb_secret', 'https:', '::error::', token, staleToken]) assert.ok(!output.join('\n').includes(privateValue));
};

test('supervisor publishes only current fixed diagnostics and keeps all raw/command-file streams private', async () => {
  const options = await syntheticStage(`
import { writeFileSync } from 'node:fs';
const canary = ${JSON.stringify(canary)};
console.log(canary); console.error(canary);
for (const key of ['GITHUB_OUTPUT','GITHUB_STATE','GITHUB_STEP_SUMMARY','GITHUB_PATH']) writeFileSync(process.env[key], canary);
const reporter = new PrivateDiagnostics();
const item = { location: { file: 'tests/browser-cloud/basic.spec.ts', line: 25, column: 1 }, parent: { project: () => ({name:'chromium'}) } };
reporter.onTestEnd(item, {status:'failed'}); reporter.onEnd({status:'failed'}); process.exitCode=9;`);
  const result = await runStages([stage(), stage('exit 0', 'stage-06'), stage('touch cleaned', 'stage-07', true)], options);
  assert.equal(result, 1); publicCanaryCheck(options.output);
  assert.ok(options.output.includes('stage-05 invocation=1 test=1 source=2 line=25 column=1 project=1 status=failed'));
  assert.deepEqual(options.output.slice(-3), ['stage-05 failed', 'stage-06 not-run', 'stage-07 passed']);
  await readFile(join(options.cwd, 'cleaned'));
  const directory = (await readdir(options.cwd)).find(name => name.startsWith('private-verification-'));
  const local = join(options.cwd, directory, 'stage-05');
  for (const name of ['stdout', 'stderr', 'GITHUB_OUTPUT', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY', 'GITHUB_PATH']) assert.ok((await readFile(join(local, name), 'utf8')).includes('PRIVATE_CANARY'));
});

test('supervisor never substitutes legacy, previous-stage or inherited diagnostic reports for missing output', async () => {
  const options = await syntheticStage(`import {mkdirSync, writeFileSync} from 'node:fs'; mkdirSync('.e2e/evidence',{recursive:true}); writeFileSync('.e2e/evidence/results.json', ${JSON.stringify(journal([start, end]))});`);
  options.env.QA_PRIVATE_DIAGNOSTIC_FILE = join(options.cwd, 'stale.jsonl');
  options.env.QA_PRIVATE_DIAGNOSTIC_TOKEN = token;
  await writeFile(options.env.QA_PRIVATE_DIAGNOSTIC_FILE, journal([start, end]));
  assert.equal(await runStages([stage()], options), 1);
  assert.deepEqual(options.output, ['stage-05 diagnostics report=missing expected=1 observed=0 termination=none', 'stage-05 failed']);
  assert.equal(await readFile(options.env.QA_PRIVATE_DIAGNOSTIC_FILE, 'utf8'), journal([start, end]));
});

test('supervisor marks later missing invocation partial and preserves failing child exit after an earlier passing report', async () => {
  const options = await syntheticStage(`if (process.argv[2] === 'first') { const reporter = new PrivateDiagnostics(); reporter.onEnd({status:'passed'}); } else process.exitCode=7;`);
  assert.equal(await runStages([stage('node scripts/qa-playwright.mjs first\nnode scripts/qa-playwright.mjs second')], options), 1);
  assert.ok(options.output.includes('stage-05 diagnostics report=partial expected=2 observed=1 termination=none'));
  assert.equal(options.output.filter(line => line.includes('invocation=2')).length, 0);
  assert.equal(options.output.at(-1), 'stage-05 failed'); publicCanaryCheck(options.output);
});

test('supervisor timeout reports active coordinates, incomplete journal, preserved failure and cleanup', async () => {
  const options = await syntheticStage(`const reporter = new PrivateDiagnostics(); reporter.onTestBegin({location:{file:'tests/browser-cloud/basic.spec.ts',line:25,column:1},parent:{project:()=>({name:'webkit-small'})}}); setTimeout(()=>{},10000);`);
  options.timeoutMs = 300;
  assert.equal(await runStages([stage(), stage('touch cleaned', 'stage-06', true)], options), 1);
  assert.ok(options.output.includes('stage-05 diagnostics report=incomplete expected=1 observed=1 termination=timeout'));
  assert.ok(options.output.includes('stage-05 invocation=1 test=1 source=2 line=25 column=1 project=2 status=running'));
  await readFile(join(options.cwd, 'cleaned')); publicCanaryCheck(options.output);
});

test('fresh sequential invocations pass while a later stage receives a different private token', async () => {
  const options = await syntheticStage(`import {existsSync, readFileSync, writeFileSync} from 'node:fs'; if(existsSync('prior-token') && readFileSync('prior-token','utf8')===process.env.QA_PRIVATE_DIAGNOSTIC_TOKEN) process.exitCode=9; writeFileSync('prior-token',process.env.QA_PRIVATE_DIAGNOSTIC_TOKEN); const reporter=new PrivateDiagnostics(); reporter.onEnd({status:'passed'});`);
  assert.equal(await runStages([stage(), stage('node scripts/qa-playwright.mjs', 'stage-06')], options), 0);
  assert.ok(options.output.includes('stage-05 passed')); assert.ok(options.output.includes('stage-06 passed'));
  const token = await readFile(join(options.cwd, 'prior-token'), 'utf8'); assert.ok(!options.output.join('').includes(token));
});

const receiptFile = 'tests/e2e/language-reset-receipts.spec.ts';
const receiptDefinition = { file: receiptFile, line: 9, column: 5 };
const safeAt = (line = 52) => ({ file: receiptFile, line, column: 31 });
const safeFailure = () => ({ category: 'test-error', testDefinition: receiptDefinition,
  errors: [{ location: safeAt() }], omittedErrors: 0, failedSteps: [safeAt(44)],
  failedOperations: [{ location: safeAt(), category: 'expect', durationMs: 15 }] });
const numericAt = (line = 52) => ({ source: 48, line, column: 31 });
const numericFailure = () => ({ category: 1, errors: [numericAt()], omittedErrors: 0,
  failedSteps: [numericAt(44)], failedOperations: [{ ...numericAt(), category: 1, durationMs: 15 }], stepScanTruncated: 0 });
const receiptBegin = { event: 'begin', test: 1, source: 48, line: 9, column: 5, project: 5 };
const withFailure = failure => [start, receiptBegin, { event: 'result', test: 1, status: 'failed', failure }, { event: 'end', status: 'failed' }];
const publishFailure = async failure => {
  const fixture = await fresh(), reporter = new PrivateDiagnostics(fixture);
  reporter.onTestEnd(specimen(receiptDefinition, 'chromium-app-smoke'), { status: 'failed',
    get errors() { throw new Error('Native errors must not be inspected by numeric serializer'); } }, failure);
  reporter.onEnd({ status: 'failed' });
  const result = await emit(fixture);
  const bytes = await readFile(fixture.path, 'utf8');
  for (const text of ['PRIVATE', receiptFile, 'message', 'stack', 'params', 'attachments', 'https:']) assert.ok(!bytes.includes(text));
  return result;
};

test('safe native failure evidence crosses the journal as same-source bounded numbers and fixed labels', async () => {
  const { report, output } = await publishFailure(safeFailure());
  assert.deepEqual(report.invocations[0].details[0].failure, numericFailure());
  assert.ok(output.includes('stage-05 invocation=1 test=1 operation=1 source=48 line=52 column=31 category=expect durationMs=15'));
  assert.ok(output.includes('stage-05 invocation=1 test=1 phase=1 source=48 line=44 column=31'));
  assert.ok(output.includes('stage-05 invocation=1 test=1 error=1 source=48 line=52 column=31'));
  assert.ok(output.includes('stage-05 invocation=1 test=1 failure=test-error omittedErrors=0 stepScanTruncated=0'));
  const api = safeFailure(); api.failedOperations[0].category = 'pw:api'; api.failedOperations[0].durationMs = 1000000;
  assert.ok((await publishFailure(api)).output.some(line => line.endsWith('category=pw-api durationMs=1000000')));
});

test('safe failure producer neither invokes malicious getters nor copies extra fields, names or contents', async () => {
  const denied = { get() { throw new Error('Must not inspect a private getter'); } };
  const failure = safeFailure();
  for (const value of [failure, failure.testDefinition, failure.errors[0], failure.errors[0].location,
    failure.failedSteps[0], failure.failedOperations[0], failure.failedOperations[0].location]) {
    Object.defineProperties(value, Object.fromEntries(['message', 'stack', 'snippet', 'cause', 'title', 'params', 'attachments', 'toJSON', 'token']
      .map(key => [key, denied])));
  }
  assert.deepEqual((await publishFailure(failure)).report.invocations[0].details[0].failure, numericFailure());
  for (const key of ['category', 'testDefinition']) {
    const bad = Object.defineProperty(safeFailure(), key, denied);
    assert.equal((await publishFailure(bad)).report.invocations[0].details[0].failure, undefined);
  }
  for (const key of ['errors', 'failedSteps', 'failedOperations']) {
    const bad = Object.defineProperty(safeFailure(), key, denied);
    assert.equal((await publishFailure(bad)).report.invocations[0].details[0].failure[key].length, 0);
  }
  const failureWithAccessor = safeFailure();
  for (const values of [failureWithAccessor.errors, failureWithAccessor.failedSteps, failureWithAccessor.failedOperations]) {
    Object.defineProperty(values, '0', denied);
  }
  const result = (await publishFailure(failureWithAccessor)).report.invocations[0].details[0].failure;
  assert.deepEqual([result.errors, result.failedSteps, result.failedOperations], [[], [], []]);
  const proxied = safeFailure();
  for (const key of ['errors', 'failedSteps', 'failedOperations']) {
    proxied[key] = new Proxy(proxied[key], { get() { throw new Error('Must not invoke array property getters'); } });
  }
  assert.deepEqual((await publishFailure(proxied)).report.invocations[0].details[0].failure, numericFailure());
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  const withRevoked = safeFailure(); withRevoked.failedOperations = revoked.proxy;
  assert.deepEqual((await publishFailure(withRevoked)).report.invocations[0].details[0].failure.failedOperations, []);
});

test('producer drops unknown, cross-spec, outside-root, malformed and non-native locations instead of inferring sites', async () => {
  const badLocations = [undefined, null, {}, { ...safeAt(), line: 0 }, { ...safeAt(), column: 1000001 },
    ...['tests/e2e/auth.spec.ts', 'tests/e2e/fixture.ts', '/outside/' + receiptFile, '../' + receiptFile,
      'file://' + receiptFile, receiptFile + '\n' + canary, 'x'.repeat(4097)].map(file => ({ ...safeAt(), file }))];
  for (const location of badLocations) {
    const bad = safeFailure(); bad.errors = [{ location }]; bad.failedSteps = [location]; bad.failedOperations[0].location = location;
    const failure = (await publishFailure(bad)).report.invocations[0].details[0].failure;
    assert.deepEqual([failure.errors, failure.failedSteps, failure.failedOperations], [[], [], []]);
  }
  for (const category of [canary, 'test.step', undefined]) {
    const bad = safeFailure(); bad.failedOperations[0].category = category;
    assert.deepEqual((await publishFailure(bad)).report.invocations[0].details[0].failure.failedOperations, []);
  }
  for (const durationMs of [-1, 1.5, Infinity, NaN, 1000001, '12']) {
    const bad = safeFailure(); bad.failedOperations[0].durationMs = durationMs;
    assert.deepEqual((await publishFailure(bad)).report.invocations[0].details[0].failure.failedOperations, []);
  }
  const bad = safeFailure(); bad.testDefinition = { ...receiptDefinition, line: 10 };
  assert.equal((await publishFailure(bad)).report.invocations[0].details[0].failure, undefined);
});

test('producer caps each failure list at three, preserves native truncation and does not scan later getters', async () => {
  const failure = safeFailure(); failure.omittedErrors = 1000000;
  for (const key of ['errors', 'failedSteps', 'failedOperations']) {
    failure[key] = Array.from({ length: 2001 }, () => failure[key][0]);
    Object.defineProperty(failure[key], '3', { get() { throw new Error('Must not scan fourth record'); } });
  }
  const result = (await publishFailure(failure)).report.invocations[0].details[0].failure;
  assert.deepEqual([result.errors.length, result.failedSteps.length, result.failedOperations.length], [3, 3, 3]);
  assert.equal(result.omittedErrors, 1000000); assert.equal(result.stepScanTruncated, 1);
  const truncated = safeFailure(); truncated.stepScanTruncated = true;
  assert.equal((await publishFailure(truncated)).report.invocations[0].details[0].failure.stepScanTruncated, 1);
});

test('journal revalidation rejects forged extra fields, categories, numeric bounds, cross-source and oversized failure lists', async () => {
  const invalid = [null, {}, [], { ...numericFailure(), extra: canary }, { ...numericFailure(), category: 2 },
    { ...numericFailure(), errors: [{ ...numericAt(), file: receiptFile }] },
    ...['errors', 'failedSteps', 'failedOperations'].flatMap(key => [
      { ...numericFailure(), [key]: 'PRIVATE' }, { ...numericFailure(), [key]: [null] },
      { ...numericFailure(), [key]: Array.from({ length: 4 }, () => numericFailure()[key][0]) },
      ...[0, 19, 49, '48'].map(source => ({ ...numericFailure(), [key]: [{ ...numericFailure()[key][0], source }] })),
      ...[0, 1000001, -1, 1.5, '52'].map(line => ({ ...numericFailure(), [key]: [{ ...numericFailure()[key][0], line }] })),
    ]),
    ...[-1, 1000001, 1.5, '0'].map(omittedErrors => ({ ...numericFailure(), omittedErrors })),
    ...[-1, 2, true, '0'].map(stepScanTruncated => ({ ...numericFailure(), stepScanTruncated })),
    ...[0, 3, 'expect', canary].map(category => ({ ...numericFailure(), failedOperations: [{ ...numericFailure().failedOperations[0], category }] })),
    ...[-1, 1000001, 1.5, '0'].map(durationMs => ({ ...numericFailure(), failedOperations: [{ ...numericFailure().failedOperations[0], durationMs }] })),
  ];
  const fixture = await fresh();
  for (const failure of invalid) {
    const input = journal(withFailure(failure));
    assert.equal(parseDiagnosticJournal(input, token, 1).report, 'invalid');
    await writeFile(fixture.path, input); assert.equal((await emit(fixture)).report.report, 'invalid');
  }
  for (const status of ['passed', 'skipped', 'unknown', 'timedOut', 'interrupted']) {
    const entries = withFailure(numericFailure()); entries[2].status = status;
    assert.equal(parse(entries).report, 'invalid');
  }
  for (const [status, category] of [['timedOut', 2], ['interrupted', 3]]) {
    const entries = withFailure({ ...numericFailure(), category }); entries[2].status = status;
    assert.equal(parse(entries).report, 'complete');
  }
});

test('appended browser IDs retain private same-spec failure coordinates', async () => {
  for (const [file, source] of [['tests/e2e/japanese-level-choice.spec.ts', 51], ['tests/e2e/japanese-due-review.spec.ts', 52], ['tests/e2e/curriculum-corruption.spec.ts', 53], ['tests/e2e/curriculum-terminal.spec.ts', 54], ['tests/e2e/japanese-settings-recovery.spec.ts', 55]]) {
    const fixture = await fresh(), reporter = new PrivateDiagnostics(fixture);
    const definition = { file, line: 3, column: 5 };
    const at = { file, line: 8, column: 11 };
    reporter.onTestEnd(specimen(definition, 'chromium-app-smoke'), { status: 'failed' }, {
      category: 'test-error', testDefinition: definition,
      errors: [{ location: at }], omittedErrors: 0, failedSteps: [at],
      failedOperations: [{ location: at, category: 'expect', durationMs: 15 }],
    });
    reporter.onEnd({ status: 'failed' });
    const { report, output } = await emit(fixture);
    assert.equal(report.report, 'complete');
    const detail = report.invocations[0].details[0];
    assert.equal(detail.source, source); assert.equal(detail.line, 3); assert.equal(detail.column, 5);
    assert.equal(detail.project, 5);
    assert.deepEqual(detail.failure.failedSteps, [{ source, line: 8, column: 11 }]);
    assert.ok(output.some(line => line.includes(`phase=1 source=${source} line=8 column=11`)));
    const bytes = await readFile(fixture.path, 'utf8');
    for (const secret of [file, canary, 'message', 'stack', 'attachments', 'https:']) assert.ok(!bytes.includes(secret));
  }
});

test('smoke diagnostics require all fourteen exact identities and the sole appended command', () => {
  const eventsFor = items => [start, ...items.flatMap((item, index) => [
    { event: 'begin', test: index + 1, ...item },
    { event: 'result', test: index + 1, status: 'passed' },
  ]), end];
  const events = eventsFor(inventory);
  const report = parseDiagnosticJournal(journal(events), token, 1, inventory);
  assert.equal(inventory.length, 14);
  assert.deepEqual(inventory.at(-1), { source: 55, line: 3, column: 5, project: 5 });
  assert.equal(report.report, 'complete');
  assert.equal(report.invocations[0].counts.passed, 14);
  for (const badInventory of [inventory.slice(0, 13), [...inventory, { source: 55, line: 4, column: 5, project: 5 }],
    [...inventory.slice(0, 13), inventory[0]]]) {
    assert.equal(parseDiagnosticJournal(journal(events), token, 1, badInventory).report, 'invalid');
  }
  const invalidEvents = [eventsFor(inventory.slice(0, 13)),
    eventsFor([...inventory.slice(0, 13), inventory[0]]),
    ...[{ source: 54 }, { line: 4 }, { column: 6 }, { project: 1 }].map(change =>
      eventsFor([...inventory.slice(0, 13), { ...inventory.at(-1), ...change }])),
    events.map(entry => entry.event === 'result' && entry.test === 14 ? { ...entry, status: 'skipped' } : entry),
  ];
  for (const badEvents of invalidEvents) {
    assert.equal(parseDiagnosticJournal(journal(badEvents), token, 1, inventory).report, 'invalid');
  }
  assert.equal(diagnosticInvocations(browserCommand), 1);
  for (const command of [browserCommand.replace(' tests/e2e/japanese-settings-recovery.spec.ts:3', ''),
    browserCommand.replace('japanese-settings-recovery.spec.ts:3', 'japanese-settings-recovery.spec.ts:4'),
    browserCommand + ' --list', browserCommand + ' --grep settings']) {
    assert.equal(diagnosticInvocations(command), 0);
  }
});

test('settings source 55 rejects cross-source evidence and never publishes private canaries', async () => {
  const file = 'tests/e2e/japanese-settings-recovery.spec.ts';
  const fixture = await fresh(), reporter = new PrivateDiagnostics(fixture);
  const definition = { file, line: 3, column: 5 };
  const same = { file, line: 8, column: 11 };
  const other = { file: 'tests/e2e/curriculum-terminal.spec.ts', line: 8, column: 11 };
  reporter.onTestEnd(specimen(definition, 'chromium-app-smoke'), { status: 'failed', errors: [{ message: canary }] }, {
    category: 'test-error', testDefinition: definition, message: canary,
    errors: [{ location: same, message: canary }, { location: other, message: canary }], omittedErrors: 0,
    failedSteps: [same, other], failedOperations: [same, other].map(location =>
      ({ location, category: 'expect', durationMs: 15, title: canary, params: canary })),
  });
  reporter.onEnd({ status: 'failed' });
  const { report, output } = await emit(fixture);
  assert.equal(report.report, 'complete');
  const failure = report.invocations[0].details[0].failure;
  assert.deepEqual(failure.errors, [{ source: 55, line: 8, column: 11 }]);
  assert.deepEqual(failure.failedSteps, [{ source: 55, line: 8, column: 11 }]);
  assert.deepEqual(failure.failedOperations, [{ source: 55, line: 8, column: 11, category: 1, durationMs: 15 }]);
  const bytes = await readFile(fixture.path, 'utf8');
  for (const secret of [file, other.file, canary, 'PRIVATE', 'message', 'stack', 'params', 'attachments', 'https:']) {
    assert.ok(!bytes.includes(secret)); assert.ok(!output.join('\n').includes(secret));
  }
  for (const key of ['errors', 'failedSteps', 'failedOperations']) {
    const forged = { ...failure, [key]: [{ ...failure[key][0], source: 54 }] };
    const events = [start, { event: 'begin', test: 1, source: 55, line: 3, column: 5, project: 5 },
      { event: 'result', test: 1, status: 'failed', failure: forged }, { event: 'end', status: 'failed' }];
    assert.equal(parse(events).report, 'invalid');
  }
});
