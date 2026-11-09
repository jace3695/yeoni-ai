import { JAPANESE_READING_EXPANSION } from './japaneseContentExpansion.ts';
import { JAPANESE_UPPER_LESSONS, type UpperLesson } from './japaneseUpperLessons.ts';
import type { JapaneseLevel } from './japaneseLevels.ts';

/** Shared catalogue for navigation and review; original lesson objects stay intact. */
export const JAPANESE_READING_LESSONS: UpperLesson[] = [...JAPANESE_UPPER_LESSONS, ...JAPANESE_READING_EXPANSION];

export function getJapaneseReadingLesson(id: string): UpperLesson | undefined {
  return JAPANESE_READING_LESSONS.find(lesson => lesson.id === id);
}

export function getReadingLessonLevel(id: string): JapaneseLevel | undefined {
  const expansion = JAPANESE_READING_EXPANSION.find(lesson => lesson.id === id);
  return expansion?.level ?? (JAPANESE_UPPER_LESSONS.some(lesson => lesson.id === id) ? 'advanced' : undefined);
}

export function getLevelReadingLessons(level: JapaneseLevel): UpperLesson[] {
  return JAPANESE_READING_LESSONS.filter(lesson => getReadingLessonLevel(lesson.id) === level);
}

/** Invalid/retired IDs are not displayed, but their saved records are not removed. */
export function isKnownReadingAnswer(answer: { lessonId: string; questionId: string }): boolean {
  return Boolean(getJapaneseReadingLesson(answer.lessonId)?.questions.some(question => question.id === answer.questionId));
}
