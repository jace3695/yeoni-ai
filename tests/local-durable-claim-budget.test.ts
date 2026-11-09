import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { LocalDurableReplyClient as Client } from '../lib/yeoni/local-durable-reply.ts';
const schema = readFileSync('docs/yeoni-durable-reply/schema.local.sql', 'utf8');
async function setup() {
  const db = new PGlite(); await db.exec(schema);
  await db.exec("insert into reply_local.policies values('analysis',100,100),('voice',100,100)");
  const c = new Client(db, { mode: 'synthetic', owner: 'synthetic-a' }); await c.login();
  const v = await c.publish('budget', 1, { n: 1 });
  assert.equal((await c.reserve('budget', 1, v, 'analysis', 40)).status, 'reserved');
  return { db, c, v };
}
async function receipt(db: PGlite, v: string) {
  return (await db.query<{ cost: number; claim: string | null; state: string; erased: boolean }>('select cost,claim,state,erased from reply_local.receipts where version=$1', [v])).rows[0];
}
test('claim rechecks policy removal without erasing reservation or granting a retry', async () => {
  const { db, c, v } = await setup(); try {
    const before = await receipt(db, v); await db.exec('delete from reply_local.policies');
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'first'), false);
    assert.deepEqual(await receipt(db, v), before);
    assert.equal((await c.reserve('budget', 1, v, 'analysis', 40)).status, 'busy');
  } finally { await db.close(); }
});
test('zero or lower project/account caps stop unclaimed work; equal cap permits one claim', async () => {
  const { db, c, v } = await setup(); try {
    for (const [project, account] of [[0, 100], [100, 0], [39, 100], [100, 39]]) {
      await db.query("update reply_local.policies set project_cap=$1,account_cap=$2 where pool='analysis'", [project, account]);
      assert.equal(await c.claim('budget', 1, v, 'analysis', 'blocked'), false);
      assert.equal((await receipt(db, v)).claim, null);
    }
    await db.exec("update reply_local.policies set project_cap=40,account_cap=40 where pool='analysis'");
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'allowed-once'), true);
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'allowed-once'), false);
  } finally { await db.close(); }
});
test('known other-account overrun blocks project dispatch while preserving uncapped actual cost', async () => {
  const { db, c, v } = await setup(); try {
    const b = new Client(db, { mode: 'synthetic', owner: 'synthetic-b' }); await b.login();
    const bv = await b.publish('diet', 1, { n: 2 });
    assert.equal((await b.reserve('diet', 1, bv, 'analysis', 40)).status, 'reserved');
    assert.equal(await b.claim('diet', 1, bv, 'analysis', 'already-sent'), true);
    await db.query('select reply_local.settle($1,$2,$3,$4,$5)', ['synthetic-b', 'diet', bv, 'analysis', 150]);
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'must-stop'), false);
    assert.equal((await receipt(db, v)).claim, null);
    assert.equal(Number((await db.query<{ amount: string }>('select sum(greatest(cost,coalesce(actual,0))) amount from reply_local.receipts')).rows[0].amount), 190);
  } finally { await db.close(); }
});
test('same-owner overrun blocks account claim even with a larger project cap', async () => {
  const { db, c, v } = await setup(); try {
    await db.exec("update reply_local.policies set project_cap=1000 where pool='analysis'");
    const v2 = await c.publish('diet', 1, { n: 2 });
    await c.reserve('diet', 1, v2, 'analysis', 40); await c.claim('diet', 1, v2, 'analysis', 'sent');
    await db.query('select reply_local.settle($1,$2,$3,$4,$5)', ['synthetic-a', 'diet', v2, 'analysis', 80]);
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'stop-account'), false);
  } finally { await db.close(); }
});
test('previous-month uncertain/erased debt remains in claim checks and pools stay separate', async () => {
  const { db, c, v } = await setup(); try {
    const b = new Client(db, { mode: 'synthetic', owner: 'synthetic-b' }); await b.login();
    const bv = await b.publish('diet', 1, { n: 2 }); await b.reserve('diet', 1, bv, 'analysis', 40);
    await b.claim('diet', 1, bv, 'analysis', 'uncertain'); await b.finish('diet', bv, 'analysis', null, 'uncertain');
    await b.publish('diet', 2, null, true);
    await db.query("update reply_local.receipts set month='2025-01' where owner='synthetic-b'");
    await db.exec("update reply_local.policies set project_cap=70 where pool='analysis'");
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'stop-carry'), false);
    const voice = await c.publish('growth', 1, { n: 3 }); await c.reserve('growth', 1, voice, 'voice', 40);
    assert.equal(await c.claim('growth', 1, voice, 'voice', 'voice-independent'), true);
  } finally { await db.close(); }
});
test('completed fully-priced old expenses do not block a valid later-month claim', async () => {
  const { db, c, v } = await setup(); try {
    const b = new Client(db, { mode: 'synthetic', owner: 'synthetic-b' }); await b.login();
    const bv = await b.publish('diet', 1, { n: 2 }); await b.reserve('diet', 1, bv, 'analysis', 40);
    await b.claim('diet', 1, bv, 'analysis', 'done');
    await b.finish('diet', bv, 'analysis', { mode: 'mock', text: '가상 응답', generatedAt: '2026-11-09T00:00:00Z', analysisDate: '2026-11-09', sourceVersion: bv }, 'done');
    await db.query('select reply_local.settle($1,$2,$3,$4,$5)', ['synthetic-b', 'diet', bv, 'analysis', 20]);
    await db.query("update reply_local.receipts set month='2025-01' where owner='synthetic-b'");
    await db.exec("update reply_local.policies set project_cap=40 where pool='analysis'");
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'valid'), true);
  } finally { await db.close(); }
});
test('lowered policy cannot revoke an already returned grant; repeated claim never dispatches again', async () => {
  const { db, c, v } = await setup(); try {
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'prior-grant'), true);
    await db.exec("update reply_local.policies set project_cap=0 where pool='analysis'");
    assert.equal(await c.claim('budget', 1, v, 'analysis', 'prior-grant'), false);
    assert.equal((await receipt(db, v)).claim, 'prior-grant');
  } finally { await db.close(); }
});
