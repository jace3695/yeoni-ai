import type { UpperLesson } from './japaneseUpperLessons.ts';

/** Original, fictional expansion connected to the local level-learning candidate.
 * App study labels are not JLPT/CEFR certification or a complete syllabus.
 * The writing field is an example-comparison activity, never an input task.
 */
export type JapaneseContentUnit = UpperLesson & {
  level: 'intermediate' | 'advanced';
  domain: 'everyday' | 'mechanical-development';
  fictional: true;
  focus: string[];
  prerequisites: string[];
};
