import { JAPANESE_COURSE_GAP_CHUNKS } from './japaneseCourseGapChunks.ts';
import { JAPANESE_GRAMMAR_FOUNDATION_CHUNKS } from './japaneseGrammarFoundationChunks.ts';
import { JAPANESE_GRAMMAR_EXPANSION_CHUNKS } from './japaneseGrammarExpansionChunks.ts';
import { JAPANESE_CORE_CHUNK_LESSONS } from './japaneseCoreChunkLessons.ts';
import { JAPANESE_READING_CHUNK_LESSONS } from './japaneseReadingChunkLessons.ts';
import { JAPANESE_WORK_CHUNK_LESSONS } from './japaneseWorkChunkLessons.ts';
import { JAPANESE_TRAVEL_CHUNK_LESSONS } from './japaneseTravelChunkLessons.ts';

/** Original optional practice. Its saved review is separate from curriculum/level scores. */
export type JapaneseChunkLesson = {
  lessonId: string;
  expression: string;
  sentence: string;
  meaning: string;
  chunks: { text: string; meaning: string; role: string }[];
  variations: { kind: 'word' | 'tense'; label: string; sentence: string; meaning: string; explanation: string }[];
  questions: { id: string; kind: 'meaning' | 'blank' | 'listening'; prompt: string; choices: string[]; answer: number; explanation: string; audioText?: string }[];
};

export const JAPANESE_CHUNK_LESSONS: JapaneseChunkLesson[] = [
  ...JAPANESE_CORE_CHUNK_LESSONS,
  ...JAPANESE_READING_CHUNK_LESSONS,
  ...JAPANESE_WORK_CHUNK_LESSONS,
  ...JAPANESE_TRAVEL_CHUNK_LESSONS,
];

/** Grammar reference practice has its own stable IDs; existing 82 lesson IDs remain unchanged. */
export const JAPANESE_GRAMMAR_CHUNK_LESSONS: JapaneseChunkLesson[] = [
  ...JAPANESE_GRAMMAR_FOUNDATION_CHUNKS, ...JAPANESE_GRAMMAR_EXPANSION_CHUNKS,
];
export const ALL_JAPANESE_CHUNK_LESSONS = [...JAPANESE_CHUNK_LESSONS, ...JAPANESE_GRAMMAR_CHUNK_LESSONS, ...JAPANESE_COURSE_GAP_CHUNKS];

export function getChunkLesson(id: string): JapaneseChunkLesson | undefined {
  return ALL_JAPANESE_CHUNK_LESSONS.find(lesson => lesson.lessonId === id);
}
