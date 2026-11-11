import { JAPANESE_COURSE_GAP_CHUNKS } from '../../data/japaneseCourseGapChunks.ts';
import { CURRICULUM, TRACKS, type CourseTrack } from '../../data/curriculum.ts';
import { JAPANESE_CHUNK_LESSONS } from '../../data/japaneseChunkLessons.ts';
import { JAPANESE_LEVELS } from '../../data/japaneseLevels.ts';
import { getLevelReadingLessons } from '../../data/japaneseReadingLessons.ts';
import { previewHash } from './navigation.ts';

export const PREVIEW_TRACK_ORDER: CourseTrack[] = ['foundation', 'work', 'travel'];
export const PREVIEW_READING_LESSONS = (['intermediate', 'advanced'] as const).flatMap(level =>
  getLevelReadingLessons(level).map(lesson => ({ ...lesson, level })));

export const PREVIEW_CURRICULUM_CATALOG = PREVIEW_TRACK_ORDER.flatMap(track =>
  CURRICULUM.filter(lesson => lesson.track === track).sort((a, b) => a.order - b.order).map(lesson => ({
    id: lesson.id, title: lesson.title, group: TRACKS[track].title, track,
    href: previewHash(`/language/learn?lesson=${encodeURIComponent(lesson.id)}`),
  })));
export const PREVIEW_READING_CATALOG = PREVIEW_READING_LESSONS.map(lesson => ({
  id: lesson.id, title: lesson.title, group: JAPANESE_LEVELS[lesson.level].title,
  href: previewHash(`/language/levels?lesson=${encodeURIComponent(lesson.id)}`),
}));
export const PREVIEW_CHUNK_CATALOG = [...JAPANESE_CHUNK_LESSONS, ...JAPANESE_COURSE_GAP_CHUNKS].map(lesson => {
  const parent = [...PREVIEW_CURRICULUM_CATALOG, ...PREVIEW_READING_CATALOG].find(item => item.id === lesson.lessonId);
  if (!parent) throw new Error(`Unknown chunk parent in preview catalog: ${lesson.lessonId}`);
  return { id: lesson.lessonId, title: parent.title, group: parent.group, expression: lesson.expression,
    href: previewHash(`/language/qa-chunks?lesson=${encodeURIComponent(lesson.lessonId)}`) };
});

export function previewTrack(value: string | null): CourseTrack | undefined {
  return PREVIEW_TRACK_ORDER.find(track => track === value);
}
