import { JAPANESE_INTERMEDIATE_LESSONS } from './japaneseIntermediateLessons.ts';
import { JAPANESE_MECHANICAL_LESSONS } from './japaneseMechanicalLessons.ts';
import type { JapaneseContentUnit } from './japaneseContentUnit.ts';

/** Original expansion connected through japaneseReadingLessons in the local candidate.
 * IDs are stable and separate from existing lessons. Local fixture checks are
 * distinct from real authentication, cloud persistence and device audio checks.
 */
export const JAPANESE_READING_EXPANSION: JapaneseContentUnit[] = [
  ...JAPANESE_INTERMEDIATE_LESSONS,
  ...JAPANESE_MECHANICAL_LESSONS,
];

export function getReadingExpansionLesson(id: string): JapaneseContentUnit | undefined {
  return JAPANESE_READING_EXPANSION.find(lesson => lesson.id === id);
}
