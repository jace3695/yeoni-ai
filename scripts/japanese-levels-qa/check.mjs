import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CURRICULUM } from '../../data/curriculum.ts';
import { JAPANESE_UPPER_LESSONS } from '../../data/japaneseUpperLessons.ts';
import { createLearningSession, getSessionQuizIndices } from '../../utils/learningSession.ts';
const output = '/tmp/yeoni-japanese-levels-evidence'; mkdirSync(output, { recursive: true });
const origin = 'http://127.0.0.1:8886';
const key = 'japaneseLevelJourneyV1';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [], external = [], proof = [];
await context.addInitScript(() => {
  window.__spoken = []; window.__mic = 0;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [{ name: 'Synthetic Japanese', lang: 'ja-JP', localService: true }], cancel: () => {}, speak: utterance => { window.__spoken.push(utterance.text); utterance.onstart?.(); setTimeout(() => utterance.onend?.(), 20); }, addEventListener: () => {}, removeEventListener: () => {} } });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => { window.__mic++; throw Error('No microphone permitted'); } } });
});
await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (external.push(route.request().url()), route.abort()));
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(origin + '/language/levels');
  await page.getByRole('heading', { name: '초급부터 고급까지, 내 속도로' }).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  const legacy = { completedLessonIds: ['f01'], selectedTrack: 'foundation', quizScores: { f01: 80 }, lessonAttempts: {}, activityDates: [] };
  await page.evaluate(({ key, legacy }) => { localStorage.setItem('language-cloud-sync-user', 'synthetic-A'); localStorage.setItem('japaneseCurriculumProgressV1', JSON.stringify(legacy)); localStorage.setItem('grammarProgress', '[{"lessonId":"desu","correctCount":2}]'); }, { key, legacy });
  await page.reload();
  await page.getByRole('link', { name: '중급 살펴보기', exact: true }).click();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  await page.getByRole('button', { name: '중급 선택하기', exact: true }).click();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedLevel, key), 'intermediate');
  await page.getByRole('link', { name: '고급 살펴보기', exact: true }).click();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedLevel, key), 'intermediate');
  await page.goBack(); await page.goForward();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedLevel, key), 'intermediate');
  await page.getByRole('link', { name: '초급 살펴보기', exact: true }).click();
  await page.getByRole('button', { name: '초급 선택하기', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('japaneseCurriculumProgressV1'))), legacy);
  proof.push('Preview, Back/Forward and lesson visits do not select a level; explicit forward/backward choice preserves legacy history.');

  const last = CURRICULUM.find(item => item.id === 'f12'); const session = createLearningSession(last.id, 10, 'starter');
  const indices = getSessionQuizIndices(last, 10); session.stage = 4; session.quizCursor = indices.length - 1;
  for (const index of indices) { session.answers[index] = true; session.firstAnswers[index] = true; session.responses[index] = last.quiz[index].choices[last.quiz[index].answer]; }
  await page.evaluate(({ legacy, session }) => localStorage.setItem('japaneseCurriculumProgressV1', JSON.stringify({ ...legacy, activeSession: session })), { legacy, session });
  await page.goto(origin + '/language/learn?lesson=f12&level=beginner');
  await page.getByRole('button', { name: '오늘 연습 저장하기' }).click();
  await page.getByRole('link', { name: '초급 더 반복하기', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '다음 수업 보기', exact: true }).count(), 0);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedLevel, key), 'beginner');
  assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem('japaneseCurriculumProgressV1')).completedLessonIds)).includes('f01'));
  proof.push('Completing f12 from beginner returns to beginner repetition rather than f13 or automatic promotion.');

  const lesson = JAPANESE_UPPER_LESSONS[0];
  await page.goto(origin + '/language/levels?lesson=' + lesson.id);
  assert.equal(await page.getByRole('textbox').count(), 0);
  await page.getByRole('button', { name: '1문단 듣기', exact: true }).click();
  await page.waitForFunction(text => window.__spoken.includes(text), lesson.paragraphs[0].japanese);
  await page.getByRole('button', { name: '확인 문제 시작', exact: true }).click();
  await page.getByRole('button', { name: '본문 다시 읽기', exact: true }).click();
  await page.getByRole('button', { name: '확인 문제 시작', exact: true }).click();
  for (const [index, question] of lesson.questions.entries()) {
    const choice = index === 1 ? (question.answer + 1) % 3 : question.answer;
    if (index === 0) await page.evaluate(key => { const original = Storage.prototype.setItem; window.__restoreStorage = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.call(this, k, v); }; }, key);
    await page.getByRole('button', { name: question.choices[choice], exact: true }).click();
    if (index === 0) { await page.getByRole('button', { name: '이 답 저장 다시 시도', exact: true }).waitFor(); await page.evaluate(() => window.__restoreStorage()); await page.getByRole('button', { name: '이 답 저장 다시 시도', exact: true }).click(); }
    await page.getByText('이 답을 복습 기록에 저장했어요.', { exact: true }).waitFor();
    await page.getByRole('button', { name: index === lesson.questions.length - 1 ? '표현을 비교하며 자기점검' : '다음 문제', exact: true }).click();
  }
  assert.equal(await page.getByRole('textbox').count(), 0);
  assert.equal(await page.getByRole('button', { name: '이번 단원 연습 기록 저장', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '예시 답과 비교하기', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '이번 단원 연습 기록 저장', exact: true }).click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(saved.selectedLevel, 'beginner'); assert.equal(Object.keys(saved.answers).length, 6); assert.ok(saved.practicedUnits[lesson.id]);
  assert.equal(saved.answers[lesson.questions[0].id].neededHelp, true); assert.equal(saved.answers[lesson.questions[0].id].attempts, 1);
  assert.equal(saved.answers[lesson.questions[1].id].correct, false);
  proof.push('Six real reading questions, fixed-text listening, retry after quota failure, assisted recall, wrong answer and self-check completion work without text entry or promotion.');

  await page.evaluate(({ key, id }) => { const state = JSON.parse(localStorage.getItem(key)); state.answers[id].nextReviewAt = '2020-01-01T00:00:00.000Z'; localStorage.setItem(key, JSON.stringify(state)); }, { key, id: lesson.questions[0].id });
  await page.goto(origin + '/language/levels?lesson=' + lesson.id + '&review=1');
  await page.getByRole('button', { name: lesson.questions[0].choices[lesson.questions[0].answer], exact: true }).click();
  await page.getByText('이 답을 복습 기록에 저장했어요.', { exact: true }).waitFor();
  await page.getByRole('button', { name: '복습 마치기', exact: true }).click();
  await page.getByRole('heading', { name: '이번 복습을 마쳤어요', exact: true }).waitFor();
  await page.reload(); await page.getByRole('heading', { name: '지금 예정된 복습은 없어요', exact: true }).waitFor();
  proof.push('Due-only review freezes its question for feedback, reschedules it, and becomes empty after reload.');

  await page.goto(origin + '/language/levels');
  await page.evaluate(key => { const state = window.levelFixture.readLanguageState(); const journey = JSON.parse(state[key]); journey.selectedLevel = 'intermediate'; journey.selectionUpdatedAt = new Date().toISOString(); window.levelFixture.applyLanguageState({ ...state, [key]: JSON.stringify(journey) }); }, key);
  await page.getByText('내가 선택한 단계:', { exact: false }).filter({ hasText: '중급' }).waitFor();
  proof.push('Same-tab remote state apply refreshes visible selected level without a focus change.');

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/language/levels?level=advanced');
    await page.getByRole('heading', { name: '고급 · 글의 근거와 표현 다듬기', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    await page.screenshot({ path: `${output}/levels-${width}.png`, fullPage: true });
  }
  await page.goto(origin + '/language/levels?lesson=upper-06');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${output}/upper-reading.png`, fullPage: true });
  proof.push('320/390/768px level views and long-reading content have no horizontal overflow.');

  await page.getByRole('button', { name: '확인 문제 시작', exact: true }).click();
  await page.evaluate(() => { window.levelFixture.prepareLanguageLocalState('synthetic-B'); window.dispatchEvent(new Event('yeoni-cloud-session-changed')); });
  await page.getByRole('button', { name: '확인 문제 시작', exact: true }).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  proof.push('Account boundary clears the prior question state and never saves old work into the new owner.');

  await page.goto(origin + '/language/levels?level=advanced');
  await page.evaluate(() => localStorage.setItem('language-cloud-sync-user', 'synthetic-C'));
  await page.getByRole('button', { name: '고급 선택하기', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  proof.push('A stale owner change before event delivery blocks writes.');

  await page.evaluate(key => localStorage.setItem(key, '{damaged'), key);
  await page.goto(origin + '/language/levels'); await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: '기록 다시 읽기', exact: true }).click();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{damaged');
  proof.push('Malformed storage is retained, with saving blocked and retry offered.');

  assert.equal(await page.evaluate(() => window.__mic), 0); assert.deepEqual(errors, []); assert.deepEqual(external, []);
  writeFileSync(`${output}/result.json`, JSON.stringify({ passed: true, proof, errors, external, microphoneCalls: 0, scope: 'Actual components with synthetic local account/audio and localStorage only. No real authentication, hosted database, physical device or live audio quality validation.' }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: proof.length, output }, null, 2));
} finally { await browser.close(); }
