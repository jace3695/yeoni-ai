import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const output = '/tmp/yeoni-bridge-evidence'; mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  window.__spoken=[];window.__microphone=0;
  window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
  Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'Synthetic Japanese',lang:'ja-JP',localService:true}],cancel:()=>{},speak:u=>{window.__spoken.push({text:u.text,lang:u.lang});u.onstart?.();setTimeout(()=>u.onend?.(),50);},addEventListener:()=>{},removeEventListener:()=>{}}});
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>{window.__microphone++;throw Error('No microphone');}}});
});
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const origin = 'http://127.0.0.1:8873';
await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
const oldRecords = [{ lessonId: 'ga-particle', title: '조사 が', category: '조사', pattern: 'A が B', correctCount: 4, wrongCount: 2, lastResult: 'correct', lastAnsweredAt: '2026-10-31T01:00:00Z' }, { lessonId: 'desu', title: 'です 문장', category: 'です/ます', pattern: 'A は B です', correctCount: 2, wrongCount: 0, lastResult: 'correct', lastAnsweredAt: '2026-10-31T01:00:00Z' }];
try {
  await page.goto(origin + '/language/grammar');
  await page.evaluate(records => localStorage.setItem('grammarProgress', JSON.stringify(records)), oldRecords);
  await page.reload();
  assert.equal(await page.getByLabel('배울 문법').locator('option').count(), 12);
  await page.getByLabel('추천 학습 순서').selectOption('bridge');
  assert.deepEqual(await page.getByLabel('배울 문법').locator('option').evaluateAll(options => options.map(option => option.value)), ['no-particle', 'mo-particle', 'nan', 'doko', 'masen', 'mashita', 'ga-suki']);
  assert.equal(await page.locator('article').count(), 1);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('grammarProgress'))), oldRecords);
  await page.screenshot({ path: output + '/bridge-start-mobile.png', fullPage: true });
  const tasks = [
    ['no-particle','私のかばん','わたしのかばん','かいしゃの資料'],
    ['mo-particle','も','も','これもほんです。'],
    ['nan','なん','なんですか','それは何ですか？'],
    ['doko','どこ','どこですか','でぐちはどこですか。'],
    ['masen','行きません','いきません','のみません'],
    ['mashita','食べました','いきました','たべました'],
    ['ga-suki','が','が','にほんごが好きです。'],
  ];
  for (const [id, choice, first, second] of tasks) {
    await page.getByLabel('배울 문법').selectOption(id);
    await page.getByRole('button',{name:'2. 예문',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'예문 듣기',exact:true}).count(),2);
    await page.getByRole('button',{name:'3. 연습',exact:true}).click();
    await page.getByRole('button',{name:choice,exact:false}).last().click();
    const input=page.getByRole('textbox');
    assert.equal(await page.getByRole('button',{name:'쓴 답 확인'}).isDisabled(),true);
    await input.fill('wrong'); await page.getByRole('button',{name:'쓴 답 확인'}).click();
    await page.getByText('이번 연습의 예시 답과 비교해 보세요.',{exact:true}).waitFor();
    await input.fill(first); await page.getByRole('button',{name:'쓴 답 확인'}).click();
    await page.getByText('맞게 썼어요.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'다른 예문으로 다시 써 보기'}).click();
    assert.equal(await page.getByRole('button',{name:'도움말 보기'}).getAttribute('aria-expanded'),'false');
    assert.equal(await input.inputValue(),'');
    await input.fill(second);await page.getByRole('button',{name:'쓴 답 확인'}).click();
    await page.getByText('맞게 썼어요.',{exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'완성 문장 듣기'}).click();
    await page.waitForFunction(()=>window.__spoken.length>0);
    assert.equal(await page.evaluate(()=>window.__spoken.at(-1).lang),'ja-JP');
    assert.equal(await page.evaluate(()=>window.__microphone),0);
    await page.screenshot({path:output+'/'+id+'-mobile.png',fullPage:true});
  }
  assert.equal(await page.getByRole('button',{name:'다음 문법 배우기',exact:true}).count(),0);
  await page.getByRole('button',{name:'생활·여행 종합 연습하기'}).click();
  assert.equal(await page.getByLabel('최근 틀린 문법만 복습').count(),0);
  const progressBefore=await page.evaluate(()=>localStorage.getItem('grammarProgress'));
  await page.getByRole('textbox').fill('トイレはどこですか？');
  await page.getByRole('button',{name:'쓴 답 확인'}).click();await page.getByText('맞게 썼어요.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'도움 없이 다시 쓰기'}).click();
  assert.equal(await page.getByRole('textbox').inputValue(),'');
  await page.getByRole('button',{name:'2. 여행 기록 두 줄'}).click();
  const practices=page.getByRole('region',{name:'직접 써 보기'});
  await practices.nth(0).getByRole('textbox').fill('きのう京都へいきました。');
  await practices.nth(0).getByRole('button',{name:'쓴 답 확인'}).click();
  await practices.nth(1).getByRole('textbox').fill('今日は会社へ行きません');
  await practices.nth(1).getByRole('button',{name:'쓴 답 확인'}).click();
  assert.equal(await page.getByText('맞게 썼어요.',{exact:true}).count(),2);
  await practices.nth(0).getByRole('radio').first().check();await practices.nth(1).getByRole('radio').last().check();
  assert.equal(await practices.nth(0).getByRole('radio').first().isChecked(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('grammarProgress')),progressBefore);
  await page.screenshot({path:output+'/consolidation-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:output+'/consolidation-desktop.png',fullPage:true});
  await page.getByLabel('추천 학습 순서').selectOption('beginner');
  assert.deepEqual(await page.getByLabel('배울 문법').locator('option').evaluateAll(options=>options.map(option=>option.value)),['ga-particle']);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('grammarProgress')));
  assert.deepEqual(stored.find(item=>item.lessonId==='ga-particle'),oldRecords[0]);
  assert.deepEqual(stored.find(item=>item.lessonId==='desu'),oldRecords[1]);
  await page.reload();await page.getByLabel('추천 학습 순서').selectOption('bridge');
  assert.equal(await page.getByLabel('배울 문법').locator('option').count(),7);
  await page.getByLabel('추천 학습 순서').selectOption('foundation');await page.getByLabel('배울 문법').selectOption('de');
  await page.getByRole('button',{name:'3. 연습'}).click();await page.getByRole('button',{name:'で',exact:true}).click();
  await page.getByRole('button',{name:'다음 걸음 시작하기'}).click();
  assert.equal(await page.getByLabel('배울 문법').inputValue(),'no-particle');
  await page.evaluate(() => localStorage.setItem('grammarProgress',JSON.stringify(['no-particle','mo-particle'].map(lessonId=>({lessonId,correctCount:0,wrongCount:1,lastResult:'wrong',lastAnsweredAt:'2026-10-31T01:00:00Z'})))));
  await page.reload();await page.getByLabel('추천 학습 순서').selectOption('bridge');await page.getByLabel('최근 틀린 문법만 복습').check();
  await page.getByRole('button',{name:'3. 연습'}).click();await page.getByRole('button',{name:'私のかばん',exact:false}).last().click();
  await page.getByRole('button',{name:'다음 복습 문제'}).click();assert.equal(await page.getByLabel('배울 문법').inputValue(),'mo-particle');
  await page.getByLabel('추천 학습 순서').selectOption('consolidation');await page.getByRole('button',{name:'2. 여행 기록 두 줄'}).click();
  const plan = page.getByRole('region',{name:'직접 써 보기'}).nth(1);
  await plan.getByRole('textbox').fill('今日は会社に行きません？');await plan.getByRole('button',{name:'쓴 답 확인'}).click();
  await plan.getByText('이번 연습의 예시 답과 비교해 보세요.',{exact:true}).waitFor();
  assert.equal(await plan.getByText('맞게 썼어요.',{exact:true}).count(),0);


  assert.deepEqual(errors, []);
  writeFileSync(output + '/browser-result.json', JSON.stringify({ syntheticOnly: true, errors, passed: true }, null, 2));
} finally { await browser.close(); }
