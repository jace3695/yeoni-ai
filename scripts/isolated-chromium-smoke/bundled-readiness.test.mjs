import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { checkBundledChromium, bundledChromiumContext, InspectionContextError, BUNDLE_CACHE } from './bundled-readiness.mjs';
import { driverEnvironment, DRIVER_EXIT_CODES, MISSING_LIBRARIES } from './bundled-driver.mjs';
import { supervise, mainFailureLine } from './supervisor.mjs';
const canary = 'SYNTHETIC_PRIVATE_eyJtoken.sb_secret_FAKE.https://private.invalid/?secret=CANARY\r\n::error::PRIVATE';
const environment = () => ({ CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/agent/yeoni-japanese-ci-20261110', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
  RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'ubuntu24', ImageVersion: '20261101.360.1',
  GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com', PLAYWRIGHT_BROWSERS_PATH: BUNDLE_CACHE });
const safeOutput = output => {
  for (const line of output) assert.match(line, /^[a-zA-Z0-9 =-]+$/);
  assert.ok(!output.join('\n').includes('PRIVATE')); assert.ok(!output.join('\n').includes('/'));
};
function fixture(code = 0, override = {}) {
  const output = [], launches = [];
  const options = { cwd: '/synthetic/repository', env: environment(), emit: line => output.push(line),
    signalGroup: () => { const error = new Error('Synthetic absent group'); error.code = 'ESRCH'; throw error; },
    launch: (path, args, config) => {
      launches.push({ path, args, config }); const child = new EventEmitter(); child.pid = 123456; child.unref = () => {};
      queueMicrotask(() => { child.emit('exit', code, null); child.emit('close', code); }); return child;
    }, ...override };
  return { options, output, launches };
}

test('pinned bundled route selects the headless shell without channel, system executable, install-deps or browser override', async () => {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) assert.equal(lock.packages[`node_modules/${name}`].version, '1.63.0');
  const core = await readFile('node_modules/playwright-core/lib/coreBundle.js');
  assert.equal(createHash('sha256').update(core).digest('hex'), '549070af3acabb3efcc4f55bfe6210f9f7c2fcf633cf7eaa59bfe60719969171');
  const browsers = JSON.parse(await readFile('node_modules/playwright-core/browsers.json', 'utf8'));
  const shell = browsers.browsers.find(x => x.name === 'chromium-headless-shell');
  assert.equal(shell.revision, '1243'); assert.equal(shell.browserVersion, '153.0.8010.12');
  const config = await readFile('playwright.chromium-smoke.config.ts', 'utf8');
  assert.ok(config.includes('bundledChromiumContext(env, true);'));
  assert.doesNotMatch(config, /channel:|executablePath|launchOptions|connectOptions|chromiumSandbox|--no-sandbox/);
  const driver = await readFile('scripts/isolated-chromium-smoke/bundled-driver.mjs', 'utf8');
  assert.doesNotMatch(driver, /import\.meta/);
  assert.ok(driver.includes("process.argv[1] === path.join(process.cwd(), 'scripts/isolated-chromium-smoke/bundled-driver.mjs')"));
  const plan = await readFile('scripts/isolated-chromium-smoke/plan.mjs', 'utf8');
  assert.ok(plan.includes("command: 'pinned-bundled-chromium-readiness', timeoutMs: 240_000, lifecycleDiagnostics: true"));
  assert.doesNotMatch(plan, /--with-deps|install-deps|apt-get|sudo|system-google-chrome/);
});

test('bundled readiness launches only its fixed private driver with no caller secrets, flags, overrides or raw streams', async () => {
  const state = fixture(); Object.assign(state.options.env, { PATH: canary, HOME: canary, NODE_OPTIONS: canary, HTTPS_PROXY: canary, NODE_ENV: canary, NEXT_PUBLIC_SUPABASE_ANON_KEY: canary });
  assert.equal(await checkBundledChromium(state.options), 0);
  assert.deepEqual(state.launches, [{ path: process.execPath, args: ['/synthetic/repository/scripts/isolated-chromium-smoke/bundled-driver.mjs'],
    config: { cwd: '/synthetic/repository', env: driverEnvironment, stdio: ['ignore', 'ignore', 'ignore'], detached: true } }]);
  assert.ok(!Object.values(state.launches[0].config.env).includes(canary));
  assert.equal(state.output.at(-2), 'stage-02 readiness browser=playwright-chromium-headless-shell revision=1243 major=153 minor=0 build=8010 patch=12 install=passed hostValidation=passed status=passed');
  assert.equal(state.output.at(-1), 'stage-02 passed');
  assert.ok(!state.output.some(x => x.includes('realBrowser=true'))); safeOutput(state.output);
});

test('bundled context rejects skip, host, platform, remote, loader and npm aliases before any child', async () => {
  for (const [name, value] of Object.entries(environment())) {
    for (const wrong of [undefined, '', value + 'x', canary]) {
      const state = fixture(); state.options.env[name] = wrong;
      assert.equal(await checkBundledChromium(state.options), 1); assert.equal(state.launches.length, 0); safeOutput(state.output);
    }
  }
  for (const name of ['PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS','PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD','PLAYWRIGHT_HOST_PLATFORM_OVERRIDE','PLAYWRIGHT_DOWNLOAD_HOST','PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST','PW_TEST_CONNECT_WS_ENDPOINT','PWTEST_CLI_EXECUTABLE_PATH','CHROMIUM_PATH','LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES']) {
    for (const key of [name, 'npm_config_' + name.toLowerCase(), 'npm_package_config_' + name.toLowerCase()]) {
      const state = fixture(); state.options.env[key] = canary;
      assert.equal(await checkBundledChromium(state.options), 1); assert.equal(state.launches.length, 0); safeOutput(state.output);
    }
  }
  const raw = environment(); assert.throws(() => bundledChromiumContext(raw)); delete raw.PLAYWRIGHT_BROWSERS_PATH;
  const defaults = { CHROME_BIN: '/usr/bin/google-chrome', SELENIUM_JAR_PATH: '/usr/share/java/selenium-server.jar' };
  for (const addition of [{}, { CHROME_BIN: '' }, { SELENIUM_JAR_PATH: '' }, { CHROME_BIN: defaults.CHROME_BIN }, { SELENIUM_JAR_PATH: defaults.SELENIUM_JAR_PATH }, defaults]) {
    const accepted = bundledChromiumContext({ ...raw, ...addition });
    assert.ok(!Object.hasOwn(accepted, 'CHROME_BIN')); assert.ok(!Object.hasOwn(accepted, 'SELENIUM_JAR_PATH'));
  }
  for (const [name,value] of Object.entries(defaults)) for (const [key,wrong] of [[name,value+' '],[name,value+'/'],[name.toLowerCase(),value],['npm_config_'+name.toLowerCase(),value]]) {
    assert.throws(() => bundledChromiumContext({ ...raw, [key]: wrong }));
  }
});

test('installation, missing-library and uncertain driver outcomes stop the actual browser stage and suppress raw failure content', async () => {
  for (const code of [DRIVER_EXIT_CODES.contract, DRIVER_EXIT_CODES.cache, DRIVER_EXIT_CODES.install, DRIVER_EXIT_CODES.bundle, DRIVER_EXIT_CODES.dependencies, DRIVER_EXIT_CODES.dependencyTool, DRIVER_EXIT_CODES.dependencyOutput, DRIVER_EXIT_CODES.validation, DRIVER_EXIT_CODES.unexpected, 63, 156, 255, ...MISSING_LIBRARIES.map(entry => 63 + entry.id), null]) {
    const state = fixture(code); const calls = [];
    assert.equal(await supervise({ cwd: state.options.cwd, runnerTemp: '.', env: state.options.env, emit: state.options.emit,
      run: async stages => { calls.push(stages[0].id); return 0; }, readiness: options => checkBundledChromium({ ...state.options, ...options }) }), 1);
    assert.deepEqual(calls, ['stage-01']); assert.ok(state.output.includes('stage-03 not-run'));
    assert.ok(!state.output.some(line => line.includes('realBrowser=true'))); safeOutput(state.output);
  }
  for (const launch of [() => { throw new Error(canary); }, () => {
    const child = new EventEmitter(); child.pid = 123456; child.unref = () => {}; queueMicrotask(() => child.emit('error', new Error(canary))); return child;
  }, () => {
    const child = new EventEmitter(); child.pid = 123456; child.unref = () => {}; queueMicrotask(() => child.emit('close', 0)); return child;
  }]) { const state = fixture(0, { launch }); assert.equal(await checkBundledChromium(state.options), 1); safeOutput(state.output); }
});

test('only normal closed missing-library exits expose one bounded numeric ID, never raw names or uncertain output', async () => {
  for (const code of [24, ...MISSING_LIBRARIES.map(entry => 63 + entry.id)]) {
    const state = fixture(code); assert.equal(await checkBundledChromium(state.options), 1);
    assert.equal(state.output.at(-2), `stage-02 readiness browser=playwright-chromium-headless-shell status=failed reason=dependencies missingLibrary=${code === 24 ? 0 : code - 63}`);
    safeOutput(state.output);
  }
  for (const code of [0, 20, 21, 22, 23, 25, 26, 27, 28, 63, 156, 255, null]) {
    const state = fixture(code); await checkBundledChromium(state.options);
    assert.ok(!state.output.join(' ').includes('missingLibrary='));
  }
  for (const signal of ['SIGTERM', canary]) {
    const state = fixture(64, { launch: () => {
      const child = new EventEmitter(); child.pid = 123456; child.unref = () => {};
      queueMicrotask(() => { child.emit('exit', 64, signal); child.emit('close', 64); }); return child;
    } });
    assert.equal(await checkBundledChromium(state.options), 1);
    assert.ok(!state.output.join(' ').includes('missingLibrary=')); safeOutput(state.output);
  }
});

test('bundled readiness preserves cancellation, shared 240-second budget and one five-second grace without late success', async t => {
  const cancel = new AbortController(); cancel.abort(); const pre = fixture(0, { signal: cancel.signal });
  assert.equal(await checkBundledChromium(pre.options), 1); assert.equal(pre.launches.length, 0);
  for (const timeoutMs of [0, 240001, NaN]) { const state = fixture(0, { timeoutMs }); assert.equal(await checkBundledChromium(state.options), 1); assert.equal(state.launches.length, 0); }
  let child;
  const state = fixture(0, { timeoutMs: 10, launch: () => { child = new EventEmitter(); child.unref = () => {}; return child; } });
  t.mock.timers.enable({ apis: ['setTimeout'] }); const result = checkBundledChromium(state.options);
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(10); t.mock.timers.tick(5000);
  assert.equal(await result, 1); t.mock.timers.reset();
  const before = [...state.output]; child.emit('exit', 0, null); child.emit('close', 0);
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(state.output, before);
  assert.ok(state.output.some(x => x.includes('reason=timeout'))); safeOutput(state.output);
});

test('owned-group admission fails closed on unexpected members, denied probes and unsafe identities without claiming cleanup', async () => {
  for (const code of [0, 22, 24, 64]) {
    for (const scenario of ['group-disappears', 'probe-denied', 'term-denied', 'hostile-error']) {
      let calls = 0;
      const state = fixture(code, { signalGroup: (pid, signal) => {
        assert.equal(pid, -123456); calls++;
        const error = new Error(canary);
        if (scenario === 'hostile-error') { Object.defineProperty(error, 'code', { get: () => { throw new Error(canary); } }); throw error; }
        if (scenario === 'probe-denied' || scenario === 'term-denied' && signal === 'SIGTERM') { error.code = 'EPERM'; throw error; }
        if (calls === 2) { error.code = 'ESRCH'; throw error; }
        return true;
      } });
      assert.equal(await checkBundledChromium(state.options), 1); assert.equal(calls, 2);
      assert.ok(state.output.includes('stage-02 readiness browser=playwright-chromium-headless-shell status=failed reason=owned-group'));
      assert.ok(!state.output.join(' ').includes('missingLibrary='));
      assert.ok(!state.output.join(' ').includes('processCleanup=passed')); safeOutput(state.output);
    }
  }
  for (const pid of [undefined, null, 0, 1, -2, NaN, process.pid]) {
    let signals = 0;
    const state = fixture(0, { signalGroup: () => { signals++; }, launch: () => {
      const child = new EventEmitter(); child.pid = pid; child.unref = () => {};
      queueMicrotask(() => { child.emit('exit', 0, null); child.emit('close', 0); }); return child;
    } });
    assert.equal(await checkBundledChromium(state.options), 1); assert.equal(signals, 0); safeOutput(state.output);
  }
});

test('entry diagnostic categories never expose raw error, environment, property or phase content', () => {
  for (const phase of ['fixture', 'private-mode', 'signal-handlers', 'child-environment', 'runner-context', canary, null, {}, 'handoff']) {
    for (const error of [new Error(canary), canary, { category: canary }, undefined]) safeOutput([mainFailureLine(phase, error)]);
  }
  for (const category of ['request', 'runner', 'image', 'repository', 'override']) {
    assert.equal(mainFailureLine('runner-context', new InspectionContextError(category)), `chromium-app-smoke admission failed category=context-${category}`);
  }
  const hostile = new InspectionContextError('override');
  Object.defineProperty(hostile, 'category', { get: () => { throw new Error(canary); } });
  assert.equal(mainFailureLine('runner-context', hostile), 'chromium-app-smoke admission failed category=runner-context');
  assert.equal(mainFailureLine('handoff', hostile), 'chromium-app-smoke supervisor failed category=unexpected');
  let reads = 0;
  const changing = new InspectionContextError('override');
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
    const { bundledChromiumContext, InspectionContextError } = await import(url.pathToFileURL(path.join(root, 'scripts/isolated-chromium-smoke/bundled-readiness.mjs')));
    const repo = '/synthetic/repository', runnerTemp = '/home/runner/work/_temp';
    const entry = `${repo}/scripts/isolated-chromium-smoke/supervisor.mjs`;
    const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.synthetic`;
    const base = () => ({ CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/agent/yeoni-japanese-ci-20261110', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
      RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'ubuntu24', ImageVersion: '20261101.360.1',
      GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com',
      RUNNER_TEMP: runnerTemp, YEONI_E2E: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon'), PATH: '/synthetic/bin', HOME: '/synthetic/home', LANG: 'C' });
    const failure = 'chromium-app-smoke failed browser=playwright-chromium-headless-shell realBrowser=unverified fixtureCleanup=unverified';
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
      stub('./bundled-readiness.mjs', { InspectionContextError, BUNDLE_CACHE: '/home/runner/work/_temp/yeoni-chromium-1-63',
        bundledChromiumContext: value => { checkpoints.push('official-context'); const accepted = bundledChromiumContext(value); checkpoints.push('official-context-passed'); return accepted; },
        checkBundledChromium: async options => { checkpoints.push('no-launch-readiness-boundary'); childEnvs.push(options.env); return 1; },
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
          assert.equal(forwarded.PLAYWRIGHT_BROWSERS_PATH, '/home/runner/work/_temp/yeoni-chromium-1-63');
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

// Append to bundled-readiness.test.mjs. Uses its existing test/assert,
// checkBundledChromium and driverEnvironment imports. These finite local helpers
// replace the installer entirely; no browser/installer/ldd/validator is invoked.
async function runFiniteNativeAdapterRegression(scenario) {
  const { spawn: nativeSpawn } = await import('node:child_process');
  const { mkdtemp, writeFile, readFile: readSyntheticFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const directory = await mkdtemp(join(tmpdir(), 'yeoni-native-adapter-regression-'));
  const helperFile = join(directory, 'helper.json');
  const installerFile = join(directory, 'installer.json');
  const helperScript = join(directory, 'finite-helper.mjs');
  const installerScript = join(directory, 'finite-installer.mjs');
  const driverScript = join(directory, 'finite-driver.mjs');
  const driverModule = pathToFileURL(join(process.cwd(), 'scripts/isolated-chromium-smoke/bundled-driver.mjs')).href;
  const output = [];
  const cancel = new AbortController();
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  let leader;
  let stage;
  let helperIdentity;
  let installerIdentity;
  let completed = false;
  const identitySource = `const ownStat = fs.readFileSync('/proc/self/stat', 'utf8'); const identity = { pid: process.pid, start: ownStat.slice(ownStat.lastIndexOf(')') + 2).split(' ')[19] };`;
  async function currentProcess(identity) {
    if (!identity || !Number.isSafeInteger(identity.pid) || identity.pid <= 1 || typeof identity.start !== 'string') return null;
    try {
      const stat = await readSyntheticFile(`/proc/${identity.pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return fields[19] === identity.start ? { state: fields[0], group: Number(fields[2]) } : null;
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ESRCH') return null;
      throw error;
    }
  }
  async function awaitRecord(file) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      try { return JSON.parse(await readSyntheticFile(file, 'utf8')); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
      await sleep(10);
    }
    throw new Error('Finite synthetic helper did not become ready');
  }
  const running = state => state !== null && state.state !== 'Z' && state.state !== 'X';
  async function stopExact(identity) {
    if (!running(await currentProcess(identity))) return;
    try { process.kill(identity.pid, 'SIGKILL'); }
    catch (error) { if (error?.code !== 'ESRCH') throw error; }
  }
  try {
    // All helper lifetimes are independently finite, and all descendants keep
    // the owned readiness process group. TERM resistance exposes early release.
    await writeFile(helperScript, `import fs from 'node:fs';
process.on('SIGTERM', () => {});
${identitySource}
fs.writeFileSync(${JSON.stringify(helperFile)}, JSON.stringify(identity));
setTimeout(() => process.exit(0), 12000);
`, { mode: 0o600 });
    await writeFile(installerScript, `import fs from 'node:fs'; import { spawn } from 'node:child_process';
process.on('SIGTERM', () => {});
${identitySource}
fs.writeFileSync(${JSON.stringify(installerFile)}, JSON.stringify(identity));
const helper = spawn(process.execPath, [${JSON.stringify(helperScript)}], { stdio: 'ignore', detached: false });
helper.unref();
const finiteFence = setTimeout(() => process.exit(91), 11000);
const readyDeadline = Date.now() + 2000;
while (!fs.existsSync(${JSON.stringify(helperFile)})) {
  if (Date.now() >= readyDeadline) process.exit(92);
  await new Promise(resolve => setTimeout(resolve, 5));
}
const scenario = ${JSON.stringify(scenario)};
if (scenario === 'nonzero') process.exit(7);
if (scenario === 'zero-with-descendant') process.exit(0);
if (scenario === 'overflow') process.stdout.write(Buffer.alloc(65536, 88));
await new Promise(resolve => setTimeout(resolve, 10000));
clearTimeout(finiteFence); process.exit(93);
`, { mode: 0o600 });
    await writeFile(driverScript, `import { createNativeBoundaries } from ${JSON.stringify(driverModule)};
const context = { cwd: process.cwd(), executable: process.execPath, platform: process.platform, arch: process.arch, uid: process.getuid?.() ?? -1, umask: process.umask(), env: process.env };
const io = createNativeBoundaries(context);
const result = await io.command({ file: process.execPath, args: [${JSON.stringify(installerScript)}], cwd: process.cwd(), env: process.env, timeoutMs: ${scenario === 'inner-timeout' ? 700 : 10000}, maxOutputBytes: ${scenario === 'overflow' ? 64 : 0}, stdio: ${JSON.stringify(scenario === 'overflow' ? 'capture' : 'ignore')} });
process.exitCode = result.overflow ? 28 : result.timedOut || result.error || result.signal || result.code !== 0 ? 22 : 0;
`, { mode: 0o600 });
    const timeoutMs = scenario === 'outer-timeout' ? 1000 : 9000;
    const started = Date.now();
    stage = checkBundledChromium({
      cwd: process.cwd(), env: { ...driverEnvironment }, signal: cancel.signal, timeoutMs,
      emit: line => output.push(line),
      launch: (_file, _args, options) => {
        assert.equal(options.detached, true);
        assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore']);
        // This is the sole substitution: finite driver calls the ACTUAL native
        // command adapter with finite synthetic installer/helper arguments only.
        leader = nativeSpawn(process.execPath, [driverScript], options);
        return leader;
      },
    });
    helperIdentity = await awaitRecord(helperFile);
    installerIdentity = await awaitRecord(installerFile);
    const initial = await currentProcess(helperIdentity);
    assert.equal(initial?.group, leader.pid, 'Synthetic helper must remain in the readiness-owned group');
    if (scenario === 'cancelled') cancel.abort();
    const code = await stage;
    completed = true;
    const elapsed = Date.now() - started;
    assert.equal(code, 1, 'A leaked descendant must never turn an installer zero into readiness success');
    assert.equal(output.at(-1), 'stage-02 failed');
    assert.ok(!output.some(line => /status=passed|hostValidation=passed/.test(line)));
    assert.ok(output.every(line => /^[a-zA-Z0-9 =-]+$/.test(line)));
    assert.ok(output.some(line => line.startsWith('stage-02 ownedGroup ') && line.endsWith('processCleanup=unverified')));
    if (!['outer-timeout', 'cancelled'].includes(scenario)) assert.ok(output.some(line => line.startsWith('stage-02 ownedGroup initial=present ')));
    if (scenario === 'outer-timeout') assert.ok(output.some(line => line.includes('reason=timeout')));
    if (scenario === 'cancelled') assert.ok(output.some(line => line.includes('reason=cancelled')));
    assert.ok(elapsed <= timeoutMs + 5000 + 1000, 'The existing single grace budget must not be renewed');
    // A SIGKILL may take one scheduler turn to become observable. No process
    // state, path or helper metadata is included in production output.
    const settleDeadline = Date.now() + 300;
    let helperState = await currentProcess(helperIdentity);
    let installerState = await currentProcess(installerIdentity);
    while ((running(helperState) || running(installerState)) && Date.now() < settleDeadline) {
      await sleep(10);
      helperState = await currentProcess(helperIdentity);
      installerState = await currentProcess(installerIdentity);
    }
    assert.equal(running(helperState), false, 'Finite TERM-resistant helper must not remain running after readiness returns');
    assert.equal(running(installerState), false, 'Finite TERM-resistant installer must not remain running after readiness returns');
    // A zombie is not running, but a group containing one is not absent. Do not
    // certify complete group absence solely because SIGKILL was accepted.
    if (helperState || installerState) assert.ok(!output.some(line => /(?:^| )group=absent(?: |$)|ownedGroup .*final=absent(?: |$)|(?:^| )processCleanup=verified(?: |$)/.test(line)));
  } finally {
    if (!completed) cancel.abort();
    // Parent failure paths must not leak the regression helper itself. The group
    // belongs exclusively to this finite synthetic launch. Also kill only the
    // exact recorded PID/start-time identities, avoiding PID-reuse confusion.
    if (leader && leader.exitCode === null && leader.signalCode === null) {
      try { process.kill(-leader.pid, 'SIGKILL'); } catch (error) { if (error?.code !== 'ESRCH') throw error; }
    }
    helperIdentity ??= await readSyntheticFile(helperFile, 'utf8').then(JSON.parse, () => null);
    installerIdentity ??= await readSyntheticFile(installerFile, 'utf8').then(JSON.parse, () => null);
    await stopExact(helperIdentity);
    await stopExact(installerIdentity);
    if (stage && !completed) await stage;
    const cleanupDeadline = Date.now() + 500;
    while (Date.now() < cleanupDeadline && (running(await currentProcess(helperIdentity)) || running(await currentProcess(installerIdentity)))) await sleep(10);
    assert.equal(running(await currentProcess(helperIdentity)), false, 'Regression finally cleanup must stop its helper');
    assert.equal(running(await currentProcess(installerIdentity)), false, 'Regression finally cleanup must stop its installer');
    await rm(directory, { recursive: true, force: true });
  }
}

test('actual native adapter finite descendant regressions share one fixed grace interval', { skip: process.platform !== 'linux', timeout: 16000 }, async () => {
  // Only these finite synthetic subprocess cases overlap. This does not change
  // the actual application/browser worker count or any production grace.
  const outcomes = await Promise.allSettled(['inner-timeout', 'outer-timeout', 'cancelled', 'nonzero', 'overflow', 'zero-with-descendant']
    .map(scenario => runFiniteNativeAdapterRegression(scenario)));
  // Await every finally cleanup even when one case fails.
  for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
});
