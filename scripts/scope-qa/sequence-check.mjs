import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const output='/tmp/yeoni-sequence-evidence';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844}}), page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8873'?r.continue():r.abort());
const origin='http://127.0.0.1:8873',proof=[];
try {
 for(const [text,tab,counts] of [['きゃ','hiragana',[4,3]],['ぎゃ','hiragana',[6,3]],['ぴゅ','hiragana',[2,2]],['キャ','katakana',[3,2]],['ギャ','katakana',[5,2]],['ピョ','katakana',[3,3]]]) {
  await page.goto(origin+'/sequence?text='+encodeURIComponent(text)+'&tab='+tab);
  await page.waitForFunction(()=>document.getAnimations().length>0);
  const timing=await page.locator('[data-kana-sequence] svg').evaluateAll(nodes=>nodes.map(svg=>Array.from(svg.querySelectorAll('[data-stroke-start]')).map(path=>{const a=path.getAnimations()[0];a.pause();return {start:a.effect.getTiming().delay,duration:a.effect.getTiming().duration,origin:a.startTime};})));
  assert.deepEqual(timing.map(x=>x.length),counts);
  const firstEnd=Math.max(...timing[0].map(x=>x.start+x.duration)),secondStart=Math.min(...timing[1].map(x=>x.start));assert.ok(secondStart>firstEnd);
  assert.equal(new Set(timing.flat().map(x=>x.origin)).size,1);
  const mid=timing[0].at(-1).start+350;
  const frame=await page.locator('[data-kana-sequence] svg').evaluateAll((nodes,t)=>nodes.map(svg=>Array.from(svg.querySelectorAll('[data-stroke-start]')).map(path=>{const a=path.getAnimations()[0];a.currentTime=t;return a.effect.getComputedTiming().progress;})),mid);
  assert.ok(frame[0].at(-1)>0 && frame[0].at(-1)<1);assert.ok(frame[1].every(x=>x===null));
  await page.screenshot({path:output+'/'+text+'-first-finishing.png'});
  await page.locator('[data-kana-sequence]').evaluate((root,t)=>root.getAnimations({subtree:true}).forEach(a=>a.currentTime=t),secondStart+350);
  await page.screenshot({path:output+'/'+text+'-small-starting.png'});
  proof.push({text,counts,timing,firstEnd,secondStart,frameAt:mid,frame});
 }
 writeFileSync(output+'/timing-proof.json',JSON.stringify({proof},null,2));
 await page.goto(origin+'/growth');await page.getByRole('heading',{name:'앱에 있는 기본 기능'}).waitFor();
 const builtins=page.getByRole('navigation',{name:'기본 기능'});assert.equal(await builtins.getByRole('link').count(),5);
 assert.equal(await page.locator('a[href*="typing"],a[href*="drawing"],a[href*="conversation"]').count(),0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('scope-qa-synthetic-database')||'{"growth_routines":[]}').growth_routines.length),0);
 await page.screenshot({path:output+'/builtins-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:output+'/builtins-desktop.png',fullPage:true});
 await builtins.getByRole('link',{name:'손글씨 자유 연습'}).click();await page.locator('canvas').waitFor();
 const c=await page.locator('canvas').boundingBox();await page.mouse.move(c.x+30,c.y+30);await page.mouse.down();await page.mouse.move(c.x+100,c.y+80,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'손글씨와 완료 기록 저장'}).click();await page.getByRole('button',{name:'저장 완료',exact:true}).waitFor();
 let db=await page.evaluate(()=>JSON.parse(localStorage.getItem('scope-qa-synthetic-database')));assert.equal(db.growth_routines.length,0);assert.equal(db.growth_sessions.length,1);assert.equal(db.growth_sessions[0].routine_id,null);assert.equal(db.growth_resources[0].routine_id,null);
 await page.evaluate(()=>localStorage.setItem('sequence-synthetic-workbook','1'));
 await page.goto(origin+'/growth/handwriting');await page.getByRole('img',{name:/연습지/}).count();
 await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
 await page.locator('input[type="number"]').fill('5');
 await page.getByRole('button',{name:'이 수업 완료하고 저장'}).click();await page.getByRole('button',{name:'수업 저장 완료'}).waitFor();
 db=await page.evaluate(()=>JSON.parse(localStorage.getItem('scope-qa-synthetic-database')));assert.equal(db.growth_sessions.length,2);assert.equal(db.growth_sessions[1].routine_id,null);assert.equal(db.growth_routines.length,0);
 await page.goto(origin+'/language/grammar');await page.getByRole('button',{name:'3. 연습'}).click();await page.getByRole('button',{name:/私.*は学生です。/}).click();
 await page.getByLabel('빈칸에 들어갈 일본어').fill('ます');await page.getByRole('button',{name:'쓴 답 확인'}).click();await page.getByText('이번 연습의 예시 답과 비교해 보세요.',{exact:true}).waitFor();
 await page.getByLabel('빈칸에 들어갈 일본어').fill('です');await page.getByRole('button',{name:'쓴 답 확인'}).click();await page.getByText('맞게 썼어요.',{exact:true}).waitFor();await page.getByRole('radio').first().check();await page.getByRole('button',{name:'다른 예문으로 다시 써 보기'}).click();assert.equal(await page.getByLabel('빈칸에 들어갈 일본어').inputValue(),'');await page.getByLabel('빈칸에 들어갈 일본어').fill('です');await page.getByRole('button',{name:'쓴 답 확인'}).click();await page.getByText('私は会社員です。',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.getByRole('region',{name:'직접 써 보기'}).screenshot({path:output+'/grammar-written-mobile.png'});

 await page.getByLabel('추천 학습 순서').selectOption('foundation');
 assert.equal(await page.getByLabel('배울 문법').locator('option').count(),12);
 for (const [id,answer] of [['desu-question','か'],['desu-negative','ではありません'],['i-adjective','おいしい'],['na-adjective','な']]) {
 await page.getByLabel('배울 문법').selectOption(id);
 await page.getByRole('button',{name:'3. 연습'}).click();
 await page.locator('button').filter({hasText: id === 'desu-question' ? 'これは本ですか。' : id === 'desu-negative' ? 'ではありません' : id === 'i-adjective' ? 'おいしいパン' : /^な$/}).first().click();
 await page.getByLabel('빈칸에 들어갈 일본어').fill(answer);await page.getByRole('button',{name:'쓴 답 확인'}).click();await page.getByText('맞게 썼어요.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'다른 예문으로 다시 써 보기'}).click();
 assert.equal(await page.getByRole('button',{name:'도움말 보기'}).getAttribute('aria-expanded'),'false');
 await page.screenshot({path:output+'/foundation-'+id+'-mobile.png',fullPage:true});
 }
 await page.getByLabel('배울 문법').selectOption('ni');
 await page.getByRole('button',{name:'3. 연습'}).click();
 await page.getByRole('button',{name:'に',exact:true}).click();
 await page.getByLabel('빈칸에 들어갈 일본어').fill('へ');await page.getByRole('button',{name:'쓴 답 확인'}).click();
 await page.getByText('맞게 썼어요.',{exact:true}).waitFor();await page.getByText('学校へ行きます。',{exact:true}).waitFor();
 await page.getByLabel('배울 문법').selectOption('desu-negative');await page.getByRole('button',{name:'3. 연습'}).click();
 await page.getByLabel('빈칸에 들어갈 일본어').fill('じゃないです');await page.getByRole('button',{name:'쓴 답 확인'}).click();
 await page.getByText('맞게 썼어요.',{exact:true}).waitFor();await page.getByText('これは本じゃないです。',{exact:true}).waitFor();
 await page.screenshot({path:output+'/valid-alternative-mobile.png',fullPage:true});
 await page.getByLabel('추천 학습 순서').selectOption('beginner');
 assert.equal(await page.getByLabel('배울 문법').locator('option').count(),7);
 assert.deepEqual(errors,[]);writeFileSync(output+'/timing-proof.json',JSON.stringify({passed:true,proof,errors,syntheticOnly:true},null,2));
}catch(error){console.log(await page.locator('body').innerText());throw error;}finally{await browser.close();}
