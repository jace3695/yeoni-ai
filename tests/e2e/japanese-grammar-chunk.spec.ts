import { test, expect, login, canonical, type State } from './fixture';
import { assertChunkDelta, unavailableSpeech } from './japanese-grammar-chunk-state';
test('grammar expression chunks and silent listening fallback preserve wrong-answer history through real saves and relogin', async ({ page, qa }) => {
  const lesson = getChunkLesson('grammar:desu')!;
  const info = chunkLessonInfo(lesson.lessonId);
  expect(lesson.questions.map(question => question.kind)).toEqual(['meaning', 'blank', 'listening']);
  expect(lesson.variations.map(variation => variation.kind)).toEqual(['word', 'tense']);
  expect(FREE_MODE).toBe(true);
  const fitness = await qa.read();
  // Synthetic unrelated historical inputs only, before login. No new answer,
  // completion, due date, browser owner, local storage or application clock is seeded.
  let saved: State = { ...await qa.readLanguage(),
    [GRAMMAR_PROGRESS_KEY]: JSON.stringify([{ lessonId: 'masu', title: 'Synthetic preserved grammar', category: 'です/ます', pattern: '〜ます', correctCount: 1, wrongCount: 1, lastResult: 'wrong', lastAnsweredAt: oldTime }]),
    [LEVEL_JOURNEY_KEY]: JSON.stringify({ ...emptyLevelJourney(), practicedUnits: { 'retired-unit': oldTime } }),
    [CURRICULUM_PROGRESS_KEY]: JSON.stringify(historicalProgress), [CURRICULUM_REVIEW_KEY]: JSON.stringify([historicalReview]),
  };
  expect(saved).not.toHaveProperty(CHUNK_REVIEW_KEY);
  const seeded = await qa.account.client.from('language_user_state').update({ state: saved }).eq('user_id', qa.account.id).select('state').single();
  expect(seeded.error).toBeNull(); expect(seeded.data?.state).toEqual(saved);
  const before = { ...saved };
  let ttsRequests = 0;
  const onRequest = (request: import('@playwright/test').Request) => {
    if (new URL(request.url()).pathname === '/api/language/tts') ttsRequests++;
  };
  page.context().on('request', onRequest);
  // Fail closed before the listening click: even a regressed FREE_MODE path
  // cannot reach the TTS server. This is an abort, never a fabricated success.
  const ttsRoute = '**/api/language/tts**';
  const blockTts = (route: import('@playwright/test').Route) => route.abort('blockedbyclient');
  await page.route(ttsRoute, blockTts);
  const practice = () => page.getByRole('region', { name: '표현 조각 보충연습', exact: true });
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const unchanged = async () => {
    expect(canonical(await settingsState(page))).toBe(canonical(saved));
    expect(canonical(await qa.readLanguage())).toBe(canonical(saved));
    expect(await qa.read()).toEqual(fitness);
  };
  const answer = async (index: number, correct: boolean, neededHelp: boolean, mode: 'choice' | 'reading') => {
    const question = lesson.questions[index], region = practice();
    await expect(region.getByText(question.prompt, { exact: true })).toBeVisible();
    const next = region.getByRole('button', { name: index === 2 ? '이번 연습 확인' : '다음 문제', exact: true });
    // Review opens one question, so its completion control differs from the full queue.
    if (mode === 'reading' || neededHelp) await expect(next).toBeDisabled();
    const startedAt = await page.evaluate(() => Date.now());
    await region.getByRole('button', { name: question.choices[correct ? question.answer : (question.answer + 1) % question.choices.length], exact: true }).click();
    await expect(region.getByText(correct ? '맞게 골랐어요.' : '뜻과 문장 모양을 다시 확인해요.', { exact: true })).toBeVisible();
    await expect(region.getByText(question.explanation, { exact: true })).toBeVisible();
    await expect(region.getByText('이 답을 이 기기의 보충복습 기록에 저장했어요.', { exact: true })).toBeVisible();
    for (const choice of question.choices) await expect(region.getByRole('button', { name: choice, exact: true })).toBeDisabled();
    const snapshot = await page.evaluate(key => ({ raw: localStorage.getItem(key), at: Date.now() }), CHUNK_REVIEW_KEY);
    expect(snapshot.raw).not.toBeNull();
    const event = assertChunkDelta(saved[CHUNK_REVIEW_KEY], snapshot.raw,
      { lessonId: lesson.lessonId, questionId: question.id, correct, neededHelp, mode }, startedAt, snapshot.at);
    saved = { ...saved, [CHUNK_REVIEW_KEY]: snapshot.raw };
    expect(canonical(Object.fromEntries(Object.entries(saved).filter(([key]) => key !== CHUNK_REVIEW_KEY)))).toBe(canonical(before));
    await confirmedSettings(page, qa, saved, fitness);
    expect(ttsRequests).toBe(0);
    return event;
  };
  const names = ['뜻 고르기', '빈칸 고르기', '듣고 뜻 고르기'];
  const card = (index: number) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: `${info.title} · ${names[index]}`, exact: true }) });
  const restored = async (repaired: boolean) => {
    await synced(page);
    await expect(page.getByRole('heading', { level: 1, name: '표현 조각 보충복습', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '문법 표현', exact: true }).click();
    await expect(page.getByRole('button', { name: '지금 예정 0문제', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '저장한 전체 3문제', exact: true }).click();
    await expect(page.getByText('선택한 범위 3문제', { exact: true })).toBeVisible();
    for (const index of [0, 1, 2]) {
      await expect(card(index)).toHaveCount(1);
      await expect(card(index).getByText(`저장된 응답 ${index === 0 && repaired ? 2 : 1}회 · 오답 ${index === 0 ? 1 : 0}회 · 도움 포함 1회`, { exact: true })).toBeVisible();
      await expect(card(index).getByText(index === 0 ? repaired ? '최근 답: 정답 · 도움 없이 선택' : '최근 답: 오답 · 도움 포함'
        : index === 2 ? '최근 답: 정답 · 도움 포함 · 문장 보기 대체' : '최근 답: 정답 · 도움 포함', { exact: true })).toBeVisible();
    }
    const state = parseChunkReview(saved[CHUNK_REVIEW_KEY]);
    expect(Object.keys(state.events)).toHaveLength(repaired ? 4 : 3);
    expect(new Set(Object.values(state.events).map(event => event.attemptId)).size).toBe(repaired ? 4 : 3);
    const items = chunkReviewItems(state); expect(items).toHaveLength(3);
    for (const item of items) {
      const first = Object.values(state.events).find(event => event.questionId === item.questionId && event.neededHelp)!;
      expect(item.intervalDays).toBe(1); expect(item.successDates).toEqual([]);
      expect(Date.parse(item.nextReviewAt)).toBe(Date.parse(first.answeredAt) + 86_400_000);
      const nextLabel = new Date(item.nextReviewAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      await expect(card(lesson.questions.findIndex(question => question.id === item.questionId))).toContainText(`다음 복습 ${nextLabel}`);
    }
    await unchanged(); await noOverflow();
  };
  try {
    await test.step('synthetic history and real grammar entry at narrow width', async () => {
      await page.setViewportSize({ width: 320, height: 740 });
      await login(page, qa.account, info.href); await synced(page);
      await expect(page.getByLabel(/^배울 문법\s/)              ).toHaveValue('desu');
      await expect(page.getByRole('heading', { level: 2, name: info.title, exact: true })).toBeVisible();
      await page.getByRole('button', { name: '2. 예문', exact: true }).click();
      await page.getByRole('button', { name: '짧은 표현부터 조각으로 배우기', exact: true }).click();
      await expect(practice().getByText(lesson.expression, { exact: true })).toBeVisible();
      await expect(practice().getByText(lesson.sentence, { exact: true })).toBeVisible();
      await expect(practice().getByText(lesson.meaning, { exact: true })).toBeVisible();
      await noOverflow();
      const writes = writeCount(qa);
      await practice().getByRole('button', { name: '닫고 문법으로 돌아가기', exact: true }).click();
      await expect(page.getByRole('button', { name: '2. 예문', exact: true })).toHaveAttribute('aria-current', 'step');
      await unchanged(); expect(writeCount(qa)).toBe(writes);
      await page.getByRole('button', { name: '짧은 표현부터 조각으로 배우기', exact: true }).click();
    });
    await test.step('source-mapped chunks and both substitutions', async () => {
      await practice().getByRole('button', { name: '조각별 뜻과 역할 보기', exact: true }).click();
      for (const chunk of lesson.chunks) {
        const item = practice().getByRole('listitem').filter({ has: page.getByText(chunk.text, { exact: true }) });
        await expect(item).toHaveCount(1);
        await expect(item.getByText(`뜻: ${chunk.meaning}`, { exact: true })).toBeVisible();
        await expect(item.getByText(`역할: ${chunk.role}`, { exact: true })).toBeVisible();
      }
      await practice().getByRole('button', { name: '단어·시제 바꾼 예문 보기', exact: true }).click();
      for (const variation of lesson.variations) {
        const item = practice().getByRole('article').filter({ has: page.getByRole('heading', { name: `${variation.kind === 'word' ? '단어 바꾸기' : '시제 바꾸기'} · ${variation.label}`, exact: true }) });
        for (const text of [variation.sentence, variation.meaning, variation.explanation]) await expect(item.getByText(text, { exact: true })).toBeVisible();
      }
      await noOverflow(); await unchanged();
      await practice().getByRole('button', { name: '선택 문제 시작', exact: true }).click();
    });
    await test.step('wrong meaning correct gap and explicit unavailable listening fallback', async () => {
      await answer(0, false, true, 'choice');
      await practice().getByRole('button', { name: '다음 문제', exact: true }).click();
      await answer(1, true, true, 'choice');
      await practice().getByRole('button', { name: '다음 문제', exact: true }).click();
      const restore = await unavailableSpeech(page);
      try {
        await practice().getByRole('button', { name: '문제 소리 듣기', exact: true }).click();
        await expect(practice().getByRole('status').filter({ hasText: '기기의 일본어 음성을 재생하지 못했어요.' })).toBeVisible();
        await expect(practice().getByRole('button', { name: '문제 소리 듣기', exact: true })).toBeEnabled();
      } finally { expect(await restore()).toBeGreaterThan(0); }
      expect(ttsRequests).toBe(0); await unchanged();
      await practice().getByRole('button', { name: '문장 보기로 대신하기', exact: true }).click();
      await expect(practice().getByText(lesson.questions[2].audioText!, { exact: true })).toBeVisible();
      await answer(2, true, true, 'reading');
      await practice().getByRole('button', { name: '이번 연습 확인', exact: true }).click();
      await expect(practice().getByText('이번 화면에서 다시 풀 문제 1개가 있어요.', { exact: true })).toBeVisible();
      await practice().locator('header').getByRole('button', { name: '닫고 문법으로 돌아가기', exact: true }).click();
      await expect(page.getByRole('button', { name: '2. 예문', exact: true })).toHaveAttribute('aria-current', 'step');
      await page.getByRole('button', { name: '짧은 표현부터 조각으로 배우기', exact: true }).click();
      await practice().getByRole('link', { name: '표현 조각 보충복습 목록', exact: true }).click();
      await restored(false);
    });
    await test.step('later correct repair retains wrong event and restored schedule', async () => {
      await card(0).getByRole('button', { name: `${info.title} 뜻 고르기 다시 풀기`, exact: true }).click();
      await expect(practice().getByRole('heading', { name: '뜻 고르기', exact: true })).toBeVisible();
      await expect(practice().getByRole('button', { name: '이번 연습 확인', exact: true })).toBeDisabled();
      await answer(0, true, false, 'choice');
      await practice().getByRole('button', { name: '닫고 보충복습 목록으로', exact: true }).click();
      await restored(true); await page.reload(); await restored(true);
      await page.getByRole('button', { name: '로그아웃', exact: true }).click();
      await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), CHUNK_REVIEW_KEY)).toBeNull();
      await login(page, qa.account, '/language/chunk-review'); await restored(true);
      await card(0).getByRole('link', { name: '본수업 보기', exact: true }).click();
      await expect(page).toHaveURL(`http://127.0.0.1:3000${info.href}`);
      await expect(page.getByLabel(/^배울 문법\s/)              ).toHaveValue('desu');
      await expect(page.getByRole('heading', { level: 2, name: info.title, exact: true })).toBeVisible();
      await synced(page); await unchanged(); expect(ttsRequests).toBe(0);
    });
  } finally {
    try { await page.unroute(ttsRoute, blockTts); }
    finally { page.context().off('request', onRequest); expect(ttsRequests).toBe(0); }
  }
});

import { getChunkLesson } from '../../data/japaneseChunkLessons';
import { GRAMMAR_PROGRESS_KEY } from '../../data/grammar';
import { chunkLessonInfo } from '../../utils/japaneseChunkCatalog';
import { CHUNK_REVIEW_KEY, parseChunkReview, chunkReviewItems } from '../../utils/japaneseChunkReview';
import { FREE_MODE } from '../../lib/free-mode';
import { LEVEL_JOURNEY_KEY, emptyLevelJourney, oldTime, synced, writeCount } from './japanese-level-flow-state';
import { historicalProgress, historicalReview, CURRICULUM_PROGRESS_KEY, CURRICULUM_REVIEW_KEY } from './curriculum-browser-state';
import { settingsState, confirmedSettings } from './japanese-settings-state';
