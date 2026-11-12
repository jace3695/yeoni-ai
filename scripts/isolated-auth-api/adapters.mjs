// @ts-check
import { check, same, STACK_ORIGIN } from './boundary.mjs';
const tables = ['user_app_state', 'language_user_state', 'budget_transactions'];
const options = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
export function userTransport(fetchImpl, anon, service) {
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === STACK_ORIGIN) {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      check(headers.get('apikey') === anon && headers.get('authorization') !== `Bearer ${service}`);
    }
    return fetchImpl(input, init);
  };
}
export function createUserAdapter(createClient, context, fetchImpl) {
  const client = createClient(context.url, context.anon, { auth: options, global: { fetch: fetchImpl } });
  return {
    async login(account) {
      const result = await client.auth.signInWithPassword({ email: account.email, password: account.password });
      check(!result.error && result.data.session?.access_token && result.data.user?.id === account.id);
      return result.data.session.access_token;
    },
    async getUser() { const result = await client.auth.getUser(); check(!result.error); return result.data.user; },
    async state(method, table, owner, state, expectedTime, nextTime) {
      check(tables.slice(0, 2).includes(table));
      let query = client.from(table);
      if (method === 'insert') query = query.insert({ user_id: owner, state, updated_at: nextTime });
      else if (method === 'update') query = query.update({ state, updated_at: nextTime }).eq('user_id', owner).eq('updated_at', expectedTime);
      else if (method === 'delete') query = query.delete().eq('user_id', owner);
      else { check(method === 'read'); query = query.select('user_id,state,updated_at').eq('user_id', owner); }
      if (method !== 'read') query = query.select('user_id,state,updated_at');
      return await query;
    },
    async signOut() {
      check(!(await client.auth.signOut({ scope: 'local' })).error);
      const result = await client.auth.getSession();
      check(!result.error && result.data.session === null);
      // An issued access JWT can remain valid until expiry. No revocation assertion.
    },
  };
}
export function createAdminAdapter(context, accounts, fetchImpl) {
  // No unscoped list/query API is exposed. Only two locally generated objects qualify.
  const allowed = new Set(accounts);
  const authorize = account => check(allowed.has(account));
  const request = async (path, method, body, headers = {}) => {
    const response = await fetchImpl(`${context.url}${path}`, { method, headers: {
      apikey: context.service, Authorization: `Bearer ${context.service}`, 'content-type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01', ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return response;
  };
  return {
    async create(account) {
      authorize(account);
      const response = await request('/auth/v1/admin/users', 'POST', { id: account.id, email: account.email,
        password: account.password, email_confirm: true, app_metadata: { isolated_auth_api: account.nonce } });
      check(response.status === 200 || response.status === 201);
      const user = await response.json();
      check(user.id === account.id && user.email === account.email && user.app_metadata?.isolated_auth_api === account.nonce);
    },
    async inspect(account) {
      authorize(account);
      const response = await request(`/auth/v1/admin/users/${account.id}`, 'GET');
      const body = await response.json();
      if (response.status === 404 && body.code === 'user_not_found') return false;
      check(response.status === 200 && body.id === account.id && body.email === account.email
        && body.app_metadata?.isolated_auth_api === account.nonce);
      return true;
    },
    async remove(account) {
      authorize(account);
      // Reverify ownership immediately before destructive cleanup.
      check(await this.inspect(account));
      const response = await request(`/auth/v1/admin/users/${account.id}`, 'DELETE', { should_soft_delete: false });
      check(response.status === 200);
    },
    async verifyRows(account) {
      authorize(account);
      for (const table of tables) {
        const query = new URLSearchParams({ select: 'user_id', user_id: `eq.${account.id}` });
        const response = await request(`/rest/v1/${table}?${query}`, 'HEAD', undefined, { Prefer: 'count=exact' });
        check(response.status === 200 && response.headers.get('content-range') === '*/0');
      }
    },
  };
}
export async function requestApp(fetchImpl, origin, method, token, body) {
  const response = await fetchImpl(`${origin}/api/transactions`, { method, headers: {
    'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
export function assertRows(result, owner, state, time) {
  check(!result.error && [200, 201].includes(result.status));
  check(Array.isArray(result.data) && result.data.length === 1);
  const row = result.data[0];
  check(row.user_id === owner && same(row.state, state) && Date.parse(row.updated_at) === Date.parse(time));
  return row;
}
export function assertEmpty(result) { check(!result.error && result.status === 200 && Array.isArray(result.data) && result.data.length === 0); }
