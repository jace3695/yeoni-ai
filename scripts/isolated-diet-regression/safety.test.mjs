import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import Reporter from './reporter.mjs';
import { accepted, titles, source, project, command } from './manifest.mjs';

const root = new URL('../../', import.meta.url);
test('diet config differs only in exact test selection, reporter, project and output directory', () => {
  let original = readFileSync(new URL('playwright.chromium-smoke.config.ts', root), 'utf8');
  original = original.replace(/^  testMatch: .*$/m, "  testMatch: ['diet-protein-response.spec.ts'],")
    .replace("[['./tests/e2e/reporter.ts']]", "[['./scripts/isolated-diet-regression/reporter.mjs']]")
    .replace('.e2e/chromium-smoke-output','.e2e/diet-regression-output').replaceAll('chromium-app-smoke','chromium-diet-regression');
  assert.equal(readFileSync(new URL('playwright.diet-regression.config.ts', root),'utf8'),original);
  assert.equal(command,'node node_modules/@playwright/test/cli.js test --config playwright.diet-regression.config.ts --project chromium-diet-regression');
});
test('new test is the reviewed immutable source, not weakened assertions', () => {
  const bytes=readFileSync(new URL('tests/e2e/diet-protein-response.spec.ts',root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'5f881b011c7df4e44bcf6eb15a0117d70ed7980a068ef67beeb48a0e94ff62f3');
});
function run({ status='passed', cleanup=true, retry=0, count=2, duplicate=false, blocked=false, testStatus='passed' }={}) {
  const dir=mkdtempSync(join(tmpdir(),'diet-reporter-test-')); const path=join(dir,'receipt.json');
  const oldFile=process.env.YEONI_DIET_RECEIPT_FILE, oldToken=process.env.YEONI_DIET_RECEIPT_TOKEN;
  process.env.YEONI_DIET_RECEIPT_FILE=path; process.env.YEONI_DIET_RECEIPT_TOKEN='a'.repeat(64);
  try {
    const r=new Reporter();
    const cases=titles.slice(0,count).map((title,i)=>({ id:String(i),title,location:{file:source},parent:{project:()=>({name:project})},retries:0,repeatEachIndex:0,expectedStatus:'passed' }));
    r.onBegin({workers:1,forbidOnly:true},{allTests:()=>cases});
    for(const t of cases){
      if(cleanup){const text='QA_CLEANUP '+JSON.stringify({title:t.title,accountsRemoved:1,rowsRemaining:0,storageFilesRemoved:0,blockedOrigins:blocked?['https://example.invalid']:[],realResponses:3})+'\n';r.onStdOut(text.slice(0,10),t);r.onStdOut(text.slice(10),t);if(duplicate)r.onStdOut(text,t);}
      r.onTestEnd(t,{status:testStatus,retry,errors:[]});
    }
    const result=r.onEnd({status}); const report=JSON.parse(readFileSync(path,'utf8'));
    return result.status==='passed' && accepted(report,'a'.repeat(64));
  } finally {
    if(oldFile===undefined)delete process.env.YEONI_DIET_RECEIPT_FILE;else process.env.YEONI_DIET_RECEIPT_FILE=oldFile;
    if(oldToken===undefined)delete process.env.YEONI_DIET_RECEIPT_TOKEN;else process.env.YEONI_DIET_RECEIPT_TOKEN=oldToken;
    rmSync(dir,{recursive:true,force:true});
  }
}
test('only exactly two passed and cleaned results pass',()=>assert.equal(run(),true));
for(const [label,options] of Object.entries({partial:{count:1},missingCleanup:{cleanup:false},skipped:{testStatus:'skipped'},flakyRetry:{retry:1},duplicateCleanup:{duplicate:true},external:{blocked:true},interrupted:{status:'interrupted'}})) {
  test(`reporter rejects ${label}`,()=>assert.equal(run(options),false));
}
test('receipt rejects stale token, unexpected fields and missing cleanup',()=>{
  const good={token:'a',status:'passed',total:2,passed:2,cleaned:2};
  assert.equal(accepted(good,'b'),false);assert.equal(accepted({...good,extra:true},'a'),false);assert.equal(accepted({...good,cleaned:1},'a'),false);
});
