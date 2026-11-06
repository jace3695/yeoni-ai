// Local synthetic PGlite subprocess lifecycle only. No network or app connection.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const path=mkdtempSync(join(tmpdir(),'yeoni-process-proof-'));
const worker=`import {PGlite} from '@electric-sql/pglite';const db=new PGlite(process.argv[1]);console.log(JSON.stringify((await db.query('select version,state,claim,cost::text,answer from reply_local.receipts order by version')).rows));await db.close();`;
try {
 const db=new PGlite(path);await db.exec(readFileSync('docs/yeoni-durable-reply/schema.local.sql','utf8'));
 // Synthetic durable states representing interruption points, never real sends.
 await db.query(`insert into reply_local.receipts values
 ('fixture','diet','a','analysis','2026-11',100,null,'claimed-once','pending',null),
 ('fixture','diet','b','analysis','2026-11',100,null,'unknown-send','uncertain',null),
 ('fixture','diet','c','analysis','2026-11',100,null,'purged','deleted',null),
 ('fixture','diet','d','analysis','2026-11',100,100,'completed','done','{"mode":"mock","text":"synthetic only"}')`);
 await db.close();
 const p=spawnSync(process.execPath,['--input-type=module','-e',worker,path],{encoding:'utf8',timeout:60000});assert.equal(p.status,0,p.stderr);const rows=JSON.parse(p.stdout.trim());assert.deepEqual(rows.map(x=>x.state),['pending','uncertain','deleted','done']);assert.equal(rows[0].claim,'claimed-once');assert.equal(rows[2].answer,null);assert.equal(rows[3].answer.mode,'mock');
 console.log(JSON.stringify({passed:true,backend:'PGlite disk',processes:2,simultaneousConnections:1,crash:false,method:'clean close and fresh OS child process reopen; seeded interruption states, not SIGKILL',states:rows.map(x=>({state:x.state,claim:x.claim,cost:x.cost}))},null,2));
}finally{rmSync(path,{recursive:true,force:true});}
