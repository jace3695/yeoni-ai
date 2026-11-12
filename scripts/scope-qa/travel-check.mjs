import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const output='/tmp/yeoni-travel-evidence';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(()=>{
 window.__spoken=[];window.__microphone=0;
 window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'Synthetic Japanese',lang:'ja-JP',localService:true}],cancel:()=>{},speak:u=>{window.__spoken.push({text:u.text,lang:u.lang});u.onstart?.();setTimeout(()=>u.onend?.(),50);},addEventListener:()=>{},removeEventListener:()=>{}}});
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>{window.__microphone++;throw Error('No microphone');}}});
});
const page=await context.newPage(),errors=[],proof=[];
page.on('pageerror',error=>errors.push(error.message));
const origin='http://127.0.0.1:8873';
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const oldRecords=[{lessonId:'ga-particle',correctCount:3,wrongCount:1,lastResult:'correct'},{lessonId:'ga-suki',correctCount:1,wrongCount:2,lastResult:'wrong'},{lessonId:'desu',correctCount:2,wrongCount:0,lastResult:'correct'}];
const cases=[
 ['time-on-hour','よじ','４時','今，９時です。','今、きゅうじです','今,9時です。'],
 ['price-yen','엔','いくら','百えんです。','1000円です','百えんです。'],
 ['place-arimasu','ここに本があります','に','そこにほんがあります。','そこでほんがあります','そこにほんがあります。'],
 ['place-imasu','店員がいます','います','ここにねこがいます。','ここにねこがあります','ここにねこがいます。'],
 ['noun-kudasai','本をください','を','ぱんをください。','パンにください','ぱんをください。'],
 ['quantity-hitotsu','みっつ','２つ','蜜柑を３つください。','みかんをみつください','蜜柑を3つください。'],
];
try{
 await page.goto(origin+'/language/grammar');await page.evaluate(rows=>localStorage.setItem('grammarProgress',JSON.stringify(rows)),oldRecords);await page.reload();
 assert.equal(await page.getByLabel('배울 문법').locator('option').count(),12);
 await page.getByLabel('추천 학습 순서').selectOption('bridge');assert.equal(await page.getByLabel('배울 문법').locator('option').count(),7);
 await page.getByLabel('추천 학습 순서').selectOption('travel');
 assert.deepEqual(await page.getByLabel('배울 문법').locator('option').evaluateAll(options=>options.map(option=>option.value)),cases.map(item=>item[0]));
 await page.getByLabel('배울 문법').selectOption('price-yen');await page.getByRole('button',{name:'이전 문법 보기'}).click();assert.equal(await page.getByLabel('배울 문법').inputValue(),'time-on-hour');
 for(const [id,choice,first,second,wrong,spoken] of cases){
  await page.getByLabel('배울 문법').selectOption(id);
  await page.getByRole('button',{name:'2. 예문',exact:true}).click();assert.equal(await page.getByRole('button',{name:'예문 듣기',exact:true}).count(),2);
  await page.getByRole('button',{name:'3. 연습',exact:true}).click();await page.getByRole('button',{name:choice,exact:false}).last().click();
  assert.equal(await page.getByRole('button',{name:'쓴 답 확인'}).isDisabled(),true);
  await page.getByRole('textbox').fill(first);await page.getByRole('button',{name:'쓴 답 확인'}).click();await page.getByText('맞게 썼어요.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'다른 예문으로 다시 써 보기'}).click();assert.equal(await page.getByRole('button',{name:'도움말 보기'}).getAttribute('aria-expanded'),'false');
  await page.getByRole('textbox').fill(wrong);await page.getByRole('button',{name:'쓴 답 확인'}).click();await page.getByText('이번 연습의 예시 답과 비교해 보세요.',{exact:true}).waitFor();
  await page.getByRole('textbox').fill(second);await page.getByRole('button',{name:'쓴 답 확인'}).click();await page.getByText('맞게 썼어요.',{exact:true}).waitFor();
  const before=await page.evaluate(()=>window.__spoken.length);await page.getByRole('button',{name:'완성 문장 듣기'}).click();await page.waitForFunction(before=>window.__spoken.length>before,before);
  assert.deepEqual(await page.evaluate(()=>window.__spoken.at(-1)),{text:spoken,lang:'ja-JP'});
  assert.equal(await page.evaluate(()=>window.__microphone),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:output+'/'+id+'-mobile.png',fullPage:true});proof.push({id,first,second,spoken});
 }
 assert.equal(await page.getByRole('button',{name:'다음 문법 배우기',exact:true}).count(),0);
 await page.getByRole('button',{name:'생활·여행 적용 연습하기'}).click();
 const beforeConsolidation=await page.evaluate(()=>localStorage.getItem('grammarProgress'));
 const practices=page.getByRole('region',{name:'직접 써 보기'});
 await practices.nth(0).getByRole('textbox').fill('これはいくらですか？');await practices.nth(0).getByRole('button',{name:'쓴 답 확인'}).click();
 await practices.nth(1).getByRole('textbox').fill('林檎を２つください。');await practices.nth(1).getByRole('button',{name:'쓴 답 확인'}).click();assert.equal(await page.getByText('맞게 썼어요.',{exact:true}).count(),2);
 await page.screenshot({path:output+'/shop-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'2. 방 안내 메모'}).click();
 await practices.nth(0).getByRole('textbox').fill('ここにほんがあります。');await practices.nth(0).getByRole('button',{name:'쓴 답 확인'}).click();
 await practices.nth(1).getByRole('textbox').fill('ここに猫がいます。');await practices.nth(1).getByRole('button',{name:'쓴 답 확인'}).click();assert.equal(await page.getByText('맞게 썼어요.',{exact:true}).count(),2);
 await practices.nth(0).getByRole('radio').first().check();await practices.nth(1).getByRole('radio').last().check();assert.equal(await practices.nth(0).getByRole('radio').first().isChecked(),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('grammarProgress')),beforeConsolidation);
 await page.screenshot({path:output+'/room-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:output+'/room-desktop.png',fullPage:true});
 await page.getByLabel('추천 학습 순서').selectOption('basic');
 const references=await page.getByLabel('배울 문법').locator('option').evaluateAll(options=>options.map(option=>option.value));assert.ok(cases.every(([id])=>!references.includes(id)));
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('grammarProgress')));for(const row of oldRecords)assert.deepEqual(stored.find(item=>item.lessonId===row.lessonId),row);
 await page.reload();await page.getByLabel('추천 학습 순서').selectOption('travel');assert.equal(await page.getByLabel('배울 문법').locator('option').count(),6);
 assert.deepEqual(errors,[]);writeFileSync(output+'/browser-result.json',JSON.stringify({passed:true,syntheticOnly:true,proof,consolidations:2,consolidationInputs:4,errors},null,2));
}catch(error){console.log(await page.locator('body').innerText());throw error;}finally{await browser.close();}
