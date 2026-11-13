import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { runStages } from '../qa-private-orchestrator.mjs';
import { loadContext, childEnvironment, readPrivateFile } from '../isolated-auth-api/boundary.mjs';
import { checkBundledChromium, bundledChromiumContext, BUNDLE_CACHE } from '../isolated-chromium-smoke/bundled-readiness.mjs';
import { command, accepted } from './manifest.mjs';

const failure = 'diet-regression failed tests=2 realBrowser=unverified fixtureCleanup=unverified';
async function main() {
  await loadContext();
  const context = bundledChromiumContext(process.env);
  process.umask(0o077);
  const controller = new AbortController(); const abort = () => controller.abort();
  process.on('SIGTERM', abort); process.on('SIGINT', abort);
  const timer = setTimeout(abort, 600_000);
  try {
    const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'private-diet-regression-'));
    const receipt = join(directory, 'receipt.json'), token = randomBytes(32).toString('hex');
    const env = { ...childEnvironment(process.env), ...context, PLAYWRIGHT_BROWSERS_PATH: BUNDLE_CACHE, NODE_ENV: 'production',
      YEONI_DIET_RECEIPT_FILE: receipt, YEONI_DIET_RECEIPT_TOKEN: token };
    const options = { cwd:process.cwd(), runnerTemp:process.env.RUNNER_TEMP, env, signal:controller.signal, emit:line => console.log(line) };
    // Raw assertion details, page text, tokens, and subprocess output remain private.
    if (await runStages([{id:'stage-01', command:'node --test scripts/isolated-diet-regression/safety.test.mjs'}], {...options, timeoutMs:60_000}) !== 0) throw new Error('safety');
    if (await checkBundledChromium({cwd:options.cwd, env, signal:controller.signal, timeoutMs:240_000, emit:options.emit}) !== 0) throw new Error('readiness');
    if (await runStages([{id:'stage-02', command}], {...options, timeoutMs:240_000}) !== 0) throw new Error('browser');
    if (controller.signal.aborted || !accepted(JSON.parse(await readPrivateFile(receipt, 1024)), token)) throw new Error('receipt');
    console.log('diet-regression passed tests=2 browser=playwright-chromium-headless-shell realBrowser=true fixtureCleanup=passed');
  } finally {
    clearTimeout(timer); process.off('SIGTERM',abort); process.off('SIGINT',abort);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.log(failure); process.exitCode=1; });
}
