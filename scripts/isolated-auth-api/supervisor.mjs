// @ts-check
import { mkdtemp, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStages } from '../qa-private-orchestrator.mjs';
import { loadContext, childEnvironment, readPrivateFile } from './boundary.mjs';
import { parseReport, publicLines, reportPassed } from './report.mjs';
export async function supervise({ cwd, runnerTemp, env, reportPath, token, signal, emit = line => console.log(line), timeoutMs = 8 * 60_000 }) {
  const options = { cwd, runnerTemp, env, signal, timeoutMs, emit };
  const code = await runStages([
    { id: 'stage-01', command: 'node --test scripts/isolated-auth-api/safety.test.mjs' },
    { id: 'stage-02', command: 'node scripts/isolated-auth-api/runner.mjs' },
  ], options);
  let report;
  try { report = parseReport(await readPrivateFile(reportPath, 2048), token); }
  catch { emit('isolated-auth-api report failed'); emit('isolated-auth-api browserRun=false'); return 1; }
  for (const line of publicLines(report)) emit(line);
  const passed = code === 0 && reportPassed(report);
  emit(passed ? 'isolated-auth-api passed' : 'isolated-auth-api failed');
  return passed ? 0 : 1;
}
async function main() {
  await loadContext();
  const controller = new AbortController(); const abort = () => controller.abort();
  process.on('SIGTERM', abort); process.on('SIGINT', abort);
  try {
    const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'isolated-auth-api-'));
    const reportPath = join(directory, 'report.json'), token = randomBytes(32).toString('hex');
    await writeFile(reportPath, '', { flag: 'wx', mode: 0o600 });
    const env = { ...childEnvironment(process.env), ISOLATED_AUTH_API_REPORT: reportPath, ISOLATED_AUTH_API_TOKEN: token };
    process.exitCode = await supervise({ cwd: process.cwd(), runnerTemp: process.env.RUNNER_TEMP, env, reportPath, token, signal: controller.signal });
  } finally { process.off('SIGTERM', abort); process.off('SIGINT', abort); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.log('isolated-auth-api failed'); console.log('isolated-auth-api browserRun=false'); process.exitCode = 1; });
}
