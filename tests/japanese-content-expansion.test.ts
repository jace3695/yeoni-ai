import assert from 'node:assert/strict';
import test from 'node:test';
import { JAPANESE_INTERMEDIATE_LESSONS } from '../data/japaneseIntermediateLessons.ts';
import { JAPANESE_MECHANICAL_LESSONS } from '../data/japaneseMechanicalLessons.ts';
import { JAPANESE_READING_EXPANSION, getReadingExpansionLesson } from '../data/japaneseContentExpansion.ts';
import { JAPANESE_UPPER_LESSONS } from '../data/japaneseUpperLessons.ts';

const text = (value: unknown, label: string) => {
  assert.equal(typeof value, 'string', label);
  assert.ok((value as string).trim().length > 1, label);
  assert.doesNotMatch(value as string, /TODO|TBD|placeholder/i, label);
};
const packs = [
  { name: 'intermediate', lessons: JAPANESE_INTERMEDIATE_LESSONS, count: 8, prefix: 'middle', paragraphs: 2, min: 200, max: 350, wordsMin: 5, wordsMax: 5 },
  { name: 'advanced', lessons: JAPANESE_MECHANICAL_LESSONS, count: 6, prefix: 'upper-mech', paragraphs: 3, min: 400, max: 650, wordsMin: 6, wordsMax: 7 },
] as const;

for (const pack of packs) {
  test(`${pack.name} contains bounded original units with stable IDs and complete study material`, () => {
    assert.equal(pack.lessons.length, pack.count);
    pack.lessons.forEach((lesson, index) => {
      const id = `${pack.prefix}-${String(index + 1).padStart(2, '0')}`;
      assert.equal(lesson.id, id); assert.equal(lesson.level, pack.name);
      assert.equal(lesson.fictional, true);
      assert.ok(['everyday', 'mechanical-development'].includes(lesson.domain));
      if (pack.name === 'advanced') assert.equal(lesson.domain, 'mechanical-development');
      text(lesson.title, id); text(lesson.goal, id);
      assert.ok(lesson.focus.length >= 2); assert.ok(lesson.prerequisites.length >= 2);
      [...lesson.focus, ...lesson.prerequisites].forEach(value => text(value, id));
      assert.equal(lesson.paragraphs.length, pack.paragraphs);
      const length = lesson.paragraphs.reduce((n, p) => n + Array.from(p.japanese).length, 0);
      assert.ok(length >= pack.min && length <= pack.max, `${id} length ${length}`);
      lesson.paragraphs.forEach(paragraph => {
        text(paragraph.japanese, id); text(paragraph.meaning, id);
        assert.match(paragraph.japanese, /[ぁ-んァ-ヶ一-龯]/); assert.doesNotMatch(paragraph.japanese, /[가-힣]/);
        assert.match(paragraph.meaning, /[가-힣]/);
      });
      assert.ok(lesson.words.length >= pack.wordsMin && lesson.words.length <= pack.wordsMax);
      assert.equal(new Set(lesson.words.map(w => w.japanese)).size, lesson.words.length);
      lesson.words.forEach(word => { assert.ok(word.japanese.trim().length > 0); text(word.reading, id); text(word.meaning, id); assert.match(word.reading, /^[ぁ-んァ-ヶー]+$/); });
      assert.ok(lesson.notes.length >= 2 && lesson.notes.length <= 3);
      lesson.notes.forEach(note => text(note, id));
      text(lesson.writing.prompt, id); text(lesson.writing.sample, id); text(lesson.writing.explanation, id);
      assert.doesNotMatch(lesson.writing.sample, /[가-힣]/);
      assert.equal(lesson.writing.checklist.length, 3);
      lesson.writing.checklist.forEach(value => text(value, id));
    });
  });
  test(`${pack.name} questions include answer explanations and independent transfer contexts`, () => {
    const counts = [0, 0, 0];
    for (const lesson of pack.lessons) {
      assert.equal(lesson.questions.length, 6);
      lesson.questions.forEach((q, i) => {
        assert.equal(q.id, `${lesson.id}-q${i + 1}`); text(q.prompt, q.id); text(q.explanation, q.id);
        assert.equal(q.choices.length, 3); assert.equal(new Set(q.choices).size, 3);
        q.choices.forEach(choice => text(choice, q.id));
        assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 3);
        counts[q.answer]++;
        if (i >= 4) assert.match(q.prompt, /^새 상황:/);
      });
    }
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `answer positions ${counts}`);
  });
}

test('new reading IDs and paragraph texts do not collide with the preserved earlier content', () => {
  const all = [...JAPANESE_UPPER_LESSONS, ...JAPANESE_READING_EXPANSION];
  assert.equal(all.length, 20);
  assert.equal(new Set(all.map(l => l.id)).size, 20);
  const questions = all.flatMap(l => l.questions.map(q => q.id));
  assert.equal(questions.length, 120); assert.equal(new Set(questions).size, 120);
  const paragraphs = all.flatMap(l => l.paragraphs.map(p => p.japanese));
  assert.equal(new Set(paragraphs).size, paragraphs.length);
  for (const lesson of JAPANESE_READING_EXPANSION) assert.strictEqual(getReadingExpansionLesson(lesson.id), lesson);
  for (const id of ['', 'missing', 'f01', 'upper-01', 'middle-99']) assert.equal(getReadingExpansionLesson(id), undefined);
});

test('comparison activities do not revive typing, recording or proficiency guarantees', () => {
  for (const lesson of [...JAPANESE_UPPER_LESSONS, ...JAPANESE_READING_EXPANSION]) {
    assert.doesNotMatch(lesson.writing.prompt, /쓰세요|써\s*보세요|작성하세요|입력하세요|녹음|따라\s*말|대화하세요/);
  }
  const content = JSON.stringify(JAPANESE_READING_EXPANSION);
  assert.doesNotMatch(content, /N[1-5]\s*(?:급|합격|보장)|완전\s*정복|공식\s*인증|고급\s*전체\s*과정|getUserMedia|MediaRecorder|SpeechRecognition/);
});

test('reviewed language and technical distinctions stay explicit', () => {
  const find = (id: string) => JAPANESE_READING_EXPANSION.find(lesson => lesson.id === id)!;
  const recipientQuestion = find('middle-04').questions[4];
  assert.match(recipientQuestion.prompt, /山田さん宛てに/);
  assert.match(recipientQuestion.prompt, /수신 대상/);
  assert.match(recipientQuestion.choices[recipientQuestion.answer], /수신 대상은 야마다/);
  assert.match(recipientQuestion.explanation, /실제 수령 완료.*확인할 수 없다/);
  assert.ok(find('middle-05').words.some(word => word.japanese === '部品表'));
  assert.ok(find('middle-05').words.some(word => word.japanese === '員数'));
  assert.ok(find('middle-07').words.some(word => word.japanese === '改訂欄'));
  const tolerance = find('upper-mech-02');
  assert.match(tolerance.paragraphs[0].japanese, /寸法許容差/);
  assert.doesNotMatch(tolerance.paragraphs[0].japanese, /公差を±/);
  assert.match(tolerance.notes.join(' '), /公差|공차/);
  assert.match(tolerance.notes.join(' '), /許容差|허용 편차/);
  assert.match(find('upper-mech-03').questions[4].prompt, /表面の跡/);
  assert.match(find('upper-mech-06').paragraphs[0].japanese, /供給元/);
  assert.doesNotMatch(JSON.stringify(find('upper-mech-06')), /供給先/);
});

test('previous six lesson IDs and answer positions remain compatible', () => {
  const answers = [
    [1, 2, 0, 1, 2, 0], [1, 0, 2, 0, 1, 2], [2, 0, 1, 2, 0, 1],
    [2, 0, 1, 2, 0, 1], [0, 1, 2, 0, 1, 2], [1, 2, 0, 1, 2, 0],
  ];
  assert.equal(JAPANESE_UPPER_LESSONS.length, 6);
  JAPANESE_UPPER_LESSONS.forEach((lesson, i) => {
    assert.equal(lesson.id, `upper-${String(i + 1).padStart(2, '0')}`);
    assert.deepEqual(lesson.questions.map(question => question.answer), answers[i]);
    assert.doesNotMatch(lesson.title + ' ' + lesson.goal, /읽고 쓰기|글을 쓴다/);
  });
  assert.doesNotMatch(JAPANESE_UPPER_LESSONS[3].notes.join(' '), /비중도 달라졌/);
});
