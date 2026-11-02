import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {validRequestCost} from '../lib/zephyr-28-cost.ts';
import {syntheticRequestCost} from './zephyr-28-fixtures.ts';
const now=1_800_000_000_000;
const malformed=[...['evidenceRef','taxBasisRef','feeBasisRef'].flatMap(key=>['valid-ref\n','\t\n','😀'.repeat(300),'with spaces','x'.repeat(501)].map(value=>({...syntheticRequestCost(now),[key]:value}))),null,{},true,{allInCapVerified:true},...Object.entries({schemaVersion:2,evidenceRef:'',approvalId:'other',requestId:'other',text:'other',voice:'other',encoding:'WAV',requests:2,unit:'byte',quantity:29,currency:'KRW',sku:'other',unitPriceMicrousd:31,priceSource:'https://other.invalid',priceCheckedAt:now+1,taxUpperMicrousd:null,taxBasisRef:'',taxCheckedAt:0,feeUpperMicrousd:-1,feeBasisRef:'',feeCheckedAt:now-86_400_001,additionalPaidCalls:1,maximumMicrousd:10001,reviewedAt:now+1,expiresAt:now}).map(([key,value])=>({...syntheticRequestCost(now),[key]:value})),
 {...syntheticRequestCost(now),taxUpperMicrousd:9161}, {...syntheticRequestCost(now),taxUpperMicrousd:0.1}, {...syntheticRequestCost(now),feeUpperMicrousd:10000},
 {...syntheticRequestCost(now),taxUpperMicrousd:'84'}, {...syntheticRequestCost(now),expiresAt:now+86_400_001}];
test('request-scoped microUSD validation requires matching units/SKU/tax/fees/evidence times; boolean/subtotal alone never grants',()=>{
 assert.equal(validRequestCost(syntheticRequestCost(now),now,now+300_000),true);
 assert.equal(validRequestCost({...syntheticRequestCost(now),taxUpperMicrousd:9160},now),true);
 for(const value of malformed)assert.equal(validRequestCost(value,now),false,JSON.stringify(value));
 assert.equal(validRequestCost(syntheticRequestCost(now),now,now+600_001),false);
});
test('actual SQL applies the same request-scoped evidence checks, no global-cap boolean',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(readFileSync('docs/zephyr-28-once/schema-draft.sql','utf8'));
 for(const value of [syntheticRequestCost(now),...malformed]){
 const r=await db.query<{valid:boolean}>('select public.zephyr_28_cost_valid($1::jsonb,$2,$3) valid',[JSON.stringify(value),now,now+300_000]);
 assert.equal(r.rows[0].valid,validRequestCost(value,now,now+300_000),JSON.stringify(value));
 }
 }finally{await db.close()}
});
