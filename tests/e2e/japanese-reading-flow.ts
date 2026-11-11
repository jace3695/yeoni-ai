import type { Page } from '@playwright/test';
import { expect, login, canonical, type State, type Traffic } from './fixture';
import { JAPANESE_COURSE_GAP_LESSONS } from '../../data/japaneseCourseGapLessons';
import { getJapaneseReadingLesson, getReadingLessonLevel } from '../../data/japaneseReadingLessons';
import { getReadingSupport, readingEvidenceStrategy } from '../../data/japaneseReadingSupport';
import { getReadingEnhancement } from '../../data/japaneseReadingEnhancements';
import { LEVEL_JOURNEY_KEY, emptyLevelJourney, readLevelJourney, upperAnswerStable, type LevelJourney } from '../../utils/japaneseLevelJourney';
import { CHUNK_REVIEW_KEY } from '../../utils/japaneseChunkReview';

type Qa = { account: Parameters<typeof login>[1]; traffic: Traffic; read: () => Promise<State>; readLanguage: () => Promise<State> };
type Level = 'intermediate' | 'advanced';
type Phase = (action: () => Promise<void>) => Promise<void>;
type ReadingPhases = { setup: Phase; lessons: [Phase, Phase, Phase]; restoration: Phase };
const lessonIds = {
  intermediate: ['middle-core-01', 'middle-core-02', 'middle-core-03'],
  advanced: ['upper-core-01', 'upper-core-02', 'upper-core-03'],
};
const preservedUnits = { 'ci-preserved-unit': '2001-01-02T00:00:00.000Z' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const studyDay = (iso: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(iso));

// Static answers check source-to-UI mapping, not independent Japanese quality.
// Each caller gets its own unchanged qa fixture and the unchanged 90-second limit.
export async function verifyReadingLessons(page: Page, qa: Qa, level: Level, phases: ReadingPhases) {
  const lessons = JAPANESE_COURSE_GAP_LESSONS.filter(lesson => lesson.level === level);
  let beforeFitness: State; let before: State;
  let ttsRequests = 0;
  page.context().on('request', request => {
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:3000' && url.pathname === '/api/language/tts') ttsRequests++;
  });
  const levelTitle = level === 'intermediate' ? '중급' : '고급';
  const listPath = `/language/levels?level=${level}`;
  const synced = () => expect(page.getByText('학습 기록 · 서버 저장 확인', { exact: true })).toBeVisible();
  const local = async () => {
    const snapshot = await page.evaluate(key => ({ raw: localStorage.getItem(key), at: Date.now() }), LEVEL_JOURNEY_KEY);
    expect(snapshot.raw).not.toBeNull();
    const journey = readLevelJourney({ getItem: () => snapshot.raw, setItem: () => { throw new Error('Read-only snapshot'); } });
    expect(journey.selectedLevel).toBe('beginner'); expect(journey).not.toHaveProperty('selectionUpdatedAt');
    return { ...snapshot, raw: snapshot.raw!, journey };
  };
  const narrow = async () => {
    const size = await page.evaluate(() => ({ width: innerWidth, scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
    expect(size.width).toBe(320); expect(size.scroll).toBeLessThanOrEqual(size.width);
  };
  const listing = () => page.getByRole('region', { name: `${levelTitle} 학습 안내`, exact: true });
  const itemFor = (id: string) => listing().getByRole('listitem').filter({ has: page.locator(`a[href="/language/levels?lesson=${id}"]`) });
  const badge = async (id: string) => {
    const item = itemFor(id); await expect(item).toHaveCount(1);
    await expect(item.getByText('연습 기록 있음 · 다시 연습할 수 있어요', { exact: true })).toBeVisible();
    await expect(item.getByRole('link', { name: '단원 전체 다시 연습', exact: true })).toHaveAttribute('href', `/language/levels?lesson=${id}`);
  };
  const unchangedLocal = async () => {
    const keys = Object.keys(before).filter(key => key !== LEVEL_JOURNEY_KEY);
    const state = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);
    expect(state).toEqual(Object.fromEntries(keys.map(key => [key, before[key]])));
    expect(await page.evaluate(key => localStorage.getItem(key), CHUNK_REVIEW_KEY)).toBeNull();
  };
  let expectedAnswers: LevelJourney['answers'] = {};
  let expectedUnits: LevelJourney['practicedUnits'] = { ...preservedUnits };
  const sessions = new Set<string>();
  let saved: State = {};
  try {
    await phases.setup(async () => {
      expect(lessons.map(lesson => lesson.id)).toEqual(lessonIds[level]);
      expect(lessons).toHaveLength(3);
      expect(new Set(lessons.flatMap(lesson => lesson.questions.map(question => question.id))).size).toBe(18);
      for (const lesson of lessons) {
        expect(getJapaneseReadingLesson(lesson.id)).toEqual(lesson);
        expect(getReadingLessonLevel(lesson.id)).toBe(level);
        expect(lesson.questions.map(question => question.id)).toEqual(Array.from({ length: 6 }, (_, index) => `${lesson.id}-q${index + 1}`));
        expect(getReadingSupport(lesson)).toBeDefined(); expect(getReadingEnhancement(lesson)).toBeDefined();
      }
      beforeFitness = await qa.read();
      before = { ...await qa.readLanguage(), [LEVEL_JOURNEY_KEY]: JSON.stringify({
        ...emptyLevelJourney(), practicedUnits: preservedUnits,
      }) };
      expect(before).not.toHaveProperty(CHUNK_REVIEW_KEY);
      // Only an empty journey and unrelated synthetic stamp are seeded, before login.
      const seeded = await qa.account.client.from('language_user_state').update({ state: before }).eq('user_id', qa.account.id).select('state').single();
      expect(seeded.error).toBeNull(); expect(seeded.data?.state).toEqual(before);
      await login(page, qa.account, listPath); await synced();
      await expect(listing()).toBeVisible(); await unchangedLocal();
    });
    for (const [lessonIndex, lesson] of lessons.entries()) {
      await phases.lessons[lessonIndex](async () => {
        const link = listing().locator(`a[href="/language/levels?lesson=${lesson.id}"]`);
        await expect(link).toHaveCount(1); await link.click();
        await expect(page.getByRole('heading', { level: 1, name: lesson.title, exact: true })).toBeVisible();
        const support = getReadingSupport(lesson)!; const enhancement = getReadingEnhancement(lesson)!;
        const preparation = page.getByRole('region', { name: '읽기 목적과 준비', exact: true });
        await expect(preparation.getByText(support.purpose, { exact: true })).toBeVisible();
        await expect(preparation.getByText(`읽기 전에 생각해 보기: ${support.beforeReading}`, { exact: true })).toBeVisible();
        const passage = page.getByRole('article', { name: '일본어 본문', exact: true });
        for (const paragraph of lesson.paragraphs) await expect(passage.getByText(paragraph.japanese, { exact: true })).toBeVisible();
        if (lessonIndex === 0) { await page.setViewportSize({ width: 320, height: 800 }); await narrow(); }
        await page.getByRole('button', { name: '확인 문제 시작', exact: true }).click();
        let session = '';
        for (const [questionIndex, question] of lesson.questions.entries()) {
          const questionRegion = page.getByRole('region', { name: '읽기 확인 문제', exact: true });
          await expect(questionRegion.getByRole('heading', { level: 2, name: question.prompt, exact: true })).toBeVisible();
          const passageEvidence = questionRegion.getByRole('region', { name: '본문 정답 근거', exact: true });
          const transferEvidence = questionRegion.getByRole('region', { name: '새 상황의 근거', exact: true });
          await expect(passageEvidence).toHaveCount(0); await expect(transferEvidence).toHaveCount(0);
          await expect(questionRegion.getByRole('status')).toHaveCount(0);
          const next = questionRegion.getByRole('button', { name: questionIndex < 5 ? '다음 문제' : '표현을 비교하며 자기점검', exact: true });
          await expect(next).toBeDisabled();
          for (const choice of question.choices) await expect(questionRegion.getByRole('button', { name: choice, exact: true })).toBeEnabled();
          const intentionalWrong = level === 'intermediate' && lessonIndex === 0 && questionIndex === 1;
          const neededHelp = level === 'intermediate' && lessonIndex === 0 && questionIndex === 2;
          if (neededHelp) {
            await questionRegion.getByRole('button', { name: '근거 찾는 방법과 본문 보기', exact: true }).click();
            await expect(questionRegion.getByText(readingEvidenceStrategy(lesson, questionIndex), { exact: true })).toBeVisible();
            await expect(passageEvidence).toHaveCount(0); await expect(transferEvidence).toHaveCount(0);
          }
          const chosen = intentionalWrong ? (question.answer + 1) % question.choices.length : question.answer;
          const startedAt = Date.now();
          await questionRegion.getByRole('button', { name: question.choices[chosen], exact: true }).click();
          const feedback = questionRegion.getByRole('status');
          await expect(feedback.getByText(intentionalWrong ? '정답의 근거를 함께 확인해요.' : '맞게 골랐어요.', { exact: true })).toBeVisible();
          await expect(feedback.getByText(`내 선택: ${question.choices[chosen]}`, { exact: true })).toBeVisible();
          await expect(feedback.getByText(`정답: ${question.choices[question.answer]}`, { exact: true })).toBeVisible();
          await expect(feedback.getByText(question.explanation, { exact: true })).toBeVisible();
          await expect(feedback.getByText('이 답을 복습 기록에 저장했어요.', { exact: true })).toBeVisible();
          for (const [index, choice] of question.choices.entries()) {
            const button = questionRegion.getByRole('button', { name: choice, exact: true });
            await expect(button).toBeDisabled();
            await expect(button).toHaveAttribute('data-correct', String(index === question.answer));
            await expect(button).toHaveAttribute('data-wrong', String(intentionalWrong && index === chosen));
          }
          if (questionIndex < 4) {
            const evidence = enhancement.evidence.find(item => item.questionId === question.id)!;
            expect(evidence).toBeDefined(); await expect(passageEvidence).toBeVisible(); await expect(transferEvidence).toHaveCount(0);
            const scope = [...new Set(evidence.paragraphIndexes)];
            await expect(passageEvidence.getByText(`확인 범위: ${scope.map(index => `${index + 1}문단`).join(' · ')}`, { exact: true })).toBeVisible();
            await expect(passageEvidence.getByText(`근거 설명: ${evidence.reason}`, { exact: true })).toBeVisible();
            await expect(passageEvidence.locator('blockquote')).toHaveText(evidence.quotes);
            for (const quote of evidence.quotes) expect(scope.some(index => lesson.paragraphs[index].japanese.includes(quote))).toBe(true);
          } else {
            await expect(transferEvidence).toBeVisible(); await expect(passageEvidence).toHaveCount(0);
            await expect(transferEvidence.getByText(question.prompt, { exact: true })).toBeVisible();
            await expect(transferEvidence.getByText('원래 본문의 상황이 아니라, 이번 문제에 제시된 문장을 근거로 판단해요.', { exact: true })).toBeVisible();
          }
          const snapshot = await local(); const answer = snapshot.journey.answers[question.id];
          expect(answer).toMatchObject({ lessonId: lesson.id, questionId: question.id, correct: !intentionalWrong, neededHelp, attempts: 1, intervalDays: 1 });
          expect(answer.lastAttemptId.endsWith(`:${question.id}`)).toBe(true);
          const prefix = answer.lastAttemptId.slice(0, -question.id.length - 1); expect(prefix).toMatch(uuid);
          if (questionIndex === 0) { session = prefix; expect(sessions.has(prefix)).toBe(false); sessions.add(prefix); }
          expect(prefix).toBe(session);
          expect(Date.parse(answer.lastAnsweredAt)).toBeGreaterThanOrEqual(startedAt);
          expect(Date.parse(answer.lastAnsweredAt)).toBeLessThanOrEqual(snapshot.at);
          expect(Date.parse(answer.nextReviewAt)).toBe(Date.parse(answer.lastAnsweredAt) + 86_400_000);
          expect(answer.successDates).toEqual(intentionalWrong || neededHelp ? [] : [studyDay(answer.lastAnsweredAt)]);
          expect(upperAnswerStable(answer)).toBe(false);
          expectedAnswers = { ...expectedAnswers, [question.id]: answer };
          expect(snapshot.journey.answers).toEqual(expectedAnswers); expect(snapshot.journey.practicedUnits).toEqual(expectedUnits);
          if (lessonIndex === 0) await narrow();
          await expect(next).toBeEnabled(); await next.click();
        }
        const comparison = page.getByRole('region', { name: '서면 표현 자기점검', exact: true });
        const finish = comparison.getByRole('button', { name: '이번 단원 연습 기록 저장', exact: true });
        await expect(finish).toBeDisabled();
        await comparison.locator('summary').filter({ hasText: '같은 표현, 다른 상황 · 선택해서 열기' }).click();
        const pair = enhancement.pair;
        await expect(comparison.getByRole('heading', { level: 3, name: `${pair.expression} · ${pair.meaning}`, exact: true })).toBeVisible();
        for (const text of [pair.sourceSentence, pair.parallelSentence, pair.parallelMeaning, `달라진 내용: ${pair.changedDetail}`, `비교할 점: ${pair.caution}`]) {
          await expect(comparison.getByText(text, { exact: true })).toBeVisible();
        }
        await expect(comparison.getByText(lesson.writing.prompt, { exact: true })).toBeVisible();
        await comparison.getByRole('button', { name: '예시 답과 비교하기', exact: true }).click();
        await expect(comparison.getByText(lesson.writing.sample, { exact: true })).toBeVisible();
        await expect(comparison.getByText(lesson.writing.explanation, { exact: true })).toBeVisible();
        for (const text of lesson.writing.checklist) await expect(comparison.getByRole('listitem').filter({ hasText: text })).toHaveText(text);
        await expect(finish).toBeDisabled();
        if (lessonIndex === 0) await narrow();
        await comparison.getByRole('checkbox', { name: '예시와 점검 기준을 살펴봤어요. 실제 쓰기 능력 점수는 아니에요.', exact: true }).check();
        await expect(finish).toBeEnabled(); const completedAt = Date.now(); await finish.click();
        const done = page.getByRole('region', { name: '연습 마침', exact: true });
        await expect(done.getByRole('heading', { name: '이번 단원을 연습했어요', exact: true })).toBeVisible();
        const completed = await local(); const stamp = completed.journey.practicedUnits[lesson.id];
        expect(Date.parse(stamp)).toBeGreaterThanOrEqual(completedAt); expect(Date.parse(stamp)).toBeLessThanOrEqual(completed.at);
        expectedUnits = { ...expectedUnits, [lesson.id]: stamp };
        expect(completed.journey.practicedUnits).toEqual(expectedUnits); expect(completed.journey.answers).toEqual(expectedAnswers);
        // Define the expected full state from UI/local observations BEFORE reading DB.
        saved = { ...before, [LEVEL_JOURNEY_KEY]: completed.raw };
        await unchangedLocal();
        await expect.poll(async () => canonical(await qa.readLanguage())).toBe(canonical(saved));
        await expect.poll(() => qa.traffic.entries.some(entry => entry.table === 'language_user_state' && entry.method === 'GET'
          && entry.status === 200 && entry.delivered && entry.receivedState && canonical(entry.receivedState) === canonical(saved))).toBe(true);
        await synced(); qa.traffic.assertLanguageConfirmed(saved);
        expect(await qa.read()).toEqual(beforeFitness);
        if (lessonIndex === 0) await narrow();
        await done.getByRole('link', { name: `${levelTitle} 단원 목록으로`, exact: true }).click(); await badge(lesson.id);
        if (lessonIndex === 0) await page.setViewportSize({ width: 1280, height: 720 });
      });
    }
    await phases.restoration(async () => {
      const final = await local();
      expect(Object.keys(final.journey.answers).sort()).toEqual(lessons.flatMap(lesson => lesson.questions.map(question => question.id)).sort());
      expect(Object.keys(final.journey.practicedUnits).sort()).toEqual([...Object.keys(preservedUnits), ...lessonIds[level]].sort());
      expect(Object.values(final.journey.answers).filter(answer => answer.correct)).toHaveLength(level === 'intermediate' ? 17 : 18);
      expect(Object.values(final.journey.answers).filter(answer => answer.neededHelp)).toHaveLength(level === 'intermediate' ? 1 : 0);
      expect(sessions.size).toBe(3);
      const restored = async () => {
        await synced(); await expect(listing()).toBeVisible();
        for (const lesson of lessons) await badge(lesson.id);
        expect((await local()).raw).toBe(saved[LEVEL_JOURNEY_KEY]); await unchangedLocal();
        expect(canonical(await qa.readLanguage())).toBe(canonical(saved)); expect(await qa.read()).toEqual(beforeFitness);
      };
      await restored(); await page.reload(); await restored();
      await page.getByRole('button', { name: '로그아웃', exact: true }).click();
      await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), LEVEL_JOURNEY_KEY)).toBeNull();
      await login(page, qa.account, listPath); await restored();
    });
  } finally {
    // Supplemental observation, not a replacement for absent provider secrets/origin guards.
    expect(ttsRequests, 'No same-origin TTS requests during reading verification').toBe(0);
  }
}
