import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import Reporter from './reporter.mjs';
import { accepted, diagnosticLines, validReceipt, titles, sources, project, command } from './manifest.mjs';

const root = new URL('../../', import.meta.url);
test('diet config differs only in exact test selection, reporter, project and output directory', () => {
  let original = readFileSync(new URL('playwright.chromium-smoke.config.ts', root), 'utf8');
  original = original.replace(/^  testMatch: .*$/m, "  testMatch: ['diet-protein-response.spec.ts', 'japanese-application-plan.spec.ts', 'safety-ux-followup.spec.ts'],")
    .replace("[['./tests/e2e/reporter.ts']]", "[['./scripts/isolated-diet-regression/reporter.mjs']]")
    .replace('.e2e/chromium-smoke-output','.e2e/diet-regression-output').replaceAll('chromium-app-smoke','chromium-diet-regression');
  assert.equal(readFileSync(new URL('playwright.diet-regression.config.ts', root),'utf8'),original);
  assert.equal(command,'node node_modules/@playwright/test/cli.js test --config playwright.diet-regression.config.ts --project chromium-diet-regression');
});
test('new test is the reviewed immutable source, not weakened assertions', () => {
  const bytes=readFileSync(new URL('tests/e2e/diet-protein-response.spec.ts',root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'5f881b011c7df4e44bcf6eb15a0117d70ed7980a068ef67beeb48a0e94ff62f3');
});
function run({ status='passed', cleanup=true, retry=0, count=7, duplicate=false, blocked=false, testStatus='passed', wrongSource=false }={}) {
  const dir=mkdtempSync(join(tmpdir(),'diet-reporter-test-')); const path=join(dir,'receipt.json');
  const oldFile=process.env.YEONI_DIET_RECEIPT_FILE, oldToken=process.env.YEONI_DIET_RECEIPT_TOKEN;
  process.env.YEONI_DIET_RECEIPT_FILE=path; process.env.YEONI_DIET_RECEIPT_TOKEN='a'.repeat(64);
  try {
    const r=new Reporter();
    const cases=titles.slice(0,count).map((title,i)=>({ id:String(i),title,location:{file:wrongSource ? 'other.spec.ts' : sources[title]},parent:{project:()=>({name:project})},retries:0,repeatEachIndex:0,expectedStatus:'passed' }));
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
test('only exactly seven passed and cleaned results pass',()=>assert.equal(run(),true));
for(const [label,options] of Object.entries({partial:{count:6},previousFourOnly:{count:4},dietOnly:{count:2},wrongSource:{wrongSource:true},missingCleanup:{cleanup:false},skipped:{testStatus:'skipped'},flakyRetry:{retry:1},duplicateCleanup:{duplicate:true},external:{blocked:true},interrupted:{status:'interrupted'}})) {
  test(`reporter rejects ${label}`,()=>assert.equal(run(options),false));
}
test('receipt rejects stale token, unexpected fields and missing cleanup',()=>{
  const good={token:'a',status:'passed',total:7,passed:7,cleaned:7,cases:Array.from({length:7},(_,i)=>({index:i+1,status:1,cleanup:1,stage:0}))};
  assert.equal(accepted(good,'b'),false);assert.equal(accepted({...good,extra:true},'a'),false);assert.equal(accepted({...good,cleaned:1},'a'),false);
});

test('application regression source is pinned without changing the original diet source pin',()=>{
  assert.equal(createHash('sha256').update(readFileSync(new URL('tests/e2e/japanese-application-plan.spec.ts',root))).digest('hex'),'245106aea8b56f36a831cc9204db4bf55393949afc9d26b74d926382669f630a');
});

test('safety UX regression source is pinned without changing previous four cases',()=>{
  assert.equal(createHash('sha256').update(readFileSync(new URL('tests/e2e/safety-ux-followup.spec.ts',root))).digest('hex'),'e748d63661f04f85b25d8f1a67e631a4e7574d256a5960c0c0c47b92ba6ba7fc');
});

test('numeric diagnostics never expose arbitrary strings or upgrade failure',()=>{
  const report={token:'x',status:'failed',total:7,passed:6,cleaned:7,cases:Array.from({length:7},(_,i)=>({index:i+1,status:i===4?2:1,cleanup:1,stage:0}))};
  assert.equal(validReceipt(report,'x'),true);assert.equal(accepted(report,'x'),false);
  const lines=diagnosticLines(report,'x');assert.equal(lines.length,7);assert.equal(lines[4],'regression-case index=5 status=2 cleanup=1 stage=0');
  for(const line of lines)assert.match(line,/^regression-case index=[1-7] status=[0-6] cleanup=[01] stage=[0-9]{1,2}$/);
  for(const bad of [{...report,token:'wrong'},{...report,error:'PRIVATE_STRING'}, {...report,cases:[...report.cases.slice(0,6)]}, {...report,cases:report.cases.map(x=>({...x,status:'PRIVATE_STRING'}))}]) {
    assert.deepEqual(diagnosticLines(bad,'x'),['regression-cases receipt=unverified']);assert.equal(accepted(bad,'x'),false);
  }
  assert.deepEqual(diagnosticLines(undefined,'x'),['regression-cases receipt=unverified']);
});

// Remove only inert, closed numeric checkpoints: every original assertion/action must remain byte-identical.
test('checkpoints preserve the complete reviewed seven-case source',()=>{
  const source=readFileSync(new URL('tests/e2e/safety-ux-followup.spec.ts',root),'utf8');
  const original=source.replace(/  \/\/ BEGIN fixed preservation diagnostics: additional assertions only\n[\s\S]*?  \/\/ END fixed preservation diagnostics\n/,'').replace(/^  await test\.step\('QA_STAGE_[0-9]{2}', async \(\) => \{\}\);\n/gm,'').replace("  preserved(saved);\n  qa.traffic.assertConfirmed(saved);", "  preserved(saved); qa.traffic.assertConfirmed(saved);").replace("async()=>{const raw=(await qa.readLanguage()).dailyLearningHistory;return raw===undefined?undefined:JSON.parse(raw as string)[day]?.completedIds;}","async()=>JSON.parse((await qa.readLanguage()).dailyLearningHistory as string)[day]?.completedIds").replace("expect(row(restored)).toEqual({...row(saved),foamRollerAreas:[]});","expect(row(restored)).toEqual(row(saved));");
  assert.equal(createHash('sha256').update(original).digest('hex'),'758e67f6bd1f36012bdbc7756df8ac1109eef1c8af0dac8eb299d8ebbd78d397');
});
test('step diagnostics accept only sequential bounded numeric checkpoints on the two selected cases',()=>{
  const r=new Reporter(), t={title:titles[4]};
  for(const title of ['PRIVATE_STRING','QA_STAGE_01 PRIVATE_STRING','https://example.invalid'])r.onStepEnd(t,{}, {category:'test.step',title});
  assert.equal(r.stages[4],0);
  r.onStepEnd(t,{}, {category:'test.step',title:'QA_STAGE_01'});assert.equal(r.stages[4],1);
  r.onStepEnd({title:titles[0]}, {}, {category:'test.step',title:'QA_STAGE_01'});assert.equal(r.stages[0],0);
  r.onStepEnd(t,{}, {category:'test.step',title:'QA_STAGE_03'});assert.equal(r.invalid,true);assert.equal(r.stages[4],1);
});

test('stage receipt rejects missing, out-of-range and nonnumeric stage data',()=>{
  const report={token:'x',status:'failed',total:7,passed:6,cleaned:7,cases:Array.from({length:7},(_,i)=>({index:i+1,status:i===4?2:1,cleanup:1,stage:0}))};
  for(const stage of [-1,56,1.5,'PRIVATE_STRING',null,undefined]) {
    const bad={...report,cases:report.cases.map((item,index)=>index===4?{...item,stage}:item)};
    assert.deepEqual(diagnosticLines(bad,'x'),['regression-cases receipt=unverified']);assert.equal(accepted(bad,'x'),false);
  }
  assert.equal(validReceipt({...report,cases:report.cases.map((item,index)=>index===6?{...item,stage:24}:item)},'x'),false);
  assert.equal(validReceipt({...report,cases:report.cases.map((item,index)=>index===0?{...item,stage:1}:item)},'x'),false);
});
