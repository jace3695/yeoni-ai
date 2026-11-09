import type { GrammarLesson, GrammarProgressItem } from '../data/grammar.ts';

type ProgressStorage = Pick<Storage, 'setItem'>;
type GrammarAnswerResult =
  | { saved: false }
  | { saved: true; progress: GrammarProgressItem[]; routineSaved: boolean };

/** Publish progress to the UI only after the corresponding local write succeeds. */
export function persistGrammarQuizAnswer({ getStorage, key, progress, lesson, choice, answeredAt, completeRoutine }: {
  getStorage: () => ProgressStorage;
  key: string;
  progress: GrammarProgressItem[];
  lesson: GrammarLesson;
  choice: string;
  answeredAt: string;
  completeRoutine: () => void;
}): GrammarAnswerResult {
  const existing = progress.find(item => item.lessonId === lesson.id);
  const isCorrect = choice === lesson.quiz.answer;
  const nextItem: GrammarProgressItem = {
    ...existing,
    lessonId: lesson.id,
    title: lesson.title,
    category: lesson.category,
    pattern: lesson.pattern,
    correctCount: (existing?.correctCount ?? 0) + (isCorrect ? 1 : 0),
    wrongCount: (existing?.wrongCount ?? 0) + (isCorrect ? 0 : 1),
    lastAnsweredAt: answeredAt,
    lastResult: isCorrect ? 'correct' : 'wrong',
  };
  const next = existing
    ? progress.map(item => item.lessonId === lesson.id ? nextItem : item)
    : [...progress, nextItem];
  try {
    getStorage().setItem(key, JSON.stringify(next));
  } catch {
    return { saved: false };
  }
  // The answer is already durable. A separate routine-check failure must not
  // roll it back, hide it or make a retry count the same answer a second time.
  try {
    completeRoutine();
    return { saved: true, progress: next, routineSaved: true };
  } catch {
    return { saved: true, progress: next, routineSaved: false };
  }
}
