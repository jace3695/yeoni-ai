"use client";

import Link from 'next/link';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { JapaneseChunkLesson } from '@/data/japaneseChunkLessons';
import { createChunkPractice, reduceChunkPractice, type ChunkPracticeAction, type ChunkStage } from '@/utils/japaneseChunkPractice';
import { rememberChunkAnswer, type ChunkReviewState } from '@/utils/japaneseChunkReview';
import { useChunkReview } from './useChunkReview';
import { useLearningAudio } from './useLearningAudio';
import styles from './japanese-chunk-practice.module.css';

const stages: { id: ChunkStage; label: string }[] = [
  { id: 'expression', label: '짧은 표현' }, { id: 'chunks', label: '조각별 뜻' },
  { id: 'variations', label: '바꾼 예문' }, { id: 'questions', label: '선택 문제' }, { id: 'done', label: '이번 연습' },
];
const questionNames = { meaning: '뜻 고르기', blank: '빈칸 고르기', listening: '듣고 뜻 고르기' };

type PracticeProps = {
  lesson: JapaneseChunkLesson; onClose: () => void; onUse?: () => void; audioRate?: number; onReturnToReview?: () => void;
  questionIds?: string[]; startAtQuestions?: boolean; closeLabel?: string;
};
type SavedResponse = {
  attemptId: string; choice: number; neededHelp: boolean; mode: 'choice' | 'audio' | 'reading';
  answeredAt: string; saved: boolean; saving: boolean; retained: boolean;
};

/** A changed account/reset owner, or an unreadable store, unmounts local answers. */
export default function JapaneseChunkPractice(props: PracticeProps) {
  const review = useChunkReview();
  if (review.readError || !review.state) return <section className={styles.practice} aria-label="보충연습 기록 확인">
    <h2>보충연습 기록 확인</h2>
    {review.readError ? <><p className={styles.error} role="alert">{review.readError}</p><button type="button" onClick={review.reload}>기록 다시 읽기</button></> : <p role="status">보충연습 기록을 불러오고 있어요.</p>}
    <p>기록을 확인한 뒤 연습할 수 있어요. 기존 기록을 빈 기록으로 바꾸지 않아요.</p>
    <button type="button" onClick={props.onClose}>{props.closeLabel ?? '닫고 본수업으로'}</button>
  </section>;
  return <ChunkPracticeSession key={`${review.state.owner}:${props.lesson.lessonId}`} {...props} update={review.update} />;
}

export function ChunkPracticeSession({ lesson, onClose, onUse, audioRate = 0.9, questionIds, startAtQuestions = false, closeLabel = '닫고 본수업으로', onReturnToReview, update }: PracticeProps & {
  update: (change: (latest: ChunkReviewState) => ChunkReviewState) => Promise<ChunkReviewState>;
}) {
  // Freeze the requested queue. Saved/remote due-date updates cannot hide active feedback.
  const [state, dispatch] = useReducer((value: ReturnType<typeof createChunkPractice>, action: ChunkPracticeAction) => reduceChunkPractice(lesson, value, action), undefined,
    () => createChunkPractice(lesson, { questionIds, startAtQuestions }));
  const live = useRef(state);
  live.current = state;
  const [responses, setResponses] = useState<Record<number, SavedResponse>>({});
  const responseRef = useRef(responses);
  responseRef.current = responses;
  const [saveError, setSaveError] = useState('');
  const exposed = useRef(!startAtQuestions);
  const audioAttempted = useRef(new Set<number>());
  const audioCompleted = useRef(new Set<number>());
  const playGeneration = useRef(0);
  const mounted = useRef(true);
  const audio = useLearningAudio();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { heading.current?.focus(); }, [state.stage, state.cursor, state.retryRound]);
  const index = state.queue[state.cursor];
  const question = lesson.questions[index];
  const choice = state.answers[index];
  const answered = choice !== undefined;
  const response = responses[index];
  const pending = Object.values(responses).some(item => !item.saved);
  const saving = Object.values(responses).some(item => item.saving);
  const replaceResponse = (questionIndex: number, value: SavedResponse) => {
    responseRef.current = { ...responseRef.current, [questionIndex]: value };
    setResponses(responseRef.current);
  };
  const transition = (action: ChunkPracticeAction) => {
    const next = reduceChunkPractice(lesson, live.current, action);
    if (next === live.current) return false;
    live.current = next;
    dispatch(action);
    return true;
  };
  const act = (type: Exclude<ChunkPracticeAction['type'], 'answer'>) => {
    if (Object.values(responseRef.current).some(item => !item.saved)) return;
    const before = live.current;
    if (!transition({ type, revision: state.revision })) return;
    playGeneration.current++; audio.stop(); onUse?.();
    if (type === 'restart' || type === 'retry-wrong') { responseRef.current = {}; setResponses({}); audioAttempted.current.clear(); audioCompleted.current.clear(); }
    if (type === 'retry-question') {
      const next = { ...responseRef.current }; delete next[before.queue[before.cursor]];
      responseRef.current = next; setResponses(next); audioAttempted.current.delete(before.queue[before.cursor]); audioCompleted.current.delete(before.queue[before.cursor]);
    }
    if (type === 'restart' || type === 'retry-question' || type === 'retry-wrong' || type === 'reveal' || live.current.stage !== 'questions') exposed.current = true;
    setSaveError('');
  };
  const close = () => { mounted.current = false; playGeneration.current++; audio.stop(); onClose(); };
  const returnToReview = () => { mounted.current = false; playGeneration.current++; audio.stop(); onReturnToReview?.(); };
  const play = (text: string) => { onUse?.(); void audio.play(text, audioRate); };
  const playQuestion = async () => {
    if (!question?.audioText || answered) return;
    const generation = ++playGeneration.current;
    audioAttempted.current.add(index);
    audioCompleted.current.delete(index);
    onUse?.();
    const completed = await audio.play(question.audioText, audioRate);
    if (mounted.current && generation === playGeneration.current && completed) audioCompleted.current.add(index);
  };
  const persist = async (questionIndex: number, next: SavedResponse) => {
    if (!mounted.current || next.saved || next.saving) return;
    replaceResponse(questionIndex, { ...next, saving: true });
    try {
      const value = await update(latest => rememberChunkAnswer(latest, {
        lessonId: lesson.lessonId, questionId: lesson.questions[questionIndex].id, attemptId: next.attemptId,
        correct: next.choice === lesson.questions[questionIndex].answer, neededHelp: next.neededHelp, mode: next.mode,
      }, new Date(next.answeredAt)));
      if (!mounted.current) return;
      replaceResponse(questionIndex, { ...next, saved: true, saving: false, retained: Boolean(value.events[next.attemptId]) });
      setSaveError('');
    } catch (cause) {
      if (!mounted.current) return;
      replaceResponse(questionIndex, { ...next, saving: false });
      setSaveError(cause instanceof Error ? cause.message : '이 답을 저장하지 못했어요. 같은 답 저장을 다시 시도해 주세요.');
    }
  };
  const answer = (selected: number) => {
    if (!question || Object.values(responseRef.current).some(item => !item.saved)) return;
    if (!transition({ type: 'answer', choice: selected, revision: state.revision })) return;
    playGeneration.current++; audio.stop(); onUse?.();
    const reading = state.revealed.includes(index);
    const triedAudio = audioAttempted.current.has(index);
    const next: SavedResponse = {
      attemptId: crypto.randomUUID(), choice: selected, answeredAt: new Date().toISOString(), saved: false, saving: false, retained: false,
      neededHelp: exposed.current || reading || (question.kind === 'listening' && !audioCompleted.current.has(index)),
      mode: reading ? 'reading' : question.kind === 'listening' && triedAudio ? 'audio' : 'choice',
    };
    // The explanation can reveal the same expression in subsequent questions/retries.
    exposed.current = true;
    replaceResponse(index, next);
    void persist(index, next);
  };
  const retrySave = () => { const next = responseRef.current[index]; if (next && !next.saved && !next.saving) void persist(index, next); };
  const title = state.stage === 'questions' && question ? questionNames[question.kind] : stages.find(stage => stage.id === state.stage)!.label;

  return <section className={styles.practice} aria-label="표현 조각 보충연습">
    <header className={styles.header}><p className={styles.eyebrow}>선택해서 하는 보충연습</p><button type="button" onClick={close}>{closeLabel}</button></header>
    <p className={styles.notice}>오답·도움받은 답은 별도 보충복습에 저장해요. 저장된 문제는 닫은 뒤에도 다시 풀 수 있어요. 풀이 중 화면 위치는 저장하지 않아요. 본수업 점수·선택 단계·본문과 문법 복습 일정은 바꾸지 않아요.</p>
    <p>{onReturnToReview ? <button type="button" onClick={returnToReview}>표현 조각 보충복습 목록</button> : <Link href="/language/chunk-review" onClick={audio.stop}>표현 조각 보충복습 목록</Link>}</p>
    {saving && <p role="status">이 답을 저장하고 있어요. 완료 전에 닫으면 이 답이 남지 않을 수 있어요.</p>}
    {pending && !saving && <p className={styles.error} role="alert">아직 이 답을 저장하지 못했어요. 지금 닫거나 이동하면 이 답은 나중복습에 남지 않을 수 있어요. 이전에 저장한 기록은 유지돼요.</p>}
    {saveError && <p className={styles.error} role="alert">{saveError}</p>}
    <ol className={styles.steps} aria-label="보충연습 단계">{stages.map(stage => <li key={stage.id} aria-current={state.stage === stage.id ? 'step' : undefined}>{stage.label}</li>)}</ol>
    <h2 ref={heading} tabIndex={-1}>{title}</h2>

    {state.stage === 'expression' && <>
      <p className={styles.expression} lang="ja">{lesson.expression}</p>
      <p className={styles.japanese} lang="ja">{lesson.sentence}</p><p>{lesson.meaning}</p>
      <button type="button" disabled={audio.playing} onClick={() => play(lesson.sentence)}>예문 소리 듣기</button>
      <p className={styles.muted}>먼저 표현 하나를 보고, 다음에서 조각별 뜻과 역할을 살펴봐요.</p>
    </>}
    {state.stage === 'chunks' && <>
      <p className={styles.japanese} lang="ja">{lesson.sentence}</p>
      <ol className={styles.chunks}>{lesson.chunks.map((chunk, position) => <li key={`${position}:${chunk.text}`}><strong lang="ja">{chunk.text}</strong><p><b>뜻:</b> {chunk.meaning}</p><p><b>역할:</b> {chunk.role}</p></li>)}</ol>
      <p className={styles.muted}>조사·어미를 따로 떼어 외우기보다 문장 안에서 어떤 일을 하는지 확인해요.</p>
    </>}
    {state.stage === 'variations' && <>
      <p className={styles.muted}>원래 문장: <span lang="ja">{lesson.sentence}</span></p>
      <div className={styles.variations}>{lesson.variations.map((variation, position) => <article key={`${variation.kind}:${position}`}><h3>{variation.kind === 'word' ? '단어 바꾸기' : '시제 바꾸기'} · {variation.label}</h3><p className={styles.japanese} lang="ja">{variation.sentence}</p><p>{variation.meaning}</p><p>{variation.explanation}</p><button type="button" disabled={audio.playing} onClick={() => play(variation.sentence)}>바꾼 예문 {position + 1} 듣기</button></article>)}</div>
    </>}
    {state.stage === 'questions' && question && <>
      <p className={styles.eyebrow}>{state.retryRound ? '틀린 문제만 다시' : '이번 선택 연습'} · {state.cursor + 1} / {state.queue.length}</p>
      <p className={styles.prompt}>{question.prompt}</p>
      {question.kind === 'meaning' && !question.prompt.includes(lesson.sentence) && <p className={styles.japanese} lang="ja" aria-label="뜻을 고를 문장">{lesson.sentence}</p>}
      {question.kind === 'listening' && <div className={styles.listening}><div className={styles.actions}><button type="button" disabled={answered || audio.playing || !question.audioText} onClick={() => void playQuestion()}>문제 소리 듣기</button><button type="button" disabled={answered || pending || state.revealed.includes(index)} onClick={() => act('reveal')}>문장 보기로 대신하기</button></div>{state.revealed.includes(index) && <div><p className={styles.muted}>문장 보기로 연습 중이에요.</p><p className={styles.japanese} lang="ja">{question.audioText}</p></div>}<p className={styles.muted}>기기의 무료 일본어 음성을 사용해요. 소리가 안 나면 문장을 보고 풀어도 돼요. 실제로 들었는지 확인하거나 듣기 능력을 채점하지 않아요.</p></div>}
      <p className={styles.muted}>답을 하나 고르면 정답과 해설이 보여요.</p>
      <div className={styles.choices}>{question.choices.map((option, optionIndex) => <button type="button" key={optionIndex} disabled={answered || pending} data-correct={answered && optionIndex === question.answer} data-wrong={answered && optionIndex === choice && choice !== question.answer} onClick={() => answer(optionIndex)}>{option}</button>)}</div>
      {answered && <div className={styles.feedback} role="status"><strong>{choice === question.answer ? '맞게 골랐어요.' : '뜻과 문장 모양을 다시 확인해요.'}</strong><p><b>내 선택:</b> {question.choices[choice]}</p><p><b>정답:</b> {question.choices[question.answer]}</p><p>{question.explanation}</p>{response && <><p>{response.saved ? response.retained ? '이 답을 이 기기의 보충복습 기록에 저장했어요.' : '처음에 도움 없이 맞힌 문제라 새 보충복습 항목은 만들지 않았어요.' : response.saving ? '이 답을 저장하고 있어요.' : '아직 이 답이 저장되지 않았어요.'}</p><p className={styles.muted}>{response.neededHelp ? '예문·해설·문장 보기 도움, 같은 화면 재연습 또는 소리 재생 미확인이 포함된 답이에요. 도움 없이 기억한 답으로 계산하지 않아요.' : '이번 화면에서는 도움을 열지 않고 골랐어요. 전체 숙련도를 뜻하지 않아요.'}{response.mode === 'audio' && ' 소리 재생 시도만 기록하며 실제 청취 여부는 확인하지 않아요.'}{response.mode === 'reading' && ' 듣기 대신 문장 보기로 푼 답이에요.'}</p>{!response.saved && <button type="button" disabled={response.saving} onClick={retrySave}>이 답 저장 다시 시도</button>}</>}{choice !== question.answer && <><p>이 문제는 이번 화면에서도 다시 풀 수 있어요. 저장된 오답 이력은 나중에 맞혀도 지우지 않아요.</p><button type="button" disabled={pending} onClick={() => act('retry-question')}>이 문제 지금 다시 풀기</button></>}</div>}
    </>}
    {state.stage === 'done' && <div className={styles.summary}>
      <p>{state.wrong.length ? `이번 화면에서 다시 풀 문제 ${state.wrong.length}개가 있어요.` : '이번 선택 연습을 마쳤어요. 지금 남은 다시 풀 문제는 없어요.'}</p>
      <p>저장된 오답·도움받은 문제는 보충복습 목록에서 다시 볼 수 있어요. 지금 맞힌 뒤에도 이전 기록은 남아요. 이 화면을 닫으면 풀이 위치만 끝나요.</p>
      <div className={styles.actions}>{state.wrong.length > 0 && <button type="button" className={styles.primary} onClick={() => act('retry-wrong')}>틀린 문제 {state.wrong.length}개만 다시 풀기</button>}<button type="button" onClick={() => act('restart')}>표현부터 새로 반복하기</button><button type="button" onClick={close}>{closeLabel}</button></div>
    </div>}
    {audio.audioError && <p className={styles.error} role="status">{audio.audioError} 문장 보기로도 계속할 수 있어요.</p>}
    {audio.playing && <button type="button" onClick={() => { playGeneration.current++; audio.stop(); }}>소리 멈추기</button>}
    <footer className={styles.actions}><button type="button" disabled={pending || state.stage === 'expression'} onClick={() => act('previous')}>{state.stage === 'questions' && state.cursor > 0 ? '이전 문제' : state.stage === 'done' ? '마지막 문제 보기' : '이전 단계'}</button>{state.stage !== 'done' && <button type="button" className={styles.primary} disabled={pending || (state.stage === 'questions' && !answered)} onClick={() => act('next')}>{state.stage === 'expression' ? '조각별 뜻과 역할 보기' : state.stage === 'chunks' ? '단어·시제 바꾼 예문 보기' : state.stage === 'variations' ? '선택 문제 시작' : state.cursor < state.queue.length - 1 ? '다음 문제' : '이번 연습 확인'}</button>}</footer>
  </section>;
}
