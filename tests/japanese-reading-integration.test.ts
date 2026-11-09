import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JAPANESE_READING_EXPANSION } from '../data/japaneseContentExpansion.ts';
import { JAPANESE_UPPER_LESSONS } from '../data/japaneseUpperLessons.ts';
import { JAPANESE_LEVELS, getLevelLegacyLessons } from '../data/japaneseLevels.ts';
import { JAPANESE_READING_LESSONS, getJapaneseReadingLesson, getLevelReadingLessons, getReadingLessonLevel, isKnownReadingAnswer } from '../data/japaneseReadingLessons.ts';
import { JAPANESE_READING_SUPPORT, getReadingSupport, readingEvidenceStrategy } from '../data/japaneseReadingSupport.ts';
import { splitReadingHighlights } from '../utils/japaneseReadingHighlight.ts';
import { dueUpperAnswers, emptyLevelJourney, rememberUpperAnswer } from '../utils/japaneseLevelJourney.ts';

test('20 reviewed lessons preserve all 120 question IDs and answer positions', () => {
  assert.equal(JAPANESE_READING_LESSONS.length, 20);
  assert.equal(JAPANESE_READING_LESSONS.flatMap(lesson => lesson.questions).length, 120);
  // Reviewed 2026-11-09 content: middle-06/07 clarity, mechanical-02 deadline,
  // and mechanical-03 sample corrections. IDs and answer positions retain the base contract.
  assert.equal(createHash('sha256').update(JSON.stringify(JAPANESE_READING_LESSONS)).digest('hex'), '490da50998f6c6eb191bcef874d76e92a930ad7d8280f6b5c0388bc53c0343d2');
  assert.equal(createHash('sha256').update(JSON.stringify(JAPANESE_READING_LESSONS.map(lesson => ({ id: lesson.id, questions: lesson.questions.map(q => ({ id: q.id, answer: q.answer })) })))).digest('hex'), 'd0fdb8cf435b2d9552aa8e5393872a6d1e3a39b0438ebef037e594e4dbabd51b');
  for (const lesson of [...JAPANESE_UPPER_LESSONS, ...JAPANESE_READING_EXPANSION]) assert.strictEqual(getJapaneseReadingLesson(lesson.id), lesson);
  assert.equal(getLevelReadingLessons('beginner').length, 0);
  assert.equal(getLevelReadingLessons('intermediate').length, 8);
  assert.equal(getLevelReadingLessons('advanced').length, 12);
  assert.equal(getLevelLegacyLessons('intermediate').length + getLevelReadingLessons('intermediate').length, 16);
  assert.match(JAPANESE_LEVELS.intermediate.coverage, /8수업.*8단원/);
  assert.match(JAPANESE_LEVELS.advanced.coverage, /6단원.*6단원/);
  assert.doesNotMatch(JAPANESE_LEVELS.beginner.outcomes.join(' '), /바꿔 쓰기/);
  for (const lesson of JAPANESE_READING_EXPANSION) assert.equal(getReadingLessonLevel(lesson.id), lesson.level);
  for (const id of ['', 'missing', 'f01', 'middle-99', 'upper-mech-07', '__proto__']) {
    assert.equal(getJapaneseReadingLesson(id), undefined);
    assert.equal(getReadingLessonLevel(id), undefined);
  }
});

test('20 support sets have exactly 40 target expressions present in the passage', () => {
  assert.deepEqual(Object.keys(JAPANESE_READING_SUPPORT).sort(), JAPANESE_READING_LESSONS.map(lesson => lesson.id).sort());
  for (const lesson of JAPANESE_READING_LESSONS) {
    const support = getReadingSupport(lesson)!;
    assert.ok(support);
    for (const value of [support.purpose, support.beforeReading, support.evidenceStrategy]) {
      assert.ok(value.length >= 15);
      assert.match(value, /[가-힣]/);
      assert.doesNotMatch(value, /TODO|TBD|정답은|답은\s*[123ABC]|입력하세요|녹음하세요|작성하세요/);
    }
    assert.equal(support.targetExpressions.length, 2);
    assert.equal(new Set(support.targetExpressions).size, 2);
    for (const target of support.targetExpressions) assert.ok(lesson.paragraphs.some(paragraph => paragraph.japanese.includes(target)), `${lesson.id}: ${target}`);
  }
  assert.equal(getReadingSupport({ ...JAPANESE_UPPER_LESSONS[0], id: 'missing' }), undefined);
});

test('pre-answer strategy never reads answer explanations, and transfer uses its own context', () => {
  for (const lesson of JAPANESE_READING_LESSONS) {
    const poisoned = { ...lesson, questions: lesson.questions.map(question => ({ ...question, answer: 99, explanation: 'SECRET_ANSWER' })) };
    for (let i = 0; i < 6; i++) {
      const strategy = readingEvidenceStrategy(poisoned, i);
      assert.equal(strategy, readingEvidenceStrategy(lesson, i));
      assert.doesNotMatch(strategy, /SECRET_ANSWER/);
      if (i >= 4) assert.match(strategy, /새 상황에 적힌 문장만/);
    }
  }
});

test('literal highlighting preserves every character and handles repeated/overlapping targets', () => {
  for (const lesson of JAPANESE_READING_LESSONS) {
    const targets = getReadingSupport(lesson)!.targetExpressions;
    for (const paragraph of lesson.paragraphs) {
      const parts = splitReadingHighlights(paragraph.japanese, targets);
      assert.equal(parts.map(part => part.text).join(''), paragraph.japanese);
      for (const part of parts.filter(part => part.highlighted)) assert.ok(targets.includes(part.text));
    }
  }
  assert.deepEqual(splitReadingHighlights('abcabc', ['ab', 'abc', '']), [{ text: 'abc', highlighted: true }, { text: 'abc', highlighted: true }]);
  assert.deepEqual(splitReadingHighlights('a+b [x]', ['a+b', '[x]']), [{ text: 'a+b', highlighted: true }, { text: ' ', highlighted: false }, { text: '[x]', highlighted: true }]);
  assert.deepEqual(splitReadingHighlights('text', []), [{ text: 'text', highlighted: false }]);
  assert.deepEqual(splitReadingHighlights('', ['text']), []);
});

test('new units use the existing help-aware SRS without changing selected level or removing unknown records', () => {
  let state = emptyLevelJourney();
  const now = new Date('2026-11-08T12:00:00Z');
  for (const id of ['middle-01', 'upper-mech-06', 'upper-01', 'retired']) state = rememberUpperAnswer(state, { lessonId: id, questionId: `${id}-q1`, attemptId: id, correct: true, neededHelp: true }, now);
  const due = dueUpperAnswers(state, now.getTime() + 2 * 86400000).filter(isKnownReadingAnswer);
  assert.equal(due.length, 3);
  assert.equal(due.filter(answer => getReadingLessonLevel(answer.lessonId) === 'intermediate').length, 1);
  assert.equal(due.filter(answer => getReadingLessonLevel(answer.lessonId) === 'advanced').length, 2);
  assert.equal(state.selectedLevel, 'beginner');
  assert.equal(Object.keys(state.answers).length, 4);
  assert.ok(state.answers['retired-q1']);
  assert.equal(isKnownReadingAnswer({ lessonId: 'middle-01', questionId: 'upper-01-q1' }), false);
  for (const answer of Object.values(state.answers)) { assert.equal(answer.neededHelp, true); assert.equal(answer.intervalDays, 1); assert.deepEqual(answer.successDates, []); }
});
