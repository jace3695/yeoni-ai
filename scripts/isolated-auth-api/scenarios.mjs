// @ts-check
import { randomUUID, randomBytes } from 'node:crypto';
import { check, same } from './boundary.mjs';
import { assertRows, assertEmpty } from './adapters.mjs';
import { emptyReport } from './report.mjs';
const times = ['2001-01-02T00:00:00.000Z', '2001-01-03T00:00:00.000Z', '2001-01-04T00:00:00.000Z'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function generateAccounts() {
  return Object.freeze(Array.from({ length: 2 }, () => Object.freeze({ id: randomUUID(),
    email: `qa-${randomUUID()}@example.test`, password: `${randomBytes(32).toString('base64url')}!aA1`, nonce: randomBytes(32).toString('hex') })));
}
const statePairs = [
  [{ 'ai-fitness-daily-notes': { '2001-01-02': 'Synthetic initial note' } }, { 'ai-fitness-daily-notes': { '2001-01-02': 'Synthetic revised note' } }],
  [{ learningSettings: JSON.stringify({ dailyGoalCount: 5 }) }, { learningSettings: JSON.stringify({ dailyGoalCount: 6 }) }],
];
export async function runScenarios({ accounts, admin, newUser, appRequest, beforeCleanup = async () => {}, cleanupMode = () => {}, signal }) {
  check(accounts.length === 2 && new Set(accounts.map(a => a.id)).size === 2 && new Set(accounts.map(a => a.email)).size === 2
    && accounts.every(a => uuid(a.id) && /^qa-[0-9a-f-]+@example\.test$/.test(a.email)));
  const report = emptyReport(), attempted = [], confirmed = new Set(), removed = new Set(), sessions = [];
  const [a, b] = accounts; let userA, userB, tokenA, tokenB, failed = false;
  const scenario = async (index, callback, always = false) => {
    if (!always && (failed || signal?.aborted)) { failed = true; return; }
    try { await callback(); report.scenarios[index] = 'passed'; }
    catch { failed = true; report.scenarios[index] = 'failed'; }
  };
  const login = async account => {
    const user = newUser(); sessions.push(user);
    const token = await user.login(account); const identity = await user.getUser();
    check(identity?.id === account.id && identity?.email === account.email);
    return { user, token };
  };
  try {
    await scenario(0, async () => {
      for (const account of accounts) { attempted.push(account); await admin.create(account); confirmed.add(account); }
      ({ user: userA, token: tokenA } = await login(a)); ({ user: userB, token: tokenB } = await login(b));
    });
    for (const [index, table] of ['user_app_state', 'language_user_state'].entries()) {
      await scenario(index + 1, async () => {
        const [initial, updated] = statePairs[index];
        assertRows(await userA.state('insert', table, a.id, initial, undefined, times[0]), a.id, initial, times[0]);
        assertRows(await userA.state('read', table, a.id), a.id, initial, times[0]);
        assertRows(await userA.state('update', table, a.id, updated, times[0], times[1]), a.id, updated, times[1]);
        const unchanged = async () => assertRows(await userA.state('read', table, a.id), a.id, updated, times[1]);
        await unchanged();
        assertEmpty(await userA.state('update', table, a.id, initial, times[0], times[2])); await unchanged();
        assertEmpty(await userB.state('read', table, a.id)); await unchanged();
        assertEmpty(await userB.state('update', table, a.id, initial, times[1], times[2])); await unchanged();
        assertEmpty(await userB.state('delete', table, a.id)); await unchanged();
        const denied = await userB.state('insert', table, a.id, initial, undefined, times[0]);
        // A duplicate-key error cannot prove insert ownership protection.
        check(denied.status === 403 && denied.error?.code === '42501'); await unchanged();
      });
    }
    await scenario(3, async () => {
      check((await appRequest('GET')).status === 401);
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const payload = { date, amount: 17, place: 'Synthetic test shop', category: '기타', memo: 'Synthetic API persistence' };
      const created = await appRequest('POST', tokenA, payload);
      const original = created.body?.data;
      check(created.status === 200 && uuid(original?.id) && original.user_id === a.id);
      for (const key of Object.keys(payload)) check(same(original[key], payload[key]));
      const assertA = async token => {
        const response = await appRequest('GET', token);
        check(response.status === 200 && same(response.body?.data, [original]));
      };
      await assertA(tokenA);
      const fresh = await login(a); check(fresh.user !== userA); await assertA(fresh.token);
      for (const [index, table] of ['user_app_state', 'language_user_state'].entries()) {
        assertRows(await fresh.user.state('read', table, a.id), a.id, statePairs[index][1], times[1]);
      }
      const hidden = await appRequest('GET', tokenB);
      check(hidden.status === 200 && same(hidden.body?.data, []));
      const deleted = await appRequest('DELETE', tokenB, { id: original.id });
      check(deleted.status === 200 && deleted.body?.success === true); await assertA(fresh.token);
      const forged = await appRequest('POST', tokenB, { ...payload, user_id: a.id });
      // The existing route overwrites caller-supplied user_id; prove that behavior.
      check(forged.status === 200 && uuid(forged.body?.data?.id) && forged.body.data.id !== original.id && forged.body.data.user_id === b.id);
      for (const key of Object.keys(payload)) check(same(forged.body.data[key], payload[key]));
      const own = await appRequest('GET', tokenB);
      check(own.status === 200 && same(own.body?.data, [forged.body.data])); await assertA(fresh.token);
    });
  } finally {
    // Cleanup has separate request deadlines even if a scenario is cancelled.
    cleanupMode();
    await scenario(4, async () => {
      let signOutFailed = false;
      for (const session of sessions) { try { await session.signOut(); } catch { signOutFailed = true; } }
      check(!signOutFailed && sessions.length > 0);
    }, true);
    await scenario(5, async () => {
      let cleanupFailed = false;
      try { await beforeCleanup(); } catch { cleanupFailed = true; }
      // Continue for both accounts after any individual cleanup failure.
      for (const account of attempted) {
        try {
          if (await admin.inspect(account)) { confirmed.add(account); await admin.remove(account); }
          check(!(await admin.inspect(account)));
          await admin.verifyRows(account);
          if (confirmed.has(account)) removed.add(account);
        } catch { cleanupFailed = true; }
      }
      check(!cleanupFailed); report.cleanupVerified = true;
    }, true);
  }
  report.created = confirmed.size; report.removed = removed.size;
  return report;
}
