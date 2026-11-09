import { CURRICULUM } from './curriculum.ts';

export const JAPANESE_LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'] as const;
export type JapaneseLevel = typeof JAPANESE_LEVEL_ORDER[number];
export function isJapaneseLevel(value: unknown): value is JapaneseLevel {
  return JAPANESE_LEVEL_ORDER.some(level => level === value);
}

// These are app study paths, not JLPT/CEFR certifications. Existing lesson IDs
// and their histories stay intact; a filename containing "Advanced" is not a level.
export const JAPANESE_LEVELS: Record<JapaneseLevel, {
  title: string; subtitle: string; goal: string; outcomes: string[];
  legacyLessonIds: string[]; coverage: string;
}> = {
  beginner: {
    title: '초급', subtitle: '글자와 짧은 문장',
    goal: '글자와 기본 표현을 익히고, 짧은 문장의 뜻과 만드는 순서를 반복해요.',
    outcomes: ['히라가나·가타카나의 소리와 모양 구분', '기본 조사·현재·과거·비교 표현 이해', '짧은 예문의 뜻과 표현 비교'],
    legacyLessonIds: Array.from({ length: 12 }, (_, index) => `f${String(index + 1).padStart(2, '0')}`),
    coverage: '기존 기초 12수업을 연결했어요. 가나·문법 자료실을 함께 반복할 수 있어요.',
  },
  intermediate: {
    title: '중급', subtitle: '문장 연결과 활용',
    goal: '기초를 바탕으로 이유·조건·경험·계획을 연결하고 생활·업무 표현으로 넓혀요.',
    outcomes: ['허가·규칙·경험·계획 문형 이해', '이유와 조건을 연결한 문장 읽기', '업무·여행 상황에 맞는 표현 비교'],
    legacyLessonIds: Array.from({ length: 8 }, (_, index) => `f${index + 13}`),
    coverage: '연결문장 8수업과 읽기·표현 비교 8단원을 연결했어요. 중급의 모든 문법·독해 범위를 다루는 완성 교재는 아니에요.',
  },
  advanced: {
    title: '고급', subtitle: '글의 근거와 표현 다듬기',
    goal: '여러 문장의 관계와 근거를 읽고, 단정·조건·상대에 맞는 글을 연습해요.',
    outcomes: ['사실·추측과 조건·예외 구분', '글의 핵심과 근거를 연결해 요약', '요청·보고·제안 문장의 목적과 표현 점검'],
    legacyLessonIds: [],
    coverage: '기존 읽기 6단원과 가상 기계개발 자료 읽기 6단원을 연결했어요. 공식 시험 등급이나 고급 전체 교육과정 이수를 인증하지 않아요.',
  },
};

export function getLevelLegacyLessons(level: JapaneseLevel) {
  return JAPANESE_LEVELS[level].legacyLessonIds.flatMap(id => {
    const lesson = CURRICULUM.find(item => item.id === id);
    return lesson ? [lesson] : [];
  });
}

export function getLessonStudyLevel(lessonId: string): JapaneseLevel | undefined {
  return JAPANESE_LEVEL_ORDER.find(level => JAPANESE_LEVELS[level].legacyLessonIds.includes(lessonId));
}

export function nextLevelLessonId(level: JapaneseLevel, currentId: string) {
  const ids = JAPANESE_LEVELS[level].legacyLessonIds;
  const index = ids.indexOf(currentId);
  return index >= 0 ? ids[index + 1] : undefined;
}
