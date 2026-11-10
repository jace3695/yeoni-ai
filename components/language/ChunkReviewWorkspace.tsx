"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ALL_JAPANESE_CHUNK_LESSONS as JAPANESE_CHUNK_LESSONS, getChunkLesson } from '@/data/japaneseChunkLessons';
import { chunkReviewItems, type ChunkReviewState } from '@/utils/japaneseChunkReview';
import { CHUNK_TRACK_LABELS, chunkLessonInfo, type ChunkTrack } from '@/utils/japaneseChunkCatalog';
import { useChunkReview } from './useChunkReview';
import JapaneseChunkPractice from './JapaneseChunkPractice';
import styles from './chunk-review.module.css';

export default function ChunkReviewWorkspace() {
  const review = useChunkReview();
  if (review.readError || !review.state) return <section className={styles.page}>
    <Link href="/language">← 일본어 학습</Link><h1>표현 조각 보충복습</h1>
    {review.readError ? <><p className={styles.error} role="alert">{review.readError}</p><button type="button" onClick={review.reload}>기록 다시 읽기</button></> : <p role="status">보충복습 기록을 불러오고 있어요.</p>}
    <p>기록이 확인되기 전에는 새 답을 덮어쓰지 않아요.</p>
  </section>;
  return <ChunkReviewList key={review.state.owner} value={review.state.value} reload={review.reload} />;
}

type ActivePractice = { lessonId: string; questionIds: string[]; from: 'review' | 'free'; sessionId: string };
const questionNames = { meaning: '뜻 고르기', blank: '빈칸 고르기', listening: '듣고 뜻 고르기' };
const dateLabel = (value: string) => new Date(value).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ChunkReviewList({ value, reload }: { value: ChunkReviewState; reload: () => void }) {
  const [view, setView] = useState<'due' | 'all' | 'free'>('due');
  const [track, setTrack] = useState<ChunkTrack | 'all'>('all');
  const [active, setActive] = useState<ActivePractice>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (!active) heading.current?.focus(); }, [active]);
  const activeLesson = active && getChunkLesson(active.lessonId);
  const start = (lessonId: string, questionIds: string[], from: ActivePractice['from']) => setActive({ lessonId, questionIds: [...questionIds], from, sessionId: crypto.randomUUID() });
  const close = () => { setActive(undefined); reload(); };
  if (active && activeLesson) return <section className={styles.page}>
    <p className={styles.eyebrow}>{chunkLessonInfo(active.lessonId).trackLabel} · 본수업과 별도 보충연습</p><h1>{chunkLessonInfo(active.lessonId).title}</h1>
    <JapaneseChunkPractice key={active.sessionId} lesson={activeLesson} questionIds={active.questionIds} startAtQuestions={active.from === 'review'} closeLabel="닫고 보충복습 목록으로" onClose={close} onReturnToReview={close} />
  </section>;
  if (active) return <section className={styles.page}><h1>연습 내용을 찾지 못했어요</h1><p>저장한 답과 기존 진도는 그대로예요.</p><button type="button" onClick={close}>보충복습 목록으로</button></section>;
  const all = chunkReviewItems(value);
  const now = Date.now();
  const due = all.filter(item => Date.parse(item.nextReviewAt) <= now);
  const scoped = (view === 'due' ? due : all).filter(item => track === 'all' || chunkLessonInfo(item.lessonId).track === track);
  const freeLessons = JAPANESE_CHUNK_LESSONS.filter(lesson => track === 'all' || chunkLessonInfo(lesson.lessonId).track === track);
  return <section className={styles.page}>
    <Link href="/language">← 일본어 학습</Link><p className={styles.eyebrow}>본문·문법 복습과 따로 모은 선택형 연습</p><h1 ref={heading} tabIndex={-1}>표현 조각 보충복습</h1>
    <p>짧은 표현 보충연습에서 틀렸거나 도움받은 문제를 다시 풀어요. 한 번 맞혀도 이전 오답 이력은 지우지 않아요.</p>
    <p className={styles.notice}>답은 먼저 이 기기에 저장돼요. 같은 계정의 다른 기기 기록은 동기화가 정상 완료되면 합쳐져요. 이 화면의 저장 표시는 클라우드 저장 완료를 뜻하지 않아요. 선택한 단계·기존 진도·본문과 문법 복습 일정은 바뀌지 않아요.</p>
    <nav className={styles.actions} aria-label="보충복습 보기">
      <button type="button" aria-pressed={view === 'due'} onClick={() => setView('due')}>지금 예정 {due.length}문제</button>
      <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>저장한 전체 {all.length}문제</button>
      <button type="button" aria-pressed={view === 'free'} onClick={() => setView('free')}>자유 재연습</button>
    </nav>
    <div className={styles.actions} role="group" aria-label="보충연습 목적별 범위"><button type="button" aria-pressed={track === 'all'} onClick={() => setTrack('all')}>모든 과정</button>{Object.entries(CHUNK_TRACK_LABELS).map(([id, label]) => <button type="button" key={id} aria-pressed={track === id} onClick={() => setTrack(id as ChunkTrack)}>{label}</button>)}</div>
    {view === 'free' ? <>
      <h2>원하는 단원 자유 재연습</h2><p>저장된 문제나 예정일이 없어도 표현부터 다시 연습할 수 있어요. 단계 선택을 바꾸거나 기존 기록을 초기화하지 않아요.</p>
      <p role="status">선택한 범위 {freeLessons.length}단원</p>
      {!freeLessons.length && <p className={styles.empty}>이 범위에는 보충연습 단원이 없어요. 다른 과정을 골라 주세요.</p>}
      <ul className={styles.list}>{freeLessons.map(lesson => { const info = chunkLessonInfo(lesson.lessonId); return <li className={styles.card} key={lesson.lessonId}><p className={styles.eyebrow}>{info.trackLabel}</p><h3>{info.title}</h3><div className={styles.actions}><button type="button" aria-label={`${info.title} 표현부터 자유 연습`} onClick={() => start(lesson.lessonId, lesson.questions.map(question => question.id), 'free')}>표현부터 자유 연습</button><Link href={info.href}>본수업 보기</Link></div></li>; })}</ul>
    </> : <>
      <h2>{view === 'due' ? '지금 다시 볼 문제' : '저장한 모든 문제'}</h2>
      <p role="status">선택한 범위 {scoped.length}문제</p>
      <p className={styles.muted}>다시 풀기를 누르면 정답·예문을 먼저 열지 않고 문제부터 시작해요. 도움이나 같은 화면 재연습은 따로 표시하며, 오늘 반복한 횟수만으로 복습 간격을 계속 늘리지 않아요.</p>
      {!scoped.length && <div className={styles.empty}><p>{all.length === 0 ? '아직 저장된 보충복습 문제가 없어요. 보충연습에서 틀렸거나 도움받은 답을 저장하면 여기에 모여요.' : view === 'due' ? '이 범위에는 지금 예정된 보충복습이 없어요. 전체 목록에서 미리 다시 풀거나 자유 재연습을 할 수 있어요.' : '이 범위에는 저장된 문제가 없어요. 다른 과정을 골라 주세요.'}</p><button type="button" onClick={() => setView('free')}>자유 재연습 고르기</button></div>}
      <ul className={styles.list}>{scoped.map(item => {
        const lesson = getChunkLesson(item.lessonId), question = lesson?.questions.find(candidate => candidate.id === item.questionId), info = chunkLessonInfo(item.lessonId);
        return <li className={styles.card} key={`${item.lessonId}:${item.questionId}`}><p className={styles.eyebrow}>{info.trackLabel}</p><h3>{info.title} · {question ? questionNames[question.kind] : '찾을 수 없는 문제'}</h3>
          <p>저장된 응답 {item.attempts}회 · 오답 {item.wrongAttempts}회 · 도움 포함 {item.helpedAttempts}회</p>
          <p>최근 답: {item.correct ? '정답' : '오답'}{item.neededHelp ? ' · 도움 포함' : ' · 도움 없이 선택'}{item.mode === 'reading' ? ' · 문장 보기 대체' : item.mode === 'audio' ? ' · 소리 재생 시도' : ''}</p>
          <p className={styles.muted}>최근 저장 {dateLabel(item.lastAnsweredAt)}<br />다음 복습 {dateLabel(item.nextReviewAt)}</p>
          {question ? <div className={styles.actions}><button type="button" aria-label={`${info.title} ${questionNames[question.kind]} 다시 풀기`} onClick={() => start(item.lessonId, [item.questionId], 'review')}>이 문제 다시 풀기</button><Link href={info.href}>본수업 보기</Link></div> : <p className={styles.error}>현재 문제 콘텐츠를 찾을 수 없어 다시 풀기는 잠시 열지 않아요. 저장된 이력은 삭제하지 않았어요.</p>}
        </li>;
      })}</ul>
    </>}
    <footer className={styles.actions}><Link href="/language/review">본문·단어·문법 복습</Link><Link href="/language/levels">단계별 학습</Link><button type="button" onClick={reload}>저장 기록 다시 읽기</button></footer>
    <p className={styles.muted}>선택형 연습 기록이며 듣기·쓰기·회화 능력이나 공식 등급을 인증하지 않아요. 실제 소리를 들었는지도 확인하지 않아요.</p>
  </section>;
}
