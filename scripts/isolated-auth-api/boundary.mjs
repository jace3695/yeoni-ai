// @ts-check
import { constants } from 'node:fs';
import { open, lstat, realpath, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export const STACK_ORIGIN = 'http://127.0.0.1:54321';
export const RUNNER_TEMP = '/home/runner/work/_temp';
export const check = value => { if (!value) throw new Error('Check failed'); };
export const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : Array.isArray(value) ? value.map(canonical) : value;
}
function role(key, expected) {
  check(typeof key === 'string' && key.length < 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key));
  const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  check(payload.role === expected);
}
export function guardEnvironment(env) {
  check(env.GITHUB_ACTIONS === 'true' && env.RUNNER_TEMP === RUNNER_TEMP && env.YEONI_E2E === '1');
  check(env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/agent/yeoni-japanese-ci-20261110');
  check(env.NEXT_PUBLIC_SUPABASE_URL === STACK_ORIGIN && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  check(!Object.keys(env).some(key => key.startsWith('VERCEL') && env[key]));
  role(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'anon');
}
export function validateFixture(env, fixture) {
  guardEnvironment(env);
  check(fixture && fixture.API_URL === STACK_ORIGIN && fixture.ANON_KEY === env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  role(fixture.ANON_KEY, 'anon'); role(fixture.SERVICE_ROLE_KEY, 'service_role');
  check(fixture.ANON_KEY !== fixture.SERVICE_ROLE_KEY);
  return { url: STACK_ORIGIN, anon: fixture.ANON_KEY, service: fixture.SERVICE_ROLE_KEY };
}
export async function readPrivateFile(path, maximum = 16384) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    check(info.isFile() && (info.mode & 0o077) === 0 && info.size <= maximum);
    const bytes = Buffer.alloc(maximum + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    check(bytesRead <= maximum);
    return bytes.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}
export async function loadContext(env = process.env, cwd = process.cwd()) {
  // Reject before any file creation, imports with side effects, or network use.
  guardEnvironment(env);
  const info = await lstat(env.RUNNER_TEMP);
  check(info.isDirectory() && !info.isSymbolicLink() && await realpath(env.RUNNER_TEMP) === RUNNER_TEMP);
  const names = await readdir(cwd);
  check(!names.some(name => /^\.env(?:$|\.(?:local|production|production\.local)$)/.test(name)));
  const fixturePath = join(cwd, '.e2e', 'stack-status.json');
  check(await realpath(fixturePath) === resolve(fixturePath));
  return validateFixture(env, JSON.parse(await readPrivateFile(fixturePath)));
}
export function childEnvironment(env) {
  // No original command files, credential variables, preload flags or proxy settings.
  const result = {};
  for (const name of ['PATH', 'HOME', 'LANG', 'GITHUB_ACTIONS', 'GITHUB_EVENT_NAME', 'GITHUB_REF', 'RUNNER_TEMP',
    'YEONI_E2E', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    if (typeof env[name] === 'string') result[name] = env[name];
  }
  return { ...result, CI: 'true', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' };
}
export function createBoundaryFetch({ fetchImpl, origins, signal = () => undefined, timeoutMs = 10000, maxRequests = 250 }) {
  let requests = 0;
  return async (input, init = {}) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw);
    check(url.username === '' && url.password === '' && origins.has(url.origin));
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url.origin === STACK_ORIGIN) {
      const auth = (url.pathname === '/auth/v1/token' && method === 'POST' && url.search === '?grant_type=password')
        || (url.pathname === '/auth/v1/user' && method === 'GET' && !url.search)
        || (url.pathname === '/auth/v1/logout' && method === 'POST' && url.search === '?scope=local')
        || (url.pathname === '/auth/v1/admin/users' && method === 'POST' && !url.search)
        || (/^\/auth\/v1\/admin\/users\/[0-9a-f-]{36}$/.test(url.pathname) && ['GET', 'DELETE'].includes(method) && !url.search);
      const rest = /^\/rest\/v1\/(user_app_state|language_user_state|budget_transactions)$/.test(url.pathname)
        && ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(method);
      check(auth || rest);
    } else check(url.pathname === '/api/transactions' && !url.search && ['GET', 'POST', 'DELETE'].includes(method));
    check(++requests <= maxRequests);
    const signals = [init.signal ?? (input instanceof Request ? input.signal : undefined), signal(), AbortSignal.timeout(timeoutMs)].filter(Boolean);
    const response = await fetchImpl(input, { ...init, redirect: 'error', signal: AbortSignal.any(signals) });
    check(!response.redirected && (response.url === '' || new URL(response.url).origin === url.origin));
    check(response.status < 300 || response.status >= 400);
    // Bound response retention as well as request time, including streamed bodies.
    const reader = response.body?.getReader(); const parts = []; let size = 0;
    if (reader) {
      try {
        while (true) {
          const item = await reader.read(); if (item.done) break;
          size += item.value.byteLength; check(size <= 1024 * 1024); parts.push(item.value);
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    }
    return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : Buffer.concat(parts), {
      status: response.status, statusText: '', headers: response.headers,
    });
  };
}
