import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CURRICULUM } from '../data/curriculum.ts';
import {
  answerSessionQuestion, createLearningSession, getQuestionChoices, getSessionQuizIndices,
  getSessionResult, isTypedAnswerCorrect, normalizeLearningSession, retrySessionQuestion,
  updateSessionReviews, withLearningSessionDraft,
} from '../utils/learningSession.ts';
import { CURRICULUM_PROGRESS_KEY, loadCurriculumProgress, saveCurriculumProgress } from '../utils/curriculumProgress.ts';
import type { ReviewObservation } from '../utils/learningReview.ts';

const modes = ['starter', 'reader'] as const;
const lesson = CURRICULUM.find(item => item.id === 'f02')!;
const index = lesson.quiz.findIndex(quiz => quiz.kind === 'input' && quiz.choices[quiz.answer] === '名前');
const correctLabel = lesson.quiz[index].choices[lesson.quiz[index].answer];
const wrongLabel = getQuestionChoices(lesson, index, 'reader').find(choice => !choice.correct)!.label;
const now = new Date('2026-11-08T12:00:00Z');
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test('all 210 legacy input questions have distinct valid choices and one answer in both modes', () => {
  const covered = { foundation: 0, work: 0, travel: 0 };
  for (const entry of CURRICULUM) {
    const snapshot = JSON.stringify(entry);
    for (const [questionIndex, quiz] of entry.quiz.entries()) {
      for (const mode of modes) {
        const choices = getQuestionChoices(entry, questionIndex, mode);
        assert.ok(choices.length >= 2, `${entry.id}:${questionIndex}:${mode}`);
        assert.ok(choices.every(choice => choice.label.trim().length > 0));
        assert.equal(new Set(choices.map(choice => choice.label)).size, choices.length);
        assert.deepEqual(choices.filter(choice => choice.correct).map(choice => choice.label), [quiz.choices[quiz.answer]]);
        if (quiz.kind === 'input') {
          assert.equal(choices.length, 3);
          assert.ok(choices.every(choice => quiz.choices.includes(choice.label) || entry.words.some(word => word.japanese === choice.label)));
          assert.deepEqual(choices, getQuestionChoices(entry, questionIndex, 'starter'));
        } else {
          assert.deepEqual(choices.map(choice => choice.label).sort(), [...new Set(quiz.choices)].sort());
        }
      }
      if (quiz.kind === 'input') covered[entry.track] += 1;
    }
    assert.equal(JSON.stringify(entry), snapshot, 'Choice generation must not mutate source content or IDs.');
  }
  assert.equal(Object.values(covered).reduce((sum, count) => sum + count, 0), 210);
  assert.ok(Object.values(covered).every(count => count > 0));
});

test('deduplication happens before limiting legacy choices', () => {
  const duplicateWords = { ...lesson, words: [lesson.words[1], lesson.words[1], ...lesson.words] };
  for (const mode of modes) assert.equal(getQuestionChoices(duplicateWords, index, mode).length, 3);
});

test('new selection observations survive reader and starter session restoration unchanged', () => {
  for (const mode of modes) {
    const answered = answerSessionQuestion(createLearningSession(lesson.id, 20, mode), index, true, correctLabel, { neededHelp: false, modality: 'meaning', responseMs: 15001 });
    const draft = { ...answered, stage: 4, wordIndex: 1, quizCursor: index, speakingChecks: [true, false, true] };
    const restored = normalizeLearningSession(roundTrip(draft), lesson)!;
    assert.deepEqual(restored, draft);
    assert.equal(restored.mode, mode);
    const reviews = updateSessionReviews([], lesson, restored, now);
    assert.equal(reviews[0].id, `${lesson.id}:${index}`);
    assert.equal(reviews[0].lastModality, 'meaning');
    assert.equal(reviews[0].lastResponseMs, 15001);
    assert.equal(reviews[0].lastSessionResult, true);
    assert.deepEqual(updateSessionReviews(reviews, lesson, restored, now), reviews);
  }
});

test('old typed answers retain original text, classification, progress and first result', () => {
  for (const correct of [false, true]) {
    const response = correct ? ' なまえ。' : '以前の入力';
    const answered = answerSessionQuestion(createLearningSession(lesson.id, 20, 'reader'), index, correct, response, { neededHelp: !correct, modality: 'typing', responseMs: 19000 });
    const draft = { ...answered, stage: 4, quizCursor: index, wordIndex: 2 };
    const before = JSON.stringify(draft);
    const restored = normalizeLearningSession(roundTrip(draft), lesson)!;
    assert.deepEqual(restored, draft);
    assert.equal(JSON.stringify(draft), before);
    assert.equal(restored.responses[index], response);
    assert.equal(restored.answers[index], correct);
    assert.equal(restored.firstAnswers[index], correct);
    assert.equal(restored.observations?.[index].modality, 'typing');
    const [review] = updateSessionReviews([], lesson, restored, now);
    assert.equal(review.lastModality, 'typing');
    assert.equal(review.lastSessionResult, correct);
  }
  assert.equal(isTypedAnswerCorrect(lesson, index, ' なまえ。'), true, 'Historical answer evaluation remains available without a typing UI.');
});

test('old drafts without observations do not acquire invented observations', () => {
  const draft = answerSessionQuestion(createLearningSession(lesson.id, 20, 'reader'), index, true, ' なまえ。');
  const restored = normalizeLearningSession(roundTrip(draft), lesson)!;
  assert.deepEqual(restored, draft);
  assert.equal(restored.observations, undefined);
  assert.deepEqual(updateSessionReviews([], lesson, restored, now), []);
});

test('missing or invalid legacy modality falls back to old kind/mode while numeric fields are sanitized', () => {
  for (const modality of [undefined, 'invalid', null]) {
    const draft = { ...createLearningSession(lesson.id, 20, 'reader'), observations: { [index]: { modality, responseMs: -1, neededHelp: 'yes' }, 9999: { modality: 'meaning' } } };
    const restored = normalizeLearningSession(roundTrip(draft), lesson)!;
    assert.deepEqual(restored.observations, { [index]: { modality: 'typing', responseMs: undefined, neededHelp: false } });
  }
  for (const modality of ['meaning', 'listening', 'typing'] as const) {
    const draft = { ...createLearningSession(lesson.id, 20, 'reader'), observations: { [index]: { modality, responseMs: 2.6, neededHelp: true } } };
    assert.deepEqual(normalizeLearningSession(roundTrip(draft), lesson)?.observations?.[index], { modality, responseMs: 3, neededHelp: true });
  }
});

test('new wrong-choice retries preserve first answer, original time and help through restore and review', () => {
  for (const mode of modes) {
    let session = answerSessionQuestion(createLearningSession(lesson.id, 20, mode), index, false, wrongLabel, { neededHelp: true, modality: 'meaning', responseMs: 18000 });
    session = normalizeLearningSession(roundTrip(session), lesson)!;
    const retry = retrySessionQuestion(session, index);
    assert.equal(retry.answers[index], undefined);
    assert.equal(retry.responses[index], undefined);
    assert.equal(retry.firstAnswers[index], false);
    assert.deepEqual(retry.observations, session.observations);
    session = answerSessionQuestion(retry, index, true, correctLabel, { neededHelp: false, modality: 'meaning', responseMs: 500 });
    const restored = normalizeLearningSession(roundTrip(session), lesson)!;
    assert.equal(restored.answers[index], true);
    assert.equal(restored.firstAnswers[index], false);
    assert.equal(restored.responses[index], correctLabel);
    assert.deepEqual(restored.observations?.[index], { neededHelp: true, modality: 'meaning', responseMs: 18000 });
    const [review] = updateSessionReviews([], lesson, restored, now);
    assert.equal(review.wrongCount, 1);
    assert.equal(review.intervalDays, 1);
    assert.equal(review.successStreak, 0);
    assert.equal(review.lastModality, 'meaning');
    assert.equal(getSessionResult(lesson, restored).firstCorrect, 0);
    assert.equal(getSessionResult(lesson, restored).correct, 1);
  }
});

test('retrying a historical wrong typed answer records the new selection without changing its original draft', () => {
  const original = answerSessionQuestion(createLearningSession(lesson.id, 20, 'reader'), index, false, '以前の入力', { neededHelp: false, modality: 'typing', responseMs: 23000 });
  const snapshot = JSON.stringify(original);
  const restored = normalizeLearningSession(roundTrip(original), lesson)!;
  const retry = answerSessionQuestion(retrySessionQuestion(restored, index), index, true, correctLabel, { neededHelp: false, modality: 'meaning', responseMs: 800 });
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(retry.firstAnswers[index], false);
  assert.equal(retry.answers[index], true);
  assert.equal(retry.responses[index], correctLabel);
  assert.equal(retry.observations?.[index].modality, 'meaning');
  assert.equal(retry.observations?.[index].responseMs, 23000);
  assert.equal(normalizeLearningSession(roundTrip(retry), lesson)?.observations?.[index].modality, 'meaning');
});

test('choice response timing uses the choice threshold after restoration, while old typed timing keeps its threshold', () => {
  for (const modality of ['meaning', 'typing'] as const) {
    const observation: ReviewObservation = { neededHelp: false, modality, responseMs: 15000 };
    const session = answerSessionQuestion(createLearningSession(lesson.id, 20, 'reader'), index, true, correctLabel, observation);
    const existing = updateSessionReviews([], lesson, session, now).map(item => ({ ...item, lastSessionId: 'older-session', intervalDays: 3 }));
    const restored = normalizeLearningSession(roundTrip(session), lesson)!;
    assert.equal(updateSessionReviews(existing, lesson, restored, now)[0].intervalDays, modality === 'meaning' ? 3 : 7);
  }
});

test('short sessions preserve unasked historical typed reviews and source quiz indices', () => {
  for (const entry of CURRICULUM) {
    const indices = entry.quiz.map((_, questionIndex) => questionIndex);
    const vocabulary = indices.filter(questionIndex => questionIndex >= 2 && entry.quiz[questionIndex].kind !== 'input' && entry.quiz[questionIndex].kind !== 'listening');
    assert.deepEqual(getSessionQuizIndices(entry, 5), (vocabulary.length >= 3 ? vocabulary : indices).slice(0, 3));
    assert.deepEqual(getSessionQuizIndices(entry, 10), indices.filter(questionIndex => entry.quiz[questionIndex].kind !== 'input').slice(0, 5));
    assert.deepEqual(getSessionQuizIndices(entry, 20), indices);
  }
  const oldSession = answerSessionQuestion(createLearningSession(lesson.id, 20, 'reader'), index, false, '以前の入力', { neededHelp: true, modality: 'typing', responseMs: 20000 });
  const oldReviews = updateSessionReviews([], lesson, oldSession, now);
  const shortSession = answerSessionQuestion(createLearningSession(lesson.id, 5, 'reader'), 2, true, 'synthetic', { neededHelp: false, modality: 'meaning', responseMs: 500 });
  assert.deepEqual(updateSessionReviews(oldReviews, lesson, shortSession, now).find(item => item.id === `${lesson.id}:${index}`), oldReviews[0]);
});

test('synthetic save and reload preserve both historical and new drafts alongside completion history', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map<string, string>();
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } });
  try {
    const otherLesson = CURRICULUM.find(entry => entry.id === 'f01')!;
    const old = answerSessionQuestion(createLearningSession(otherLesson.id, 20, 'reader'), 3, true, ' こんにちは。', { neededHelp: false, modality: 'typing', responseMs: 11000 });
    const fresh = answerSessionQuestion(createLearningSession(lesson.id, 20, 'reader'), index, false, wrongLabel, { neededHelp: true, modality: 'meaning', responseMs: 13000 });
    const progress = { ...loadCurriculumProgress(), completedLessonIds: ['f01'], quizScores: { f01: 75 }, activityDates: ['2026-11-01'], lessonAttempts: { f01: [{ score: 75, completedAt: '2026-11-01T12:00:00Z' }] } };
    saveCurriculumProgress(withLearningSessionDraft(withLearningSessionDraft(progress, old), fresh));
    const serialized = localStorage.getItem(CURRICULUM_PROGRESS_KEY);
    const loaded = loadCurriculumProgress();
    assert.deepEqual(normalizeLearningSession(loaded.lessonDrafts?.f01, otherLesson), old);
    assert.deepEqual(normalizeLearningSession(loaded.lessonDrafts?.f02, lesson), fresh);
    assert.deepEqual(normalizeLearningSession(loaded.activeSession, lesson), fresh);
    assert.deepEqual(loaded.completedLessonIds, progress.completedLessonIds);
    assert.deepEqual(loaded.quizScores, progress.quizScores);
    assert.deepEqual(loaded.lessonAttempts, progress.lessonAttempts);
    assert.deepEqual(loaded.activityDates, progress.activityDates);
    assert.equal(localStorage.getItem(CURRICULUM_PROGRESS_KEY), serialized);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('shared learning question has no typing form or handler and labels new answers by actual choice method', () => {
  const source = readFileSync(new URL('../components/language/LearningQuestion.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<form\b|<input\b|<textarea\b|onSubmit=|setTyped|isTypedAnswerCorrect|useId/);
  assert.doesNotMatch(source, /일본어로 써 보세요|입력해도 괜찮아요|타자|키보드/);
  assert.match(source, /modality: quiz\.kind === 'listening' \? 'listening' : 'meaning'/);
  assert.doesNotMatch(source, /reviewModality\(/);
});
