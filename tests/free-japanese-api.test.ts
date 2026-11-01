import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as service from '../lib/free-japanese-conversation.ts';

function fixture(authenticated = true) {
  let calls = 0;
  const deps: Record<string, unknown> = {
    '@/lib/supabase-server': { createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'synthetic' } : null }, error: null }) } }) },
    '@/lib/free-japanese-conversation': { ...service, generateFreeJapanese: async () => { calls++; return { source: 'ai', reply: '合成応答' }; } },
  };
  const source = readFileSync(new URL('../app/api/language/practice/route.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { POST?: (request: Request) => Promise<Response> } = {};
  vm.runInNewContext('(function(exports,require){' + code + '})', { Response, process: { env: {} }, fetch: () => { throw Error('no network'); } })(exports, (name: string) => { assert.ok(name in deps); return deps[name]; });
  const run = (body: unknown) => exports.POST!(new Request('https://synthetic.invalid/api/language/practice', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { run, calls: () => calls };
}
const input = { message: 'こんにちは', situation: '일상', history: [], freeDataUseAcknowledged: true };
test('retired practice API rejects every request without auth, generation or body reads', async () => {
  for (const authenticated of [false, true]) {
    const f = fixture(authenticated);
    for (const body of [input, '{bad', { ...input, freeDataUseAcknowledged: false }, 'x'.repeat(30001)]) {
      const response = await f.run(body); assert.equal(response.status, 410);
      assert.equal((await response.json()).code, 'FEATURE_RETIRED');
    }
    assert.equal(f.calls(), 0);
  }
});
