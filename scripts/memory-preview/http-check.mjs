// HTTP-only smoke test. This does not launch or certify a browser.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import next from 'next';

const tracePath = resolve('.next/server/app/api/qa/memory/route.js.nft.json');
const trace = JSON.parse(await readFile(tracePath, 'utf8'));
const artifactPath = resolve('.generated/memory-preview/payload.json');
assert.ok(trace.files.some(file => resolve(dirname(tracePath), file) === artifactPath), 'Payload missing from Next server trace');
const payload = JSON.parse(await readFile(artifactPath, 'utf8'));
const saved = Object.fromEntries(['VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF'].map(key => [key, process.env[key]]));
const app = next({ dev: false, hostname: '127.0.0.1', port: 0 });
let server;
const results = [];
try {
  await app.prepare();
  server = createServer(app.getRequestHandler());
  await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveReady); });
  const port = server.address().port;
  for (const scenario of [
    { name: 'exact-preview', environment: 'preview', branch: 'agent/fitness-record-priority', path: '/api/qa/memory', status: 200 },
    { name: 'query-cannot-change-preview', environment: 'preview', branch: 'agent/fitness-record-priority', path: '/api/qa/memory?VERCEL_ENV=production', status: 200 },
    { name: 'production-denied', environment: 'production', branch: 'agent/fitness-record-priority', path: '/api/qa/memory?preview=1', status: 404 },
    { name: 'other-branch-denied', environment: 'preview', branch: 'main', path: '/api/qa/memory', status: 404 },
    { name: 'unknown-child-denied', environment: 'preview', branch: 'agent/fitness-record-priority', path: '/api/qa/memory/missing.js', status: 404 },
  ]) {
    process.env.VERCEL_ENV = scenario.environment;
    process.env.VERCEL_GIT_COMMIT_REF = scenario.branch;
    const response = await fetch(`http://127.0.0.1:${port}${scenario.path}`, { redirect: 'error' });
    const html = await response.text();
    assert.equal(response.status, scenario.status, scenario.name);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.doesNotMatch(html, /__next_f|\/api\/auth|CloudSyncPanel/);
    if (response.status === 200) {
      assert.equal(response.headers.get('x-yeoni-qa-source'), payload.sourceDigest);
      const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
      assert.equal(script, payload.script);
      const hash = createHash('sha256').update(script).digest('base64');
      assert.ok(response.headers.get('content-security-policy').includes(`script-src 'sha256-${hash}'`));
      const styles = html.match(/<style>([\s\S]*)<\/style>/)?.[1];
      assert.equal(styles, payload.styles);
      const styleHash = createHash('sha256').update(styles).digest('base64');
      assert.ok(response.headers.get('content-security-policy').includes(`style-src 'sha256-${styleHash}'`));
      assert.match(response.headers.get('content-security-policy'), /sandbox allow-scripts/);
      assert.doesNotMatch(response.headers.get('content-security-policy'), /allow-same-origin/);
    } else assert.equal(html, 'Not found');
    results.push({ name: scenario.name, status: response.status, bytes: Buffer.byteLength(html) });
  }
  const result = { stage: 'HTTP only; browser not run', sourceDigest: payload.sourceDigest, payloadTraced: true, results };
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (server) await new Promise(resolveClosed => { server.closeAllConnections(); server.close(resolveClosed); });
  await app.close();
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
}
