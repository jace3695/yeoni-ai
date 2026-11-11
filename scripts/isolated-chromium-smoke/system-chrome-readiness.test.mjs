import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { constants } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { checkSystemChrome, officialChromeContext, chromePath, approvedVersion, parseChromeVersion } from './system-chrome-readiness.mjs';
import { supervise } from './supervisor.mjs';

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
  assert.equal(await checkSystemChrome(state.options), 0);
  assert.deepEqual(state.launches, [{ path: chromePath, args: ['--version'], config: { cwd: '/',
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true } }]);
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
