import { JAPANESE_COURSE_GAP_ENHANCEMENTS } from './japaneseCourseGapEnhancements.ts';
import type { UpperLesson } from './japaneseUpperLessons.ts';
import { JAPANESE_INTERMEDIATE_ENHANCEMENTS } from './japaneseIntermediateEnhancements.ts';
import { JAPANESE_MECHANICAL_ENHANCEMENTS } from './japaneseMechanicalEnhancements.ts';
import { JAPANESE_UPPER_ENHANCEMENTS } from './japaneseUpperEnhancements.ts';

/** Original, optional, after-answer reading scaffolds. No saved state or scores. */
export type ReadingEvidence = {
  questionId: string;
  /** Zero-based paragraphs defining the evidence scope, including absence claims. */
  paragraphIndexes: number[];
  /** Exact substrings from the scoped paragraphs. Empty for absence evidence. */
  quotes: string[];
  reason: string;
};

export type PatternPair = {
  expression: string;
  meaning: string;
  sourceParagraphIndex: number;
  sourceSentence: string;
  parallelSentence: string;
  parallelMeaning: string;
  changedDetail: string;
  caution: string;
};

export type ReadingEnhancement = {
  lessonId: string;
  pair: PatternPair;
  evidence: ReadingEvidence[];
};

export const JAPANESE_READING_ENHANCEMENTS: ReadingEnhancement[] = [
  ...JAPANESE_INTERMEDIATE_ENHANCEMENTS,
  ...JAPANESE_MECHANICAL_ENHANCEMENTS,
  ...JAPANESE_UPPER_ENHANCEMENTS,
  ...JAPANESE_COURSE_GAP_ENHANCEMENTS,
];

export function getReadingEnhancement(lesson: Pick<UpperLesson, 'id'>): ReadingEnhancement | undefined {
  return JAPANESE_READING_ENHANCEMENTS.find(item => item.lessonId === lesson.id);
}
