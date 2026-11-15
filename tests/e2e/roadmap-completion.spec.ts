import { randomUUID } from 'node:crypto';
import { test, expect, login, synced, today, originalLanguage, type State } from './fixture';
import { RouteDrain } from './route-drain';
import { buildCurrentWorkoutSettings } from '../../app/data/currentWorkoutDirection';
import { CURRICULUM } from '../../data/curriculum';
const noOverflow = async (page: Parameters<typeof synced>[0]) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('detailed workout confirmation survives reload and restores only its own change at 320px', async ({page,qa}) => {
 await page.setViewportSize({width:320,height:844});await login(page,qa.account);await synced(page);const before=await qa.read();
 await page.goto(`/assistant/quick?command=${encodeURIComponent('오늘 운동 마지막 세트 RPE 7 기록해줘')}`,{waitUntil:'domcontentloaded'});
 const review=page.getByRole('region',{name:'운동 상세 확인'});await expect(review).toContainText('7');expect(await qa.read()).toEqual(before);
 await page.reload({waitUntil:'domcontentloaded'});await expect(review).toBeVisible();await review.getByRole('button',{name:'확인하고 저장'}).click();
 const receipt=page.getByRole('article',{name:'운동 실행 이력'});await expect(receipt).toContainText('RPE 7');
 const saved=await qa.read();expect(saved).toEqual({...before,'ai-fitness-workout-completed-days':{...(before['ai-fitness-workout-completed-days'] as State),[today()]:{workoutLastSetRpe:7}}});
 await page.goto('/assistant/history?area=workout',{waitUntil:'domcontentloaded'});await expect(receipt).toContainText('RPE 7');await receipt.getByRole('button',{name:'이 변경 되돌리기'}).click();await receipt.getByRole('button',{name:'확인하고 되돌리기'}).click();await expect(receipt).toContainText('되돌리기 완료');expect(await qa.read()).toEqual(before);await noOverflow(page);
});

test('memory create, read-only lost-response recovery, conflict protection, edit and delete preserve original records',async({page,qa})=>{
 await page.setViewportSize({width:320,height:844});await login(page,qa.account);await synced(page);const before=await qa.read();await page.goto('/assistant/memories',{waitUntil:'domcontentloaded'});
 await page.getByLabel('기억 주제').fill('검증용 선호');await page.getByLabel('기억 내용').fill('짧은 예문으로 시작');await page.getByRole('button',{name:'기억 저장 검토'}).click();expect((await qa.account.client.from('assistant_memories').select('*')).data).toEqual([]);
 const pattern='**/rest/v1/assistant_memories*',drain=new RouteDrain();let writes=0,failReads=true;
 await page.route(pattern,route=>drain.run(async()=>{if(route.request().method()==='POST'){writes++;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:'{"message":"lost"}'});}else if(failReads)await route.fulfill({status:503,contentType:'application/json',body:'{"message":"unavailable"}'});else await route.fallback();}));
 try{await page.getByRole('button',{name:'확인 후 기억 반영'}).click();await expect(page.getByRole('button',{name:'기억 서버 결과 재확인'})).toBeVisible();failReads=false;await page.getByRole('button',{name:'기억 서버 결과 재확인'}).click();await expect(page.getByRole('status')).toContainText('기억을 저장');expect(writes).toBe(1);}finally{await drain.wait();await page.unroute(pattern);}
 await page.reload({waitUntil:'domcontentloaded'});const list=page.getByRole('region',{name:'저장된 기억'});await expect(list).toContainText('짧은 예문으로 시작');const row=(await qa.account.client.from('assistant_memories').select('*').single()).data!;
 const other=await qa.createAccount();expect((await other.client.from('assistant_memories').select('*')).data).toEqual([]);
 await list.getByRole('button',{name:'기억 수정',exact:true}).click();await page.getByLabel('기억 내용').fill('확인할 변경');await page.getByRole('button',{name:'기억 저장 검토'}).click();expect((await qa.account.client.from('assistant_memories').update({content:'다른 창에서 바꾼 기억'}).eq('id',row.id)).error).toBeNull();await page.getByRole('button',{name:'확인 후 기억 반영'}).click();await expect(page.getByRole('status')).toContainText('덮어쓰지 않습니다');
 await page.getByRole('button',{name:'확인 화면 닫기'}).click();await page.getByRole('button',{name:'입력 취소',exact:true}).click();await page.getByRole('button',{name:'기억 다시 불러오기'}).click();await expect(list).toContainText('다른 창에서 바꾼 기억');
 await list.getByRole('button',{name:'기억 수정',exact:true}).click();await page.getByLabel('기억 내용').fill('저장한 최종 기억');await page.getByRole('button',{name:'기억 저장 검토'}).click();await page.getByRole('button',{name:'확인 후 기억 반영'}).click();await expect(list).toContainText('저장한 최종 기억');
 await list.getByRole('button',{name:'기억 삭제 검토'}).click();await page.getByRole('button',{name:'확인 화면 닫기'}).click();expect((await qa.account.client.from('assistant_memories').select('*')).data).toHaveLength(1);await list.getByRole('button',{name:'기억 삭제 검토'}).click();await page.getByRole('button',{name:'확인 후 기억 반영'}).click();await expect(list).toContainText('저장한 기억이 없습니다');expect(await qa.read()).toEqual(before);await noOverflow(page);
});

test('morning and evening briefing show failed domains separately and never call a partial workout complete',async({page,qa})=>{
 const before=await qa.read();
 const settings=buildCurrentWorkoutSettings({weeklyGroups:{},weeklyMethods:{},weeklyEdits:{},exerciseTargets:{},dateOverrides:{}});
 settings.dateOverrides[today()]={groupId:'current-fullbody-strength-circuit'};
 const state={...before,'ai-fitness-user-workout-settings':settings,'ai-fitness-selected-weekly-workout-plan':'five-day-fullbody-circuit','ai-fitness-workout-direction-version':'five-day-circuit-v1','ai-fitness-workout-completed-days':{...(before['ai-fitness-workout-completed-days'] as State),[today()]:{workoutStatus:'partial',workoutDone:false}}};expect((await qa.account.client.from('user_app_state').update({state}).eq('user_id',qa.account.id)).error).toBeNull();
 await page.setViewportSize({width:320,height:844});await login(page,qa.account);await synced(page);
 const pattern='**/rest/v1/budget_transactions*';await page.route(pattern,route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"unavailable"}'}));
 await page.goto('/assistant',{waitUntil:'domcontentloaded'});await page.getByText('아침·저녁 브리핑 자세히 보기',{exact:true}).click();const panel=page.getByRole('region',{name:'아침·저녁 브리핑'});await expect(panel).toContainText('조회 실패 · 미기록으로 판단하지 않음');await expect(panel).toContainText('오늘 완료 미확인');await expect(panel).not.toContainText('오늘 완료 기록 있음');await panel.getByRole('button',{name:'아침 브리핑'}).click();await expect(panel).toContainText('아침에 확인할 일');await panel.getByRole('button',{name:'저녁 브리핑'}).click();await expect(panel).toContainText('저녁 기록 돌아보기');await noOverflow(page);await page.unroute(pattern);await page.reload({waitUntil:'domcontentloaded'});await page.getByText('아침·저녁 브리핑 자세히 보기',{exact:true}).click();await expect(panel).not.toContainText('조회 실패');expect(await qa.read()).toEqual(state);
});

test('workout evidence links only saved dates and next-day condition without inferring missing answers',async({page,qa})=>{
 const before=await qa.read(),yesterday=new Date(Date.parse(`${today()}T12:00:00Z`)-86400000).toISOString().slice(0,10);
 const state={...before,'ai-fitness-workout-completed-days':{...(before['ai-fitness-workout-completed-days'] as State),[yesterday]:{workoutStatus:'partial',workoutLastSetRpe:7,workoutPainArea:'허리'}},'ai-fitness-daily-condition':{[today()]:{signals:[],date:today()}}};expect((await qa.account.client.from('user_app_state').update({state}).eq('user_id',qa.account.id)).error).toBeNull();
 await page.setViewportSize({width:320,height:844});await login(page,qa.account);await synced(page);await page.getByRole('navigation',{name:'AI 연이 공통 메뉴'}).getByRole('link',{name:'운동',exact:true}).click();const panel=page.getByRole('region',{name:'운동 수행·다음 날 컨디션'});await expect(panel).toContainText('일부 1');await panel.getByText('날짜별 수행·컨디션 근거',{exact:true}).click();await expect(panel).toContainText('RPE 7/10');await expect(panel).toContainText('선택한 불편 신호 없음');await expect(panel).toContainText('피로 미응답');await noOverflow(page);await synced(page);const saved=await qa.read();await page.reload({waitUntil:'domcontentloaded'});await expect(panel).toContainText('일부 1');await synced(page);expect((await qa.read())['ai-fitness-workout-completed-days']).toEqual(saved['ai-fitness-workout-completed-days']);
});

test('retired typing preserves original mistake history without duplicate sessions or browser writes',async({page,qa})=>{
 const routine={id:randomUUID(),user_id:qa.account.id,category:'typing',title:'QA historical typing',target_minutes:15,enabled:true};
 expect((await qa.account.client.from('growth_routines').insert(routine)).error).toBeNull();
 const session={id:randomUUID(),user_id:qa.account.id,routine_id:routine.id,session_date:'2001-01-02',status:'partial',source:'typing',planned_minutes:15,actual_minutes:1,memo:'QA original mistake history',metrics:{characters:2,correctCharacters:0,mistakeCharacters:[{character:'천',count:2}],legacyUnknown:{keep:true}}};
 expect((await qa.account.client.from('growth_sessions').insert(session)).error).toBeNull();
 const snapshot=async()=>{const routines=await qa.account.client.from('growth_routines').select('*').order('id'),sessions=await qa.account.client.from('growth_sessions').select('*').order('id');expect(routines.error).toBeNull();expect(sessions.error).toBeNull();return {routines:routines.data,sessions:sessions.data};};
 const originalRows=await snapshot();expect(originalRows.sessions).toHaveLength(1);expect(originalRows.routines).toHaveLength(1);
 await page.setViewportSize({width:320,height:844});await login(page,qa.account);await synced(page);const before=await qa.read();
 const observer=observeRetiredRequests(page);
 try{await visitRetiredPractice(page,'/growth/typing');await visitRetiredPractice(page,'/growth/typing/basics');expect(await snapshot()).toEqual(originalRows);expect(await qa.read()).toEqual(before);await noOverflow(page);observer.assertQuiet();}finally{observer.dispose();}
});

test('handwriting measures remaining strokes, saves private image and actual time, and survives reload',async({page,qa})=>{
 const routine={id:randomUUID(),user_id:qa.account.id,category:'handwriting',title:'검증 손글씨',target_minutes:20,enabled:true};expect((await qa.account.client.from('growth_routines').insert(routine)).error).toBeNull();await page.setViewportSize({width:320,height:844});await login(page,qa.account);await synced(page);const before=await qa.read();await page.goto('/growth/handwriting/free',{waitUntil:'domcontentloaded'});const canvas=page.getByLabel('손글씨 연습장');await expect(canvas).toBeVisible();await expect(page.getByRole('button',{name:'손글씨와 완료 기록 저장'})).toBeDisabled();await expect(page.getByText(/불러온 최근 30일 손글씨 기록은 \d+개예요\./)).toBeVisible();
 await canvas.scrollIntoViewIfNeeded();
 const box=(await canvas.boundingBox())!;
 const geometry=await canvas.evaluate((element,box)=>{
  const rect=element.getBoundingClientRect();
  const visibleRects=(selector:string)=>Array.from(document.querySelectorAll<HTMLElement>(selector)).map(node=>({rect:node.getBoundingClientRect(),style:getComputedStyle(node)})).filter(({rect,style})=>rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden').map(({rect})=>rect);
  const safeTop=Math.max(0,...visibleRects('.app-module-header').map(rect=>rect.bottom));
  const safeBottom=Math.min(innerHeight,...visibleRects('.hub-bottom-nav-inner').map(rect=>rect.top));
  const drawY=Math.max(box.y,safeTop)+30;
  const points=Array.from({length:2},(_,stroke)=>Array.from({length:6},(_,step)=>({x:box.x+30+step*20,y:drawY+stroke*20+step*3}))).flat();
  return {
   drawY,points,safeTop,safeBottom,
   sameRect:Math.abs(rect.x-box.x)<0.5&&Math.abs(rect.y-box.y)<0.5&&Math.abs(rect.width-box.width)<0.5&&Math.abs(rect.height-box.height)<0.5,
   pathFits:points.every(({x,y})=>x>Math.max(0,rect.left)&&x<Math.min(innerWidth,rect.right)&&y>Math.max(safeTop,rect.top)&&y<Math.min(safeBottom,rect.bottom)),
   hits:points.map(({x,y})=>document.elementFromPoint(x,y)===element),
  };
 },box);
 expect(geometry,'Both original stroke paths must remain inside the ready, unobscured canvas').toMatchObject({sameRect:true,pathFits:true,hits:Array(12).fill(true)});
 for(let i=0;i<2;i++){await page.mouse.move(box.x+30,geometry.drawY+i*20);await page.mouse.down();await page.mouse.move(box.x+130,geometry.drawY+15+i*20,{steps:5});await page.mouse.up();await expect(page.getByRole('region',{name:'손글씨 측정 기록'})).toContainText(`획 ${i+1}개`);}
 const metrics=page.getByRole('region',{name:'손글씨 측정 기록'});await expect(metrics).toContainText('획 2개');await page.getByRole('button',{name:'되돌리기',exact:true}).click();await expect(metrics).toContainText('획 1개');await expect(metrics).toContainText('변화가 있는 펜 압력 미측정');await page.getByRole('button',{name:'손글씨와 완료 기록 저장'}).click();await expect(page.getByRole('button',{name:'저장 완료',exact:true})).toBeDisabled();
 const session=(await qa.account.client.from('growth_sessions').select('*').single()).data!;expect(session.actual_minutes).toBeLessThan(20);expect(session.metrics).toMatchObject({strokes:1,pressureRange:null});expect(session.metrics.activeSeconds).toBeGreaterThanOrEqual(0);const resource=(await qa.account.client.from('growth_resources').select('*').single()).data!;expect(resource.id).toBe(session.metrics.resourceId);expect((await qa.account.client.storage.from('growth-resources').download(resource.storage_path)).error).toBeNull();const other=await qa.createAccount();expect((await other.client.storage.from('growth-resources').download(resource.storage_path)).error).not.toBeNull();await noOverflow(page);await page.reload({waitUntil:'domcontentloaded'});expect((await qa.account.client.from('growth_sessions').select('*')).data).toHaveLength(1);expect(await qa.read()).toEqual(before);
});

test('language focus links due work mistakes and opens the new drawing and quality lessons',async({page,qa})=>{
 const lesson=CURRICULUM.find(row=>row.id==='w21')!;const item={id:'w21:0',lessonId:'w21',lessonTitle:lesson.title,prompt:lesson.quiz[0].prompt,explanation:lesson.quiz[0].explanation,createdAt:'2001-01-01',wrongCount:3,lastNeededHelp:true};expect((await qa.account.client.from('language_user_state').update({state:{...originalLanguage,japaneseCurriculumReviewV1:JSON.stringify([item])}}).eq('user_id',qa.account.id)).error).toBeNull();await page.setViewportSize({width:320,height:844});await login(page,qa.account,'/language/settings');await expect(page.getByText('학습 기록 · 서버 저장 확인',{exact:true})).toBeVisible();await page.goto('/language/review',{waitUntil:'domcontentloaded'});const panel=page.getByRole('region',{name:'집중 복습 추천'});await panel.getByLabel('관심 복습 분야').selectOption('work');await expect(panel).toContainText('누적 오답 3회 · 최근 힌트 사용');await panel.getByRole('button',{name:'이 문제 먼저 복습'}).click();await noOverflow(page);await panel.getByRole('link',{name:'도면·공차 수업'}).click();await expect(page.getByRole('heading',{name:lesson.title,exact:true})).toBeVisible();await page.goto('/language/learn?lesson=w22',{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:'측정 결과와 품질 확인',exact:true})).toBeVisible();await noOverflow(page);
});

import { observeRetiredRequests, visitRetiredPractice } from './drawing-tools';
