// @ts-check
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStages } from '../qa-private-orchestrator.mjs';
import { terminationGraceMs } from '../qa-private-lifecycle.mjs';
import { loadContext, childEnvironment } from '../isolated-auth-api/boundary.mjs';
import { stages, totalTimeoutMs } from './plan.mjs';
import { checkBundledChromium, bundledChromiumContext, InspectionContextError, BUNDLE_CACHE } from './bundled-readiness.mjs';

const failedLine = 'chromium-app-smoke failed browser=playwright-chromium-headless-shell realBrowser=unverified fixtureCleanup=unverified';
/** @param {{
 * cwd: string, runnerTemp: string, env: NodeJS.ProcessEnv, signal?: AbortSignal,
 * emit?: (line: string) => void, deadlineMs?: number,
 * readiness?: typeof checkBundledChromium,
 * run?: (stages: readonly object[], options: {
 *   cwd: string, runnerTemp: string, env: NodeJS.ProcessEnv,
 *   emit: (line: string) => void, signal: AbortSignal, timeoutMs: number
 * }) => Promise<number>
 * }} options */
export async function supervise({ cwd, runnerTemp, env, signal, emit = line => console.log(line), run = runStages, readiness = checkBundledChromium,
  deadlineMs = totalTimeoutMs }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, deadlineMs);
  let failed = false, finished = false, graceTimer;
  let resolveFence;
  const fence = new Promise(resolve => { resolveFence = resolve; });
  const boundAbort = () => { graceTimer ??= setTimeout(() => resolveFence(1), terminationGraceMs); };
  controller.signal.addEventListener('abort', boundAbort, { once: true });
  if (controller.signal.aborted) boundAbort();
  try {
    for (const stage of stages) {
      if (failed || controller.signal.aborted) { failed = true; emit(`${stage.id} not-run`); continue; }
      const code = await Promise.race([Promise.resolve().then(() => stage.id === 'stage-02'
        ? readiness({ cwd, env, signal: controller.signal, timeoutMs: stage.timeoutMs,
          emit: line => { if (!finished) emit(line); } })
        : run([stage], {
        cwd, runnerTemp, env, emit: line => { if (!finished) emit(line); },
        signal: controller.signal, timeoutMs: stage.timeoutMs,
      })), fence]);
      if (code !== 0 || controller.signal.aborted) failed = true;
    }
    if (failed || controller.signal.aborted) { emit(failedLine); return 1; }
    emit('chromium-app-smoke passed tests=20 browser=playwright-chromium-headless-shell realBrowser=true fixtureCleanup=passed');
    return 0;
  } catch { emit(failedLine); return 1; }
  finally {
    finished = true; clearTimeout(timer); clearTimeout(graceTimer);
    controller.signal.removeEventListener('abort', boundAbort);
    signal?.removeEventListener('abort', abort);
  }
}

/** @param {unknown} phase @param {unknown} error */
export function mainFailureLine(phase, error) {
  if (phase === 'handoff') return 'chromium-app-smoke supervisor failed category=unexpected';
  let category = ['fixture', 'private-mode', 'signal-handlers', 'child-environment', 'runner-context']
    .find(value => value === phase) ?? 'unexpected';
  if (phase === 'runner-context') {
    try {
      const errorCategory = error instanceof InspectionContextError ? error.category : undefined;
      if (errorCategory !== undefined && ['request', 'runner', 'image', 'repository', 'override'].includes(errorCategory)) {
        category = `context-${errorCategory}`;
      }
    } catch { /* A hostile diagnostic property never exposes error content. */ }
  }
  return `chromium-app-smoke admission failed category=${category}`;
}

let entryPhase = 'fixture';
async function main() {
  await loadContext();
  // Reporter and fixture evidence stays owner-only, including implicit directories.
  entryPhase = 'private-mode';
  process.umask(0o077);
  entryPhase = 'signal-handlers';
  const controller = new AbortController(); const abort = () => controller.abort();
  process.on('SIGTERM', abort); process.on('SIGINT', abort);
  try {
    entryPhase = 'child-environment';
    const childEnv = childEnvironment(process.env);
    entryPhase = 'runner-context';
    const context = bundledChromiumContext(process.env);
    entryPhase = 'handoff';
    process.exitCode = await supervise({ cwd: process.cwd(), runnerTemp: process.env.RUNNER_TEMP,
      env: { ...childEnv, ...context, PLAYWRIGHT_BROWSERS_PATH: BUNDLE_CACHE, NODE_ENV: 'production' }, signal: controller.signal });
  } finally { process.off('SIGTERM', abort); process.off('SIGINT', abort); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.log(mainFailureLine(entryPhase, error)); console.log(failedLine); process.exitCode = 1; });
}
