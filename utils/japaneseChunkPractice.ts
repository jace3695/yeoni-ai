import type { JapaneseChunkLesson } from '../data/japaneseChunkLessons.ts';

export type ChunkStage = 'expression' | 'chunks' | 'variations' | 'questions' | 'done';
export type ChunkPracticeState = {
  stage: ChunkStage;
  queue: number[];
  initialQueue: number[];
  cursor: number;
  answers: Record<number, number>;
  wrong: number[];
  revealed: number[];
  retryRound: boolean;
  revision: number;
};
export type ChunkPracticeAction = { revision: number } & (
  | { type: 'next' | 'previous' | 'retry-wrong' | 'retry-question' | 'restart' | 'reveal' }
  | { type: 'answer'; choice: number }
);

export type ChunkPracticeOptions = { questionIds?: string[]; startAtQuestions?: boolean };
export function createChunkPractice(lesson: JapaneseChunkLesson, options: ChunkPracticeOptions = {}): ChunkPracticeState {
  const queue = lesson.questions.flatMap((question, index) => !options.questionIds || options.questionIds.includes(question.id) ? [index] : []);
  return { stage: queue.length ? options.startAtQuestions ? 'questions' : 'expression' : 'done', queue, initialQueue: queue, cursor: 0, answers: {}, wrong: [], revealed: [], retryRound: false, revision: 0 };
}

/** Render-revision tokens reject repeated/stale button events, including batched clicks.
 * Only in-memory data is returned; no storage, mastery, score, or SRS side effects. */
export function reduceChunkPractice(lesson: JapaneseChunkLesson, state: ChunkPracticeState, action: ChunkPracticeAction): ChunkPracticeState {
  if (action.revision !== state.revision) return state;
  const index = state.queue[state.cursor];
  const question = lesson.questions[index];
  const answered = state.answers[index] !== undefined;
  const change = (patch: Partial<ChunkPracticeState>) => ({ ...state, ...patch, revision: state.revision + 1 });
  switch (action.type) {
    case 'restart': return { ...createChunkPractice(lesson, { questionIds: state.initialQueue.map(index => lesson.questions[index].id) }), revision: state.revision + 1 };
    case 'answer': {
      if (state.stage !== 'questions' || !question || answered || !Number.isInteger(action.choice) || action.choice < 0 || action.choice >= question.choices.length) return state;
      const correct = action.choice === question.answer;
      return change({ answers: { ...state.answers, [index]: action.choice }, wrong: correct ? state.wrong.filter(item => item !== index) : [...new Set([...state.wrong, index])] });
    }
    case 'reveal':
      if (state.stage !== 'questions' || question?.kind !== 'listening' || state.revealed.includes(index)) return state;
      return change({ revealed: [...state.revealed, index] });
    case 'retry-question': {
      if (state.stage !== 'questions' || !question || !answered || state.answers[index] === question.answer) return state;
      const answers = { ...state.answers };
      delete answers[index];
      return change({ answers, revealed: state.revealed.filter(item => item !== index) });
    }
    case 'retry-wrong':
      if (state.stage !== 'done' || !state.wrong.length) return state;
      return change({ stage: 'questions', queue: [...state.wrong], cursor: 0, answers: {}, revealed: [], retryRound: true });
    case 'previous': {
      if (state.stage === 'done') return change({ stage: 'questions', cursor: Math.max(0, state.queue.length - 1) });
      if (state.stage === 'questions' && state.cursor > 0) return change({ cursor: state.cursor - 1 });
      const previous: Partial<Record<ChunkStage, ChunkStage>> = { chunks: 'expression', variations: 'chunks', questions: 'variations' };
      return previous[state.stage] ? change({ stage: previous[state.stage] }) : state;
    }
    case 'next': {
      if (state.stage === 'questions') {
        if (!question || !answered) return state;
        return state.cursor < state.queue.length - 1 ? change({ cursor: state.cursor + 1 }) : change({ stage: 'done' });
      }
      const next: Partial<Record<ChunkStage, ChunkStage>> = { expression: 'chunks', chunks: 'variations', variations: 'questions' };
      return next[state.stage] ? change({ stage: next[state.stage] }) : state;
    }
  }
}
