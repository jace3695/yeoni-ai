import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createGeneralSyntheticServer,composeGeneralSyntheticServer} from '../lib/openai-session/general-synthetic-server.ts';
import {GENERAL_SYNTHETIC_QUESTION} from '../lib/openai-session/general-synthetic-execution.ts';
const base={enabled:true,snapshotRaceAccepted:true,configurationReviewed:true,requestId:'10000000-0000-4000-8000-000000000001',ownerId:'10000000-0000-4000-8000-000000000002',sessionId:'10000000-0000-4000-8000-000000000003',expiresAt:2000,allowedOrigin:'https://synthetic.test'};
const request=(body:unknown)=>new Request('https://synthetic.test/api/ai/openai-general-synthetic/prepare',{method:'POST',headers:{origin:'https://synthetic.test','content-type':'application/json'},body:JSON.stringify(body)});
test('OFF and missing explicit reviews do not access environment/driver/dependencies',async()=>{
 const poison=new Proxy({},{get(){throw Error('unexpected access')}});
 for(const c of [{...base,enabled:false},{...base,snapshotRaceAccepted:false},{...base,configurationReviewed:false}]){
  const h=createGeneralSyntheticServer(c,{} as any,poison as any);assert.equal((await h.PREPARE(request({}))).status,503);
  assert.equal((await composeGeneralSyntheticServer(c,poison as any)).available,false);
 }
});
test('scope and real questions denied before auth or database',async()=>{
 let touched=0;const h=createGeneralSyntheticServer(base,{} as any,{now:()=>1000,createClient:async()=>{touched++;throw Error('unreachable')}} as any);
 for(const body of [{feature:'conversation',question:'real record question',scope:'synthetic'},{feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'fitness'}])assert.equal((await h.PREPARE(request(body))).status,503);
 assert.equal(touched,0);
});
test('routes use opt-in installation and server contains no product record aggregator',()=>{
 const s=fs.readFileSync(new URL('../lib/openai-session/general-synthetic-server.ts',import.meta.url),'utf8');
 for(const x of ['loadFreeAdviceContext','loadFreeAdviceRecords','.from('])assert.equal(s.includes(x),false);
 for(const path of ['../app/api/ai/openai-general-synthetic/route.ts','../app/api/ai/openai-general-synthetic/prepare/route.ts'])assert.match(fs.readFileSync(new URL(path,import.meta.url),'utf8'),/INSTALLED_SYNTHETIC_SERVER/);
});
test('invalid fixed scope fails before client/store or env',async()=>{
 const poison=new Proxy({},{get(){throw Error('unexpected env')}});
 const deps={now:()=>1000} as any;
 for(const c of [{...base,requestId:'bad'},{...base,expiresAt:NaN},{...base,expiresAt:301001},{...base,allowedOrigin:'http://synthetic.test'}]){
  assert.equal(createGeneralSyntheticServer(c,{} as any,deps).available,false);
  assert.equal((await composeGeneralSyntheticServer(c,poison as any,()=>1000)).available,false);
 }
});
test('authenticated different owner cannot register session or access ledger',async()=>{
 let writes=0;
 const client={auth:{getUser:async()=>({data:{user:{id:'10000000-0000-4000-8000-000000000099',is_anonymous:false}},error:null}),getClaims:async()=>({data:{claims:{sub:'10000000-0000-4000-8000-000000000099',session_id:base.sessionId,role:'authenticated',is_anonymous:false,exp:9999999999}},error:null})}};
 const h=createGeneralSyntheticServer(base,{} as any,{now:()=>1000,createClient:async()=>client,store:{transaction:()=>{writes++;throw Error('unreachable')}}} as any);
 assert.equal((await h.PREPARE(request({feature:'conversation',question:GENERAL_SYNTHETIC_QUESTION,scope:'synthetic'}))).status,503);assert.equal(writes,0);
});
