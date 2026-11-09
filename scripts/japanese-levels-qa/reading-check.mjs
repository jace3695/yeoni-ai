import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { JAPANESE_READING_LESSONS, getReadingLessonLevel } from '../../data/japaneseReadingLessons.ts';
import { getReadingSupport } from '../../data/japaneseReadingSupport.ts';
import { getReadingEnhancement } from '../../data/japaneseReadingEnhancements.ts';

const output = process.env.READING_QA_OUTPUT || '/tmp/yeoni-reading-comparison-evidence';
mkdirSync(output, { recursive: true });
const origin = 'http://127.0.0.1:8886';
const key = 'japaneseLevelJourneyV1';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
const errors = [], external = [], proof = [];
await context.addInitScript(() => {
  window.__spoken = []; window.__mic = 0;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [{ name: 'Synthetic Japanese', lang: 'ja-JP', localService: true }], cancel: () => {}, speak: utterance => { window.__spoken.push(utterance.text); utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 20); }, addEventListener: () => {}, removeEventListener: () => {} } });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => { window.__mic++; throw Error('No microphone permitted'); } } });
});
await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (external.push(route.request().url()), route.abort()));
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const selected = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"selectedLevel":"beginner"}').selectedLevel, key);
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320px horizontal overflow');
try {
  await page.goto(origin + '/language/levels?level=intermediate');
  await page.getByRole('heading', { name: '읽기·표현 비교 · 8단원', exact: true }).waitFor();
  assert.equal(await page.locator('a[href^="/language/learn?lesson="]').count(), 8);
  assert.equal(await page.locator('a[href^="/language/levels?lesson="]').count(), 8);
  await noOverflow();
  await page.screenshot({ path: `${output}/middle-list-320.png`, fullPage: true });
  await page.goto(origin + '/language/levels?level=advanced');
  await page.getByRole('heading', { name: '읽기·표현 비교 · 12단원', exact: true }).waitFor();
  assert.equal(await page.locator('a[href^="/language/levels?lesson="]').count(), 12);
  assert.equal(await selected(), 'beginner');
  proof.push('Intermediate has 8 original lessons plus 8 reading units; advanced has 12 reading units, without changing selection.');

  let checkedQuestions = 0;
  for (const lesson of JAPANESE_READING_LESSONS) {
    const level = getReadingLessonLevel(lesson.id);
    const title = level === 'intermediate' ? '중급' : '고급';
    await page.goto(origin + '/language/levels?lesson=' + lesson.id);
    await page.getByRole('heading', { name: lesson.title, exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: `← ${title} 단원으로`, exact: true }).getAttribute('href'), '/language/levels?level=' + level);
    assert.equal(await page.getByRole('textbox').count(), 0);
    await page.getByRole('region', { name: '읽기 목적과 준비', exact: true }).waitFor();
    assert.equal(await page.locator('details[open]').count(), 0);
    for (const paragraph of lesson.paragraphs) assert.equal(await page.getByText(paragraph.meaning, { exact: true }).isVisible(), false);
    await page.locator('[aria-current="step"]', { hasText: '현재: 읽기' }).waitFor();
    assert.equal(await page.getByText('같은 표현, 다른 상황 · 선택해서 열기', { exact: true }).count(), 0);
    const enhancement = getReadingEnhancement(lesson);
    const support = getReadingSupport(lesson);
    if (support) {
      assert.equal(await page.locator('mark').count(), 0);
      await page.getByRole('checkbox', { name: '목표 표현 강조하기', exact: true }).check();
      const marks = await page.locator('mark').allTextContents();
      assert.ok(marks.length > 0); assert.ok(marks.every(mark => support.targetExpressions.includes(mark)));
      assert.deepEqual(await page.locator('article[aria-label="일본어 본문"] p[lang="ja"]').allTextContents(), lesson.paragraphs.map(p => p.japanese));
      await page.getByRole('checkbox', { name: '목표 표현 강조하기', exact: true }).uncheck();
      assert.equal(await page.locator('mark').count(), 0);
    }
    await noOverflow();
    if (lesson.id === 'middle-01' || lesson.id === 'upper-mech-06') await page.screenshot({ path: `${output}/${lesson.id}-320.png`, fullPage: true });
    // A new visit starts a new session, so this run tests per-question assistance separately.
    await page.reload();
    await page.getByRole('button', { name: '확인 문제 시작', exact: true }).click();
    for (const [index, question] of lesson.questions.entries()) {
      assert.ok(!(await page.locator('body').textContent()).includes(question.explanation), question.id + ' leaked explanation before response');
      assert.equal(await page.getByRole('region', { name: '본문 정답 근거', exact: true }).count(), 0);
      assert.equal(await page.getByRole('region', { name: '새 상황의 근거', exact: true }).count(), 0);
      assert.equal(await page.getByText('같은 표현, 다른 상황 · 선택해서 열기', { exact: true }).count(), 0);
      await page.locator('[aria-current="step"]', { hasText: index < 4 ? '현재: 본문 확인' : '현재: 새 상황' }).waitFor();
      await page.getByText(index < 4 ? `문제 ${index + 1} / 6 · 본문 확인` : `문제 ${index + 1} / 6 · 새 상황 적용`, { exact: true }).waitFor();
      if (index === 0) {
        await page.getByRole('button', { name: '근거 찾는 방법과 본문 보기', exact: true }).dblclick();
        assert.ok(!(await page.locator('body').textContent()).includes(question.explanation), question.id + ' leaked explanation in support');
      }
      if (index === 1) {
        await page.getByRole('button', { name: '본문 다시 읽기', exact: true }).click();
        await page.getByRole('button', { name: '확인 문제 시작', exact: true }).click();
      }
      if (index === 4) {
        await page.getByRole('button', { name: '근거 찾는 방법과 본문 보기', exact: true }).click();
        await page.getByText(/새 상황에 적힌 문장만 근거로 읽으세요/).waitFor();
        assert.equal(await page.getByText(lesson.paragraphs[0].japanese, { exact: true }).count(), 0);
      }
      if (lesson.id === 'middle-01' && index === 0) await page.evaluate(key => {
        const original = Storage.prototype.setItem;
        window.__restoreStorage = () => { Storage.prototype.setItem = original; };
        Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.call(this, k, v); };
      }, key);
      await page.getByRole('button', { name: question.choices[question.answer], exact: true }).click();
      if (lesson.id === 'middle-01' && index === 0) {
        await page.getByRole('button', { name: '이 답 저장 다시 시도', exact: true }).waitFor();
        await page.evaluate(() => window.__restoreStorage());
        await page.getByRole('button', { name: '이 답 저장 다시 시도', exact: true }).click();
      }
      await page.getByText(question.explanation, { exact: true }).waitFor();
      await page.getByText('이 답을 복습 기록에 저장했어요.', { exact: true }).waitFor();
      const answer = await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)).answers[id], { key, id: question.id });
      assert.equal(answer.neededHelp, [0, 1, 4].includes(index));
      assert.equal(answer.attempts, 1);
      await page.getByText('내 선택:', { exact: true }).waitFor();
      await page.getByText('정답:', { exact: true }).waitFor();
      if (index < 4 && enhancement) {
        const evidence = enhancement.evidence.find(item => item.questionId === question.id);
        const region = page.getByRole('region', { name: '본문 정답 근거', exact: true });
        await region.getByText(evidence.reason, { exact: false }).waitFor();
        assert.deepEqual(await region.locator('blockquote').allTextContents(), evidence.quotes);
        for (const quote of evidence.quotes) assert.ok(evidence.paragraphIndexes.some(i => lesson.paragraphs[i].japanese.includes(quote)));
        assert.equal(await region.locator('details[open]').count(), 0);
        const savedBeforeEvidence = await page.evaluate(key => localStorage.getItem(key), key);
        await region.getByText('근거 문단 전체 다시 보기', { exact: true }).click();
        for (const i of new Set(evidence.paragraphIndexes)) await region.getByText(lesson.paragraphs[i].japanese, { exact: true }).waitFor();
        await noOverflow();
        if (lesson.id === 'middle-01' && index === 0) await page.screenshot({ path: `${output}/middle-answer-evidence-320.png`, fullPage: true });
        await region.getByText('근거 문단 전체 다시 보기', { exact: true }).click();
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), savedBeforeEvidence);
      }
      if (index >= 4) {
        await page.getByRole('region', { name: '새 상황의 근거', exact: true }).waitFor();
        assert.equal(await page.getByRole('region', { name: '본문 정답 근거', exact: true }).count(), 0);
      }
      await page.getByRole('button', { name: index < 5 ? '다음 문제' : '표현을 비교하며 자기점검', exact: true }).click();
      checkedQuestions++;
    }
    await page.locator('[aria-current="step"]', { hasText: '현재: 표현 비교' }).waitFor();
    if (enhancement) {
      const toggle = page.getByText('같은 표현, 다른 상황 · 선택해서 열기', { exact: true });
      assert.equal(await page.getByText(enhancement.pair.parallelSentence, { exact: true }).isVisible(), false);
      const savedBeforePair = await page.evaluate(key => localStorage.getItem(key), key);
      await toggle.click();
      await page.getByText(enhancement.pair.parallelSentence, { exact: true }).waitFor();
      await noOverflow();
      assert.equal(await page.getByRole('textbox').count(), 0);
      if (lesson.id === 'middle-01' || lesson.id === 'upper-mech-06') await page.screenshot({ path: `${output}/${lesson.id}-pair-320.png`, fullPage: true });
      await toggle.click(); await toggle.click();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), savedBeforePair);
    }
    await page.getByRole('button', { name: '예시 답과 비교하기', exact: true }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '이번 단원 연습 기록 저장', exact: true }).click();
    await page.getByRole('heading', { name: '이번 단원을 연습했어요', exact: true }).waitFor();
    await page.locator('[aria-current="step"]', { hasText: '현재: 마침' }).waitFor();
    await page.getByRole('link', { name: `${title} 단원 목록으로`, exact: true }).click();
    await page.getByRole('heading', { name: `읽기·표현 비교 · ${level === 'intermediate' ? 8 : 12}단원`, exact: true }).waitFor();
    assert.equal(await selected(), 'beginner');
  }
  assert.equal(checkedQuestions, 120);
  proof.push('All 20 units / 120 questions completed with phase indicators, 56 scoped evidence blocks, 40 transfer labels and 14 optional comparisons. Correct level return, collapsed help, literal highlighting, before-answer non-leakage, transfer labels, per-question assistance, duplicate clicks and storage retry checked.');

  // First-reading help is recorded conservatively even after it is closed.
  await page.goto(origin + '/language/levels?lesson=middle-02');
  await page.getByText('한국어 뜻 확인 · 1문단', { exact: true }).click();
  await page.getByText(JAPANESE_READING_LESSONS.find(l => l.id === 'middle-02').paragraphs[0].meaning, { exact: true }).waitFor();
  await page.getByText('한국어 뜻 확인 · 1문단', { exact: true }).click();
  await page.getByRole('button', { name: '확인 문제 시작', exact: true }).click();
  const middle = JAPANESE_READING_LESSONS.find(l => l.id === 'middle-02');
  await page.getByRole('button', { name: middle.questions[0].choices[middle.questions[0].answer], exact: true }).click();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).answers['middle-02-q1'].neededHelp, key), true);
  await page.reload();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).answers['middle-02-q1'].attempts, key), 2);
  proof.push('Translation is optional and assisted status survives closing help and reloading; stored attempts do not duplicate on reload.');

  // Only keyboard input, including traversal to controls, from the reading page onward.
  const keyboardActivate = async (label, role = 'BUTTON') => {
    for (let step = 0; step < 100; step++) {
      const active = await page.evaluate(() => ({ role: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim() }));
      if (active.role === role && active.text === label) { await page.keyboard.press('Enter'); return; }
      await page.keyboard.press('Tab');
    }
    throw Error('Keyboard could not reach ' + label);
  };
  await page.goto(origin + '/language/levels?lesson=middle-03');
  await page.getByRole('heading', { name: '무엇을 찾으며 읽을까요?', exact: true }).waitFor();
  await keyboardActivate('확인 문제 시작');
  const keyboardLesson = JAPANESE_READING_LESSONS.find(lesson => lesson.id === 'middle-03');
  for (const [index, question] of keyboardLesson.questions.entries()) {
    await page.waitForFunction(prompt => document.activeElement?.tagName === 'H2' && document.activeElement?.textContent === prompt, question.prompt);
    await keyboardActivate(question.choices[question.answer]);
    await keyboardActivate(index < 5 ? '다음 문제' : '표현을 비교하며 자기점검');
  }
  await page.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement?.textContent === '표현을 비교하며 자기점검');
  proof.push('Keyboard-only traversal completes six questions; each question and the comparison stage receive heading focus. Screen-reader speech is not tested.');

  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    for (const id of ['middle-01-q1', 'upper-mech-01-q1']) state.answers[id].nextReviewAt = '2020-01-01T00:00:00Z';
    localStorage.setItem(key, JSON.stringify(state));
  }, key);
  await page.goto(origin + '/language/levels?level=intermediate');
  await page.getByText('전체 단계 예정 복습: 2문제 · 전체 2문제', { exact: true }).waitFor();
  const beforeFilter = await page.evaluate(key => localStorage.getItem(key), key);
  await page.getByRole('button', { name: '살펴보는 중급만', exact: true }).dblclick();
  await page.getByText('살펴보는 중급 예정 복습: 1문제 · 전체 2문제', { exact: true }).waitFor();
  assert.equal(await page.locator('a[href$="&review=1"]').count(), 1);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), beforeFilter);
  await page.getByRole('button', { name: '전체 단계 예정 복습', exact: true }).click();
  assert.equal(await page.locator('a[href$="&review=1"]').count(), 2);
  await page.getByRole('link', { name: '고급 살펴보기', exact: true }).click();
  await page.goBack(); await page.goForward();
  assert.equal(await selected(), 'beginner');
  for (const id of ['middle-01', 'upper-mech-01']) {
    const lesson = JAPANESE_READING_LESSONS.find(l => l.id === id);
    const level = getReadingLessonLevel(id), title = level === 'intermediate' ? '중급' : '고급';
    await page.goto(origin + '/language/levels?lesson=' + id + '&review=1');
    await page.getByRole('region', { name: '예정 복습 진행', exact: true }).waitFor();
    await page.getByText('현재: 예정 복습 1/1 · 본문 확인', { exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: '단원 학습 흐름', exact: true }).count(), 0);
    await page.getByRole('button', { name: lesson.questions[0].choices[lesson.questions[0].answer], exact: true }).click();
    await page.getByText(lesson.questions[0].explanation, { exact: true }).waitFor();
    await page.getByRole('button', { name: '복습 마치기', exact: true }).click();
    assert.equal(await page.getByText('같은 표현, 다른 상황 · 선택해서 열기', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: `${title} 단원 목록으로`, exact: true }).getAttribute('href'), '/language/levels?level=' + level);
    await page.reload();
    await page.getByRole('heading', { name: '지금 예정된 복습은 없어요', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: `${title} 단계 화면으로`, exact: true }).getAttribute('href'), '/language/levels?level=' + level);
  }
  proof.push('All/preview-level review filters are read-only; middle and advanced due queues freeze for feedback, then empty after reload and return to their own levels.');
  await page.goto(origin + '/language/levels?lesson=middle-01');
  await page.getByRole('button', { name: '확인 문제 시작', exact: true }).click();
  await page.evaluate(() => { window.levelFixture.prepareLanguageLocalState('synthetic-new-owner'); window.dispatchEvent(new Event('yeoni-cloud-session-changed')); });
  await page.getByRole('button', { name: '확인 문제 시작', exact: true }).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  proof.push('Account switch clears the prior in-memory reading question and isolates records.');
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.equal(await page.evaluate(() => window.__mic), 0);
  writeFileSync(`${output}/result.json`, JSON.stringify({ passed: true, checkedQuestions, proof, errors, external, microphoneCalls: 0, scope: 'Actual components in a synthetic local browser fixture. No real login, cloud persistence, device speech or real audio listening verified.' }, null, 2));
  console.log(JSON.stringify({ passed: true, checkedQuestions, checks: proof.length, output }, null, 2));
} finally { await browser.close(); }
