import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const output='/tmp/yeoni-learning-evidence'; mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8873'?r.continue():r.abort());
const origin='http://127.0.0.1:8873';
const ink=()=>page.getByLabel('가나 쓰기 연습장').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0));
try {
 await page.goto(origin+'/language/kana'); await page.getByRole('button',{name:'쓰기 연습',exact:true}).click();
 for (const script of ['히라가나','가타카나']) {
  await page.getByRole('button',{name:script,exact:true}).click();
  await page.getByRole('button',{name:'쓰기 연습',exact:true}).click();
  await page.getByRole('button',{name:'쓰기 보기',exact:true}).last().click();
  
  await page.locator('svg [data-strokesvg="shadows"]').first().waitFor();
  const compare=await page.locator('svg[aria-label]').evaluateAll(nodes=>nodes.filter(n=>n.getAttribute('aria-label')?.includes('획순')||n.getAttribute('aria-label')?.includes('따라쓰기')).map(n=>({view:n.getAttribute('viewBox'),paths:Array.from(n.querySelectorAll('[data-strokesvg="shadows"] path')).map(p=>p.getAttribute('d')),rect:{width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}})));
  assert.equal(compare.length,2);assert.deepEqual(compare[0],compare[1]);
  await page.getByLabel('가나 쓰기 연습장').scrollIntoViewIfNeeded();
  const b=await page.getByLabel('가나 쓰기 연습장').boundingBox();
  await page.mouse.move(b.x+30,b.y+30);await page.mouse.down();await page.mouse.move(b.x+90,b.y+90,{steps:8});await page.mouse.up();assert.equal(await ink(),true);
  await page.getByRole('button',{name:'지우기',exact:true}).click();assert.equal(await ink(),false);
  await page.locator('.kana-writing-grid').screenshot({path:`${output}/${script}-mobile.png`});
  await page.getByRole('button',{name:'흐린 글자',exact:true}).click();await page.locator('svg [data-strokesvg="shadows"]').first().waitFor();
  const faint=await page.locator('svg[aria-label]').evaluate(n=>Array.from(n.querySelectorAll('[data-strokesvg="shadows"] path')).map(p=>p.getAttribute('d')));assert.deepEqual(faint,compare[0].paths);
  await page.getByRole('button',{name:'빈칸 쓰기',exact:true}).click();assert.equal(await page.locator('svg[aria-label]').count(),0);
  await page.getByRole('button',{name:'다음 글자',exact:true}).click();
  await page.getByRole('button',{name:'쓰기 보기',exact:true}).last().click();await page.locator('svg [data-strokesvg="shadows"]').first().waitFor();
 }
 for (const script of ['히라가나','가타카나']) {
  await page.getByRole('button',{name:script,exact:true}).click();
  await page.getByRole('button',{name:/^요음 기본/}).click();
  await page.getByRole('button',{name:'쓰기 연습',exact:true}).click();
  await page.getByRole('button',{name:'쓰기 보기',exact:true}).last().click();
  await page.locator('svg [data-strokesvg="shadows"]').first().waitFor();
  assert.equal(await page.locator('svg[aria-label]').count(),4);
  const paths=await page.locator('svg[aria-label]').evaluateAll(ns=>ns.map(n=>Array.from(n.querySelectorAll('[data-strokesvg="shadows"] path')).map(p=>p.getAttribute('d'))));
  assert.deepEqual(paths[0],paths[2]);assert.deepEqual(paths[1],paths[3]);
  await page.getByLabel('가나 쓰기 연습장').scrollIntoViewIfNeeded();
  const r=await page.getByLabel('가나 쓰기 연습장').boundingBox();const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+30,y:r.y+30}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+100,y:r.y+70}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await ink(),true);await cdp.detach();
  await page.locator('.kana-writing-grid').screenshot({path:output+'/'+script+'-compound.png'});
 }
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:output+'/kana-desktop.png',fullPage:true});
 await page.goto(origin+'/language/grammar');assert.equal(await page.locator('article').count(),1);
 await page.getByRole('button',{name:'예문으로 확인하기'}).click();await page.getByText('함께 문장 만들기').waitFor();
 await page.screenshot({path:output+'/grammar-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'이제 직접 풀기'}).click();assert.ok(await page.locator('ruby').count());
 await page.getByRole('button',{name:'힌트 보기'}).click();
 await page.getByRole('button',{name:/私.*を学生です。/}).click();await page.getByText('아쉬워요.',{exact:false}).waitFor();
 await page.reload();await page.getByLabel('최근 틀린 문법만 복습').check();await page.getByRole('button',{name:'3. 연습'}).click();
 await page.getByRole('button',{name:/私.*は学生です。/}).click();await page.getByText('정답이에요!',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/grammar-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'다시 풀기'}).click();
 await page.evaluate(()=>localStorage.setItem('grammarProgress',JSON.stringify([{lessonId:'wa',title:'は 패턴',category:'조사',pattern:'A は B です',correctCount:0,wrongCount:1,lastAnsweredAt:new Date().toISOString(),lastResult:'wrong'}])));
 await page.reload();await page.getByLabel('최근 틀린 문법만 복습').check();await page.getByRole('button',{name:'3. 연습'}).click();await page.getByRole('button',{name:'は',exact:true}).click();await page.getByText('정답이에요!',{exact:true}).waitFor();
 assert.equal(await page.locator('article').count(),1);await page.getByRole('button',{name:'힌트 접기'}).count();
 await page.goto(origin+'/growth');await page.getByRole('button',{name:'손글씨 활동과 요일 설정'}).click();
 await page.getByRole('button',{name:'활동 추가',exact:true}).click();await page.getByText('활동을 추가했어요.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('scope-qa-synthetic-database')).growth_routines[0].category),'handwriting');
 await page.getByRole('link',{name:'손글씨 수업 열기'}).click();await page.getByText('전체 수업 보기',{exact:true}).click();
 assert.equal(await page.locator('button[aria-current="step"]').count(),1);
 await page.screenshot({path:output+'/handwriting-course-mobile.png',fullPage:true});
 await page.goto(origin+'/growth/handwriting/free');await page.locator('canvas').waitFor();
 const c=await page.locator('canvas').boundingBox();await page.mouse.move(c.x+30,c.y+30);await page.mouse.down();await page.mouse.move(c.x+100,c.y+80,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'되돌리기',exact:true}).click();await page.getByRole('button',{name:'다시 실행',exact:true}).click();
 await page.screenshot({path:output+'/handwriting-free-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 writeFileSync(output+'/result.json',JSON.stringify({passed:true,errors,scope:'Synthetic Chromium component lab; no real auth/database/private workbook/audio'},null,2));
} finally {await browser.close();}
