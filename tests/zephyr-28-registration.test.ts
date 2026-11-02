import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createZephyrNextWrapper} from '../lib/zephyr-28-wrappers.ts';
test('registered route reuses reviewed wrapper and existing server authentication without trial data or side effects',()=>{
 const route=readFileSync('app/api/tts/once-28/route.ts','utf8');
 const draft=readFileSync('docs/zephyr-28-once/install/next-route.ts','utf8');
 assert.equal(route.slice(route.indexOf('import ')),draft.slice(draft.indexOf('import ')));
 assert.match(route,/createServerSupabaseClient/);assert.doesNotMatch(route,/fetch\(|\.rpc\(|SYNTHETIC|audioContent|Deno|GET/);
});
test('registration alone cannot activate the trial without installed preview gates',async()=>{
 let auth=0;const handler=createZephyrNextWrapper(()=>({}),async()=>{auth++;throw Error('must not construct auth')});
 const response=await handler(new Request('https://synthetic.invalid/api/tts/once-28',{method:'POST'}));
 assert.equal(response.status,404);assert.equal(auth,0);
});
