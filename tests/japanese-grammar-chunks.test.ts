import assert from 'node:assert/strict';
import test from 'node:test';
import { GRAMMAR_LESSONS } from '../data/grammar.ts';
import { ALL_JAPANESE_CHUNK_LESSONS, JAPANESE_GRAMMAR_CHUNK_LESSONS, JAPANESE_CHUNK_LESSONS, getChunkLesson } from '../data/japaneseChunkLessons.ts';
import { chunkLessonInfo } from '../utils/japaneseChunkCatalog.ts';
import { createChunkPractice, reduceChunkPractice } from '../utils/japaneseChunkPractice.ts';
import { emptyChunkReview, rememberChunkAnswer, chunkReviewItems, parseChunkReview } from '../utils/japaneseChunkReview.ts';

test('all 51 grammar references have distinct practice and review destinations without replacing the existing 82 IDs', () => {
  assert.equal(GRAMMAR_LESSONS.length, 51);
  assert.equal(JAPANESE_CHUNK_LESSONS.length, 82);
  assert.equal(JAPANESE_GRAMMAR_CHUNK_LESSONS.length, 51);
  assert.deepEqual(JAPANESE_GRAMMAR_CHUNK_LESSONS.map(x => x.lessonId).sort(), GRAMMAR_LESSONS.map(x => `grammar:${x.id}`).sort());
  assert.equal(new Set(ALL_JAPANESE_CHUNK_LESSONS.map(x => x.lessonId)).size, 139);
  const questions = ALL_JAPANESE_CHUNK_LESSONS.flatMap(x => x.questions);
  assert.equal(new Set(questions.map(x => x.id)).size, questions.length);
  for (const lesson of JAPANESE_GRAMMAR_CHUNK_LESSONS) {
    assert.equal(getChunkLesson(lesson.lessonId), lesson);
    assert.equal(chunkLessonInfo(lesson.lessonId).track, 'grammar');
    assert.equal(chunkLessonInfo(lesson.lessonId).href, `/language/grammar?lesson=${encodeURIComponent(lesson.lessonId.slice(8))}`);
  }
});

for (const lesson of JAPANESE_GRAMMAR_CHUNK_LESSONS) {
  test(`${lesson.lessonId}: reconstructible explanation, two changes and three unambiguous-choice structures`, () => {
    assert.doesNotMatch(lesson.expression, /[가-힣]/);
    assert.ok(lesson.sentence.includes(lesson.expression));
    assert.equal(lesson.chunks.map(x => x.text).join(''), lesson.sentence);
    assert.ok(lesson.chunks.length >= 2);
    for (const chunk of lesson.chunks) {
      assert.ok(chunk.text.trim()); assert.match(chunk.meaning, /[가-힣]/); assert.match(chunk.role, /[가-힣]/);
    }
    assert.equal(lesson.variations.length, 2);
    for (const change of lesson.variations) {
      assert.notEqual(change.sentence, lesson.sentence);
      assert.match(change.meaning, /[가-힣]/); assert.match(change.explanation, /[가-힣]/);
      assert.doesNotMatch(change.sentence, /[가-힣]/);
    }
    assert.deepEqual(lesson.questions.map(x => x.kind), ['meaning', 'blank', 'listening']);
    for (const q of lesson.questions) {
      assert.equal(q.choices.length, 3); assert.equal(new Set(q.choices).size, 3);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 3);
      assert.match(q.prompt, /[가-힣]/); assert.match(q.explanation, /[가-힣]/);
      if (q.kind === 'blank') assert.match(q.prompt, /＿|__|□|（\s*）/);
      if (q.kind === 'listening') {
        assert.equal(q.audioText, lesson.sentence);
        assert.equal(q.choices[q.answer], lesson.meaning);
      }
    }
  });
  test(`${lesson.lessonId}: full staged flow and durable-format review keep wrong and helped history separate`, () => {
    let state = createChunkPractice(lesson);
    let review = emptyChunkReview();
    for (let i = 0; i < 3; i++) state = reduceChunkPractice(lesson, state, { type: 'next', revision: state.revision });
    assert.equal(state.stage, 'questions');
    for (let i = 0; i < 3; i++) {
      const q = lesson.questions[i];
      const answer = i === 0 ? (q.answer + 1) % 3 : q.answer;
      state = reduceChunkPractice(lesson, state, { type: 'answer', choice: answer, revision: state.revision });
      review = rememberChunkAnswer(review, { lessonId: lesson.lessonId, questionId: q.id, attemptId: `${lesson.lessonId}:${i}`, correct: answer === q.answer, neededHelp: true, mode: i === 2 ? 'reading' : 'choice' }, new Date('2026-11-10T00:00:00.000Z'));
      state = reduceChunkPractice(lesson, state, { type: 'next', revision: state.revision });
    }
    assert.equal(state.stage, 'done');
    assert.equal(state.wrong.length, 1);
    const restored = parseChunkReview(JSON.stringify(review));
    const items = chunkReviewItems(restored);
    assert.equal(items.length, 3);
    assert.equal(items.find(x => x.questionId === lesson.questions[0].id)?.wrongAttempts, 1);
    assert.equal(items.find(x => x.questionId === lesson.questions[2].id)?.mode, 'reading');
    assert.ok(items.every(x => x.lessonId === lesson.lessonId));
  });
}
