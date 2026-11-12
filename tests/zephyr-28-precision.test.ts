import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {syntheticRequestCost} from './zephyr-28-fixtures.ts';
const now=1_800_000_000_000;
const schema=readFileSync('docs/zephyr-28-once/schema-draft.sql','utf8');
test('unchanged SQL rejects microsecond permit mismatch; normalized common timestamp preserves exact expiry and fifteen minutes',async()=>{
 assert.equal(createHash('sha256').update(schema).digest('hex'),'e336a20448194d09a1ba1f883c31915f3907d342da3eaa8c8f805f25cf4b384a');
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await db.exec(schema);
  for(const fraction of ['0.000001','0.000456','0.000999']){
   const r=await db.query<{original:boolean;aligned:boolean;shorter:boolean;duration:number}>(`WITH timing AS (
    SELECT to_timestamp($1::double precision/1000)+($3::numeric*interval '1 second') AS raw
   ), times AS (SELECT raw,date_trunc('milliseconds',raw) AS normalized FROM timing)
   SELECT public.zephyr_28_cost_valid(jsonb_set($2::jsonb,'{expiresAt}',to_jsonb(floor(extract(epoch from(raw+interval '15 minutes'))*1000))),$1::numeric,extract(epoch from(raw+interval '15 minutes'))*1000) AS original,
    public.zephyr_28_cost_valid(jsonb_set($2::jsonb,'{expiresAt}',to_jsonb((extract(epoch from(normalized+interval '15 minutes'))*1000)::bigint)),$1::numeric,extract(epoch from(normalized+interval '15 minutes'))*1000) AS aligned,
    public.zephyr_28_cost_valid(jsonb_set($2::jsonb,'{expiresAt}',to_jsonb((extract(epoch from(normalized+interval '15 minutes'))*1000)::bigint-1)),$1::numeric,extract(epoch from(normalized+interval '15 minutes'))*1000) AS shorter,
    extract(epoch from((normalized+interval '15 minutes')-normalized))::integer AS duration FROM times`,[now,JSON.stringify(syntheticRequestCost(now)),fraction]);
   assert.deepEqual(r.rows[0],{original:false,aligned:true,shorter:false,duration:900});
  }
  const template=readFileSync('docs/zephyr-28-once/approval-row-template.sql','utf8');
  const substitutions:Record<string,string|number>={owner_id:'11111111-1111-4111-8111-111111111111',evidence_ref:'synthetic:precision',tax_basis_ref:'synthetic:tax',fee_basis_ref:'synthetic:fee',price_checked_at_ms:now,tax_checked_at_ms:now,fee_checked_at_ms:now,reviewed_at_ms:now};
  const sql=template.replace(/:'([a-z_]+)'/g,(_,key)=>{assert.ok(key in substitutions,key);return "'"+String(substitutions[key]).replaceAll("'","''")+"'";}).replace('clock_timestamp()',`(to_timestamp(${now}/1000.0)+interval '0.000456 seconds')`);
  await assert.rejects(db.exec(sql.replaceAll("interval '15 minutes'","interval '15 minutes 0.001 seconds'")),/check constraint/);
  await db.exec('ROLLBACK');
  // Reproduce the original handoff's raw creation + floored evidence mismatch locally.
  const original=sql.replace("date_trunc('milliseconds', (to_timestamp(1800000000000/1000.0)+interval '0.000456 seconds'))", "(to_timestamp(1800000000000/1000.0)+interval '0.000456 seconds')")
   .replace("(extract(epoch from (created + interval '15 minutes'))*1000)::bigint", "floor(extract(epoch from (created + interval '15 minutes'))*1000)::bigint");
  assert.notEqual(original,sql);
  await db.exec(original);
  assert.deepEqual((await db.query('SELECT count(*)::integer AS rows FROM public.zephyr_28_once')).rows,[{rows:0}]);
  await db.exec(sql);
  const result=await db.query<{aligned:boolean;equality:boolean;duration:number;rows:number}>(`SELECT created_at=date_trunc('milliseconds',created_at) AS aligned,
   (cost_evidence->>'expiresAt')::numeric=extract(epoch from expires_at)*1000 AS equality,
   extract(epoch from(expires_at-created_at))::integer AS duration,
   (SELECT count(*)::integer FROM public.zephyr_28_once) AS rows FROM public.zephyr_28_once`);
  assert.deepEqual(result.rows,[{aligned:true,equality:true,duration:900,rows:1}]);
  await assert.rejects(db.exec(sql),/duplicate key/,'template cannot overwrite existing singleton');
 }finally{await db.close();}
});
