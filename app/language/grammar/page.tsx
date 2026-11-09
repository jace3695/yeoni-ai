"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import WorkWritingPractice from "@/components/language/WorkWritingPractice";
import GrammarTravelConsolidation from "@/components/language/GrammarTravelConsolidation";
import GrammarConsolidation from "@/components/language/GrammarConsolidation";
import GrammarWritingPractice from "@/components/language/GrammarWritingPractice";
import { GRAMMAR_WRITING_PRACTICE, GRAMMAR_WRITING_ALTERNATES } from "@/data/grammarWritingPractice";
import { BRIDGE_ORDER, TRAVEL_ORDER, GUIDED_GRAMMAR_ORDER, GRAMMAR_STAGE_ORDER, isGuidedGrammarStage, type GuidedGrammarStage } from "@/data/grammarStages";
import { BEGINNER_ORDER, BEGINNER_GUIDES } from "@/data/grammarBeginnerGuide";
import {
  GRAMMAR_LESSONS,
  GRAMMAR_PROGRESS_KEY,
  type GrammarCategory,
  type GrammarLesson,
  type GrammarProgressItem,
} from "@/data/grammar";
import { markTodayRoutineCompleted } from "@/utils/dailyRoutineProgress";
import { useLearningAudio } from "@/components/language/useLearningAudio";

const actionStyle = { minHeight: 44, padding: "10px 16px", border: "1px solid #93c5fd", borderRadius: 10, background: "#eff6ff", color: "#1e3a8a", cursor: "pointer", fontWeight: 700 } as const;

type GrammarFilter = "전체" | GrammarCategory;

function normalizeChoice(choice: string | { text: string; reading?: string; rubySegments?: { text: string; reading?: string }[] }) {
  if (typeof choice === "string") return { text: choice };
  return choice;
}

export default function GrammarPage() {
  const audio = useLearningAudio();
  const [pinnedLessonId, setPinnedLessonId] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState("desu");
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [filter, setFilter] = useState<GrammarFilter>("전체");
  const [levelFilter, setLevelFilter] = useState<GrammarLesson["level"] | "all" | GuidedGrammarStage | "consolidation" | "travel-consolidation" | "work-writing">("foundation");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [grammarProgress, setGrammarProgress] = useState<GrammarProgressItem[]>([]);



  useEffect(() => {
    try {
      const raw = localStorage.getItem(GRAMMAR_PROGRESS_KEY);
      if (!raw) {
        setGrammarProgress([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setGrammarProgress([]);
        return;
      }
      setGrammarProgress(parsed as GrammarProgressItem[]);
    } catch {
      setGrammarProgress([]);
    }
  }, []);

  const saveGrammarProgress = (next: GrammarProgressItem[]) => {
    setGrammarProgress(next);
    try {
      setSaveError("");
      localStorage.setItem(GRAMMAR_PROGRESS_KEY, JSON.stringify(next));
    } catch {
      setSaveError("학습 기록을 이 기기에 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.");
    }
  };

  const visibleLessons = useMemo(
    () => GRAMMAR_LESSONS.filter(lesson => (filter === "전체" || lesson.category === filter) && (levelFilter === "all" || (isGuidedGrammarStage(levelFilter) ? GRAMMAR_STAGE_ORDER[levelFilter].includes(lesson.id) : lesson.level === levelFilter && !GUIDED_GRAMMAR_ORDER.includes(lesson.id))) && (!reviewOnly || grammarProgress.some(item => item.lessonId === lesson.id && item.lastResult === 'wrong')))
      .sort((a, b) => (GUIDED_GRAMMAR_ORDER.indexOf(a.id) < 0 ? 100 : GUIDED_GRAMMAR_ORDER.indexOf(a.id)) - (GUIDED_GRAMMAR_ORDER.indexOf(b.id) < 0 ? 100 : GUIDED_GRAMMAR_ORDER.indexOf(b.id))),
    [filter, levelFilter, reviewOnly, grammarProgress],
  );
  // Keep the answered lesson visible long enough to read feedback in review mode.
  const activeLesson = visibleLessons.find(lesson => lesson.id === lessonId) ?? (pinnedLessonId ? GRAMMAR_LESSONS.find(lesson => lesson.id === pinnedLessonId) : undefined) ?? visibleLessons[0];
  const openLesson = (id: string) => { setLessonId(id); setPinnedLessonId(null); setStage(0); setShowHint(false); audio.stop(); };
  const changeFilter = () => { audio.stop(); setPinnedLessonId(null); setSelectedAnswers({}); setStage(0); setShowHint(false); };

  const openStage = (next: GuidedGrammarStage) => {
    setLevelFilter(next); setFilter("전체"); setReviewOnly(false); setSelectedAnswers({});
    openLesson(GRAMMAR_STAGE_ORDER[next][0]);
  };

  const handleSelectAnswer = (lesson: GrammarLesson, choice: string) => {
    if (selectedAnswers[lesson.id]) {
      return;
    }

    setLessonId(lesson.id);
    setPinnedLessonId(lesson.id);
    setSelectedAnswers((prev) => ({ ...prev, [lesson.id]: choice }));

    const isCorrect = choice === lesson.quiz.answer;
    const now = new Date().toISOString();
    const existing = grammarProgress.find((item) => item.lessonId === lesson.id);
    const nextItem: GrammarProgressItem = existing
      ? {
          ...existing,
          title: lesson.title,
          category: lesson.category,
          pattern: lesson.pattern,
          correctCount: existing.correctCount + (isCorrect ? 1 : 0),
          wrongCount: existing.wrongCount + (isCorrect ? 0 : 1),
          lastAnsweredAt: now,
          lastResult: isCorrect ? "correct" : "wrong",
        }
      : {
          lessonId: lesson.id,
          title: lesson.title,
          category: lesson.category,
          pattern: lesson.pattern,
          correctCount: isCorrect ? 1 : 0,
          wrongCount: isCorrect ? 0 : 1,
          lastAnsweredAt: now,
          lastResult: isCorrect ? "correct" : "wrong",
        };

    const nextProgress = existing
      ? grammarProgress.map((item) => (item.lessonId === lesson.id ? nextItem : item))
      : [...grammarProgress, nextItem];

    saveGrammarProgress(nextProgress);
    markTodayRoutineCompleted("grammar");
  };

  const resetLessonQuiz = (lessonId: string) => {
    setShowHint(false);
    setSelectedAnswers((prev) => {
      const next = { ...prev };
      delete next[lessonId];
      return next;
    });
  };

  const handleSpeak = (text: string) => { void audio.play(text); };

  return (
    <section style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px" }}>
      {audio.playing && <button type="button" className="btn" style={actionStyle} onClick={audio.stop}>소리 멈추기</button>}
      {audio.audioError && <p role="status">{audio.audioError}</p>}
      <div
        style={{
          marginBottom: "20px",
          padding: "20px",
          borderRadius: "20px",
          background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 72%)",
          border: "1px solid #dbeafe",
          boxShadow: "0 10px 24px rgba(37, 99, 235, 0.08)",
        }}
      >
        <h1 style={{ fontSize: "28px", margin: "0 0 8px", color: "#1e3a8a" }}>문장 만드는 법</h1>
        <p className="muted" style={{ margin: 0, fontSize: "15px", lineHeight: 1.6 }}>
          뜻과 만드는 순서를 이해하고, 예문을 읽은 뒤 한 문제씩 풀어요. は·を 같은 조사는 단어 뒤에 붙어 역할을 알려주는 말이에요.
        </p>
        <label>추천 학습 순서 <select value={levelFilter} onChange={(event) => { setLevelFilter(event.target.value as typeof levelFilter); setFilter("전체"); setReviewOnly(false); changeFilter(); }} style={{ minHeight: 44, marginTop: 12 }}><option value="foundation">첫걸음 · 순서대로 12수업</option><option value="bridge">다음 걸음 · 생활 문장 7수업</option><option value="consolidation">다음 걸음 복습 · 2개</option><option value="travel">생활·여행 기초 · 6수업</option><option value="travel-consolidation">생활·여행 적용 · 2개</option><option value="work-writing">내부 업무 글 응용 · 5개</option><option value="beginner">기초 참고 자료</option><option value="basic">기본 표현 넓히기</option><option value="practical">응용 표현</option><option value="all">전체 문법</option></select></label>
        <p className="muted">시험 등급이 아닌 앱 안의 학습 순서예요. 첫걸음은 명사 문장 → 질문·부정 → 지시어 → 형용사 → 동사·조사 순서예요. 12수업 모두 한국어 풀이와 표현 선택을 연결해요. 다음 걸음은 물건 설명·질문·동작 변화·좋아하는 대상을 연결해요. 생활·여행 기초는 정각·100/200엔·물건과 사람의 위치·물건 요청·과일 1–3개를 연습해요. 참고 자료와 구분해 차례로 배울 수 있어요.</p>
        <details><summary>학습 구성의 참고 자료</summary><p>국제교류기금의 한국어 안내와 한국어 입문 교재의 공개 구성을 비교해, 단어 → 한국어 설명 → 문장 구성 → 적용·복습으로 정리했어요. 예문과 문제는 앱에서 만든 것이며 공식 교재를 옮긴 것이 아니에요.</p><a href="https://www.jpf.or.kr/irodori/sData/pdf/starter/X_howto_kr.pdf" target="_blank" rel="noreferrer">이로도리 한국어 학습 안내</a> · <a href="https://www.darakwon.co.kr/books/detailProduct.asp?p_id=6342&amp;pc_id_2=9&amp;pc_id_3=52" target="_blank" rel="noreferrer">다락원 공개 교재 구성</a></details>
      </div>

      {levelFilter === 'work-writing' ? <WorkWritingPractice onListen={handleSpeak} onStop={audio.stop} /> : levelFilter === 'travel-consolidation' ? <><GrammarTravelConsolidation onListen={handleSpeak} onStop={audio.stop} /><button type="button" style={actionStyle} onClick={() => { changeFilter(); setLevelFilter('work-writing'); }}>내부 업무 글 응용 시작하기</button></> : levelFilter === 'consolidation' ? <><GrammarConsolidation onListen={handleSpeak} onStop={audio.stop} /><button type="button" className="btn" style={actionStyle} onClick={() => openStage('travel')}>생활·여행 기초 시작하기</button></> : <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "18px",
          padding: "12px",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          background: "#f8fbff",
        }}
      >
        {(["전체", "です/ます", "조사", "지시어", "기타"] as const).map((item) => {
          const isActive = filter === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => { setFilter(item); changeFilter(); }}
              style={{
                border: isActive ? "1px solid #2563eb" : "1px solid #cbd5e1",
                borderRadius: "999px",
                padding: "9px 14px",
                fontSize: "13px",
                fontWeight: 700,
                background: isActive ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)" : "#ffffff",
                color: isActive ? "#ffffff" : "#334155",
                cursor: "pointer",
                boxShadow: isActive ? "0 8px 18px rgba(37, 99, 235, 0.22)" : "none",
              }}
            >
              {item}
            </button>
          );
        })}
      </div>

      {saveError && <p role="alert">{saveError}</p>}
      <label style={{ display: 'block', marginBottom: 16 }}><input type="checkbox" checked={reviewOnly} onChange={event => { setReviewOnly(event.target.checked); changeFilter(); }} /> 최근 틀린 문법만 복습</label>
      {!!visibleLessons.length && <label style={{ display: 'block', marginBottom: 16 }}>배울 문법 <select style={{ maxWidth: '100%', minHeight: 44 }} value={activeLesson?.id ?? ''} onChange={event => openLesson(event.target.value)}>{activeLesson && !visibleLessons.some(item => item.id === activeLesson.id) && <option value={activeLesson.id}>{activeLesson.title} · 방금 복습함</option>}{visibleLessons.map((lesson, index) => <option key={lesson.id} value={lesson.id}>{index + 1}. {lesson.title}</option>)}</select></label>}
      {visibleLessons.length === 0 && !activeLesson && <p role="status">이 조건에 맞는 문법이 없어요. 복습 선택을 끄거나 분류·단계를 바꿔보세요.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "12px" }}>
        {(activeLesson ? [activeLesson] : []).map((lesson) => {
          const guide = BEGINNER_GUIDES[lesson.id];
          const selectedAnswer = selectedAnswers[lesson.id];
          const isCorrect = selectedAnswer === lesson.quiz.answer;
          const progressItem = grammarProgress.find((item) => item.lessonId === lesson.id);
          const progressText = progressItem
            ? `선택 문제: 정답 ${progressItem.correctCount}회 · 오답 ${progressItem.wrongCount}회`
            : "선택 문제: 아직 풀지 않음";
          const recentText = progressItem
            ? `최근: ${progressItem.lastResult === "correct" ? "정답" : "오답"}`
            : "최근: -";

          return (
            <article
              key={lesson.id}
              className="card"
              style={{
                padding: "16px",
                display: "grid",
                gap: "12px",
                borderRadius: "18px",
                border: "1px solid #dbeafe",
                boxShadow: "0 10px 22px rgba(15, 23, 42, 0.06)",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                <h2 style={{ fontSize: "18px", margin: 0 }}>{lesson.title}</h2>
                <span style={{ fontSize: "12px", fontWeight: 700, borderRadius: "999px", border: "1px solid #bfdbfe", padding: "4px 10px", color: "#1d4ed8", background: "#eff6ff" }}>{lesson.category}</span>
              </div>
              <p className="muted" style={{ margin: 0 }}>{guide?.goal ?? lesson.summary}</p>
              {visibleLessons.findIndex(item => item.id === lesson.id) > 0 && <button type="button" className="btn" style={actionStyle} onClick={() => openLesson(visibleLessons[visibleLessons.findIndex(item => item.id === lesson.id) - 1].id)}>이전 문법 보기</button>}
              <nav aria-label="문법 학습 단계" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{(['1. 설명', '2. 예문', '3. 연습'] as const).map((label, index) => <button type="button" className="btn" aria-current={stage === index ? 'step' : undefined} style={{ ...actionStyle, background: stage === index ? '#dbeafe' : '#fff' }} key={label} onClick={() => setStage(index as 0 | 1 | 2)}>{label}</button>)}</nav>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
                <span style={{ border: "1px solid #dbeafe", borderRadius: "999px", padding: "4px 8px", background: "#f8fbff" }}>{progressText}</span>
                <span style={{ border: "1px solid #dbeafe", borderRadius: "999px", padding: "4px 8px", background: "#f8fbff" }}>{recentText}</span>
              </div>
              {stage === 0 && <>
              {GRAMMAR_WRITING_PRACTICE[lesson.id] && <div style={{padding:12,background:'#f8fafc',borderRadius:10}}><strong>이런 상황에 써요</strong><p>{GRAMMAR_WRITING_PRACTICE[lesson.id].context}</p><p>먼저 익힐 말: {GRAMMAR_WRITING_PRACTICE[lesson.id].words}</p></div>}
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e3a8a" }}>핵심 패턴: {lesson.pattern}</div>
              <p className="muted" style={{ margin: 0, fontSize: "14px", lineHeight: 1.5 }}>{lesson.explanation}</p>

              {guide && <ol style={{ paddingLeft: 24, lineHeight: 1.9 }}>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>}
              <button type="button" className="btn" style={actionStyle} onClick={() => setStage(1)}>예문으로 확인하기</button></>}
              {stage === 1 && <>
              {guide && <div style={{ padding: 16, background: '#eff6ff', borderRadius: 12, lineHeight: 1.9 }}><strong>함께 문장 만들기</strong><p>{guide.worked}</p><p>단어 → 조사 → 끝맺음 순서로 뜻을 연결해 보세요.</p></div>}
              <div style={{ display: "grid", gap: "8px", borderRadius: "14px", border: "1px solid #e2e8f0", background: "#fcfdff", padding: "10px" }}>
                {lesson.examples.map((e) => (
                  <div key={`${lesson.id}-${e.japanese}`} style={{ fontSize: "14px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <span>{e.japanese}</span>
                      <button type="button" onClick={() => handleSpeak(e.japanese)} style={{ border: "1px solid #bfdbfe", borderRadius: "10px", padding: "6px 11px", background: "#eff6ff", cursor: "pointer", fontSize: "12px", fontWeight: 700, color: "#1d4ed8" }}>예문 듣기</button>
                    </div>
                    <div className="muted">{e.meaning}</div>
                    {e.reading && <div style={{ marginTop: "2px", color: "#64748b", fontSize: "13px" }}>읽는 법: {e.reading}</div>}
                  </div>
                ))}
              </div>

              {lesson.sentencePattern && (
                <div>
                  <Link
                    href={`/language/sentences?pattern=${encodeURIComponent(lesson.sentencePattern)}`}
                    style={{
                      display: "inline-block",
                      border: "1px solid #fb923c",
                      borderRadius: "10px",
                      padding: "9px 14px",
                      background: "#fff7ed",
                      color: "#9a3412",
                      fontSize: "13px",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    관련 문장 학습
                  </Link>
                </div>
              )}

              <button type="button" className="btn" style={actionStyle} onClick={() => setStage(2)}>이제 직접 풀기</button></>}
              {stage === 2 && <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "12px", display: "grid", gap: "10px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e3a8a" }}>연습 문제</div>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.55 }}>{lesson.quiz.question}</p>
                {guide && <><button type="button" className="btn" style={actionStyle} onClick={() => setShowHint(value => !value)} aria-expanded={showHint}>힌트 {showHint ? '접기' : '보기'}</button>{showHint && <p>{guide.hint}</p>}</>}
                <div style={{ display: "grid", gap: "8px" }}>
                  {lesson.quiz.choices.map((rawChoice) => {
                    const choice = normalizeChoice(rawChoice);
                    const isAnswer = choice.text === lesson.quiz.answer;
                    const isSelected = selectedAnswer === choice.text;
                    const answered = Boolean(selectedAnswer);

                    let background = "#ffffff";
                    let border = "1px solid #cbd5e1";
                    let color = "#111827";

                    if (answered && isAnswer) {
                      background = "#dcfce7";
                      border = "1px solid #16a34a";
                      color = "#166534";
                    } else if (answered && isSelected && !isAnswer) {
                      background = "#fee2e2";
                      border = "1px solid #ef4444";
                      color = "#991b1b";
                    } else if (answered) {
                      background = "#f9fafb";
                      color = "#6b7280";
                    }

                    return (
                      <button
                        key={`${lesson.id}-${choice.text}`}
                        type="button"
                        onClick={() => handleSelectAnswer(lesson, choice.text)}
                        disabled={answered}
                        style={{
                          width: "100%",
                          minHeight: "44px",
                          padding: "10px 12px",
                          textAlign: "left",
                          border,
                          borderRadius: "12px",
                          background,
                          color,
                          cursor: answered ? "default" : "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {choice.rubySegments ? choice.rubySegments.map((segment, index) => segment.reading ? <ruby key={index}>{segment.text}<rt>{segment.reading}</rt></ruby> : <span key={index}>{segment.text}</span>) : choice.text}
                        {choice.reading && <small style={{ display: 'block' }}>{choice.reading}</small>}
                      </button>
                    );
                  })}
                </div>

                {selectedAnswer && (
                  <div
                    style={{
                      marginTop: "4px",
                      borderRadius: "12px",
                      padding: "10px 12px",
                      fontSize: "13px",
                      fontWeight: 700,
                      background: isCorrect ? "#ecfdf5" : "#fff7ed",
                      border: isCorrect ? "1px solid #86efac" : "1px solid #fdba74",
                      color: isCorrect ? "#166534" : "#9a3412",
                    }}
                  >
                    <div role="status">{isCorrect ? "정답이에요!" : `아쉬워요. 정답은 ${lesson.quiz.answer} 입니다.`}</div>
                    {lesson.quiz.explanation && <div style={{ marginTop: "4px" }}>{lesson.quiz.explanation}</div>}
                  </div>
                )}

                {selectedAnswer && GRAMMAR_WRITING_PRACTICE[lesson.id] && <GrammarWritingPractice key={lesson.id} practice={GRAMMAR_WRITING_PRACTICE[lesson.id]} alternate={GRAMMAR_WRITING_ALTERNATES[lesson.id]} onListen={handleSpeak} />}
                {selectedAnswer && (
                  <button
                    type="button"
                    onClick={() => resetLessonQuiz(lesson.id)}
                    style={{
                      width: "fit-content",
                      border: "1px solid #93c5fd",
                      borderRadius: "10px",
                      padding: "8px 13px",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 700,
                    }}
                  >
                    다시 풀기
                  </button>
                )}
              </div>}
              {selectedAnswer && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" className="btn" style={actionStyle} onClick={() => setStage(0)}>설명 다시 보기</button>{visibleLessons.findIndex(item => item.id === lesson.id) >= 0 && visibleLessons.findIndex(item => item.id === lesson.id) < visibleLessons.length - 1 && <button type="button" className="btn" style={actionStyle} onClick={() => openLesson(visibleLessons[visibleLessons.findIndex(item => item.id === lesson.id) + 1].id)}>다음 문법 배우기</button>}
              {reviewOnly && !visibleLessons.some(item => item.id === lesson.id) && visibleLessons.length > 0 && <button type="button" className="btn" style={actionStyle} onClick={() => openLesson(visibleLessons[0].id)}>다음 복습 문제</button>}
              {levelFilter === 'foundation' && lesson.id === BEGINNER_ORDER.at(-1) && <button type="button" className="btn" style={actionStyle} onClick={() => openStage('bridge')}>다음 걸음 시작하기</button>}
              {levelFilter === 'bridge' && lesson.id === BRIDGE_ORDER.at(-1) && <button type="button" className="btn" style={actionStyle} onClick={() => { changeFilter(); setLevelFilter('consolidation'); }}>다음 걸음 복습하기</button>}
              {levelFilter === 'bridge' && lesson.id === BRIDGE_ORDER.at(-1) && <button type="button" className="btn" style={actionStyle} onClick={() => openStage('travel')}>생활·여행 기초 시작하기</button>}
              {levelFilter === 'travel' && lesson.id === TRAVEL_ORDER.at(-1) && <button type="button" className="btn" style={actionStyle} onClick={() => { changeFilter(); setLevelFilter('travel-consolidation'); }}>생활·여행 적용 연습하기</button>}
              {levelFilter === 'travel' && lesson.id === TRAVEL_ORDER.at(-1) && <button type="button" className="btn" style={actionStyle} onClick={() => openStage('travel')}>생활·여행 기초 처음부터 복습</button>}
              {levelFilter === 'bridge' && lesson.id === BRIDGE_ORDER.at(-1) && <button type="button" className="btn" style={actionStyle} onClick={() => openStage('bridge')}>다음 걸음 처음부터 복습</button>}</div>}
            </article>
          );
        })}
      </div>
      </>}
    </section>
  );
}
