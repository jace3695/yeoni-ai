import { GRAMMAR_LESSONS } from '../data/grammar.ts';
import { CURRICULUM, TRACKS } from '../data/curriculum.ts';
import { JAPANESE_LEVELS } from '../data/japaneseLevels.ts';
import { getJapaneseReadingLesson, getReadingLessonLevel } from '../data/japaneseReadingLessons.ts';

export const CHUNK_TRACK_LABELS = { grammar: '문법 표현', foundation: '기초 표현', work: '회사·업무 표현', travel: '여행 표현', reading: '중급·고급 읽기' } as const;
export type ChunkTrack = keyof typeof CHUNK_TRACK_LABELS;

/** Resolve current titles independently of immutable answer events. */
export function chunkLessonInfo(lessonId: string) {
  const grammar = lessonId.startsWith('grammar:') ? GRAMMAR_LESSONS.find(lesson => `grammar:${lesson.id}` === lessonId) : undefined;
  if (grammar) return { title: grammar.title, track: 'grammar' as ChunkTrack, trackLabel: '문법 표현', href: `/language/grammar?lesson=${encodeURIComponent(grammar.id)}` };
  const curriculum = CURRICULUM.find(lesson => lesson.id === lessonId);
  if (curriculum) return { title: curriculum.title, track: curriculum.track as ChunkTrack, trackLabel: TRACKS[curriculum.track].title, href: `/language/learn?lesson=${encodeURIComponent(lessonId)}` };
  const reading = getJapaneseReadingLesson(lessonId);
  const level = getReadingLessonLevel(lessonId);
  if (reading && level) return { title: reading.title, track: 'reading' as ChunkTrack, trackLabel: `${JAPANESE_LEVELS[level].title} 읽기·표현 비교`, href: `/language/levels?lesson=${encodeURIComponent(lessonId)}` };
  return { title: '이름을 찾을 수 없는 단원', track: undefined, trackLabel: '확인할 수 없는 과정', href: '/language/levels' };
}
