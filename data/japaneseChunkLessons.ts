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

export function getChunkLesson(id: string): JapaneseChunkLesson | undefined {
  return JAPANESE_CHUNK_LESSONS.find(lesson => lesson.lessonId === id);
}
