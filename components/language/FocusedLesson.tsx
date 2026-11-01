"use client";

import Link from "next/link";
import { useYeoniPreferences } from "@/components/useYeoniPreferences";
import { useEffect, useRef, useState } from "react";
import { TRACKS, getTrackLessons, type CurriculumLesson } from "@/data/curriculum";
import { toKoreanPronunciation } from "@/data/learningDataExpansion";
import { CURRICULUM_REVIEW_KEY, loadCurriculumProgress, saveCurriculumProgress, type CurriculumReviewItem } from "@/utils/curriculumProgress";
import { DEFAULT_INTEGRATED_LEARNING_SETTINGS, loadIntegratedLearningSettings } from "@/utils/integratedLearningSettings";
import { answerSessionQuestion, createLearningSession, getSessionQuizIndices, getSessionResult, normalizeLearningSession, retrySessionQuestion, updateSessionReviews, withLearningSessionDraft, withoutLearningSessionDraft } from "@/utils/learningSession";
import { getLocalDateKey } from "@/utils/dateKey";
import LearningCompanion from "./LearningCompanion";
import LearningQuestion from "./LearningQuestion";
import { useLearningAudio } from "./useLearningAudio";
import styles from "./learning-focus.module.css";

const stageNames = ["표현 하나씩", "문장 만들기", "대화 듣기", "따라 말하기", "한 문제씩"];
const stageGuides = ["처음부터 외우지 않아도 돼요. 뜻을 보고 소리를 한 번 들어봐요.", "오늘은 이 표현 하나만 기억해요. 어려운 이름보다 ‘언제 쓰는지’가 중요해요.", "두 사람이 무슨 이야기를 하는지 들어볼까요? 자막을 봐도 괜찮아요.", "내 목소리로 한 번 말해봐요. 지금은 정확함보다 시도가 먼저예요.", "한 문제씩 해봐요. 틀리면 힌트를 보고 다시 도전할 수 있어요."];

export default function FocusedLesson({ lesson }: { lesson: CurriculumLesson }) {
  const preferences = useYeoniPreferences();
  const [settings, setSettings] = useState(DEFAULT_INTEGRATED_LEARNING_SETTINGS);
  const [session, setSession] = useState(() => createLearningSession(lesson.id, 10, "starter"));
  const [loaded, setLoaded] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState("");
  const finishing = useRef(false);
  const audio = useLearningAudio();
  const { stop, play } = audio;
  const quizIndices = getSessionQuizIndices(lesson, session.minutes);
  const questionIndex = quizIndices[session.quizCursor];
  const result = getSessionResult(lesson, session);
  const word = lesson.words[session.wordIndex];
  const visibleStages = [0, 1, 4];
  const trackLessons = getTrackLessons(lesson.track);
  const nextLesson = trackLessons[trackLessons.findIndex((item) => item.id === lesson.id) + 1];

  useEffect(() => {
    const storedSettings = loadIntegratedLearningSettings();
    const progress = loadCurriculumProgress();
    const draft = normalizeLearningSession(progress.lessonDrafts?.[lesson.id] ?? progress.activeSession, lesson);
    setSettings(storedSettings);
    const restored = draft ?? createLearningSession(lesson.id, storedSettings.dailyMinutes, storedSettings.learnerMode);
    if (restored.stage === 2 || restored.stage === 3) restored.stage = 4;
    setSession(restored);
    setResumed(Boolean(draft));
    setLoaded(true);
  }, [lesson]);

  useEffect(() => {
    if (!loaded || finished || finishing.current) return;
    try {
      const latest = loadCurriculumProgress();
      saveCurriculumProgress(withLearningSessionDraft(latest, session));
      setSaveError("");
    } catch {
      setSaveError("이 기기에 이어할 내용을 저장하지 못했어요. 저장 공간이나 비공개 브라우징 설정을 확인해 주세요.");
    }
  }, [loaded, finished, session]);

  const changeStage = (stage: number) => {
    stop();
    setResumed(false);
    setSession((previous) => ({ ...previous, stage }));
  };

  const finish = () => {
    if (!result.complete || finishing.current) return;
    finishing.current = true;
    stop();
    try {
      const now = new Date();
      const latest = loadCurriculumProgress();
      const raw = localStorage.getItem(CURRICULUM_REVIEW_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error("Review data is not an array");
      const previousReviews = parsed.filter((item): item is CurriculumReviewItem => Boolean(item && typeof item === "object" && typeof item.id === "string"));
      const reviews = updateSessionReviews(previousReviews, lesson, session, now);
      localStorage.setItem(CURRICULUM_REVIEW_KEY, JSON.stringify(reviews));
      saveCurriculumProgress({
        ...withoutLearningSessionDraft(latest, session), selectedTrack: lesson.track, lastLessonId: lesson.id,
        completedLessonIds: [...new Set([...latest.completedLessonIds, lesson.id])],
        quizScores: { ...latest.quizScores, [lesson.id]: result.score },
        lessonAttempts: { ...latest.lessonAttempts, [lesson.id]: [...(latest.lessonAttempts[lesson.id] ?? []).filter((attempt) => attempt.sessionId !== session.id), { score: result.score, completedAt: now.toISOString(), sessionId: session.id }].slice(-20) },
        activityDates: [...new Set([...latest.activityDates, getLocalDateKey()])].sort(),
      });
      setSaveError("");
      setFinished(true);
    } catch {
      setSaveError("학습 결과를 저장하지 못했어요. 이 화면을 닫지 말고 저장을 다시 시도해 주세요. 기존 기록은 초기화하지 않습니다.");
      finishing.current = false;
    }
  };

  if (!loaded) return <div className={styles.focus} role="status">이어할 학습을 준비하고 있어요.</div>;
  const stagePosition = visibleStages.indexOf(session.stage);
  const next = () => {
    if (session.stage === 0 && session.wordIndex < lesson.words.length - 1) {
      stop(); setSession((previous) => ({ ...previous, wordIndex: previous.wordIndex + 1 })); return;
    }
    if (session.stage === 4) {
      if (session.quizCursor < quizIndices.length - 1) { stop(); setSession((previous) => ({ ...previous, quizCursor: previous.quizCursor + 1 })); }
      else finish();
      return;
    }
    changeStage(visibleStages[stagePosition + 1] ?? 4);
  };
  const previous = () => {
    if (session.stage === 0 && session.wordIndex > 0) { stop(); setSession((value) => ({ ...value, wordIndex: value.wordIndex - 1 })); }
    else if (session.stage === 4 && session.quizCursor > 0) { stop(); setSession((value) => ({ ...value, quizCursor: value.quizCursor - 1 })); }
    else changeStage(visibleStages[Math.max(0, stagePosition - 1)]);
  };

  return <section className={styles.focus} aria-label="집중 학습">
    <header className={styles.header}>
      <Link href={"/language/learn?track=" + lesson.track} className={styles.back}>← 과정으로</Link>
      <div><small>{TRACKS[lesson.track].title} · {lesson.order}번째 수업</small><h1>{lesson.title}</h1></div>
      <span className={styles.pill}>약 {session.minutes}분</span>
    </header>
    {!finished && <><ol className={styles.stageTrack} aria-label="수업 단계">{visibleStages.map((stage) => <li key={stage} data-active={stage <= session.stage} aria-current={stage === session.stage ? "step" : undefined}><span className="sr-only">{stageNames[stage]}</span></li>)}</ol><div className={styles.stageLabel}><span>{stageNames[session.stage]}</span><span>{stagePosition + 1} / {visibleStages.length} 단계</span></div></>}
    <LearningCompanion motion={audio.playing ? "off" : "once"} hidden={!preferences.visible || (!finished && session.stage === 4)}
      action={finished ? result.needsPractice ? "encourage" : "celebrate" : "explain"}
      motionKey={`${lesson.id}:${session.stage}:${session.wordIndex}:${session.quizCursor}:${finished}`}>
      {finished ? result.needsPractice ? "끝까지 해봤네요! 아직 어려운 문제는 함께 한 번 더 살펴봐요." : "잘했어요! 오늘 연습한 표현을 생활 속에서도 한 번 써봐요." : stageGuides[session.stage]}
    </LearningCompanion>
    {resumed && !finished && <p className={styles.muted}>지난번 멈춘 곳에서 이어해요. 단어와 문법부터 차근차근 살펴봐요.</p>}
    {saveError && <p className={styles.error} role="alert">{saveError}</p>}
    {audio.audioError && <p className={styles.error} role="status">{audio.audioError}</p>}
    <div className={styles.card}>
      {!finished && session.stage === 0 && <><p className={styles.kicker}>오늘의 표현 {session.wordIndex + 1} / {lesson.words.length}</p>
        <div className={styles.word}><strong className={styles.japanese} lang="ja">{word.japanese}</strong>{settings.showReading && <span className={styles.reading} lang="ja">{word.reading}</span>}{settings.showKoreanHint && <span className={styles.korean}>발음 도움: {toKoreanPronunciation(word.reading)}</span>}{settings.showMeaning && <p className={styles.meaning}>{word.meaning}</p>}</div>
        <div className={styles.row}><button type="button" disabled={audio.playing} onClick={() => void play(word.japanese, settings.audioRate)}>▶ 소리 듣기</button></div>
      </>}
      {!finished && session.stage === 1 && <><p className={styles.kicker}>이럴 때 쓰면 돼요</p><h2>{lesson.pattern.explanation}</h2><div className={styles.word}><strong className={styles.japanese} lang="ja">{lesson.pattern.example}</strong>{settings.showMeaning && <p className={styles.meaning}>{lesson.pattern.meaning}</p>}</div><div className={styles.row}><button type="button" disabled={audio.playing} onClick={() => void play(lesson.pattern.example, settings.audioRate)}>▶ 문장 듣기</button></div><details className={styles.details}><summary>문장 모양 살펴보기</summary><p>{lesson.pattern.label}</p></details></>}
      {!finished && session.stage === 4 && <><p className={styles.kicker}>확인 문제 {session.quizCursor + 1} / {quizIndices.length}</p><LearningQuestion key={questionIndex} lesson={lesson} index={questionIndex} mode={session.mode} showCompanion={preferences.visible} answer={session.answers[questionIndex]} response={session.responses[questionIndex]} onAnswer={(correct, response, observation) => setSession((value) => answerSessionQuestion(value, questionIndex, correct, response, observation))} onRetry={() => setSession((value) => retrySessionQuestion(value, questionIndex))} play={(text) => void play(text, settings.audioRate)} playing={audio.playing} /></>}
      {finished && <div className={styles.success}><span className={styles.successMark} aria-hidden="true">✓</span><h2>오늘의 연습을 저장했어요</h2><p>{lesson.goal}</p><div className={styles.score}><div><span>첫 선택 · 힌트 포함</span><strong>{result.firstCorrect} / {result.total}</strong></div><div><span>다시 풀기까지</span><strong>{result.correct} / {result.total}</strong></div></div><p>{result.needsPractice ? "아직 어려운 문제는 지금 복습에서 다시 볼 수 있어요." : result.firstCorrect < result.total ? "다시 맞힌 문제는 내일 복습에서 한 번 더 만나요." : "오늘 배운 내용을 잘 골랐어요. 다음에도 기억나는지 확인해봐요."}</p><div className={styles.row}>{result.needsPractice ? <Link href="/language/review" className={styles.primary}>어려웠던 문제 다시 보기</Link> : nextLesson ? <Link href={"/language/learn?lesson=" + nextLesson.id} className={styles.primary}>다음 수업 보기</Link> : <Link href="/language/progress" className={styles.primary}>내 학습 보기</Link>}<Link href="/language">오늘은 여기까지</Link></div>{nextLesson && result.needsPractice && <Link className={styles.back} href={"/language/learn?lesson=" + nextLesson.id}>다음 수업도 살펴보기</Link>}{lesson.practice && <div className={styles.row}><Link href={lesson.practice.href.startsWith("/language/") ? lesson.practice.href : "/language" + lesson.practice.href}>더 연습: {lesson.practice.label}</Link></div>}</div>}
    </div>
    {audio.playing && <div className={styles.row}><button type="button" onClick={stop}>■ 소리 멈추기</button></div>}
    {!finished && <><footer className={styles.actions}><button type="button" disabled={session.stage === 0 && session.wordIndex === 0} onClick={previous}>이전</button><button type="button" className={styles.primary} disabled={session.stage === 4 && session.answers[questionIndex] === undefined} onClick={next}>{session.stage === 4 ? session.quizCursor === quizIndices.length - 1 ? "오늘 연습 저장하기" : session.answers[questionIndex] === false ? "복습에 남기고 다음" : "다음 문제" : session.stage === 0 && session.wordIndex < lesson.words.length - 1 ? "다음 표현" : "다음으로"}</button></footer><details className={styles.details}><summary>읽기 도움 조절</summary><label><input type="checkbox" checked={settings.showReading} onChange={(event) => setSettings((value) => ({ ...value, showReading: event.target.checked }))} /> 일본어 읽는 법</label><label><input type="checkbox" checked={settings.showMeaning} onChange={(event) => setSettings((value) => ({ ...value, showMeaning: event.target.checked }))} /> 한국어 뜻</label><label><input type="checkbox" checked={settings.showKoreanHint} onChange={(event) => setSettings((value) => ({ ...value, showKoreanHint: event.target.checked }))} /> 단어 한글 발음 도움</label><p className={styles.muted}>한글은 대략적인 도움말이에요. 실제 소리는 듣기 버튼으로 확인해요. 이 화면의 조절은 이번 학습에만 적용돼요.</p></details></>}
  </section>;
}
