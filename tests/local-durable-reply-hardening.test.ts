import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { LocalDurableReplyClient as Client } from '../lib/yeoni/local-durable-reply.ts';
const schema = readFileSync('docs/yeoni-durable-reply/schema.local.sql', 'utf8');
async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec("insert into reply_local.policies values('analysis',100,100),('voice',100,100)");
  return db;
}
async function client(db: PGlite, owner = 'fixture-a') {
  const c = new Client(db, { mode: 'synthetic', owner });
  await c.login();
  return c;
}
test('privacy deletion preserves accounting state, never revives closed historical costs or cached text', async () => {
  const db = await setup();
  try {
    const c = await client(db);
    const v = await c.publish('diet', 1, [1]);
    await c.reserve('diet', 1, v, 'analysis', 100);
    await c.claim('diet', 1, v, 'analysis', 'once');
    await c.finish('diet', v, 'analysis', { mode: 'mock', sourceVersion: v, text: '모의', generatedAt: '2025-01-01T00:00:00Z', analysisDate: '2025-01-01' }, 'once');
    await db.query('select reply_local.settle($1,$2,$3,$4,$5)', ['fixture-a', 'diet', v, 'analysis', 100]);
    await db.query("update reply_local.receipts set month='2025-01'");
    await c.publish('diet', 2, null, true);
    await c.publish('diet', 3, [1]);
    assert.equal((await c.reserve('diet', 3, v, 'analysis', 100)).status, 'deleted');
    assert.equal(await c.claim('diet', 3, v, 'analysis', 'again'), false);
    assert.equal(await c.finish('diet', v, 'analysis', null, 'once'), false);
    const receipt = (await db.query<{ state: string; erased: boolean; answer: unknown }>('select state,erased,answer from reply_local.receipts')).rows[0];
    assert.deepEqual(receipt, { state: 'done', erased: true, answer: null });
    const b = await client(db, 'fixture-b');
    const vb = await b.publish('diet', 1, [2]);
    assert.equal((await b.reserve('diet', 1, vb, 'analysis', 1)).status, 'reserved');
  } finally { await db.close(); }
});
test('erasure never releases unknown, unfinished, current-month, or overestimate liabilities', async () => {
  const db = await setup();
  try {
    const c = await client(db);
    const v = await c.publish('diet', 1, [1]);
    await c.reserve('diet', 1, v, 'analysis', 100);
    await c.publish('diet', 2, null, true);
    const b = await client(db, 'fixture-b');
    const vb = await b.publish('diet', 1, [2]);
    for (const [state, actual] of [['pending', 100], ['uncertain', 100], ['done', null], ['done', 101]] as const) {
      await db.query("update reply_local.receipts set month='2025-01',state=$1,actual=$2", [state, actual]);
      assert.equal((await b.reserve('diet', 1, vb, 'analysis', 1)).status, 'budget');
    }
    await db.query("update reply_local.receipts set month=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM'),state='done',actual=100");
    assert.equal((await b.reserve('diet', 1, vb, 'analysis', 1)).status, 'budget');
    assert.equal((await b.reserve('diet', 1, vb, 'voice', 1)).status, 'reserved');
  } finally { await db.close(); }
});
test('same-client source changes suppress delayed claim and reserve ACKs, including invalid publication', async () => {
  const db = await setup();
  try {
    for (const [i, operation, mutation] of [[0, 'claim', 'purge'], [1, 'reserve', 'edit'], [2, 'claim', 'invalid'], [3, 'claim', 'other-app']] as const) {
      let release!: () => void, notify!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const entered = new Promise<void>(resolve => { notify = resolve; });
      let hold = false;
      const c = new Client({ async query<T>(sql: string, params?: unknown[]) {
        const result = await db.query<T>(sql, params);
        if (hold && sql.includes('reply_local.' + operation + '(')) { notify(); await held; }
        return result;
      } }, { mode: 'synthetic', owner: 'fixture-' + i });
      await c.login();
      const v = await c.publish('diet', 1, [1]);
      if (operation === 'claim') await c.reserve('diet', 1, v, 'analysis', 1);
      hold = true;
      const pending = operation === 'claim' ? c.claim('diet', 1, v, 'analysis', 'once') : c.reserve('diet', 1, v, 'analysis', 1);
      await entered;
      if (mutation === 'purge') await c.publish('diet', 2, null, true);
      else if (mutation === 'invalid') await assert.rejects(c.publish('diet', 2, new Map()));
      else await c.publish(mutation === 'other-app' ? 'growth' : 'diet', 2, [2]);
      release();
      const result = await pending;
      if (operation === 'claim') assert.equal(result, mutation === 'other-app');
      else assert.deepEqual(result, { status: 'stale' });
      hold = false;
      assert.equal(await c.claim('diet', 1, v, 'analysis', 'retry'), false);
    }
    assert.equal((await db.query<{ sum: string }>('select sum(cost)::text from reply_local.receipts')).rows[0].sum, '4');
  } finally { await db.close(); }
});
