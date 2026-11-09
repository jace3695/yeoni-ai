"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { UpperLesson } from '@/data/japaneseUpperLessons';
import { JAPANESE_LEVELS, type JapaneseLevel } from '@/data/japaneseLevels';
import { getReadingSupport, readingEvidenceStrategy } from '@/data/japaneseReadingSupport';
import { getReadingEnhancement } from '@/data/japaneseReadingEnhancements';
import { getChunkLesson } from '@/data/japaneseChunkLessons';
import JapaneseChunkPractice from './JapaneseChunkPractice';
import { ReadingAnswerEvidence, ReadingPatternComparison, ReadingProgress, type ReadingStage } from './ReadingLessonEnhancements';
import { splitReadingHighlights } from '@/utils/japaneseReadingHighlight';
import { dueUpperAnswers, rememberUpperAnswer, type LevelJourney } from '@/utils/japaneseLevelJourney';
import { useLearningAudio } from './useLearningAudio';
import styles from './level-learning.module.css';

type Response = { choice: number; neededHelp: boolean; saved: boolean; answeredAt: Date; previousAttemptId?: string };
export default function UpperReadingLesson({ lesson, level, journey, update, reviewOnly }: {
  lesson: UpperLesson; level: JapaneseLevel; journey: LevelJourney; update: (change: (latest: LevelJourney) => LevelJourney, signal?: AbortSignal) => Promise<LevelJourney>; reviewOnly: boolean;
}) {
  const audio = useLearningAudio();
  const [pending, setPending] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => { controller.abort(); operation.current?.abort(); operation.current = null; };
  }, [lesson.id, reviewOnly]);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const context = `${lesson.id}:${reviewOnly}:${sessionId}`;
  const activeContext = useRef(context);
  useEffect(() => { activeContext.current = context; }, [context]);
  // Freeze this practice queue; saving a due answer must not remove the question
  // before the learner can read feedback. A new visit computes the next queue.
  const [questionIds] = useState(() => reviewOnly ? dueUpperAnswers(journey).filter(item => item.lessonId === lesson.id).map(item => item.questionId) : lesson.questions.map(item => item.id));
  const questions = lesson.questions.filter(item => questionIds.includes(item.id));
  const [stage, setStage] = useState<ReadingStage>(reviewOnly ? 'questions' : 'read');
  const [cursor, setCursor] = useState(0);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const responseCache = useRef<Record<string, Response>>({});
  const [hinted, setHinted] = useState<Record<string, boolean>>({});
  const [highlighted, setHighlighted] = useState(false);
  const [initialHelp, setInitialHelp] = useState(false);
  const [questionsStarted, setQuestionsStarted] = useState(reviewOnly);
  const [sampleShown, setSampleShown] = useState(false);
  const [reflected, setReflected] = useState(false);
  const [error, setError] = useState('');
  const [chunkPracticeOpen, setChunkPracticeOpen] = useState(false);
  const chunkLesson = getChunkLesson(lesson.id);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { stageHeading.current?.focus(); }, [stage, cursor]);
  const question = questions[cursor];
  const response = question ? responses[question.id] : undefined;
  const support = getReadingSupport(lesson);
  const enhancement = getReadingEnhancement(lesson);
  const levelTitle = JAPANESE_LEVELS[level].title;
  const levelHref = `/language/levels?level=${level}`;
  const markReadingHelp = () => {
    if (!questionsStarted) setInitialHelp(true);
    else if (question && !response) setHinted(previous => ({ ...previous, [question.id]: true }));
  };
  const passage = (text: string) => splitReadingHighlights(text, highlighted ? support?.targetExpressions ?? [] : []).map((part, index) => part.highlighted ? <mark key={index} className={styles.target}>{part.text}</mark> : part.text);
  const move = (next: typeof stage) => { if (operation.current) return; audio.stop(); setChunkPracticeOpen(false); setStage(next); setError(''); };
  const saveAnswer = async (choice: number) => {
    const renderLifetime = lifetime.current;
    if (!question || operation.current || activeContext.current !== context || !renderLifetime || renderLifetime.signal.aborted) return;
    const controller = new AbortController(); operation.current = controller; setPending(true); setError('');
    const next: Response = responseCache.current[question.id] ?? { choice, neededHelp: initialHelp || hinted[question.id] === true, saved: false, answeredAt: new Date(), previousAttemptId: journey.answers[question.id]?.lastAttemptId };
    if (next.saved) { operation.current = null; setPending(false); return; }
    responseCache.current[question.id] = next;
    setResponses(previous => ({ ...previous, [question.id]: next }));
    audio.stop();
    try {
      await update(latest => {
        const previous = latest.answers[question.id]?.lastAttemptId;
        const attemptId = `${sessionId}:${question.id}`;
        if (previous !== next.previousAttemptId && previous !== attemptId) {
          throw new Error('다른 답안 기록이 먼저 저장됐어요. 이 답으로 덮어쓰지 않았으니 단원을 다시 열어 확인해 주세요.');
        }
        return rememberUpperAnswer(latest, {
        lessonId: lesson.id, questionId: question.id, attemptId: `${sessionId}:${question.id}`,
        correct: next.choice === question.answer, neededHelp: next.neededHelp,
      }, next.answeredAt);
      }, controller.signal);
      if (controller.signal.aborted || renderLifetime.signal.aborted) return;
      responseCache.current[question.id] = { ...next, saved: true };
      setResponses(previous => ({ ...previous, [question.id]: { ...next, saved: true } }));
      setError('');
    } catch (cause) { if (!controller.signal.aborted && !renderLifetime.signal.aborted) setError(cause instanceof Error ? cause.message : '답을 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { if (!controller.signal.aborted && !renderLifetime.signal.aborted) { operation.current = null; setPending(false); } }
  };
  const finish = async () => {
    const renderLifetime = lifetime.current;
    if (operation.current || activeContext.current !== context || !renderLifetime || renderLifetime.signal.aborted) return;
    const controller = new AbortController(); operation.current = controller; setPending(true); setError('');
    try {
      await update(latest => ({ ...latest, practicedUnits: { ...latest.practicedUnits, [lesson.id]: new Date().toISOString() } }), controller.signal);
      if (!controller.signal.aborted && !renderLifetime.signal.aborted) { operation.current = null; move('done'); }
    } catch (cause) { if (!controller.signal.aborted && !renderLifetime.signal.aborted) setError(cause instanceof Error ? cause.message : '연습 기록을 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { if (!controller.signal.aborted && !renderLifetime.signal.aborted) { operation.current = null; setPending(false); } }
  };
  const repeat = () => {
    if (operation.current) return;
    audio.stop(); setChunkPracticeOpen(false); setSessionId(crypto.randomUUID()); responseCache.current = {}; setResponses({}); setHinted({}); setCursor(0);
    setHighlighted(false); setInitialHelp(false); setQuestionsStarted(true);
    setSampleShown(false); setReflected(false); setError(''); setStage('questions');
  };
  if (!questions.length) return <section className={styles.page}><h1>지금 예정된 복습은 없어요</h1><p>선택한 학습 단계와 이전 기록은 그대로예요. 원하면 단원 전체를 다시 볼 수 있어요.</p><div className={styles.actions}><Link className={styles.button} href={`/language/levels?lesson=${lesson.id}`}>단원 전체 보기</Link><Link className={styles.button} href={levelHref}>{levelTitle} 단계 화면으로</Link></div></section>;
  return <section className={styles.page}>
    <Link href={levelHref} onClick={audio.stop} onNavigate={() => { operation.current?.abort(); operation.current = null; setPending(false); }}>← {levelTitle} 단원으로</Link>
    <p className={styles.eyebrow}>{levelTitle} 읽기·표현 비교 · {reviewOnly ? '예정된 문제 복습' : '단원 전체 연습'}</p><h1>{lesson.title}</h1><p>{lesson.goal}</p>
    <p className={styles.notice}>가상 자료로 글을 읽고 표현을 비교해요. 선택 문제 답과 연습 여부만 학습 기록에 저장해요. 타자 입력·녹음·음성대화는 하지 않아요.</p>
    <ReadingProgress stage={stage} reviewOnly={reviewOnly} cursor={cursor} questionCount={questions.length} questionIndex={question ? lesson.questions.indexOf(question) : -1} />
    {pending && <p role="status">학습 기록을 저장하고 있어요.</p>}{error && <p className={styles.error} role="alert">{error}</p>}{audio.audioError && <p className={styles.error} role="status">{audio.audioError}</p>}
    {audio.playing && <button className={styles.button} onClick={audio.stop}>소리 멈추기</button>}
    {stage === 'read' && chunkPracticeOpen && chunkLesson && <section className={styles.section}><JapaneseChunkPractice key={chunkLesson.lessonId} lesson={chunkLesson} onUse={markReadingHelp} onClose={() => { audio.stop(); setChunkPracticeOpen(false); }} /></section>}
    {stage === 'read' && !chunkPracticeOpen && <>
      <section className={styles.section} aria-label="읽기 목적과 준비"><h2 ref={stageHeading} tabIndex={-1}>무엇을 찾으며 읽을까요?</h2><p>{support?.purpose ?? lesson.goal}</p><p><strong>읽기 전에 생각해 보기:</strong> {support?.beforeReading ?? '제목을 보고 어떤 정보를 찾게 될지 예상해 보세요. 답을 입력할 필요는 없어요.'}</p><p className={styles.muted}>먼저 전체 주제를 파악하고, 두 번째 읽을 때 필요한 세부 정보와 근거를 찾아보세요. 본문 확인 4문항 뒤에는 새 상황 적용 2문항과 표현 비교가 이어져요.</p></section>
      <article className={styles.section} aria-label="일본어 본문"><h2>전체 흐름을 보고, 세부 정보 찾기</h2>
        {support && <label><input type="checkbox" checked={highlighted} onChange={event => { setHighlighted(event.target.checked); if (event.target.checked) markReadingHelp(); }} /> 목표 표현 강조하기</label>}
        <p className={styles.muted}>번역·어휘·표현 해설·강조·듣기는 필요할 때 이용하세요. 처음 읽으며 도움을 쓰면 이번 단원의 답은 도움받은 연습으로 기록해요. 문제 중 본문이나 도움을 다시 보면 해당 문제에 표시해요.</p>
        {lesson.paragraphs.map((paragraph, index) => <section key={index}><p className={styles.japanese} lang="ja">{passage(paragraph.japanese)}</p><button className={styles.button} onClick={() => { markReadingHelp(); void audio.play(paragraph.japanese); }} disabled={audio.playing}>{index + 1}문단 듣기</button><details onToggle={event => { if (event.currentTarget.open) markReadingHelp(); }}><summary>한국어 뜻 확인 · {index + 1}문단</summary><p>{paragraph.meaning}</p></details></section>)}
      </article>
      <section className={styles.section} aria-label="선택형 읽기 도움"><h2>필요한 읽기 도움</h2><details onToggle={event => { if (event.currentTarget.open) markReadingHelp(); }}><summary>어휘 뜻 열기</summary><ul>{lesson.words.map(word => <li key={word.japanese}><span lang="ja">{word.japanese}（{word.reading}）</span> · {word.meaning}</li>)}</ul></details><details onToggle={event => { if (event.currentTarget.open) markReadingHelp(); }}><summary>표현 해설 열기</summary>{lesson.notes.map(note => <p key={note}>{note}</p>)}</details></section>
      {chunkLesson && <section className={styles.section} aria-label="표현 조각 보충연습 열기"><h2>짧은 표현부터 더 연습해 볼까요?</h2><p className={styles.muted}>조각별 뜻과 역할, 바꾼 예문, 뜻·빈칸·듣기 선택 문제를 연습해요. 열면 본수업의 읽기 도움 사용으로 표시해요. 보충연습의 오답·도움받은 답은 본문 복습과 따로 저장해요.</p><button type="button" className={styles.button} onClick={() => { audio.stop(); markReadingHelp(); setChunkPracticeOpen(true); }}>표현을 조각으로 연습하기 · 선택</button><p><Link href="/language/chunk-review">표현 조각 보충복습 목록</Link></p></section>}
      <button className={styles.primary} onClick={() => { setQuestionsStarted(true); move('questions'); }}>확인 문제 시작</button>
    </>}
    {stage === 'questions' && question && <section className={styles.section} aria-label="읽기 확인 문제">
      <p className={styles.eyebrow}>문제 {cursor + 1} / {questions.length} · {lesson.questions.indexOf(question) >= 4 ? '새 상황 적용' : '본문 확인'}</p><h2 ref={stageHeading} tabIndex={-1}>{question.prompt}</h2>
      <div className={styles.choices}>{question.choices.map((choice, index) => <button key={choice} className={styles.choice} disabled={Boolean(response)} data-correct={Boolean(response) && index === question.answer} data-wrong={Boolean(response) && index === response?.choice && index !== question.answer} onClick={() => saveAnswer(index)}>{choice}</button>)}</div>
      {!response && <><button className={styles.button} onClick={() => setHinted(previous => ({ ...previous, [question.id]: true }))}>근거 찾는 방법과 본문 보기</button>{hinted[question.id] && <div className={styles.feedback}><p>{readingEvidenceStrategy(lesson, lesson.questions.indexOf(question))}</p>{lesson.questions.indexOf(question) < 4 && lesson.paragraphs.map((paragraph, index) => <p key={index} lang="ja">{paragraph.japanese}</p>)}<p className={styles.muted}>도움을 본 문제는 다음 날 다시 확인해요. 정답과 해설은 답을 고른 뒤 확인할 수 있어요.</p></div>}</>}
      {response && <div className={styles.feedback} role="status"><strong>{response.choice === question.answer ? '맞게 골랐어요.' : '정답의 근거를 함께 확인해요.'}</strong><p><strong>내 선택:</strong> {question.choices[response.choice]}</p><p><strong>정답:</strong> {question.choices[question.answer]}</p><p>{question.explanation}</p><ReadingAnswerEvidence lesson={lesson} question={question} responded={Boolean(response)} evidence={enhancement?.evidence.find(item => item.questionId === question.id)} /><p>{response.saved ? '이 답을 복습 기록에 저장했어요.' : pending ? '이 답을 저장하고 있어요.' : '아직 이 답의 저장을 확인하지 못했어요.'}</p>{!response.saved && <button className={styles.button} disabled={pending} onClick={() => saveAnswer(response.choice)}>이 답 저장 다시 시도</button>}</div>}
      <div className={styles.actions}><button className={styles.button} disabled={pending} onClick={() => { if (!response) setHinted(previous => ({ ...previous, [question.id]: true })); move('read'); }}>본문 다시 읽기</button><button className={styles.primary} disabled={pending || !response?.saved} onClick={() => { audio.stop(); if (cursor < questions.length - 1) { setCursor(value => value + 1); setError(''); } else move(reviewOnly ? 'done' : 'write'); }}>{cursor < questions.length - 1 ? '다음 문제' : reviewOnly ? '복습 마치기' : '표현을 비교하며 자기점검'}</button></div>
    </section>}
    {stage === 'write' && <section className={styles.section} aria-label="서면 표현 자기점검"><h2 ref={stageHeading} tabIndex={-1}>표현을 비교하며 자기점검</h2>{enhancement && <ReadingPatternComparison pair={enhancement.pair} />}<p>{lesson.writing.prompt}</p><p className={styles.muted}>어떤 내용을 어떤 순서로 담을지 생각한 뒤 예시와 비교해 보세요. 문장을 입력하거나 자동 채점하는 연습은 아니에요.</p><button className={styles.button} onClick={() => setSampleShown(value => !value)}>{sampleShown ? '예시 답 접기' : '예시 답과 비교하기'}</button>{sampleShown && <div className={styles.feedback}><p lang="ja" className={styles.japanese}>{lesson.writing.sample}</p><button className={styles.button} disabled={audio.playing} onClick={() => void audio.play(lesson.writing.sample)}>예시 문장 듣기</button><p>{lesson.writing.explanation}</p></div>}<ul>{lesson.writing.checklist.map(item => <li key={item}>{item}</li>)}</ul><label><input type="checkbox" checked={reflected} onChange={event => setReflected(event.target.checked)} /> 예시와 점검 기준을 살펴봤어요. 실제 쓰기 능력 점수는 아니에요.</label><div className={styles.actions}><button className={styles.primary} disabled={pending || !reflected} onClick={finish}>이번 단원 연습 기록 저장</button><button className={styles.button} disabled={pending} onClick={() => move('read')}>설명부터 다시 보기</button></div></section>}
    {stage === 'done' && <section className={styles.section} aria-label="연습 마침"><h2 ref={stageHeading} tabIndex={-1}>{reviewOnly ? '이번 복습을 마쳤어요' : '이번 단원을 연습했어요'}</h2><p>선택한 학습 단계는 바뀌지 않았어요. 오늘 다시 풀어도 복습 간격이 계속 늘어나지는 않아요. 시간이 지난 뒤에도 기억나는지 확인해 보세요.</p><p className={styles.muted}>표현 자기점검은 채점이나 단계 이수 인증이 아니에요.</p><div className={styles.actions}><button className={styles.primary} onClick={repeat}>같은 문제 더 반복하기</button>{reviewOnly && <Link className={styles.button} href={`/language/levels?lesson=${lesson.id}`}>단원 전체 연습하기</Link>}<Link className={styles.button} href={levelHref}>{levelTitle} 단원 목록으로</Link><Link className={styles.button} href="/language/levels?level=beginner">초급도 다시 보기</Link></div></section>}
  </section>;
}
