import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { WORK_WRITING_UNITS, WORK_MESSAGE } from '../../data/workWriting.ts';
const output='/tmp/yeoni-work-evidence';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(()=>{
 window.__spoken=[];window.__microphone=0;
 window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'Synthetic Japanese',lang:'ja-JP',localService:true}],cancel:()=>{},speak:u=>{window.__spoken.push({text:u.text,lang:u.lang});u.onstart?.();setTimeout(()=>u.onend?.(),30);},addEventListener:()=>{},removeEventListener:()=>{}}});
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>{window.__microphone++;throw Error('No microphone');}}});
});
const page=await context.newPage(), errors=[], external=[], proof=[];
page.on('pageerror',error=>errors.push(error.message));
const origin='http://127.0.0.1:8873';
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external.push(route.request().url()),route.abort()));
const oldRecords=[{lessonId:'ga-particle',correctCount:3,lastResult:'correct'},{lessonId:'time-on-hour',wrongCount:2,lastResult:'wrong'}];
try{
 await page.goto(origin+'/language/grammar');
 await page.evaluate(rows=>{localStorage.setItem('grammarProgress',JSON.stringify(rows));localStorage.setItem('language-cloud-sync-user','synthetic-A');localStorage.setItem('language-cloud-sync-epoch','1');},oldRecords);
 await page.reload();await page.getByLabel('추천 학습 순서').selectOption('travel-consolidation');await page.getByRole('button',{name:'내부 업무 글 응용 시작하기'}).click();
 await page.getByText('가상 업무 연습 · 실제로 전송되지 않아요.',{exact:true}).waitFor();
 for(const [index,unit] of WORK_WRITING_UNITS.entries()){
  await page.getByLabel('업무 응용 선택').selectOption(String(index));
  assert.equal(await page.getByRole('button',{name:'예문 듣기',exact:true}).count(),2);
  for(const task of unit.tasks)assert.ok((await page.locator('body').innerText()).includes(task.reading));
  await page.getByRole('button',{name:'예문을 가리고 직접 써 보기'}).click();
  const regions=page.getByRole('region',{name:'직접 써 보기',exact:true});
  for(const [i,task] of unit.tasks.entries()){
   const region=regions.nth(i);assert.equal(await region.getByRole('button',{name:'쓴 답 확인'}).isDisabled(),true);
   const input=task.answers.at(-1)+(task.questionInput?'？':task.sentenceInput?'。':'');
   await region.getByRole('textbox').fill(input);await region.getByRole('button',{name:'쓴 답 확인'}).click();await region.getByText('맞게 썼어요.',{exact:true}).waitFor();
   const count=await page.evaluate(()=>window.__spoken.length);await region.getByRole('button',{name:'완성 문장 듣기'}).click();await page.waitForFunction(count=>window.__spoken.length>count,count);
   assert.equal(await page.evaluate(()=>window.__spoken.at(-1).text),task.answers.at(-1)+task.after);
   await region.getByRole('radio').first().check();await region.getByRole('button',{name:'도움 없이 다시 쓰기'}).click();assert.equal(await region.getByRole('button',{name:'도움말 보기'}).getAttribute('aria-expanded'),'false');
   await region.getByRole('textbox').fill('<secret synthetic input>');await region.getByRole('button',{name:'쓴 답 확인'}).click();await region.getByText('이번 연습의 예시 답과 비교해 보세요.',{exact:true}).waitFor();
   const before=await page.evaluate(()=>window.__spoken.length);await region.getByRole('button',{name:'완성 문장 듣기'}).click();await page.waitForFunction(before=>window.__spoken.length>before,before);assert.equal(await page.evaluate(()=>window.__spoken.at(-1).text),task.result);
   await region.getByRole('textbox').fill(task.answers[0]);await region.getByRole('button',{name:'쓴 답 확인'}).click();
   proof.push({id:task.id,input,reading:task.reading,safeFallback:task.result});
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/'+unit.id+'-mobile.png',fullPage:true});
 }
 await page.getByRole('button',{name:'통합 읽기로 이어가기'}).click();await page.getByRole('article',{name:'통합 읽기',exact:true}).waitFor();
 assert.ok((await page.locator('body').innerText()).includes(WORK_MESSAGE.explanation));
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'본문 듣기'}).click();await page.waitForFunction(body=>window.__spoken.at(-1)?.text===body,WORK_MESSAGE.body);
 await page.screenshot({path:output+'/integration-mobile.png',fullPage:true});await page.setViewportSize({width:768,height:1024});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/integration-tablet.png',fullPage:true});
 await page.evaluate(()=>{localStorage.setItem('language-cloud-sync-user','synthetic-B');window.dispatchEvent(new Event('yeoni-cloud-session-changed'));});
 await page.getByLabel('업무 응용 선택').selectOption('reading');assert.equal(await page.getByRole('checkbox').isChecked(),false);
 await page.getByLabel('업무 응용 선택').selectOption('0');await page.getByRole('button',{name:'직접 쓰기',exact:true}).click();assert.equal(await page.getByRole('textbox').first().inputValue(),'');
 await page.getByRole('textbox').first().fill('確認します');await page.evaluate(()=>{localStorage.setItem('language-cloud-sync-epoch','2');window.dispatchEvent(new StorageEvent('storage',{key:'language-cloud-sync-epoch'}));});await page.getByRole('button',{name:'직접 쓰기',exact:true}).click();assert.equal(await page.getByRole('textbox').first().inputValue(),'');
 await page.getByRole('textbox').first().fill('確認します');await page.evaluate(()=>{localStorage.setItem('language-cloud-sync-epoch','3');window.dispatchEvent(new Event('focus'));});await page.getByRole('button',{name:'직접 쓰기',exact:true}).click();assert.equal(await page.getByRole('textbox').first().inputValue(),'');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('grammarProgress'))),oldRecords);
 await page.reload();await page.getByLabel('추천 학습 순서').selectOption('work-writing');await page.getByRole('button',{name:'직접 쓰기',exact:true}).click();assert.equal(await page.getByRole('textbox').first().inputValue(),'');
 for(const stage of ['foundation','bridge','travel']){await page.getByLabel('추천 학습 순서').selectOption(stage);assert.equal(await page.getByLabel('배울 문법').locator('option').count(),stage==='foundation'?12:stage==='bridge'?7:6);}
 assert.equal(await page.evaluate(()=>window.__microphone),0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(output+'/browser-result.json',JSON.stringify({passed:true,proof,units:5,inputs:10,integration:1,sessionStorageFocusResets:true,historyPreserved:true,microphone:0,errors,external,scope:'actual components with synthetic local owner/audio; no hosted account or physical device verification'},null,2));
}finally{await browser.close();}
