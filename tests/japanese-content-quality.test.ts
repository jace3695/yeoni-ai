import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { APPLICATION_QUIZZES } from '../data/japaneseApplicationQuiz.ts';
import test from 'node:test';
import { CURRICULUM } from '../data/curriculum.ts';
import { JAPANESE_CHUNK_LESSONS, getChunkLesson } from '../data/japaneseChunkLessons.ts';
import { JAPANESE_READING_LESSONS, getJapaneseReadingLesson } from '../data/japaneseReadingLessons.ts';
import { getReadingEnhancement } from '../data/japaneseReadingEnhancements.ts';
import { JAPANESE_UPPER_ENHANCEMENTS } from '../data/japaneseUpperEnhancements.ts';
import { chooseJapaneseLevel, dueUpperAnswers, emptyLevelJourney, rememberUpperAnswer } from '../utils/japaneseLevelJourney.ts';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const lesson = (id: string) => getJapaneseReadingLesson(id)!;

test('all 496 legacy questions stay unchanged and only 24 reviewed lessons append 48 application questions', () => {
  assert.equal(CURRICULUM.length, 62);
  const expectedIds = ['f', 'w', 't'].flatMap(prefix => Array.from({ length: 8 }, (_, index) => `${prefix}${index + 13}`)).sort();
  assert.deepEqual(Object.keys(APPLICATION_QUIZZES).sort(), expectedIds);
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/japanese-legacy-94a.json', import.meta.url), 'utf8')) as { lessons: { id: string; quiz: unknown[] }[] };
  const legacy = CURRICULUM.map(l => ({ ...l, quiz: l.quiz.slice(0, 8) }));
  assert.equal(legacy.flatMap(l => l.quiz).length, 496);
  assert.equal(CURRICULUM.flatMap(l => l.quiz).length, 544);
  let appended = 0;
  for (const item of CURRICULUM) {
    assert.deepEqual(item.quiz.slice(0, 8), baseline.lessons.find(l => l.id === item.id)?.quiz);
    const extra = item.quiz.slice(8);
    assert.equal(item.quiz.length, expectedIds.includes(item.id) ? 10 : 8);
    assert.deepEqual(extra, APPLICATION_QUIZZES[item.id] ?? []);
    appended += extra.length;
  }
  assert.equal(appended, 48);
  const exceptExplanation = legacy.map(l => ({ ...l, quiz: l.quiz.map((q, index) => {
    const { explanation, ...rest } = q; assert.ok(explanation);
    // Restore only the reviewed distractor and ambiguous prompt for the frozen
    // baseline comparison. Answer positions, spoken targets and stored IDs stay fixed.
    if (l.id === 't19' && index === 0) return { ...rest, choices: [rest.choices[0], '韓国まで何日かかりますか。', ...rest.choices.slice(2)] };
    if (l.id === 'w12' && index === 0) return { ...rest, prompt: '메일의 정중한 확인 요청은?' };
    return rest;
  }) }));
  // Frozen c241877f source contract before the two explanation-template corrections.
  assert.equal(digest(exceptExplanation), '53f84910ab43acdbb125d37c2090f71dcef42055cfc4850b17e3588f1e5637d0');
  const fixed = legacy.flatMap(l => l.quiz).filter(q => /의 뜻은 ‘.+’입니다\./.test(q.explanation));
  assert.equal(fixed.length, 210);
  for (const meaning of ['사진', '경험', '한 번', '예정', '산책', '공부', '요리']) {
    assert.ok(fixed.some(q => q.explanation.includes(`‘${meaning}’입니다.`)), meaning);
  }
});

test('all 82 optional chunk lessons preserve 246 question IDs and answer positions', () => {
  assert.equal(JAPANESE_CHUNK_LESSONS.length, 82);
  assert.equal(JAPANESE_CHUNK_LESSONS.flatMap(l => l.questions).length, 246);
  assert.equal(digest(JAPANESE_CHUNK_LESSONS.map(l => ({ lessonId: l.lessonId, questions: l.questions.map(q => ({ id: q.id, answer: q.answer })) }))), '99759a334ca7b1f0754fef9224e5356defac25bfdb1e8ba408380389861f2d8d');
});

test('middle-06 consistently finds records by date without claiming measured time savings', () => {
  const l = lesson('middle-06'), c = getChunkLesson(l.id)!, e = getReadingEnhancement(l)!;
  assert.match(l.paragraphs[0].japanese, /日付ごとの記録を見つけやすくしました/);
  assert.match(l.paragraphs[0].meaning, /날짜별 기록을 찾기 쉽게/);
  assert.doesNotMatch(JSON.stringify([l, c, e]), /どの日の記録か|어느 날의 기록인지/);
  assert.equal(c.chunks.map(x => x.text).join(''), c.sentence);
  assert.equal(c.variations[0].sentence, c.questions[2].audioText);
  assert.equal(e.pair.parallelSentence, c.questions[2].audioText);
  assert.equal(c.questions[2].answer, 1);
  assert.match(c.questions[2].choices[1], /사흘 치.*날짜별 기록/);
  assert.match(l.paragraphs[1].japanese, /探す時間を測ってはいません/);
});

test('middle-07 separates already accepted, future review and unapproved application', () => {
  const l = lesson('middle-07'), c = getChunkLesson(l.id)!;
  assert.match(l.paragraphs[0].japanese, /すでに案を受け付けており、六月五日に検討する予定です/);
  assert.match(l.paragraphs[1].japanese, /六月四日の承認状況は「未承認」/);
  assert.match(l.paragraphs[1].japanese, /適用開始日も「未定」/);
  assert.ok(c.chunks.some(x => x.text === 'すでに' && x.meaning === '이미'));
  assert.ok(c.chunks.some(x => x.text === '受け付けており、' && /受け付けている/.test(x.role)));
  assert.equal(c.chunks.map(x => x.text).join(''), c.sentence);
  assert.match(c.variations[0].sentence, /すでに資料を受け付けており/);
  assert.equal(c.questions[2].audioText, '担当者は案を検討しました。');
});

test('mechanical deadline means by Tuesday, while production dates explicitly differ', () => {
  const q = lesson('upper-mech-02').questions[4];
  assert.match(q.prompt, /火曜までに/);
  assert.equal(q.answer, 2);
  assert.match(q.choices[q.answer], /화요일까지 확인 예정일을 회신/);
  assert.doesNotMatch(q.choices[q.answer], /화요일에는/);
  assert.match(q.explanation, /회신 기한/);
  assert.match(lesson('upper-mech-03').writing.sample, /製作日が異なり、未確認の条件もあるため/);
});

test('advanced support distinguishes observed conditions and confirmation versus submission', () => {
  const e = getReadingEnhancement(lesson('upper-04'))!;
  const reason = e.evidence.find(x => x.questionId === 'upper-04-q3')!.reason;
  assert.match(reason, /경험 있는 직원이 많이 근무했다는 별도 조건/);
  assert.doesNotMatch(reason, /조건도 달랐|직원.*비율.*바뀌/);
  const caution = getReadingEnhancement(lesson('upper-mech-06'))!.pair.caution;
  assert.match(caution, /원문은 확인.*새 예문은 자료 제출/);
  assert.match(caution, /완료로 표시하라는 뜻은 아니/);
});

test('six original advanced units have original parallel examples and 24 scoped evidence entries', () => {
  assert.equal(JAPANESE_UPPER_ENHANCEMENTS.length, 6);
  assert.equal(JAPANESE_UPPER_ENHANCEMENTS.flatMap(e => e.evidence).length, 24);
  for (const e of JAPANESE_UPPER_ENHANCEMENTS) {
    const l = lesson(e.lessonId);
    assert.notEqual(e.pair.sourceSentence, e.pair.parallelSentence);
    assert.ok(l.paragraphs[e.pair.sourceParagraphIndex].japanese.includes(e.pair.sourceSentence));
    assert.deepEqual(e.evidence.map(x => x.questionId), l.questions.slice(0, 4).map(q => q.id));
    for (const evidence of e.evidence) for (const quote of evidence.quotes) {
      assert.ok(evidence.paragraphIndexes.some(i => l.paragraphs[i].japanese.includes(quote)), evidence.questionId);
    }
  }
});

test('reviewed wording keeps historical help records, retired answers and manual level selection', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  let state = emptyLevelJourney();
  for (const id of ['middle-06', 'middle-07', 'upper-mech-02', 'retired']) {
    state = rememberUpperAnswer(state, { lessonId: id, questionId: `${id}-q1`, attemptId: `existing-${id}`, correct: true, neededHelp: true }, now);
  }
  const before = structuredClone(state.answers);
  const advanced = chooseJapaneseLevel(state, 'advanced', now);
  assert.equal(state.selectedLevel, 'beginner');
  assert.equal(advanced.selectedLevel, 'advanced');
  assert.deepEqual(advanced.answers, before);
  assert.ok(advanced.answers['retired-q1']);
  assert.equal(dueUpperAnswers(advanced, now.getTime() + 2 * 86400000).length, 4);
  assert.equal(JAPANESE_READING_LESSONS.length, 26);
});
