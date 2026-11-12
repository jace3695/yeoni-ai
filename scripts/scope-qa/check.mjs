import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const output='/tmp/yeoni-scope-evidence';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'});
await context.addInitScript(() => {
 window.__spoken=[];window.__microphone=0;
 window.SpeechSynthesisUtterance=class { constructor(text){this.text=text;} };
 Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'Synthetic Japanese',lang:'ja-JP',localService:true}],cancel:()=>{},speak:u=>{window.__spoken.push({text:u.text,lang:u.lang});u.onstart?.();setTimeout(()=>u.onend?.(),50);},addEventListener:()=>{},removeEventListener:()=>{}}});
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>{window.__microphone++;throw Error('No microphone in reference listening');}}});
});
const page=await context.newPage();const errors=[],blocked=[];
page.on('pageerror',error=>errors.push(error.message));
await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:8873'?route.continue():(blocked.push(route.request().url()),route.abort()));
const origin='http://127.0.0.1:8873';
const evidence=[];
try {
 await page.goto(origin+'/growth');
 await page.getByText('아직 활동이 없어요.',{exact:false}).waitFor();
 await page.getByLabel('활동 이름').fill('합성 독서');
 await page.getByRole('button',{name:'활동 추가',exact:true}).click();
 await page.getByText('활동을 추가했어요.',{exact:true}).waitFor();
 let item=page.locator('li').filter({hasText:'합성 독서'});
 await item.getByRole('checkbox').click();
 await page.getByText('완료로 저장했어요.',{exact:false}).waitFor();
 await page.reload();await item.getByRole('checkbox').waitFor();assert.equal(await item.getByRole('checkbox').isChecked(),true);
 await item.getByRole('button',{name:'수정',exact:true}).click();
 await page.getByLabel('활동 이름').fill('합성 독서 수정');
 const weekday=await page.evaluate(()=>new Date().getDay()||7);
 const dayBoxes=page.getByRole('group',{name:'진행할 요일 · 하나 이상 선택'}).getByRole('checkbox');
 for(let index=0;index<7;index++) if(index+1!==weekday) await dayBoxes.nth(index).uncheck();
 await page.getByRole('button',{name:'수정 저장'}).click();
 await page.getByText('활동을 수정했어요.',{exact:false}).waitFor();
 item=page.locator('li').filter({hasText:'합성 독서 수정'});assert.equal(await item.getByRole('checkbox').isChecked(),true);
 await item.getByRole('button',{name:'보관',exact:true}).click();
 await page.getByText('보관했어요.',{exact:false}).waitFor();
 await page.getByText('보관한 활동 (1)',{exact:true}).click();
 await page.getByRole('button',{name:'복원',exact:true}).click();
 await page.getByText('활동을 복원했어요.',{exact:true}).waitFor();assert.equal(await item.getByRole('checkbox').isChecked(),true);
 await item.getByRole('checkbox').click();await page.getByText('완료 체크를 해제했어요.',{exact:false}).waitFor();
 await page.reload();await item.getByRole('checkbox').waitFor();assert.equal(await item.getByRole('checkbox').isChecked(),false);
 await page.evaluate(()=>localStorage.setItem('scope-qa-fail-write','1'));
 await item.getByRole('checkbox').click();
 await page.getByText('저장하지 못했어요.',{exact:false}).waitFor();
 assert.equal(await item.getByRole('checkbox').isChecked(),false);
 await page.evaluate(()=>localStorage.setItem('scope-qa-fail-refresh','1'));
 await item.getByRole('checkbox').click();
 await page.getByText('클라우드 기록을 모두 불러오지 못했어요.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();
 await item.getByRole('checkbox').waitFor();assert.equal(await item.getByRole('checkbox').isChecked(),true);
 await item.getByRole('checkbox').click();await page.getByText('완료 체크를 해제했어요.',{exact:false}).waitFor();
 evidence.push('Synthetic failed write preserves unchecked state; committed write plus failed refresh displays error, retry recovers saved state');
 const rows=await page.evaluate(()=>JSON.parse(localStorage.getItem('scope-qa-synthetic-database')));
 assert.deepEqual(rows.growth_routines[0].preferred_days,[weekday]);
 assert.equal(rows.growth_sessions.length,1);assert.equal(rows.growth_sessions[0].status,'stopped');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:output+'/growth-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:output+'/growth-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 evidence.push('390px actual GrowthPage + useGrowthData with synthetic client: create, check, reload, rename + weekday edit, archive, restore, uncheck, reload; one retained session; no horizontal overflow');
 for(const route of ['/growth/typing','/growth/typing/basics','/growth/drawing','/language/practice','/language/conversation','/language/speaking']) {
  await page.goto(origin+route);await page.getByRole('heading',{name:'이 연습은 종료했어요'}).waitFor();
 }
 evidence.push('RetiredPractice component rendered on synthetic retired route map (not Next router/AuthGate)');
 await page.goto(origin+'/language');await page.getByRole('heading',{name:'글자부터 문장까지'}).waitFor();
 assert.equal(await page.locator('a[href*="conversation"],a[href*="speaking"],a[href*="practice"]').count(),0);
 await page.screenshot({path:output+'/language-mobile.png',fullPage:true});
 for(const route of ['/language/kana','/language/words','/language/grammar']) {
  await page.goto(origin+route);await page.waitForTimeout(300);
  evidence.push(route+': '+(await page.locator('h1').allTextContents()).join(', '));
  if(route.endsWith('/kana')) {
   await page.getByRole('button',{name:'あ 발음 듣기',exact:true}).click();
   await page.waitForFunction(()=>window.__spoken.length===1);
   await page.getByRole('button',{name:'가타카나',exact:true}).click();
   await page.getByRole('button',{name:'ア 발음 듣기',exact:true}).press('Enter');
   await page.waitForFunction(()=>window.__spoken.length===2);
  } else {
   if(route.endsWith('/grammar')) await page.getByRole('button',{name:'예문으로 확인하기'}).click();
   await page.getByRole('button',{name:route.endsWith('/words')?'🔊 단어 듣기':'예문 듣기',exact:true}).first().click();
   await page.waitForFunction(()=>window.__spoken.length===1);
  }
  assert.equal(await page.evaluate(()=>window.__microphone),0);
  assert.equal(await page.evaluate(()=>window.__spoken.every(item=>item.lang==='ja-JP')),true);
  await page.screenshot({path:output+'/'+route.split('/').at(-1)+'-mobile.png',fullPage:true});
 }
 evidence.push('Hiragana, katakana, word and grammar example buttons dispatch ja-JP to synthetic SpeechSynthesis; zero microphone requests');
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 writeFileSync(output+'/result.json',JSON.stringify({status:'passed',evidence,errors,blocked,limits:['Synthetic client, not hosted auth/RLS or live data','Chromium desktop engine at 390px, not physical iPhone','No actual audio quality assessment']},null,2));
 console.log(JSON.stringify({status:'passed',evidence}));
} catch (error) { console.log(JSON.stringify({errors,blocked,text:await page.locator("body").innerText()})); throw error; } finally { await browser.close(); }
