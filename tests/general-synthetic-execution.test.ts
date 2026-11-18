import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGeneralSyntheticExecution,assertGeneralSyntheticWire,GENERAL_SYNTHETIC_QUESTION,GENERAL_SYNTHETIC_CAP} from '../lib/openai-session/general-synthetic-execution.ts';
import {GENERAL_MODEL_REFERENCE} from '../lib/openai-session/general-model-policy.ts';
import {readGeneralEnvironment} from '../lib/openai-session/general-environment-composition.ts';
test('synthetic default OFF and invalid inputs never reach auth DB credentials or provider',async()=>{
 let touched=0;const deps=new Proxy({now:()=>1000},{get(t,k){if(k==='now')return t.now;touched++;throw Error('UNEXPECTED_IO')}});
 const req=new Request('https://example.test');
 await assert.rejects(createGeneralSyntheticExecution({enabled:false,requestId:'x',expiresAt:2000},{} as any,deps as any)(req,{} as any,{}),/OPENAI_NOT_ACTIVATED/);
 await assert.rejects(createGeneralSyntheticExecution({enabled:true,requestId:'10000000-0000-4000-8000-000000000001',expiresAt:2000},{} as any,deps as any)(req,{} as any,{}),/SYNTHETIC_INPUT_REJECTED/);assert.equal(touched,0);
});
test('final wire rejects records or changed question and conservative cap is exact',()=>{
 const wire={model:GENERAL_MODEL_REFERENCE.model,max_completion_tokens:512,store:false,stream:false,service_tier:'default',reasoning_effort:'none',messages:[{role:'system',content:'fixed'},{role:'user',content:JSON.stringify({question:GENERAL_SYNTHETIC_QUESTION,recordSummary:'{}'})}]};
 assert.doesNotThrow(()=>assertGeneralSyntheticWire(JSON.stringify(wire)));
 for(const content of [JSON.stringify({question:GENERAL_SYNTHETIC_QUESTION,recordSummary:'private'}),JSON.stringify({question:'other',recordSummary:'{}'})])assert.throws(()=>assertGeneralSyntheticWire(JSON.stringify({...wire,messages:[wire.messages[0],{role:'user',content}]})));
 assert.equal(GENERAL_SYNTHETIC_CAP,400000*.75+512*4.5);
 const source=fs.readFileSync(new URL('../lib/openai-session/general-synthetic-execution.ts',import.meta.url),'utf8');assert.equal(source.includes('loadFreeAdviceContext'),false);assert.equal(source.includes('prepareGeneralProposal'),false);
});
test('publishable config accepted without legacy anon name; secret key rejected',()=>{
 const e={YEONI_OPENAI_GENERAL_ENABLED:'true',YEONI_OPENAI_DATABASE_URL:'postgresql://yeoni_openai_general_server.piqqukiiacncfbztktga:synthetic@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres',YEONI_OPENAI_DATABASE_HOST:'aws-0-ap-northeast-2.pooler.supabase.com',YEONI_OPENAI_SNAPSHOT_REVIEWED:'true',YEONI_OPENAI_GLOBAL_PRICING_REVIEWED:'true',YEONI_OPENAI_PRICE_VERIFIED_AT_MS:'1',YEONI_OPENAI_PRICE_EXPIRES_AT_MS:'2000',YEONI_OPENAI_BILLING_SCOPE:JSON.stringify({ownerId:'synthetic',budgetId:'synthetic',organization:'synthetic',project:'synthetic',creditVerifiedUntil:2000}),NEXT_PUBLIC_SUPABASE_URL:'https://piqqukiiacncfbztktga.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',YEONI_OPENAI_ALLOWED_ORIGIN:'https://example.test',YEONI_OPENAI_API_KEY:'synthetic-not-a-key'};
 assert.equal(readGeneralEnvironment(e,1000)?.supabase.publicKey,'sb_publishable_synthetic');assert.throws(()=>readGeneralEnvironment({...e,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_synthetic'},1000));
});

test('bound synthetic rejection occurs before all issuance writes (real binder, fake store)',async()=>{
 const {issueBoundGeneralGrant}=await import('../lib/openai-session/general-bound-issuance.ts');
 const {createConsentPreview}=await import('../lib/openai-session/advice-consent.ts');
 const {adviceFingerprint}=await import('../lib/openai-advice-server.ts');
 const now=1000;
 const d={ownerId:'synthetic-owner',sessionId:'synthetic-session',requestId:'10000000-0000-4000-8000-000000000001',feature:'conversation',provider:'openai',organization:'synthetic-org',project:'synthetic-project',model:GENERAL_MODEL_REFERENCE.model,question:GENERAL_SYNTHETIC_QUESTION,summary:'SYNTHETIC_PRIVATE_SENTINEL',contextRevision:'v1',includesHealthData:false,currency:'USD',maxCostMicros:GENERAL_SYNTHETIC_CAP,maxOutputTokens:512,quoteId:'synthetic-quote',pricingVersion:GENERAL_MODEL_REFERENCE.pricingVersion,expiresAt:2000} as const;
 const preview=createConsentPreview(d,now);
 const binding={epoch:7,grantId:'synthetic-grant',consentId:'synthetic-consent',approvalId:'synthetic-approval',budgetId:'synthetic-budget',consentFingerprint:preview.fingerprint,legacyFingerprint:adviceFingerprint({...d,epoch:7}),quoteExpiresAt:2000,creditVerifiedUntil:2000};
 let reads=0,writes=0,checks=0;
 const store={transaction:async(work:any)=>work({query:async(sql:string)=>{
  if(!/^\s*SELECT\b/.test(sql)){writes++;throw Error('UNEXPECTED_WRITE')}
  reads++;return {rows:[{disclosure:d,fingerprint:preview.fingerprint,budget_id:binding.budgetId,legacy_binding:binding}]};
 }})};
 await assert.rejects(issueBoundGeneralGrant(store,{request:{requestId:d.requestId,feature:d.feature,question:d.question},identity:{ownerId:d.ownerId,sessionId:d.sessionId,epoch:7},now,confirmation:{accepted:true,healthAccepted:false,requestId:d.requestId,fingerprint:preview.fingerprint},validateBoundGrant:g=>{checks++;assert.equal(g.summary,'SYNTHETIC_PRIVATE_SENTINEL');throw Error('SYNTHETIC_GRANT_REJECTED')}}),/SYNTHETIC_GRANT_REJECTED/);
 assert.equal(checks,1);assert.equal(reads,1);assert.equal(writes,0);
});

test('legacy service_role key is rejected, while legacy anon is accepted only as format guard',async()=>{
 const {isPublicSupabaseKey}=await import('../lib/openai-session/general-environment-composition.ts');
 const fake=(role:string)=>`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({role,ref:'synthetic-only'})).toString('base64url')}.synthetic-signature`;
 assert.equal(isPublicSupabaseKey(fake('service_role')),false);
 assert.equal(isPublicSupabaseKey(fake('authenticated')),false);
 assert.equal(isPublicSupabaseKey(fake('anon')),true);
 assert.equal(isPublicSupabaseKey('sb_secret_synthetic'),false);
});
