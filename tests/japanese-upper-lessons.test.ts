import assert from 'node:assert/strict';
import test from 'node:test';
import { JAPANESE_UPPER_LESSONS, getUpperLesson } from '../data/japaneseUpperLessons.ts';

const meaningful = (value: string, label: string) => {
  assert.equal(typeof value, 'string', label);
  assert.ok(value.trim().length >= 2, `${label} must contain meaningful text`);
  assert.doesNotMatch(value, /TODO|TBD|placeholder/i, label);
};

test('upper lessons offer six stable, unique focused reading/writing units', () => {
  assert.equal(JAPANESE_UPPER_LESSONS.length, 6);
  assert.equal(new Set(JAPANESE_UPPER_LESSONS.map((lesson) => lesson.id)).size, 6);
  const questionIds: string[] = [];
  JAPANESE_UPPER_LESSONS.forEach((lesson, index) => {
    assert.equal(lesson.id, `upper-${String(index + 1).padStart(2, '0')}`);
    meaningful(lesson.title, 'title');
    meaningful(lesson.goal, 'goal');
    assert.equal(lesson.paragraphs.length, 2);
    const length = lesson.paragraphs.reduce((sum, paragraph) => sum + Array.from(paragraph.japanese).length, 0);
    assert.ok(length >= 180 && length <= 350, `${lesson.id} Japanese length: ${length}`);
    for (const paragraph of lesson.paragraphs) {
      meaningful(paragraph.japanese, 'paragraph');
      meaningful(paragraph.meaning, 'paragraph meaning');
      assert.match(paragraph.japanese, /[ぁ-んァ-ヶ一-龯]/);
      assert.match(paragraph.meaning, /[가-힣]/);
    }
    assert.ok(lesson.words.length >= 4 && lesson.words.length <= 6);
    assert.equal(new Set(lesson.words.map((word) => word.japanese)).size, lesson.words.length);
    for (const word of lesson.words) {
      assert.ok(word.japanese.trim().length >= 1, 'a single kanji may be a complete word');
      meaningful(word.reading, 'reading');
      meaningful(word.meaning, 'word meaning');
      assert.match(word.reading, /^[ぁ-んァ-ヶー]+$/);
      assert.match(word.meaning, /[가-힣]/);
    }
    assert.ok(lesson.notes.length >= 2 && lesson.notes.length <= 3);
    for (const note of lesson.notes) {
      meaningful(note, 'note');
      assert.match(note, /[가-힣]/);
    }
    assert.equal(lesson.questions.length, 6);
    lesson.questions.forEach((question, questionIndex) => {
      assert.equal(question.id, `${lesson.id}-q${questionIndex + 1}`);
      questionIds.push(question.id);
      meaningful(question.prompt, 'question');
      assert.equal(question.choices.length, 3);
      assert.equal(new Set(question.choices).size, 3);
      question.choices.forEach((choice) => meaningful(choice, 'choice'));
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer <= 2);
      meaningful(question.explanation, 'answer explanation');
      assert.match(question.explanation, /[가-힣]/);
      if (questionIndex >= 4) assert.match(question.prompt, /^새 상황:/, 'alternate question must supply a new context');
    });
    meaningful(lesson.writing.prompt, 'writing prompt');
    meaningful(lesson.writing.sample, 'writing sample');
    assert.match(lesson.writing.sample, /[ぁ-んァ-ヶ一-龯]/);
    assert.doesNotMatch(lesson.writing.sample, /[가-힣]/);
    meaningful(lesson.writing.explanation, 'writing explanation');
    assert.equal(lesson.writing.checklist.length, 3);
    lesson.writing.checklist.forEach((criterion) => meaningful(criterion, 'self-check criterion'));
    assert.strictEqual(getUpperLesson(lesson.id), lesson);
  });
  assert.equal(new Set(questionIds).size, 36);
  assert.equal(getUpperLesson('missing'), undefined);
  assert.equal(getUpperLesson(''), undefined);
});

test('units remain bounded practice without invented official proficiency claims', () => {
  const content = JSON.stringify(JAPANESE_UPPER_LESSONS);
  assert.doesNotMatch(content, /CEFR|JLPT|N[1-5]\s*(?:급|합격|보장)|완전\s*정복|공식\s*인증|고급\s*전체\s*과정/i);
  assert.equal(new Set(JAPANESE_UPPER_LESSONS.map((lesson) => lesson.writing.sample)).size, 6);
  assert.equal(new Set(JAPANESE_UPPER_LESSONS.flatMap((lesson) => lesson.paragraphs.map((paragraph) => paragraph.japanese))).size, 12);
});
