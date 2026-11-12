import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import vm from 'node:vm';
import { recoverMemory, rememberMemoryChange, completeMemoryChange, type AssistantMemory, type MemoryChange, type MemoryTransport } from '../lib/assistant-memory-recovery.ts';

async function fixture() {
  const output = await build({ entryPoints: ['scripts/memory-preview/fake-client.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
  const compiled = { exports: {} };
  vm.runInNewContext(output.outputFiles[0].text, { module: compiled, exports: compiled.exports, Event,
    window: { dispatchEvent() {} }, setTimeout, clearTimeout });
  return compiled.exports as typeof import('../scripts/memory-preview/fake-client');
}
const row = { id: 'synthetic-id', user_id: 'synthetic-memory-a', topic: '가상 주제', content: '가상 내용' };
test('memory fixture loses acknowledgement after one commit and isolates owner reads', async () => {
  const f = await fixture(); f.injectLoss();
  assert.ok((await f.supabase.from('assistant_memories').insert(row)).error);
  assert.equal(f.metrics().rows, 1); assert.equal(f.metrics().writes, 1);
  const find = () => f.supabase.from('assistant_memories').select().eq('user_id', row.user_id).eq('id', row.id).maybeSingle();
  assert.ok((await find()).error); assert.equal((await find()).error, null);
  f.switchOwner(); assert.equal(f.metrics().rows, 0);
  await assert.rejects(find(), /owner boundary/);
});
test('memory fixture can release an old commit after a simulated reset', async () => {
  const f = await fixture(); f.holdNextWrite();
  const pending = Promise.resolve(f.supabase.from('assistant_memories').insert(row));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.metrics().waitingWrites, 1); assert.equal(f.metrics().rows, 0);
  f.resetOwner(); f.releaseWrites(); await pending;
  assert.equal(f.metrics().rows, 1); assert.equal(f.metrics().writes, 1); assert.equal(f.metrics().commits, 1);
  const duplicate = await f.supabase.from('assistant_memories').insert(row);
  assert.ok(duplicate.error); assert.equal(f.metrics().rows, 1);
});
test('memory fixture preserves compare-before filters instead of overwriting remote changes', async () => {
  const f = await fixture(); await f.supabase.from('assistant_memories').insert(row); f.changeRemote();
  await f.supabase.from('assistant_memories').update({ content: 'old writer' }).eq('id', row.id).eq('user_id', row.user_id).eq('content', row.content);
  const result = await f.supabase.from('assistant_memories').select().eq('user_id', row.user_id).eq('id', row.id).maybeSingle();
  assert.equal((result.data as { content: string }).content, '다른 화면에서 수정한 가상 기억');
});
test('memory fixture projects requested fields so actual recovery can edit and delete a stored row', async () => {
  const f = await fixture(); await f.supabase.from('assistant_memories').insert(row);
  const find = async () => (await f.supabase.from('assistant_memories').select('id,user_id,topic,content').eq('user_id', row.user_id).eq('id', row.id).maybeSingle()).data as AssistantMemory | null;
  const list = await f.supabase.from('assistant_memories').select('id,user_id,topic,content').eq('user_id', row.user_id);
  assert.deepEqual(Object.keys((list.data as AssistantMemory[])[0]).sort(), ['content', 'id', 'topic', 'user_id']);
  const before = (await find())!;
  assert.deepEqual({ ...before }, row);
  const storageMap = new Map<string, string>();
  const storage = { getItem: (key: string) => storageMap.get(key) ?? null, setItem: (key: string, value: string) => { storageMap.set(key, value); } };
  const transport: MemoryTransport = {
    auth: async () => (await f.supabase.auth.getUser()).data.user.id,
    reset: async () => 'null', find,
    write: async change => {
      const query = change.after ? f.supabase.from('assistant_memories').update(change.after) : f.supabase.from('assistant_memories').delete();
      return await query.eq('user_id', change.owner).eq('id', change.id).eq('topic', change.before!.topic).eq('content', change.before!.content);
    },
  };
  const change: MemoryChange = { owner: row.user_id, id: row.id, before, after: { topic: row.topic, content: '수정된 가상 내용' }, originalReset: 'null', reset: 'null', attempted: false };
  const controller = new AbortController();
  const edited = await recoverMemory(change, 'send', transport, entry => { rememberMemoryChange(storage, entry); }, () => true, controller.signal);
  assert.equal(edited.state, 'saved'); completeMemoryChange(storage, edited.change);
  const removed = await recoverMemory({ ...change, before: (await find())!, after: null }, 'send', transport, entry => { rememberMemoryChange(storage, entry); }, () => true, controller.signal);
  assert.equal(removed.state, 'saved'); completeMemoryChange(storage, removed.change);
  assert.equal(f.metrics().rows, 0); assert.equal(f.metrics().writes, 3);
  assert.equal(new Set(f.metrics().requestIds).size, 1);
});
