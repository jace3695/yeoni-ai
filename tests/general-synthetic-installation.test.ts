import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSyntheticInstallation,readSyntheticTrialConfig} from '../lib/openai-session/general-synthetic-installation.ts';
const now=1700000000000;
const trial={ownerId:'11111111-1111-4111-8111-111111111111',sessionId:'22222222-2222-4222-8222-222222222222',requestId:'33333333-3333-4333-8333-333333333333',expiresAt:now+300000,allowedOrigin:'https://example.test'};
const env=()=>({YEONI_OPENAI_SYNTHETIC_ENABLED:'true',YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(trial),YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'true',YEONI_OPENAI_SNAPSHOT_REVIEWED:'true'});
const req=()=>new Request('https://example.test/api/ai/openai-general-synthetic',{method:'POST'});
test('OFF and malformed or overlong configuration never compose or access IO',async()=>{
 const bad=[{}, {...env(),YEONI_OPENAI_SYNTHETIC_ENABLED:'false'}, {...env(),YEONI_OPENAI_SYNTHETIC_TRIAL:'oops'},...[
  {...trial,expiresAt:now},{...trial,expiresAt:now+300001},{...trial,ownerId:'other'},{...trial,allowedOrigin:'http://example.test'},{...trial,extra:true}
 ].map(x=>({...env(),YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(x)})),{...env(),YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'false'}];
 for(const e of bad){let n=0;const h=createSyntheticInstallation(e,()=>now,async()=>{n++;throw Error('never')});assert.equal((await h.POST(req())).status,503);assert.equal((await h.PREPARE(req())).status,503);assert.equal(n,0);}
});
test('private snapshot composes once across prepare/post and rechecks expiry before dispatch',async()=>{
 let time=now,loads=0,calls=0;const e=env();const h=createSyntheticInstallation(e,()=>time,async(c)=>{loads++;assert.equal(c.requestId,trial.requestId);return {available:true,POST:async()=>{calls++;return new Response('ok')},PREPARE:async()=>{calls++;return new Response('ok')}}});
 e.YEONI_OPENAI_SYNTHETIC_TRIAL='tampered';
 const result=await Promise.all([h.PREPARE(req()),h.POST(req())]);assert.deepEqual(result.map(x=>x.status),[200,200]);assert.equal(loads,1);assert.equal(calls,2);
 time=trial.expiresAt;assert.equal((await h.POST(req())).status,503);assert.equal(loads,1);assert.equal(calls,2);
});
test('composition failure fails closed without returning secret errors or automatically retrying',async()=>{
 let loads=0;const h=createSyntheticInstallation(env(),()=>now,async()=>{loads++;throw Error('secret-do-not-return')});
 for(let i=0;i<2;i++){const r=await h.POST(req());assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret-do-not-return/);}assert.equal(loads,1);
});
test('server routes both use same installed adapter; no browser-public trial variables',()=>{
 for(const p of ['../app/api/ai/openai-general-synthetic/route.ts','../app/api/ai/openai-general-synthetic/prepare/route.ts'])assert.match(readFileSync(new URL(p,import.meta.url),'utf8'),/INSTALLED_SYNTHETIC_SERVER/);
 assert.equal(readSyntheticTrialConfig({...env(),YEONI_OPENAI_SYNTHETIC_ENABLED:undefined,NEXT_PUBLIC_YEONI_OPENAI_SYNTHETIC_ENABLED:'true'},now),null);
});

test('authenticated session binding requires exact server-only alternative shape',()=>{
 const n=Date.now();const trial={ownerId:'10000000-0000-4000-8000-000000000002',requestId:'10000000-0000-4000-8000-000000000001',allowedOrigin:'https://synthetic.test',expiresAt:n+240000,sessionBinding:'authenticated'};
 const env={YEONI_OPENAI_SYNTHETIC_ENABLED:'true',YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED:'true',YEONI_OPENAI_SNAPSHOT_REVIEWED:'true',YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(trial)};
 assert.equal(readSyntheticTrialConfig(env,n)?.sessionBinding,'authenticated');
 for(const x of [{...trial,sessionBinding:undefined},{...trial,sessionBinding:'unknown'},{...trial,sessionId:'10000000-0000-4000-8000-000000000003'},{...trial,expiresAt:n},{...trial,expiresAt:n+300001}])assert.equal(readSyntheticTrialConfig({...env,YEONI_OPENAI_SYNTHETIC_TRIAL:JSON.stringify(x)},n),null);
});
