// @ts-check
import { createServer } from 'node:http';
import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, loadContext, readPrivateFile, createBoundaryFetch, STACK_ORIGIN, RUNNER_TEMP } from './boundary.mjs';
import { createAdminAdapter, createUserAdapter, requestApp, userTransport } from './adapters.mjs';
import { generateAccounts, runScenarios } from './scenarios.mjs';
import { reportPassed } from './report.mjs';
export async function boundedClose(callback, timeoutMs = 10000) {
  let timer;
  try { await Promise.race([Promise.resolve().then(callback), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Close failed')), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
async function main() {
  const context = await loadContext();
  const reportPath = process.env.ISOLATED_AUTH_API_REPORT;
  const token = process.env.ISOLATED_AUTH_API_TOKEN;
  check(typeof reportPath === 'string' && /^[0-9a-f]{64}$/.test(token ?? ''));
  check(dirname(dirname(reportPath)) === RUNNER_TEMP && /^isolated-auth-api-[A-Za-z0-9]+$/.test(dirname(reportPath).split('/').at(-1))
    && reportPath === join(dirname(reportPath), 'report.json'));
  check(await realpath(reportPath) === reportPath);
  const directory = await lstat(dirname(reportPath)); check(directory.isDirectory() && (directory.mode & 0o077) === 0);
  check(await readPrivateFile(reportPath, 2048) === '');
  // Every outgoing fetch, including compiled server route dependencies, is confined.
  const controller = new AbortController(); let cleaning = false;
  const abort = () => controller.abort();
  process.on('SIGINT', abort); process.on('SIGTERM', abort);
  const timer = setTimeout(abort, 4 * 60_000);
  const originalFetch = globalThis.fetch, origins = new Set([STACK_ORIGIN]);
  const transport = createBoundaryFetch({ fetchImpl: originalFetch, origins, signal: () => cleaning ? undefined : controller.signal });
  const ordinary = userTransport(transport, context.anon, context.service);
  globalThis.fetch = ordinary;
  let app, server, stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    let failed = false;
    if (server?.listening) {
      try { await boundedClose(() => new Promise((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections(); })); }
      catch { failed = true; }
    }
    if (app) { try { await boundedClose(() => app.close()); } catch { failed = true; } }
    check(!failed);
  };
  try {
    // Load no application/framework code until environment/file guards and fetch bounds exist.
    // Next is CommonJS at runtime; validate the dynamic default before calling it.
    const next = /** @type {unknown} */ ((await import('next')).default);
    if (typeof next !== 'function') throw new Error('Check failed');
    const { createClient } = await import('@supabase/supabase-js');
    app = next({ dev: false, hostname: '127.0.0.1', port: 0, quiet: true });
    await boundedClose(() => app.prepare(), 60000);
    // Next's environment loader must not alter the validated effective credentials.
    await loadContext();
    const handler = app.getRequestHandler();
    server = createServer((request, response) => {
      if (request.url !== '/api/transactions' || !['GET', 'POST', 'DELETE'].includes(request.method)) {
        response.writeHead(404); response.end(); return;
      }
      Promise.resolve(handler(request, response)).catch(() => { response.statusCode = 500; response.end(); });
    });
    await boundedClose(() => new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); }));
    const address = server.address();
    if (!address || typeof address !== 'object' || address.address !== '127.0.0.1') throw new Error('Check failed');
    const origin = `http://127.0.0.1:${address.port}`; origins.add(origin);
    const accounts = generateAccounts();
    const report = await runScenarios({ accounts,
      admin: createAdminAdapter(context, accounts, transport),
      newUser: () => createUserAdapter(createClient, context, ordinary),
      appRequest: (method, accessToken, body) => requestApp(ordinary, origin, method, accessToken, body),
      beforeCleanup: stop, cleanupMode: () => { cleaning = true; }, signal: controller.signal,
    });
    const file = await open(reportPath, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try { await file.writeFile(JSON.stringify({ ...report, token })); } finally { await file.close(); }
    process.exitCode = reportPassed(report) && !controller.signal.aborted ? 0 : 1;
  } finally {
    clearTimeout(timer); process.off('SIGINT', abort); process.off('SIGTERM', abort);
    try { await stop(); } finally { globalThis.fetch = originalFetch; }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.exitCode = 1; });
}
