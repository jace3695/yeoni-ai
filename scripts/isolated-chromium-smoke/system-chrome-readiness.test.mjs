import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { constants } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { checkSystemChrome, officialChromeContext, ChromeContextError, chromePath, approvedVersion, parseChromeVersion } from './system-chrome-readiness.mjs';
import { supervise, mainFailureLine } from './supervisor.mjs';

const canary = 'SYNTHETIC_PRIVATE_eyJtoken.sb_secret_FAKE.https://private.invalid/?secret=CANARY\r\n::error::PRIVATE';
const goodVersion = Buffer.from('Google Chrome 156.0.8078.79\n');
const osRelease = Buffer.from('NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n');
const environment = () => ({ CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/agent/yeoni-japanese-ci-20261110', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
  RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'ubuntu24', ImageVersion: '20261101.360.1',
  GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com' });
const safeOutput = output => {
  for (const line of output) assert.match(line, /^[a-zA-Z0-9 =-]+$/);
  assert.ok(!output.join('\n').includes('PRIVATE'));
  assert.ok(!output.join('\n').includes('Chrome 156.'));
  assert.ok(!output.join('\n').includes('/opt/'));
};
function fixture(overrides = {}) {
  const output = [], launches = [], reads = [];
  const fileInfo = { uid: 0, gid: 0, mode: 0o100755, size: 128,
    isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
  const options = { env: environment(), emit: line => output.push(line), platform: 'linux', arch: 'x64',
    metadata: async path => {
      reads.push(path);
      return path === chromePath || path === '/usr/lib/os-release' ? fileInfo
        : { ...fileInfo, isFile: () => false, isDirectory: () => true, mode: 0o40755 };
    }, canonical: async path => path,
    openFile: async (path, flags) => {
      assert.equal(path, '/usr/lib/os-release');
      assert.equal(flags, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      return { stat: async () => fileInfo, read: async buffer => {
        osRelease.copy(buffer); return { bytesRead: osRelease.length };
      }, close: async () => {} };
    }, launch: (path, args, config) => {
      launches.push({ path, args, config });
      const child = new EventEmitter();
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
      queueMicrotask(() => { child.stdout.write(goodVersion); child.emit('exit', 0, null); child.emit('close', 0); });
      return child;
    }, ...overrides };
  return { options, output, launches, reads, fileInfo };
}
function versionChild(stdout, stderr = Buffer.alloc(0), code = 0, missingExit = false) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
    queueMicrotask(() => {
      child.stdout.write(stdout); child.stderr.write(stderr);
      if (!missingExit) child.emit('exit', code, null);
      child.emit('close', code);
    });
    return child;
  };
}

test('system Chrome readiness pins official context, installed Playwright locator and exact version policy', async () => {
  assert.equal(chromePath, '/opt/google/chrome/chrome'); assert.equal(approvedVersion, '156.0.8078.79');
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) assert.equal(lock.packages[`node_modules/${name}`].version, '1.63.0');
  const core = await readFile('node_modules/playwright-core/lib/coreBundle.js');
  assert.equal(createHash('sha256').update(core).digest('hex'), '549070af3acabb3efcc4f55bfe6210f9f7c2fcf633cf7eaa59bfe60719969171');
  assert.ok(core.toString().includes('_createChromiumChannel("chrome", {\n          "linux": "/opt/google/chrome/chrome",'));
  const config = await readFile('playwright.chromium-smoke.config.ts', 'utf8');
  assert.equal((config.match(/channel: 'chrome'/g) ?? []).length, 1);
  assert.ok(config.includes('officialChromeContext(env);'));
  assert.doesNotMatch(config, /executablePath|launchOptions|connectOptions|chromiumSandbox|--no-sandbox/);
  const plan = await readFile('scripts/isolated-chromium-smoke/plan.mjs', 'utf8');
  assert.doesNotMatch(plan, /install|download|apt|sudo|curl|wget/);
  assert.ok(plan.includes("command: 'system-google-chrome-readiness', timeoutMs: 240_000, lifecycleDiagnostics: true"));
});

test('system Chrome probe reads only fixed metadata and executes only fixed --version with a minimal environment', async () => {
  const state = fixture(); state.options.env.PATH = canary; state.options.env.HOME = canary;
  state.options.env.NODE_OPTIONS = canary; state.options.env.HTTPS_PROXY = canary;
  state.options.env.NODE_ENV = canary;
  assert.equal(await checkSystemChrome(state.options), 0);
  assert.deepEqual(state.launches, [{ path: chromePath, args: ['--version'], config: { cwd: '/',
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true } }]);
  assert.deepEqual(state.reads, ['/', '/opt', '/opt/google', '/opt/google/chrome', chromePath, '/usr', '/usr/lib', '/usr/lib/os-release']);
  assert.equal(state.output.at(-2), 'stage-02 readiness browser=system-google-chrome image=ubuntu24 imageVersion=20261101-360-1 major=156 minor=0 build=8078 patch=79 status=passed');
  assert.equal(state.output.at(-1), 'stage-02 passed'); safeOutput(state.output);
});

test('system Chrome context fails closed on missing/unapproved image, host, ref, platform and injected executable/remote environments', async () => {
  for (const [key, value] of Object.entries(environment())) {
    for (const wrong of [undefined, '', value + 'x', canary]) {
      const state = fixture(); state.options.env[key] = wrong;
      assert.equal(await checkSystemChrome(state.options), 1, key);
      assert.equal(state.reads.length, 0); assert.equal(state.launches.length, 0); safeOutput(state.output);
    }
  }
  for (const key of ['PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH', 'PW_TEST_CONNECT_WS_ENDPOINT', 'PWTEST_CLI_EXECUTABLE_PATH', 'SELENIUM_REMOTE_URL', 'CHROME_BIN', 'CHROMIUM_PATH', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES']) {
    const state = fixture(); state.options.env[key] = canary;
    assert.throws(() => officialChromeContext(state.options.env));
    assert.equal(await checkSystemChrome(state.options), 1); assert.equal(state.launches.length, 0); safeOutput(state.output);
  }
  for (const override of [{ platform: 'darwin' }, { arch: 'arm64' }, { timeoutMs: 0 }, { timeoutMs: 240001 }, { timeoutMs: NaN }]) {
    const state = fixture(override); assert.equal(await checkSystemChrome(state.options), 1);
    assert.equal(state.launches.length, 0); safeOutput(state.output);
  }
});

test('system Chrome missing/unsafe/symlink metadata and OS read or parse failures never execute a version command', async () => {
  const base = fixture();
  const badInfo = [{ uid: 1 }, { gid: 1 }, { mode: 0o100777 }, { size: 0 },
    { isSymbolicLink: () => true }, { isFile: () => false }, { mode: 0o100644 }];
  for (const info of badInfo) {
    const state = fixture({ metadata: async path => path === chromePath
      ? { ...base.fileInfo, ...info } : base.options.metadata(path) });
    assert.equal(await checkSystemChrome(state.options), 1); assert.equal(state.launches.length, 0); safeOutput(state.output);
  }
  for (const override of [
    { metadata: async () => { throw new Error(canary); } },
    { canonical: async () => '/tmp/' + canary },
    { openFile: async () => { throw new Error(canary); } },
    { openFile: async () => ({ stat: async () => base.fileInfo, read: async () => { throw new Error(canary); }, close: async () => {} }) },
    ...[Buffer.from('ID=ubuntu\nID=ubuntu\nVERSION_ID="24.04"\n'), Buffer.from('ID=debian\nVERSION_ID="24.04"\n'), Buffer.from('ID=ubuntu\nVERSION_ID="26.04"\n')].map(bytes => ({
      openFile: async () => ({ stat: async () => base.fileInfo, read: async buffer => { bytes.copy(buffer); return { bytesRead: bytes.length }; }, close: async () => {} }),
    })),
  ]) {
    const state = fixture(override); assert.equal(await checkSystemChrome(state.options), 1);
    assert.equal(state.launches.length, 0); safeOutput(state.output);
  }
});

test('system Chrome strict version parsing rejects missing/wrong/ambiguous/hostile stdout, stderr and execution failure', async () => {
  assert.equal(parseChromeVersion(goodVersion, Buffer.alloc(0)), true);
  for (const bytes of [Buffer.alloc(0), Buffer.from('Google Chrome 156.0.8078.80\n'), Buffer.from('Chromium 156.0.8078.79\n'),
    Buffer.concat([goodVersion, goodVersion]), Buffer.from(' Google Chrome 156.0.8078.79\n'), Buffer.from('Google Chrome 156.0.8078.79\r\n'),
    Buffer.concat([goodVersion, Buffer.from(canary)]), Buffer.alloc(129, 65), Buffer.from(canary)]) {
    assert.equal(parseChromeVersion(bytes, Buffer.alloc(0)), false);
    const state = fixture({ launch: versionChild(bytes) });
    assert.equal(await checkSystemChrome(state.options), 1); safeOutput(state.output);
  }
  for (const launch of [versionChild(goodVersion, Buffer.from(canary)), versionChild(goodVersion, Buffer.alloc(0), 1),
    versionChild(goodVersion, Buffer.alloc(0), null), versionChild(goodVersion, Buffer.alloc(0), 0, true),
    () => { throw new Error(canary); }, () => {
      const child = new EventEmitter(); child.unref = () => {};
      queueMicrotask(() => child.emit('error', new Error(canary))); return child;
    }]) {
    const state = fixture({ launch }); assert.equal(await checkSystemChrome(state.options), 1); safeOutput(state.output);
  }
});

test('system Chrome cancellation and timeout settle failure, suppress late success and never run browser stage', async t => {
  const controller = new AbortController(); controller.abort(); const pre = fixture({ signal: controller.signal });
  assert.equal(await checkSystemChrome(pre.options), 1); assert.equal(pre.launches.length, 0);
  let release; const cancel = new AbortController();
  const pending = fixture({ signal: cancel.signal, metadata: () => new Promise(resolve => { release = resolve; }) });
  const operation = checkSystemChrome(pending.options); await new Promise(resolve => setTimeout(resolve, 5));
  cancel.abort(); release(pending.fileInfo);
  assert.equal(await operation, 1); assert.equal(pending.launches.length, 0); safeOutput(pending.output);
  const timed = fixture({ timeoutMs: 10, launch: () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.unref = () => {};
    // A mocked owned child with no pid. No real process, signal target or browser.
    return child;
  } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settled = false; const timeoutResult = checkSystemChrome(timed.options);
  timeoutResult.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(10); t.mock.timers.tick(4999);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
  t.mock.timers.tick(1); assert.equal(await timeoutResult, 1);
  t.mock.timers.reset(); assert.ok(timed.output.some(line => line.includes('reason=timeout'))); safeOutput(timed.output);
  for (const launch of [versionChild(Buffer.from(canary)), () => { throw new Error(canary); }]) {
    const state = fixture({ launch }), calls = [];
    const code = await supervise({ cwd: '.', runnerTemp: '.', env: state.options.env, emit: state.options.emit,
      run: async items => { calls.push(items[0].id); return 0; },
      readiness: options => checkSystemChrome({ ...state.options, ...options }) });
    assert.equal(code, 1); assert.deepEqual(calls, ['stage-01']);
    assert.ok(state.output.includes('stage-03 not-run')); assert.ok(!state.output.some(line => line.includes('realBrowser=true'))); safeOutput(state.output);
  }
});


test('only exact official inventory defaults are admitted and neither becomes a child input', async () => {
  const defaults = { CHROME_BIN: '/usr/bin/google-chrome', SELENIUM_JAR_PATH: '/usr/share/java/selenium-server.jar' };
  for (const additions of [{}, { CHROME_BIN: '' }, { SELENIUM_JAR_PATH: '' },
    { CHROME_BIN: defaults.CHROME_BIN }, { SELENIUM_JAR_PATH: defaults.SELENIUM_JAR_PATH }, defaults]) {
    const state = fixture(); Object.assign(state.options.env, additions);
    const admitted = officialChromeContext(state.options.env);
    assert.ok(!Object.hasOwn(admitted, 'CHROME_BIN')); assert.ok(!Object.hasOwn(admitted, 'SELENIUM_JAR_PATH'));
    assert.equal(await checkSystemChrome(state.options), 0);
    assert.deepEqual(state.launches[0].config.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', NODE_ENV: 'production' });
    assert.equal(state.launches[0].path, chromePath); safeOutput(state.output);
  }
  for (const [name, value] of Object.entries(defaults)) {
    for (const wrong of [value + ' ', ' ' + value, value + '/', value + '.extra', value.toUpperCase(), value.replace('/usr/', '/usr/../usr/'), 'file://' + value, canary]) {
      const state = fixture(); state.options.env[name] = wrong;
      assert.throws(() => officialChromeContext(state.options.env), error => error instanceof ChromeContextError && error.category === 'override');
      assert.equal(await checkSystemChrome(state.options), 1); assert.equal(state.launches.length, 0); safeOutput(state.output);
    }
    for (const wrongName of [name.toLowerCase(), name[0] + name.slice(1).toLowerCase(), name + '_EXTRA']) {
      const state = fixture(); state.options.env[wrongName] = value;
      assert.equal(await checkSystemChrome(state.options), 1); assert.equal(state.launches.length, 0); safeOutput(state.output);
    }
  }
});

test('entry diagnostic categories never expose raw error, environment, property or phase content', () => {
  for (const phase of ['fixture', 'private-mode', 'signal-handlers', 'child-environment', 'runner-context', canary, null, {}, 'handoff']) {
    for (const error of [new Error(canary), canary, { category: canary }, undefined]) safeOutput([mainFailureLine(phase, error)]);
  }
  for (const category of ['request', 'runner', 'image', 'repository', 'override']) {
    assert.equal(mainFailureLine('runner-context', new ChromeContextError(category)), `chromium-app-smoke admission failed category=context-${category}`);
  }
  const hostile = new ChromeContextError('override');
  Object.defineProperty(hostile, 'category', { get: () => { throw new Error(canary); } });
  assert.equal(mainFailureLine('runner-context', hostile), 'chromium-app-smoke admission failed category=runner-context');
  assert.equal(mainFailureLine('handoff', hostile), 'chromium-app-smoke supervisor failed category=unexpected');
  let reads = 0;
  const changing = new ChromeContextError('override');
  Object.defineProperty(changing, 'category', { get: () => ++reads === 1 ? 'override' : canary });
  assert.equal(mainFailureLine('runner-context', changing), 'chromium-app-smoke admission failed category=context-override');
  assert.equal(reads, 1);
});

test('actual main and fixture entry source distinguishes safe defaults and every synthetic pre-stage failure without launching', () => {
  const harness = async () => {
    const assert = (await import('node:assert/strict')).default;
    const { readFile } = await import('node:fs/promises');
    const { SourceTextModule, SyntheticModule, createContext } = await import('node:vm');
    const path = await import('node:path'), url = await import('node:url');
    const { constants } = await import('node:fs');
    const root = process.cwd();
    const supervisorSource = await readFile(path.join(root, 'scripts/isolated-chromium-smoke/supervisor.mjs'), 'utf8');
    const boundarySource = await readFile(path.join(root, 'scripts/isolated-auth-api/boundary.mjs'), 'utf8');
    const plan = await import(url.pathToFileURL(path.join(root, 'scripts/isolated-chromium-smoke/plan.mjs')));
    const { officialChromeContext, ChromeContextError } = await import(url.pathToFileURL(path.join(root, 'scripts/isolated-chromium-smoke/system-chrome-readiness.mjs')));
    const repo = '/synthetic/repository', runnerTemp = '/home/runner/work/_temp';
    const entry = `${repo}/scripts/isolated-chromium-smoke/supervisor.mjs`;
    const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.synthetic`;
    const base = () => ({ CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/agent/yeoni-japanese-ci-20261110', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
      RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'ubuntu24', ImageVersion: '20261101.360.1',
      GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com',
      RUNNER_TEMP: runnerTemp, YEONI_E2E: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), PATH: '/synthetic/bin', HOME: '/synthetic/home', LANG: 'C' });
    const failure = 'chromium-app-smoke failed browser=system-google-chrome realBrowser=unverified fixtureCleanup=unverified';
    const cases = [
      { name: 'valid-official-context', allowed: true },
      { name: 'empty-defaults', env: { CHROME_BIN: '', SELENIUM_JAR_PATH: '' }, allowed: true },
      { name: 'chrome-default', env: { CHROME_BIN: '/usr/bin/google-chrome' }, allowed: true },
      { name: 'selenium-default', env: { SELENIUM_JAR_PATH: '/usr/share/java/selenium-server.jar' }, allowed: true },
      { name: 'both-defaults', env: { CHROME_BIN: '/usr/bin/google-chrome', SELENIUM_JAR_PATH: '/usr/share/java/selenium-server.jar' }, allowed: true },
      { name: 'request', env: { CI: 'false' }, category: 'context-request' },
      { name: 'runner', env: { RUNNER_ARCH: 'ARM64' }, category: 'context-runner' },
      { name: 'image', env: { ImageVersion: '20261102.1.1' }, category: 'context-image' },
      { name: 'repository', env: { GITHUB_REPOSITORY: 'synthetic/other' }, category: 'context-repository' },
      ...['CHROME_BIN','SELENIUM_JAR_PATH','CHROME_PATH','SELENIUM_REMOTE_URL','PW_TEST_CONNECT_WS_ENDPOINT','LD_PRELOAD','DYLD_INSERT_LIBRARIES','chrome_bin'].map(name => ({ name: 'override-' + name, env: { [name]: 'SYNTHETIC_PRIVATE' }, category: 'context-override' })),
      ...['directoryError','directoryWrong','directoryLink','canonicalError','canonicalWrong','listError','envFile','fileFailure','modeFailure','readFailure','badJson','badRole'].map(name => ({ name, [name]: true, category: 'fixture' })),
      { name: 'umaskFailure', umaskFailure: true, category: 'private-mode' },
      { name: 'controllerFailure', controllerFailure: true, category: 'signal-handlers' },
      { name: 'signalFailure', signalFailure: true, category: 'signal-handlers' },
      { name: 'childEnvironmentFailure', childEnvironmentFailure: true, category: 'child-environment' },
      { name: 'handoffFailure', handoffFailure: true, category: 'supervisor' },
    ];
    const results = [];
    for (const scenario of cases) {
      const env = { ...base(), ...scenario.env }, output = [], checkpoints = [], childEnvs = [];
      if (scenario.childEnvironmentFailure) Object.defineProperty(env, 'PATH', { get: () => { throw new Error('SYNTHETIC_PRIVATE'); } });
      const processMock = { env, argv: ['node', entry], cwd: () => repo, exitCode: undefined,
        umask: () => { if (scenario.umaskFailure) throw new Error('SYNTHETIC_PRIVATE'); checkpoints.push('umask-boundary'); return 0o022; },
        on: () => { if (scenario.signalFailure) throw new Error('SYNTHETIC_PRIVATE'); }, off: () => { if (scenario.handoffFailure) throw new Error('SYNTHETIC_PRIVATE'); } };
      const context = createContext({ process: processMock, Buffer, URL, AbortController: class { constructor() { if (scenario.controllerFailure) throw new Error('SYNTHETIC_PRIVATE'); return new AbortController(); } }, setTimeout, clearTimeout,
        console: { log: line => output.push(line) } });
      const modules = new Map();
      const stub = (name, exports) => {
        const mod = new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context, identifier: name });
        modules.set(name, mod); return mod;
      };
      stub('node:path', { resolve: path.resolve, join: path.join });
      stub('node:url', { fileURLToPath: url.fileURLToPath });
      stub('node:fs', { constants });
      const fixture = scenario.badJson ? Buffer.from('{') : Buffer.from(JSON.stringify({ API_URL: env.NEXT_PUBLIC_SUPABASE_URL, ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt(scenario.badRole ? 'anon' : 'service_role') }));
      stub('node:fs/promises', {
        lstat: async target => { assert.equal(target, runnerTemp); checkpoints.push('fixture-directory'); if (scenario.directoryError) throw new Error('SYNTHETIC_PRIVATE'); return { isDirectory: () => !scenario.directoryWrong, isSymbolicLink: () => !!scenario.directoryLink }; },
        realpath: async target => { assert.ok([runnerTemp, `${repo}/.e2e/stack-status.json`].includes(target)); if (scenario.canonicalError) throw new Error('SYNTHETIC_PRIVATE'); return scenario.canonicalWrong ? '/synthetic/wrong' : target; },
        readdir: async target => { assert.equal(target, repo); if (scenario.listError) throw new Error('SYNTHETIC_PRIVATE'); return scenario.envFile ? ['.env.production'] : ['package.json', '.e2e']; },
        open: async target => { assert.equal(target, `${repo}/.e2e/stack-status.json`); checkpoints.push('fixture-read');
          if (scenario.fileFailure) throw new Error('SYNTHETIC_PRIVATE');
          return { stat: async () => ({ isFile: () => true, mode: scenario.modeFailure ? 0o100644 : 0o100600, size: fixture.length }),
            read: async buffer => { if (scenario.readFailure) throw new Error('SYNTHETIC_PRIVATE'); fixture.copy(buffer); return { bytesRead: fixture.length }; }, close: async () => {} };
        },
      });
      stub('../qa-private-orchestrator.mjs', { runStages: async (_stages, options) => {
        assert.equal(_stages.length, 1); assert.equal(_stages[0].id, 'stage-01');
        checkpoints.push('synthetic-safety-boundary'); childEnvs.push(options.env); return 0;
      } });
      stub('../qa-private-lifecycle.mjs', { terminationGraceMs: 5000 });
      stub('./plan.mjs', { stages: plan.stages, totalTimeoutMs: plan.totalTimeoutMs });
      stub('./system-chrome-readiness.mjs', { ChromeContextError,
        officialChromeContext: value => { checkpoints.push('official-context'); const accepted = officialChromeContext(value); checkpoints.push('official-context-passed'); return accepted; },
        checkSystemChrome: async options => { checkpoints.push('no-launch-readiness-boundary'); childEnvs.push(options.env); return 1; },
      });
      const boundary = new SourceTextModule(boundarySource, { context, identifier: `${repo}/scripts/isolated-auth-api/boundary.mjs` });
      modules.set('../isolated-auth-api/boundary.mjs', boundary);
      const supervisor = new SourceTextModule(supervisorSource, { context, identifier: entry, initializeImportMeta: meta => { meta.url = url.pathToFileURL(entry).href; } });
      await supervisor.link(specifier => { const mod = modules.get(specifier); if (!mod) throw new Error('Unmocked import forbidden'); return mod; });
      await supervisor.evaluate();
      for (let i = 0; processMock.exitCode === undefined && i < 10; i++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(processMock.exitCode, 1);
      assert.equal(output.at(-1), failure);
      if (scenario.allowed) {
        assert.ok(checkpoints.includes('no-launch-readiness-boundary'));
        assert.deepEqual(output, ['stage-03 not-run', failure]);
        for (const forwarded of childEnvs) {
          for (const key of ['RUNNER_OS','RUNNER_ARCH','RUNNER_ENVIRONMENT','ImageOS','ImageVersion','GITHUB_REPOSITORY','GITHUB_SERVER_URL']) assert.equal(forwarded[key], base()[key]);
          assert.equal(forwarded.NODE_ENV, 'production');
          assert.ok(!Object.hasOwn(forwarded, 'CHROME_BIN')); assert.ok(!Object.hasOwn(forwarded, 'SELENIUM_JAR_PATH'));
        }
      } else if (scenario.handoffFailure) {
        assert.ok(output.includes('chromium-app-smoke supervisor failed category=unexpected'));
        assert.ok(!output.some(line => line.includes('admission failed')));
      } else {
        assert.deepEqual(output, [`chromium-app-smoke admission failed category=${scenario.category}`, failure]);
        assert.ok(!checkpoints.includes('synthetic-safety-boundary'));
      }
      for (const line of output) { assert.match(line, /^[a-zA-Z0-9 =-]+$/); assert.ok(!line.includes('SYNTHETIC_PRIVATE')); }
      results.push({ scenario: scenario.name, exitCode: 1, checkpoints, output, actualIo: false, actualChildOrBrowser: false });
    }
    console.log(JSON.stringify({ cases: results.length, passed: true, actualIo: false, actualChildOrBrowser: false }));
  };
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', `await (${harness.toString()})();`], {
    cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true); assert.ok(report.cases >= 30);
  assert.equal(report.actualIo, false); assert.equal(report.actualChildOrBrowser, false);
});

test('metadata failures expose only the fixed path and check identities without changing any gate', async t => {
  const paths = ['/', '/opt', '/opt/google', '/opt/google/chrome', chromePath, '/usr', '/usr/lib', '/usr/lib/os-release'];
  const faults = [
    { check: 1, fault: 'read' }, { check: 2, field: 'uid', value: 1 },
    { check: 3, field: 'gid', value: 1 }, { check: 4, field: 'mode', value: 0o777 },
    { check: 5, field: 'isSymbolicLink', value: () => true },
    { check: 6, fault: 'canonical-read' }, { check: 7, fault: 'canonical-match' },
    { check: 8, fault: 'kind' },
  ];
  for (const [index, target] of paths.entries()) {
    const applicable = [...faults];
    if (index === 4) applicable.push({ check: 9, field: 'mode', value: 0o100644 });
    if (index === 4 || index === 7) applicable.push({ check: 10, field: 'size', value: 0 });
    if (index === 7) applicable.push({ check: 10, field: 'size', value: 4097 });
    for (const fault of applicable) {
      const state = fixture(); const baseMetadata = state.options.metadata;
      state.options.metadata = async path => {
        const info = { ...await baseMetadata(path) };
        if (path !== target) return info;
        if (fault.fault === 'read') throw new Error(canary);
        if (fault.fault === 'kind') { info.isFile = () => false; info.isDirectory = () => false; }
        if (fault.field) info[fault.field] = fault.value;
        return info;
      };
      state.options.canonical = async path => {
        if (path === target && fault.fault === 'canonical-read') throw new Error(canary);
        return path === target && fault.fault === 'canonical-match' ? canary : path;
      };
      state.options.openFile = async () => { assert.fail('OS file must not open after metadata rejection'); };
      assert.equal(await checkSystemChrome(state.options), 1);
      assert.equal(state.launches.length, 0);
      assert.deepEqual(state.reads, paths.slice(0, index + 1));
      assert.equal(state.output.length, 4);
      assert.equal(state.output[1], `stage-02 metadata path=${index} check=${fault.check}`);
      assert.equal(state.output[2], 'stage-02 readiness browser=system-google-chrome status=failed reason=metadata');
      assert.equal(state.output[3], 'stage-02 failed'); safeOutput(state.output);
    }
  }
  // Exceptions from hostile metadata properties also disclose only the fixed check.
  for (const [field, check] of [['uid', 2], ['gid', 3], ['mode', 4], ['isSymbolicLink', 5]]) {
    const state = fixture(); const baseMetadata = state.options.metadata;
    state.options.metadata = async path => {
      const info = { ...await baseMetadata(path) };
      Object.defineProperty(info, field, { get: () => { throw new Error(canary); } }); return info;
    };
    assert.equal(await checkSystemChrome(state.options), 1);
    assert.equal(state.output[1], `stage-02 metadata path=0 check=${check}`);
    assert.equal(state.launches.length, 0); safeOutput(state.output);
  }
  const accepted = fixture(); assert.equal(await checkSystemChrome(accepted.options), 0);
  assert.ok(!accepted.output.some(line => line.startsWith('stage-02 metadata ')));
  const cancelled = new AbortController(); cancelled.abort();
  const state = fixture({ signal: cancelled.signal });
  assert.equal(await checkSystemChrome(state.options), 1);
  assert.ok(!state.output.some(line => line.startsWith('stage-02 metadata ')));
  assert.equal(state.launches.length, 0); safeOutput(state.output);
  const pending = fixture({ timeoutMs: 10, metadata: () => new Promise(() => {}) });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timed = checkSystemChrome(pending.options);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(10); t.mock.timers.tick(5000);
  assert.equal(await timed, 1); t.mock.timers.reset();
  assert.ok(!pending.output.some(line => line.startsWith('stage-02 metadata ')));
  assert.equal(pending.launches.length, 0); safeOutput(pending.output);
  for (const override of [{ env: {} }, { openFile: async () => { throw new Error(canary); } },
    { launch: versionChild(Buffer.from(canary)) }]) {
    const other = fixture(override); assert.equal(await checkSystemChrome(other.options), 1);
    assert.ok(!other.output.some(line => line.startsWith('stage-02 metadata '))); safeOutput(other.output);
  }
});
