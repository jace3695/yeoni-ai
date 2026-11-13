import { test, expect, login, canonical, type State } from './fixture';
import { CURRICULUM } from '../../data/curriculum';
import { getQuestionChoices } from '../../utils/learningSession';
import { CURRICULUM_PROGRESS_KEY, CURRICULUM_REVIEW_KEY } from '../../utils/curriculumProgress';
import { seedCurriculum, historicalProgress, historicalReview, historicalDraft } from './curriculum-browser-state';

const lesson = CURRICULUM.find(item => item.id === 'f13')!;
const path = '/language/learn?lesson=f13';
const progress = (state: State) => JSON.parse(state[CURRICULUM_PROGRESS_KEY] as string);
const languageSynced = (page: import('@playwright/test').Page) => expect(page.getByText('학습 기록 · 서버 저장 확인', { exact: true })).toBeVisible();

for (const legacy of [false, true]) {
  test(legacy ? 'legacy Japanese application lesson keeps original question identities through reload and relogin'
    : 'new Japanese application lesson answers appended questions through reload save and relogin', async ({ page, qa }) => {
    const fitness = await qa.read();
    let before = await seedCurriculum(qa);
    const legacyDraft = { version: 1, id: 'synthetic-legacy-f13', lessonId: 'f13', minutes: 5, mode: 'starter', stage: 4,
      wordIndex: 0, quizCursor: 0, answers: {}, firstAnswers: {}, responses: {}, speakingChecks: [false, false, false] };
    if (legacy) {
      const p = progress(before);
      before = { ...before, [CURRICULUM_PROGRESS_KEY]: JSON.stringify({ ...p, activeSession: legacyDraft,
        lessonDrafts: { [historicalDraft.lessonId]: historicalDraft, ...p.lessonDrafts, f13: legacyDraft } }) };
      const result = await qa.account.client.from('language_user_state').update({ state: before }).eq('user_id', qa.account.id).select('state').single();
      expect(result.error).toBeNull(); expect(result.data?.state).toEqual(before);
    }
    let ttsRequests = 0;
    page.context().on('request', request => { if (new URL(request.url()).pathname === '/api/language/tts') ttsRequests++; });
    await page.route('**/api/language/tts**', route => route.abort('blockedbyclient'));
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, qa.account, path); await languageSynced(page);
    const region = page.getByRole('region', { name: '집중 학습', exact: true });
    await expect(region.getByRole('heading', { level: 1, name: lesson.title, exact: true })).toBeVisible();
    await expect(region.getByText('약 5분', { exact: true })).toBeVisible();
    if (!legacy) {
      for (const [index] of lesson.words.entries()) {
        await expect(region.getByText(`오늘의 표현 ${index + 1} / ${lesson.words.length}`, { exact: true })).toBeVisible();
        await region.getByRole('button', { name: index < lesson.words.length - 1 ? '다음 표현' : '다음으로', exact: true }).click();
      }
      await expect(region.getByRole('heading', { name: lesson.pattern.explanation, exact: true })).toBeVisible();
      await region.getByRole('button', { name: '다음으로', exact: true }).click();
    }
    const indices = legacy ? [2, 4, 6] : [2, 8, 9];
    let sessionId = '';
    for (const [cursor, index] of indices.entries()) {
      await expect(region.getByText(`확인 문제 ${cursor + 1} / 3`, { exact: true })).toBeVisible();
      const question = lesson.quiz[index]; expect(question.kind).not.toBe('listening'); expect(question.kind).not.toBe('input');
      await expect(region.getByRole('heading', { level: 3, name: question.prompt.replace('日本語', '일본어'), exact: true })).toBeVisible();
      const choice = getQuestionChoices(lesson, index, 'starter').find(choice => choice.correct)!;
      await region.getByRole('button', { name: choice.label, exact: true }).click();
      await expect(region.getByText(`내 답: ${choice.label}`, { exact: true })).toBeVisible();
      await expect.poll(async () => progress(await qa.readLanguage()).activeSession?.answers[index]).toBe(true);
      await languageSynced(page);
      const state = await qa.readLanguage(), p = progress(state), draft = p.activeSession;
      sessionId ||= draft.id; expect(draft.id).toBe(sessionId);
      expect(draft.quizPlanVersion).toBe(legacy ? undefined : 2);
      expect(p.lessonDrafts.f13).toEqual(draft); expect(draft.quizCursor).toBe(cursor);
      expect(Object.keys(draft.answers).map(Number).sort((a,b)=>a-b)).toEqual(indices.slice(0,cursor+1).sort((a,b)=>a-b));
      expect(draft.firstAnswers[index]).toBe(true); expect(draft.responses[index]).toBe(choice.label);
      qa.traffic.assertLanguageConfirmed(state);
      if (cursor === 1) {
        await page.reload(); await languageSynced(page);
        await expect(region.getByText(`내 답: ${choice.label}`, { exact: true })).toBeVisible();
        expect(progress(await qa.readLanguage()).activeSession).toEqual(draft);
        await page.getByRole('button', { name: '로그아웃', exact: true }).click();
        await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
        await login(page, qa.account, path); await languageSynced(page);
        await expect(region.getByText(`내 답: ${choice.label}`, { exact: true })).toBeVisible();
        expect(progress(await qa.readLanguage()).activeSession).toEqual(draft);
      }
      if (cursor < 2) await region.getByRole('button', { name: '다음 문제', exact: true }).click();
    }
    await region.getByRole('button', { name: '오늘 연습 저장하기', exact: true }).click();
    await expect(region.getByRole('heading', { name: '오늘의 연습을 저장했어요', exact: true })).toBeVisible();
    await expect.poll(async () => progress(await qa.readLanguage()).quizScores.f13).toBe(100); await languageSynced(page);
    const saved = await qa.readLanguage(), p = progress(saved);
    expect(p.completedLessonIds).toEqual(['f01','f13']); expect(p.lessonAttempts.f13).toHaveLength(1);
    expect(p.lessonAttempts.f13[0]).toMatchObject({ score:100,sessionId });
    expect(p.lessonAttempts.f01).toEqual(historicalProgress.lessonAttempts.f01);
    expect(p.lessonDrafts).toEqual({ [historicalDraft.lessonId]: historicalDraft });
    expect(p.activeSession).toEqual(historicalDraft);
    expect(p.extension).toEqual(historicalProgress.extension); expect(p.kanaCompletedGroups).toEqual(historicalProgress.kanaCompletedGroups);
    const reviews = JSON.parse(saved[CURRICULUM_REVIEW_KEY] as string);
    expect(reviews.find((item:{id:string})=>item.id===historicalReview.id)).toEqual(historicalReview);
    expect(reviews.filter((item:{lessonId:string})=>item.lessonId==='f13').map((item:{id:string})=>item.id).sort()).toEqual(indices.map(index=>`f13:${index}`).sort());
    const omit = (state:State) => Object.fromEntries(Object.entries(state).filter(([key])=>![CURRICULUM_PROGRESS_KEY,CURRICULUM_REVIEW_KEY].includes(key)));
    expect(canonical(omit(saved))).toBe(canonical(omit(before))); expect(await qa.read()).toEqual(fitness);
    qa.traffic.assertLanguageConfirmed(saved); expect(ttsRequests).toBe(0);
    await page.goto('/language/progress'); await languageSynced(page); await page.reload(); await languageSynced(page);
    expect(canonical(await qa.readLanguage())).toBe(canonical(saved)); expect(await qa.read()).toEqual(fitness);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true); expect(ttsRequests).toBe(0);
  });
}
