// @ts-check
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { runPrivateStage, lifecycleLine, terminationGraceMs } from '../qa-private-lifecycle.mjs';
import { BUNDLE_CACHE, driverEnvironment, DRIVER_EXIT_CODES, missingLibraryId } from './bundled-driver.mjs';

export { BUNDLE_CACHE };
const imageContext = Object.freeze({ RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
  RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'ubuntu24', ImageVersion: '20261111.370.1',
  GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com' });
/** @typedef {'request' | 'runner' | 'image' | 'repository' | 'override'} ContextCategory */
export class InspectionContextError extends Error {
  /** @param {ContextCategory} category */
  constructor(category) { super('Readiness rejected'); this.category = category; }
}
/** @param {unknown} value @param {ContextCategory} category */
const requireContext = (value, category) => { if (!value) throw new InspectionContextError(category); };
/** @type {Readonly<Record<string, string>>} */
const imageInventoryDefaults = Object.freeze({ CHROME_BIN: '/usr/bin/google-chrome',
  SELENIUM_JAR_PATH: '/usr/share/java/selenium-server.jar' });

/** @param {NodeJS.ProcessEnv} env @param {boolean} [allowCache] */
export function bundledChromiumContext(env, allowCache = false) {
  requireContext(env.CI === 'true' && env.GITHUB_ACTIONS === 'true'
    && env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/agent/yeoni-japanese-ci-20261110', 'request');
  for (const [name, value] of Object.entries(imageContext)) requireContext(env[name] === value,
    name.startsWith('Image') ? 'image' : name.startsWith('RUNNER_') ? 'runner' : 'repository');
  requireContext(!Object.keys(env).some(name => {
    const value = env[name];
    if (!value) return false;
    if (allowCache && name === 'PLAYWRIGHT_BROWSERS_PATH') return value !== BUNDLE_CACHE;
    // Set by the pinned Playwright runner before worker config reload, never an external admission override.
    if (allowCache && name === 'PLAYWRIGHT_TEST') return value !== '1';
    if (Object.hasOwn(imageInventoryDefaults, name)) return value !== imageInventoryDefaults[name];
    const normalized = name.replace(/^npm_(?:package_)?config_/i, '').toUpperCase();
    return /^(?:PLAYWRIGHT_|PW_|PWTEST_|CHROME_|CHROMIUM_|SELENIUM_|LD_|DYLD_)/.test(normalized);
  }), 'override');
  if (allowCache) requireContext(env.PLAYWRIGHT_BROWSERS_PATH === BUNDLE_CACHE, 'override');
  return { ...imageContext };
}

/** @typedef {{ check: () => void, watch: (child: import('node:child_process').ChildProcess) => Promise<number>, readonly finished: boolean, readonly interrupted: boolean }} ReadinessControl */
/** @typedef {'not-attempted' | 'accepted' | 'missing' | 'denied' | 'other'} GroupAttempt */
/** @typedef {{ initial: 'unobserved' | 'absent' | 'present' | 'unknown', final: 'unverified' | 'absent' | 'present', term: GroupAttempt, kill: GroupAttempt }} GroupObservation */
/** @param {number} ms */
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
/** @param {ReadinessControl} control */
async function waitForOuterFence(control) {
  // Returning or throwing before this fence settles would let the shared helper
  // clear its KILL timer when the leader exits early after TERM.
  while (!control.finished) await pause(10);
}
/** @param {number | undefined} pid @param {ReadinessControl} control
 * @param {(pid: number, signal: NodeJS.Signals | 0) => unknown} signalGroup
 * @param {GroupObservation} observation */
async function finishOwnedGroup(pid, control, signalGroup, observation) {
  if (control.interrupted) { await waitForOuterFence(control); return false; }
  if (control.finished || !Number.isSafeInteger(pid) || typeof pid !== 'number' || pid <= 1 || pid === process.pid) return false;
  /** @param {NodeJS.Signals | 0} signal @returns {GroupAttempt} */
  const attempt = signal => {
    try { signalGroup(-pid, signal); return 'accepted'; }
    catch (error) {
      try {
        if (error instanceof Error && 'code' in error) {
          const code = error.code;
          return code === 'ESRCH' ? 'missing' : code === 'EPERM' ? 'denied' : 'other';
        }
      } catch { /* Diagnostic access never exposes or propagates native errors. */ }
      return 'other';
    }
  };
  let presence = attempt(0);
  if (presence === 'missing') { observation.initial = 'absent'; observation.final = 'absent'; return true; }
  observation.initial = presence === 'accepted' ? 'present' : 'unknown';
  observation.term = attempt('SIGTERM');
  if (observation.term === 'missing') { observation.final = 'absent'; return false; }
  if (observation.term !== 'accepted') return false;
  const started = performance.now();
  while (performance.now() - started < terminationGraceMs) {
    if (control.interrupted) { await waitForOuterFence(control); return false; }
    if (control.finished) return false;
    presence = attempt(0);
    if (presence === 'missing') { observation.final = 'absent'; return false; }
    if (presence !== 'accepted') return false;
    await pause(Math.min(25, terminationGraceMs - (performance.now() - started)));
  }
  if (control.interrupted) { await waitForOuterFence(control); return false; }
  if (control.finished) return false;
  // Final probe avoids signaling an already observed absent group.
  presence = attempt(0);
  if (presence === 'missing') { observation.final = 'absent'; return false; }
  if (presence !== 'accepted') return false;
  observation.kill = attempt('SIGKILL');
  if (observation.kill === 'missing') { observation.final = 'absent'; return false; }
  if (observation.kill !== 'accepted') return false;
  await pause(10);
  if (control.interrupted) { await waitForOuterFence(control); return false; }
  if (control.finished) return false;
  presence = attempt(0);
  observation.final = presence === 'missing' ? 'absent' : presence === 'accepted' ? 'present' : 'unverified';
  // A signal syscall is not descendant-cleanup proof. Even verified absence
  // after an unexpected survivor cannot turn this readiness attempt into a pass.
  return false;
}

/** @param {{ cwd: string, env: NodeJS.ProcessEnv, signal?: AbortSignal,
 * timeoutMs?: number, emit?: (line: string) => void, launch?: typeof spawn, signalGroup?: (pid: number, signal: NodeJS.Signals | 0) => unknown }} options */
export async function checkBundledChromium({ cwd, env, signal, timeoutMs = 240_000,
  emit = line => console.log(line), launch = spawn, signalGroup = process.kill }) {
  let category = 'context';
  /** @type {GroupObservation} */
  const group = { initial: 'unobserved', final: 'unverified', term: 'not-attempted', kill: 'not-attempted' };
  let groupInitiallyAbsent = false;
  const result = await runPrivateStage(/** @param {ReadinessControl} control */ async control => {
    bundledChromiumContext(env, true); control.check();
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 240_000
      || typeof cwd !== 'string' || !cwd || cwd.length > 4096 || cwd.includes('\0')) throw new Error('Readiness rejected');
    category = 'runner';
    /** @type {import('node:child_process').SpawnOptionsWithStdioTuple<'ignore', 'ignore', 'ignore'>} */
    const options = { cwd, env: { ...driverEnvironment }, stdio: ['ignore', 'ignore', 'ignore'], detached: true };
    const child = launch(process.execPath, [resolve(cwd, 'scripts/isolated-chromium-smoke/bundled-driver.mjs')], options);
    const code = await control.watch(child);
    groupInitiallyAbsent = await finishOwnedGroup(child.pid, control, signalGroup, group);
    return { code: groupInitiallyAbsent ? code : 1 };
  }, { timeoutMs: Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 240_000 ? timeoutMs : 1, signal });
  const passed = groupInitiallyAbsent && result.code === 0 && !signal?.aborted && result.observation.reason === 'none'
    && result.observation.exited === true && result.observation.code === 0
    && result.observation.signal === null && result.observation.capture === 'drained';
  const missingId = groupInitiallyAbsent && result.observation.reason === 'none' && result.observation.exited === true
    && result.observation.signal === null && result.observation.capture === 'drained'
    ? missingLibraryId(result.observation.code) : null;
  if (result.observation.reason === 'timeout' || result.observation.reason === 'cancelled') category = result.observation.reason;
  else if (missingId !== null) category = 'dependencies';
  else if (result.observation.code === DRIVER_EXIT_CODES.install) category = 'install';
  else if (result.observation.code === DRIVER_EXIT_CODES.dependencyTool) category = 'dependency-tool';
  else if (result.observation.code === DRIVER_EXIT_CODES.dependencyOutput) category = 'dependency-output';
  else if (result.observation.code === DRIVER_EXIT_CODES.validation) category = 'host-validation';
  else if (result.observation.code === DRIVER_EXIT_CODES.cache) category = 'fresh-cache';
  else if (result.observation.code === DRIVER_EXIT_CODES.bundle) category = 'bundle';
  else if (result.observation.code === DRIVER_EXIT_CODES.contract) category = 'contract';
  if (result.observation.reason === 'none' && (group.initial === 'present' || group.initial === 'unknown')) category = 'owned-group';
  emit(lifecycleLine('stage-02', result.observation));
  emit(`stage-02 ownedGroup initial=${group.initial} final=${group.final} term=${group.term} kill=${group.kill} processCleanup=unverified`);
  emit(passed
    ? 'stage-02 readiness browser=playwright-chromium-headless-shell revision=1243 major=153 minor=0 build=8010 patch=12 install=passed hostValidation=passed status=passed'
    : `stage-02 readiness browser=playwright-chromium-headless-shell status=failed reason=${category}${missingId !== null ? ` missingLibrary=${missingId}` : ''}`);
  emit(`stage-02 ${passed ? 'passed' : 'failed'}`);
  return passed ? 0 : 1;
}
