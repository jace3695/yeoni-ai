import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { diagnosticInvocations, emitDiagnosticJournal } from './qa-private-diagnostics.mjs';
import { mkdir, mkdtemp, readFile, writeFile, open, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const channels = ['GITHUB_ENV', 'GITHUB_OUTPUT', 'GITHUB_STATE', 'GITHUB_STEP_SUMMARY', 'GITHUB_PATH'];
const limit = 1024 * 1024;
export function parseEnvironment(text, stage, runnerTemp) {
  const result = {};
  if (text.length > 16384 || text.includes('\r')) throw new Error('Invalid private environment');
  for (const line of text.split('\n').filter(Boolean)) {
    const match = /^([A-Z_][A-Z_0-9]*)=(.*)$/.exec(line);
    if (!match || Object.hasOwn(result, match[1])) throw new Error('Invalid private environment');
    const [, key, value] = match;
    const library = stage.command.includes('meson install -C .e2e/libsoup-build');
    const stack = stage.command === 'node scripts/e2e-stack.mjs start';
    if (library && key === 'QA_SOUP_LIBRARY' && value === join(runnerTemp, 'webkit-soup/lib/libsoup-3.0.so.0')) result[key] = value;
    else if (stack && key === 'YEONI_E2E' && value === '1') result[key] = value;
    else if (stack && key === 'NEXT_PUBLIC_SUPABASE_URL' && value === 'http://127.0.0.1:54321') result[key] = value;
    else if (stack && key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
      const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') throw new Error('Invalid private environment');
      result[key] = value;
    } else throw new Error('Invalid private environment');
  }
  if (stage.command === 'node scripts/e2e-stack.mjs start' && Object.keys(result).length !== 3) throw new Error('Missing private environment');
  if (stage.command.includes('meson install -C .e2e/libsoup-build') && Object.keys(result).length !== 1) throw new Error('Missing private environment');
  return result;
}

export async function runStages(stages, { cwd, runnerTemp, env = process.env, emit = line => console.log(line), timeoutMs = 100 * 60_000, signal } = {}) {
  // Production guard belongs to main(), not this injectable, synthetic-tested supervisor.
  const directory = await mkdtemp(join(runnerTemp, 'private-verification-'));
  let inherited = { ...env }, failed = false, cancelled = false;
  for (const stage of stages) {
    if (!/^stage-[0-9]{2}$/.test(stage.id)) return 1;
    if ((failed || signal?.aborted) && !stage.cleanup) { failed = true; emit(`${stage.id} not-run`); continue; }
    try {
    const local = join(directory, stage.id);
    await mkdir(local);
    const childEnv = { ...inherited };
    delete childEnv.QA_PRIVATE_DIAGNOSTIC_FILE;
    delete childEnv.QA_PRIVATE_DIAGNOSTIC_TOKEN;
    const expected = diagnosticInvocations(stage.command);
    const diagnosticPath = join(local, 'diagnostic.jsonl');
    const diagnosticToken = randomBytes(32).toString('hex');
    if (expected) {
      await writeFile(diagnosticPath, '', { mode: 0o600, flag: 'wx' });
      childEnv.QA_PRIVATE_DIAGNOSTIC_FILE = diagnosticPath;
      childEnv.QA_PRIVATE_DIAGNOSTIC_TOKEN = diagnosticToken;
    }
    let termination = 'none';
    for (const key of channels) {
      childEnv[key] = join(local, key);
      await writeFile(childEnv[key], '', { mode: 0o600 });
    }
    const handles = await Promise.all(['stdout', 'stderr'].map(name => open(join(local, name), 'w', 0o600)));
    let bytes = [0, 0], writes = Promise.resolve(), code = 1, captureFailed = false;
    try {
      code = await new Promise(resolveResult => {
        // Abort may arrive during asynchronous private-file preparation.
        if (!stage.cleanup && signal?.aborted) { cancelled = true; termination = 'cancelled'; resolveResult(1); return; }
        const child = spawn('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', stage.command], { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
        let interrupted = false, killTimer;
        const stop = (reason = 'timeout') => {
          if (termination === 'none') termination = reason;
          interrupted = true;
          try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
          killTimer ??= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already stopped. */ } }, 5000);
        };
        const abort = () => { cancelled = true; stop('cancelled'); };
        // Cleanup still runs after interruption, with its own bounded lifetime.
        if (!stage.cleanup) {
          signal?.addEventListener('abort', abort, { once: true });
          // Register first, then check, so an already-fired event cannot be lost.
          if (signal?.aborted) abort();
        }
        const timer = setTimeout(stop, stage.cleanup ? Math.min(timeoutMs, 11 * 60_000) : timeoutMs);
        [child.stdout, child.stderr].forEach((stream, i) => stream.on('data', chunk => {
          const kept = chunk.subarray(0, Math.max(0, limit - bytes[i])); bytes[i] += kept.length;
          if (kept.length) writes = writes.then(() => handles[i].write(kept)).catch(() => { captureFailed = true; interrupted = true; stop('capture-error'); });
        }));
        let settled = false;
        const finish = value => {
          if (settled) return; settled = true;
          clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
          resolveResult(interrupted ? 1 : value);
        };
        child.on('error', () => { termination = 'runner-error'; finish(1); });
        child.on('close', value => finish(value === 0 ? 0 : 1));
      });
      await writes;
      if (captureFailed || (await stat(childEnv.GITHUB_ENV)).size > 16384) throw new Error('Private capture failed');
      const additions = parseEnvironment(await readFile(childEnv.GITHUB_ENV, 'utf8'), stage, runnerTemp);
      if (code === 0) inherited = { ...inherited, ...additions };
    } catch { code = 1; }
    finally { await writes; await Promise.all(handles.map(handle => handle.close())); }
    if (expected) {
      const report = await emitDiagnosticJournal({ path: diagnosticPath, token: diagnosticToken, expected,
        stage: stage.id, termination, emit });
      // Diagnostic uncertainty cannot upgrade an exit failure or certify success.
      if (report.report !== 'complete' || report.invocations.some(item => item.status !== 'passed')) code = 1;
    }
    if (code !== 0) failed = true;
    emit(`${stage.id} ${code === 0 ? 'passed' : 'failed'}`);
    } catch { failed = true; emit(`${stage.id} failed`); }
  }
  return failed || cancelled ? 1 : 0;
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP || process.env.VERCEL) throw new Error('Runner guard');
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw new Error('Manual event required');
  const lane = process.argv[2];
  if (!['focused-components', 'browser'].includes(lane)) throw new Error('Unknown lane');
  const stages = JSON.parse(await readFile(new URL('./qa-private-stages.json', import.meta.url), 'utf8'))[lane];
  const controller = new AbortController();
  for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => controller.abort());
  process.exitCode = await runStages(stages, { cwd: process.cwd(), runnerTemp: process.env.RUNNER_TEMP, signal: controller.signal });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.log('verification failed'); process.exitCode = 1; });
}
