import assert from 'node:assert/strict';
import test from 'node:test';
import { JAPANESE_COURSE_GAP_LESSONS as lessons } from '../data/japaneseCourseGapLessons.ts';
import { JAPANESE_COURSE_GAP_CHUNKS as chunks } from '../data/japaneseCourseGapChunks.ts';
import { getJapaneseReadingLesson, getReadingLessonLevel } from '../data/japaneseReadingLessons.ts';
import { getChunkLesson, ALL_JAPANESE_CHUNK_LESSONS } from '../data/japaneseChunkLessons.ts';
import { chunkLessonInfo } from '../utils/japaneseChunkCatalog.ts';
import { getReadingSupport } from '../data/japaneseReadingSupport.ts';
import { getReadingEnhancement } from '../data/japaneseReadingEnhancements.ts';
import { emptyLevelJourney, rememberUpperAnswer, dueUpperAnswers } from '../utils/japaneseLevelJourney.ts';
import { emptyChunkReview, rememberChunkAnswer, chunkReviewItems, parseChunkReview } from '../utils/japaneseChunkReview.ts';

test('six original gap units are distinct, reachable and preserve level selection independence', () => {
 assert.equal(lessons.length, 6); assert.equal(chunks.length, 6);
 assert.equal(new Set(lessons.map(l => l.id)).size, 6);
 assert.equal(lessons.filter(l => l.level === 'intermediate').length, 3);
 assert.equal(lessons.filter(l => l.level === 'advanced').length, 3);
 assert.equal(new Set(ALL_JAPANESE_CHUNK_LESSONS.flatMap(l => l.questions.map(q => q.id))).size, 417);
 for (const lesson of lessons) {
  assert.equal(lesson.fictional, true);
  assert.equal(getJapaneseReadingLesson(lesson.id), lesson);
  assert.equal(getReadingLessonLevel(lesson.id), lesson.level);
  assert.equal(chunkLessonInfo(lesson.id).href, `/language/levels?lesson=${lesson.id}`);
  assert.ok(getReadingSupport(lesson)); assert.ok(getReadingEnhancement(lesson));
  assert.equal(lesson.questions.length, 6);
  assert.ok(lesson.paragraphs.length >= 2);
  assert.ok(lesson.words.length >= 5);
  assert.doesNotMatch(lesson.writing.prompt, /입력|작성하세요|쓰세요|녹음|따라.*말|대화하세요/);
  for (const [i,q] of lesson.questions.entries()) {
   assert.equal(q.id, `${lesson.id}-q${i+1}`);
   assert.equal(q.choices.length,3); assert.equal(new Set(q.choices).size,3);
   assert.ok(Number.isInteger(q.answer) && q.answer>=0 && q.answer<3);
   assert.match(q.explanation, /[가-힣]/);
   if(i>=4) assert.match(q.prompt,/^새 상황:/);
  }
 }
});
for (const lesson of lessons) test(`${lesson.id}: exact parts, changed examples, fixed listening and answer evidence`,()=>{
 const chunk=getChunkLesson(lesson.id)!;
 assert.ok(chunk); assert.equal(chunk.chunks.map(x=>x.text).join(''), chunk.sentence);
 assert.ok(chunk.expression.trim()); assert.ok(chunk.chunks.length>=2);
 assert.equal(chunk.variations.length,2);
 assert.deepEqual(chunk.questions.map(q=>q.kind), ['meaning','blank','listening']);
 assert.ok([chunk.sentence,...chunk.variations.map(v=>v.sentence)].includes(chunk.questions[2].audioText!));
 for(const v of chunk.variations) {assert.notEqual(v.sentence,chunk.sentence);assert.match(v.explanation,/[가-힣]/);}
 for(const q of chunk.questions) {assert.equal(new Set(q.choices).size,3);assert.ok(q.answer>=0&&q.answer<3);assert.match(q.explanation,/[가-힣]/);}
 const enhancement=getReadingEnhancement(lesson)!;
 assert.deepEqual(enhancement.evidence.map(x=>x.questionId),lesson.questions.slice(0,4).map(q=>q.id));
 for(const e of enhancement.evidence) for(const quote of e.quotes) assert.ok(e.paragraphIndexes.some(i=>lesson.paragraphs[i].japanese.includes(quote)));
 for(const expression of getReadingSupport(lesson)!.targetExpressions) assert.ok(lesson.paragraphs.some(p=>p.japanese.includes(expression)));
});
test('new lessons survive synthetic help-aware review roundtrip without choosing or promoting a level',()=>{
 const now=new Date('2026-11-11T12:00:00Z');
 let journey=emptyLevelJourney(); let review=emptyChunkReview();
 for(const lesson of lessons) {
  journey=rememberUpperAnswer(journey,{lessonId:lesson.id,questionId:lesson.questions[0].id,attemptId:lesson.id,correct:true,neededHelp:true},now);
  const chunk=getChunkLesson(lesson.id)!;
  review=rememberChunkAnswer(review,{lessonId:lesson.id,questionId:chunk.questions[2].id,attemptId:lesson.id,correct:true,neededHelp:true,mode:'reading'},now);
 }
 assert.equal(dueUpperAnswers(journey,now.getTime()+2*86400000).length,6);
 const restored=parseChunkReview(JSON.stringify(review));
 const items=chunkReviewItems(restored);
 assert.equal(items.length,6);
 for(const item of items) {assert.equal(item.mode,'reading');assert.equal(item.helpedAttempts,1);assert.equal(item.intervalDays,1);}
 assert.deepEqual(restored,review);
});
