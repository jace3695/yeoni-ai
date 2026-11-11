// @ts-check
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStages } from '../qa-private-orchestrator.mjs';
import { loadContext, childEnvironment } from '../isolated-auth-api/boundary.mjs';
import { stages, totalTimeoutMs } from './plan.mjs';

const failedLine = 'chromium-app-smoke failed browser=chromium realBrowser=unverified fixtureCleanup=unverified';
/** @param {{
 * cwd: string, runnerTemp: string, env: NodeJS.ProcessEnv, signal?: AbortSignal,
 * emit?: (line: string) => void, deadlineMs?: number,
 * run?: (stages: readonly object[], options: {
 *   cwd: string, runnerTemp: string, env: NodeJS.ProcessEnv,
 *   emit: (line: string) => void, signal: AbortSignal, timeoutMs: number
 * }) => Promise<number>
 * }} options */
export async function supervise({ cwd, runnerTemp, env, signal, emit = line => console.log(line), run = runStages,
  deadlineMs = totalTimeoutMs }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, deadlineMs);
  let failed = false;
  try {
    for (const stage of stages) {
      if (failed || controller.signal.aborted) { failed = true; emit(`${stage.id} not-run`); continue; }
      const code = await run([stage], { cwd, runnerTemp, env, emit, signal: controller.signal, timeoutMs: stage.timeoutMs });
      if (code !== 0 || controller.signal.aborted) failed = true;
    }
    if (failed || controller.signal.aborted) { emit(failedLine); return 1; }
    emit('chromium-app-smoke passed tests=11 browser=chromium realBrowser=true fixtureCleanup=passed');
    return 0;
  } catch { emit(failedLine); return 1; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

async function main() {
  await loadContext();
  // Reporter and fixture evidence stays owner-only, including implicit directories.
  process.umask(0o077);
  const controller = new AbortController(); const abort = () => controller.abort();
  process.on('SIGTERM', abort); process.on('SIGINT', abort);
  try {
    process.exitCode = await supervise({ cwd: process.cwd(), runnerTemp: process.env.RUNNER_TEMP,
      env: { ...childEnvironment(process.env), NODE_ENV: 'production' }, signal: controller.signal });
  } finally { process.off('SIGTERM', abort); process.off('SIGINT', abort); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.log(failedLine); process.exitCode = 1; });
}
