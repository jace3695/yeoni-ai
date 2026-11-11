"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { JAPANESE_LEVELS, JAPANESE_LEVEL_ORDER, getLevelLegacyLessons, isJapaneseLevel } from '@/data/japaneseLevels';
import { getJapaneseReadingLesson, getLevelReadingLessons, getReadingLessonLevel, isKnownReadingAnswer } from '@/data/japaneseReadingLessons';
import { curriculumProgressErrorMessage, loadCurriculumProgress } from '@/utils/curriculumProgress';
import { chooseJapaneseLevel, dueUpperAnswers, upperAnswerStable } from '@/utils/japaneseLevelJourney';
import { useLevelJourney } from './useLevelJourney';
import UpperReadingLesson from './UpperReadingLesson';
import styles from './level-learning.module.css';

export default function LevelLearningWorkspace({ requestedLevel, lessonId, reviewOnly = false }: { requestedLevel?: string | null; lessonId?: string | null; reviewOnly?: boolean }) {
  const journey = useLevelJourney();
  const [pending, setPending] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const context = `${journey.state?.owner}:${requestedLevel}:${lessonId}:${reviewOnly}`;
  const activeContext = useRef(context);
  useEffect(() => {
    activeContext.current = context; setPending(false); setMessage(''); setSaveError('');
    return () => { operation.current?.abort(); operation.current = null; };
  }, [context]);
  const leave = () => { operation.current?.abort(); operation.current = null; setPending(false); setMessage(''); };
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const [curriculumError, setCurriculumError] = useState('');
  const [readAttempt, setReadAttempt] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [reviewScope, setReviewScope] = useState<'all' | 'level'>('all');
  useEffect(() => {
    try { setCompletedIds(loadCurriculumProgress().completedLessonIds); setCurriculumError(''); }
    catch (error) { setCurriculumError(curriculumProgressErrorMessage(error, '학습 기록을 읽지 못했어요. 다시 읽어 주세요.')); }
  }, [journey.state, readAttempt]);
  useEffect(() => { setMessage(''); setSaveError(''); }, [journey.state?.owner]);
  if (curriculumError) return <section className={styles.page}><p role="alert">{curriculumError}</p><button onClick={() => setReadAttempt(value => value + 1)}>기록 다시 읽기</button><Link href="/language">학습 홈으로</Link></section>;
  if (journey.readError) return <section className={styles.page}><h1>단계별 학습 기록 확인</h1><p className={styles.error} role="alert">{journey.readError}</p><button className={styles.button} onClick={journey.reload}>기록 다시 읽기</button><p><Link onNavigate={leave} href="/language">학습 홈으로</Link></p></section>;
  if (!journey.state) return <p className={styles.page} role="status">단계별 학습 기록을 불러오고 있어요.</p>;
  const { value, owner } = journey.state;
  const previewLevel = isJapaneseLevel(requestedLevel) ? requestedLevel : value.selectedLevel;
  const info = JAPANESE_LEVELS[previewLevel];
  const legacyLessons = getLevelLegacyLessons(previewLevel);
  const readingLessons = getLevelReadingLessons(previewLevel);
  const due = dueUpperAnswers(value).filter(isKnownReadingAnswer);
  const visibleDue = reviewScope === 'all' ? due : due.filter(item => getReadingLessonLevel(item.lessonId) === previewLevel);
  const reading = lessonId ? getJapaneseReadingLesson(lessonId) : undefined;
  const readingLevel = lessonId ? getReadingLessonLevel(lessonId) : undefined;
  if (lessonId) return reading && readingLevel ? <UpperReadingLesson key={`${owner}:${lessonId}:${reviewOnly}`} lesson={reading} level={readingLevel} journey={value} update={journey.update} reviewOnly={reviewOnly} /> : <section className={styles.page}><h1>단원을 찾지 못했어요</h1><p>학습 기록과 선택한 단계는 바뀌지 않았어요.</p><Link onNavigate={leave} className={styles.button} href={`/language/levels?level=${previewLevel}`}>단계별 학습으로</Link></section>;
  const choose = async () => {
    if (operation.current || activeContext.current !== context) return;
    const controller = new AbortController(); operation.current = controller;
    setPending(true); setMessage(''); setSaveError('');
    const current = () => !controller.signal.aborted && activeContext.current === context;
    try {
      await journey.update(latest => chooseJapaneseLevel(latest, previewLevel), controller.signal);
      if (current()) setMessage(`${info.title}을 선택했어요. 이전 학습 기록은 그대로예요.`);
    } catch (error) {
      if (current()) setSaveError(error instanceof Error ? error.message : '단계를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (current()) { operation.current = null; setPending(false); }
    }
  };
  const practiced = readingLessons.filter(item => value.practicedUnits[item.id]).length + legacyLessons.filter(item => completedIds.includes(item.id)).length;
  const total = readingLessons.length + legacyLessons.length;
  return <section className={styles.page}>
    <Link onNavigate={leave} href="/language">← 일본어 학습</Link>
    <p className={styles.eyebrow}>충분히 반복하고, 다음 단계는 내가 선택</p>
    <h1>초급부터 고급까지, 내 속도로</h1>
    <p>초급을 계속 연습해도 괜찮아요. 수업을 마쳐도 자동으로 다음 단계로 넘어가지 않아요.</p>
    <p className={styles.current}>내가 선택한 단계: <strong>{JAPANESE_LEVELS[value.selectedLevel].title}</strong> · 다른 단계를 살펴봐도 이 선택은 바뀌지 않아요.</p>
    <nav className={styles.cards} aria-label="학습 단계 살펴보기">{JAPANESE_LEVEL_ORDER.map(level => <article className={styles.card} key={level} data-active={previewLevel === level}>
      <h2>{JAPANESE_LEVELS[level].title}</h2><p>{JAPANESE_LEVELS[level].subtitle}</p>
      {value.selectedLevel === level && <span className={styles.tag}>현재 선택</span>}
      <p><Link onNavigate={leave} className={styles.button} href={`/language/levels?level=${level}`} aria-current={previewLevel === level ? 'page' : undefined}>{JAPANESE_LEVELS[level].title} 살펴보기</Link></p>
    </article>)}</nav>
    {requestedLevel && !isJapaneseLevel(requestedLevel) && <p role="status">요청한 단계를 찾지 못해 현재 선택을 보여드려요. 기록은 바뀌지 않았어요.</p>}
    {pending && <p role="status">학습 단계를 저장하고 있어요.</p>}
    {saveError && <p className={styles.error} role="alert">{saveError}</p>}
    {message && <p role="status">{message}</p>}
    <section className={styles.section} aria-label={`${info.title} 학습 안내`}>
      <h2>{info.title} · {info.subtitle}</h2><p>{info.goal}</p><ul>{info.outcomes.map(outcome => <li key={outcome}>{outcome}</li>)}</ul>
      {previewLevel !== value.selectedLevel ? <button className={styles.primary} onClick={choose} disabled={pending}>{info.title} 선택하기</button> : <p className={styles.tag}>지금 반복할 단계예요</p>}
      <p className={styles.muted}>연습해 본 수업 {practiced} / {total} · 한 번 마친 기록이며 숙달이나 단계 통과 점수가 아니에요.</p>
      <p className={styles.notice}>{info.coverage} 단계 이름은 앱 안의 학습 순서이며 JLPT·CEFR 등급과 일치한다는 뜻은 아니에요.</p>
      {previewLevel === 'beginner' && <div className={styles.actions}><Link onNavigate={leave} className={styles.button} href="/language/start">가나 첫걸음부터</Link><Link onNavigate={leave} className={styles.button} href="/language/kana">히라가나·가타카나 반복</Link><Link onNavigate={leave} className={styles.button} href="/language/grammar">한국어 설명으로 문법 연습</Link></div>}
      {legacyLessons.length > 0 && <><h3>기존 문장 수업 · {legacyLessons.length}수업</h3><ol className={styles.list}>{legacyLessons.map((item, index) => <li className={styles.lesson} key={item.id}><div><h3>{index + 1}. {item.title}</h3><p>{item.goal}</p>{completedIds.includes(item.id) && <small>연습 기록 있음 · 반복 가능</small>}</div><Link onNavigate={leave} className={styles.button} href={`/language/learn?lesson=${item.id}&level=${previewLevel}`}>{completedIds.includes(item.id) ? '다시 연습' : '수업 보기'}</Link></li>)}</ol></>}
      {readingLessons.length > 0 && <><h3>읽기·표현 비교 · {readingLessons.length}단원</h3><p className={styles.muted}>단원 전체 연습은 복습일과 관계없이 고를 수 있어요. 예정된 문제만 풀려면 아래 읽기 복습을 이용하세요.</p><ol className={styles.list}>{readingLessons.map((item, index) => <li className={styles.lesson} key={item.id}><div><h3>{index + 1}. {item.title}</h3><p>{item.goal}</p>{value.practicedUnits[item.id] && <small>연습 기록 있음 · 다시 연습할 수 있어요</small>}</div><Link onNavigate={leave} className={styles.button} href={`/language/levels?lesson=${item.id}`}>{value.practicedUnits[item.id] ? '단원 전체 다시 연습' : '단원 전체 연습'}</Link></li>)}</ol></>}
    </section>
    <section className={styles.section} aria-label="이전 단계도 계속 복습"><h2>이전 단계도 계속 복습해요</h2><p>중급·고급을 선택해도 초급 진도와 오답은 남아 있어요. 배운 내용을 며칠 뒤, 도움 없이 다시 확인해 보세요.</p>
      <div className={styles.actions}><Link onNavigate={leave} className={styles.primary} href="/language/review">기존 수업·단어·문법 복습</Link><Link onNavigate={leave} className={styles.button} href="/language/levels?level=beginner">초급 더 반복하기</Link></div>
      <p><Link onNavigate={leave} className={styles.button} href="/language/chunk-review">표현 조각 보충복습 · 본문과 별도</Link></p>
      <h3>복습일이 된 읽기 문제</h3>
      <div className={styles.actions} role="group" aria-label="예정된 읽기 복습 범위"><button className={styles.button} aria-pressed={reviewScope === 'all'} onClick={() => setReviewScope('all')}>전체 단계 예정 복습</button><button className={styles.button} aria-pressed={reviewScope === 'level'} onClick={() => setReviewScope('level')}>살펴보는 {info.title}만</button></div>
      <p role="status">{reviewScope === 'all' ? '전체 단계' : `살펴보는 ${info.title}`} 예정 복습: {visibleDue.length}문제 · 전체 {due.length}문제</p>
      {visibleDue.length === 0 && <p>이 범위에는 지금 예정된 읽기 복습이 없어요. 위 목록에서 단원을 골라 더 연습할 수 있어요.</p>}
      {[...new Set(visibleDue.map(item => item.lessonId))].map(id => <p key={id}><Link onNavigate={leave} href={`/language/levels?lesson=${id}&review=1`}>{getJapaneseReadingLesson(id)?.title} · 예정된 {visibleDue.filter(item => item.lessonId === id).length}문제 복습</Link></p>)}
      <p className={styles.muted}>복습 범위를 바꿔도 선택한 단계와 복습 날짜는 바뀌지 않아요. 읽기 문제는 도움 없이 서로 다른 날 3번 이상 맞히고 간격이 7일 이상일 때 안정으로 표시해요. 전체 읽기에서 현재 안정 {Object.values(value.answers).filter(isKnownReadingAnswer).filter(upperAnswerStable).length}문제이며, 글쓰기·전체 일본어 실력 평가는 아니에요.</p>
    </section>
    <details className={styles.section}><summary>목적별 자료와 기존 기록</summary><p>기존 수업은 삭제하거나 새 수업으로 초기화하지 않았어요. 필요한 자료를 따로 골라 볼 수 있어요.</p><div className={styles.actions}><Link onNavigate={leave} className={styles.button} href="/language/learn?track=work">업무 표현</Link><Link onNavigate={leave} className={styles.button} href="/language/learn?track=travel">여행 표현</Link><Link onNavigate={leave} className={styles.button} href="/language/progress">기존 학습 기록</Link><Link onNavigate={leave} className={styles.button} href="/language/settings">학습 시간·읽기 도움 설정</Link></div></details>
  </section>;
}
