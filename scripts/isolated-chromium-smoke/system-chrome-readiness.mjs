// @ts-check
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { runPrivateStage, lifecycleLine } from '../qa-private-lifecycle.mjs';

// Playwright 1.63.0's chrome channel uses this exact Linux path. No PATH lookup,
// executable override, install, browser session, profile, flags or fallback.
export const chromePath = '/opt/google/chrome/chrome';
export const approvedVersion = '156.0.8078.79';
const imageContext = Object.freeze({ RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
  RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'ubuntu24', ImageVersion: '20261101.360.1',
  GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com' });
const metadataPaths = ['/', '/opt', '/opt/google', '/opt/google/chrome', chromePath,
  '/usr', '/usr/lib', '/usr/lib/os-release'];
const versionLimit = 128;
/** @param {unknown} value */
const requireTrue = value => { if (!value) throw new Error('Readiness rejected'); };

/** @typedef {'request' | 'runner' | 'image' | 'repository' | 'override'} ContextCategory */
export class ChromeContextError extends Error {
  /** @param {ContextCategory} category */
  constructor(category) { super('Readiness rejected'); this.category = category; }
}
/** @param {unknown} value @param {ContextCategory} category */
const requireContext = (value, category) => { if (!value) throw new ChromeContextError(category); };
// Exact inventory defaults exported by the pinned official image, never launch inputs.
/** @type {Readonly<Record<string, string>>} */
const imageInventoryDefaults = Object.freeze({ CHROME_BIN: '/usr/bin/google-chrome',
  SELENIUM_JAR_PATH: '/usr/share/java/selenium-server.jar' });

/** @param {NodeJS.ProcessEnv} env */
export function officialChromeContext(env) {
  requireContext(env.CI === 'true' && env.GITHUB_ACTIONS === 'true'
    && env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/agent/yeoni-japanese-ci-20261110', 'request');
  for (const [name, value] of Object.entries(imageContext)) requireContext(env[name] === value,
    name.startsWith('Image') ? 'image' : name.startsWith('RUNNER_') ? 'runner' : 'repository');
  // Absent/empty stays unset. Known nonempty inventory values must match exactly.
  // Case variants, arbitrary browser/remote/preload overrides still fail closed.
  requireContext(!Object.keys(env).some(name => {
    const value = env[name];
    if (!value) return false;
    if (Object.hasOwn(imageInventoryDefaults, name)) return value !== imageInventoryDefaults[name];
    if (Object.hasOwn(imageInventoryDefaults, name.toUpperCase())) return true;
    return /^(?:PLAYWRIGHT_|PW_|PWTEST_|CHROME_|CHROMIUM_|SELENIUM_|LD_|DYLD_)/.test(name);
  }), 'override');
  // Return only the approved image/context fields, never either inventory value.
  return { ...imageContext };
}

/** Only a single exact approved Google Chrome version line is accepted.
 * @param {Buffer} stdout @param {Buffer} stderr */
export function parseChromeVersion(stdout, stderr) {
  if (stdout.length > versionLimit || stderr.length !== 0) return false;
  return stdout.equals(Buffer.from(`Google Chrome ${approvedVersion}\n`));
}

/** @param {{ env: NodeJS.ProcessEnv, signal?: AbortSignal, timeoutMs?: number,
 * emit?: (line: string) => void, platform?: string, arch?: string,
 * metadata?: typeof lstat, canonical?: typeof realpath, openFile?: typeof open,
 * launch?: typeof spawn }} options */
export async function checkSystemChrome({ env, signal, timeoutMs = 240_000,
  emit = line => console.log(line), platform = process.platform, arch = process.arch,
  metadata = lstat, canonical = realpath, openFile = open, launch = spawn }) {
  let category = 'context', versionVerified = false;
  // Diagnostic identities only; never emit filesystem values or error content.
  let metadataIndex = 8, metadataCheck = 0;
  // Only the unchanged lifecycle control methods used by this probe.
  /** @typedef {{ readonly finished: boolean, check: () => void,
   * watch: (child: import('node:child_process').ChildProcess) => Promise<number>,
   * captureError: () => void }} ReadinessControl */
  const result = await runPrivateStage(/** @param {ReadinessControl} control */ async control => {
    officialChromeContext(env); control.check();
    requireTrue(platform === 'linux' && arch === 'x64');
    requireTrue(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 240_000);
    category = 'metadata';
    for (const [index, path] of metadataPaths.entries()) {
      metadataIndex = index; metadataCheck = 1;
      const info = await metadata(path); control.check();
      metadataCheck = 2; requireTrue(info.uid === 0);
      metadataCheck = 3; requireTrue(info.gid === 0);
      metadataCheck = 4; requireTrue((info.mode & 0o022) === 0);
      metadataCheck = 5; requireTrue(!info.isSymbolicLink());
      metadataCheck = 6; const canonicalPath = await canonical(path);
      metadataCheck = 7; requireTrue(canonicalPath === path); control.check();
      metadataCheck = 8;
      if (path === chromePath) {
        requireTrue(info.isFile());
        metadataCheck = 9; requireTrue((info.mode & 0o111) === 0o111);
        metadataCheck = 10; requireTrue(info.size > 0);
      } else if (path === '/usr/lib/os-release') {
        requireTrue(info.isFile());
        metadataCheck = 10; requireTrue(info.size > 0 && info.size <= 4096);
      } else requireTrue(info.isDirectory());
    }
    category = 'os';
    const file = await openFile('/usr/lib/os-release', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      control.check();
      const info = await file.stat(); control.check();
      requireTrue(info.isFile() && info.uid === 0 && info.gid === 0 && (info.mode & 0o022) === 0 && info.size <= 4096);
      const bytes = Buffer.alloc(4097);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0); control.check();
      requireTrue(bytesRead <= 4096);
      const lines = bytes.subarray(0, bytesRead).toString('utf8').split('\n');
      requireTrue(lines.filter(line => line.startsWith('ID=')).join('\n') === 'ID=ubuntu');
      requireTrue(lines.filter(line => line.startsWith('VERSION_ID=')).join('\n') === 'VERSION_ID="24.04"');
    } finally { await file.close(); }
    control.check(); category = 'exec';
    /** @type {import('node:child_process').SpawnOptionsWithStdioTuple<'ignore', 'pipe', 'pipe'>} */
    const launchOptions = { cwd: '/',
      env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true };
    const child = launch(chromePath, ['--version'], launchOptions);
    const done = control.watch(child);
    const output = [Buffer.alloc(0), Buffer.alloc(0)];
    [child.stdout, child.stderr].forEach((stream, index) => stream?.on('data', /** @param {unknown} chunk */ chunk => {
      if (control.finished) return;
      if (!Buffer.isBuffer(chunk) || output[index].length + chunk.length > versionLimit) {
        category = 'capture'; control.captureError(); return;
      }
      output[index] = Buffer.concat([output[index], chunk]);
    }));
    const code = await done; control.check();
    if (code !== 0) return { code: 1 };
    category = 'version';
    versionVerified = parseChromeVersion(output[0], output[1]);
    return { code: versionVerified ? 0 : 1 };
  }, { timeoutMs: Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 240_000 ? timeoutMs : 1, signal });
  const passed = result.code === 0 && versionVerified && !signal?.aborted
    && result.observation.reason === 'none' && result.observation.exited === true
    && result.observation.code === 0 && result.observation.signal === null
    && result.observation.capture === 'drained';
  if (result.observation.reason === 'timeout' || result.observation.reason === 'cancelled') category = result.observation.reason;
  emit(lifecycleLine('stage-02', result.observation));
  if (!passed && category === 'metadata' && result.observation.reason === 'prepare-error') {
    const pathCode = [0, 1, 2, 3, 4, 5, 6, 7].includes(metadataIndex) ? metadataIndex : 8;
    const checkCode = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(metadataCheck) ? metadataCheck : 0;
    emit(`stage-02 metadata path=${pathCode} check=${checkCode}`);
  }
  // Fixed categories/numbers only. No raw output, paths, environment or exceptions.
  emit(passed
    ? 'stage-02 readiness browser=system-google-chrome image=ubuntu24 imageVersion=20261101-360-1 major=156 minor=0 build=8078 patch=79 status=passed'
    : `stage-02 readiness browser=system-google-chrome status=failed reason=${category}`);
  emit(`stage-02 ${passed ? 'passed' : 'failed'}`);
  return passed ? 0 : 1;
}
