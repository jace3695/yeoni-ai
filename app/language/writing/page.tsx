"use client";

import { useEffect, useRef, useState } from "react";

import { JAPANESE_WRITING_CHOICES as PROBLEMS, type JapaneseWritingChoice as WritingProblem } from '@/data/japaneseWritingChoices';

type InputMode = "choice" | "handwriting";
type Result = {
  problem: WritingProblem;
  userInput: string;
  grade: "correct" | "wrong" | null;
  mode: InputMode;
};

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 200;

export default function WritingPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>("choice");
  const [userInput, setUserInput] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const currentProblem = PROBLEMS[currentIndex];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    hasDrawnRef.current = false;
  };

  useEffect(() => {
    if (inputMode === "handwriting") initCanvas();
  }, [currentIndex, inputMode]);

  const getCanvasPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
    hasDrawnRef.current = true;
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = (e?: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e?.preventDefault();
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    hasDrawnRef.current = false;
  };

  const resetAll = () => {
    setUserInput("");
    setResult(null);
    if (inputMode === "handwriting") {
      clearCanvas();
    }
  };

  const handleSubmit = () => {
    if (result) return;
    if (inputMode === "choice") {
      if (!currentProblem.choices.includes(userInput)) return;
      setResult({ problem: currentProblem, userInput, grade: userInput === currentProblem.answer ? "correct" : "wrong", mode: "choice" });
    } else {
      setResult({ problem: currentProblem, userInput: "(필기 입력)", grade: null, mode: "handwriting" });
    }
  };

  const changeMode = (mode: InputMode) => {
    if (mode === inputMode) return;
    setUserInput("");
    setResult(null);
    setInputMode(mode);
  };
  const move = (direction: number) => {
    setUserInput("");
    setResult(null);
    setCurrentIndex(index => (index + direction + PROBLEMS.length) % PROBLEMS.length);
  };
  const handleNext = () => move(1);
  const handlePrev = () => move(-1);

  const modeButtonStyle = (mode: InputMode) => ({
    padding: "8px 18px",
    borderRadius: "8px",
    border: inputMode === mode ? "2px solid #0070f3" : "2px solid #d0d0d0",
    background: inputMode === mode ? "#0070f3" : "#f5f5f5",
    color: inputMode === mode ? "#ffffff" : "#444",
    fontWeight: inputMode === mode ? 700 : 400,
    cursor: "pointer",
    fontSize: "14px",
    outline: inputMode === mode ? "3px solid #99c4fb" : "none",
    outlineOffset: "2px",
    transition: "all 0.15s",
  });

  return (
    <section>
      <div className="page-header">
        <h1>표현 고르기·손글씨 연습</h1>
        <p className="muted" style={{ margin: 0 }}>
          한국어 뜻에 맞는 일본어 문장을 고르거나 손으로 써 보세요. 선택 답과 필기는 이번 화면에서만 사용하며 저장하지 않아요.
        </p>
      </div>

      {/* 문제 카드 */}
      <div className="card">
        <div className="card-top">
          <div className="label">문제 {currentIndex + 1} / {PROBLEMS.length}</div>
          <span className="badge">{currentProblem.category}</span>
        </div>
        <div style={{ marginTop: "8px" }}>
          <div className="label">한국어</div>
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>
            {currentProblem.prompt}
          </div>
        </div>
        <div style={{ marginTop: "14px", display: "flex", gap: "8px", justifyContent: "space-between" }}>
          <button onClick={handlePrev} className="btn" style={{ background: "#888" }}>
            이전
          </button>
          <button onClick={handleNext} className="btn" style={{ background: "#888" }}>
            다음
          </button>
        </div>
      </div>

      {/* 연습 방식 선택 */}
      <div className="card">
        <div className="label" style={{ marginBottom: "8px" }}>연습 방식</div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={modeButtonStyle("choice")} onClick={() => changeMode("choice")}>
            표현 고르기
          </button>
          <button style={modeButtonStyle("handwriting")} onClick={() => changeMode("handwriting")}>
            ✏️ 필기로 쓰기
          </button>
        </div>
      </div>

      {/* 답안 입력 영역 */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div className="label" style={{ margin: 0 }}>답안</div>
          <button
            onClick={resetAll}
            style={{
              padding: "4px 12px",
              borderRadius: "6px",
              border: "1px solid #d0d0d0",
              background: "#f5f5f5",
              color: "#555",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            이번 문제 다시 연습
          </button>
        </div>

        {inputMode === "choice" ? (
          <div role="group" aria-label="일본어 표현 선택" style={{ display: "grid", gap: 8 }}>
            {currentProblem.choices.map(choice => <button
              type="button"
              key={choice}
              lang="ja"
              aria-pressed={userInput === choice}
              disabled={!!result}
              onClick={() => setUserInput(choice)}
              style={{ minHeight: 44, padding: "10px", border: userInput === choice ? "2px solid #0070f3" : "1px solid #d0d0d0", borderRadius: 8, background: "#ffffff", color: "#222222", textAlign: "left", fontSize: 16, overflowWrap: "anywhere" }}
            >{choice}</button>)}
          </div>
        ) : (
          <div>
            <div
              style={{
                width: "100%",
                height: `${CANVAS_HEIGHT}px`,
                position: "relative",
                border: "1px dashed #b8b8b8",
                borderRadius: "8px",
                overflow: "hidden",
                background: "#ffffff",
                boxSizing: "border-box",
              }}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  touchAction: "none",
                  cursor: "crosshair",
                }}
              />
            </div>
            <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: "12px" }}>
                * 필기 인식은 아직 지원하지 않습니다.
              </span>
              <button
                onClick={clearCanvas}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #f2c0bd",
                  background: "#fdecea",
                  color: "#a12a25",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🗑 지우기
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSubmit}
            className="btn"
            disabled={!!result || (inputMode === "choice" && !userInput)}
          >
            {inputMode === "choice" ? "선택한 답 확인" : "예시 답과 비교"}
          </button>
        </div>
      </div>

      {/* 결과 표시 영역 */}
      {result && (
        <div className="card" role="status">
          <div className="label">이번 연습 결과 · 저장하지 않아요</div>

          <div style={{ marginTop: "6px" }}>
            <div className="label">문제</div>
            <div>{result.problem.prompt}</div>
          </div>

          <div style={{ marginTop: "10px" }}>
            <div className="label">{result.mode === "choice" ? "내가 고른 답" : "내 필기"}</div>
            <div className="jp-text" style={{ fontSize: "18px" }}>
              {result.userInput || "(입력 없음)"}
            </div>
          </div>

          <div style={{ marginTop: "10px" }}>
            <div className="label">예시 답</div>
            <div className="jp-text" style={{ fontSize: "18px" }}>
              {result.problem.answer}
            </div>
          </div>

          <div style={{ marginTop: "12px" }}>
            {result.mode === "choice" ? (
              result.grade === "correct" ? (
                <div style={{ background: "#e6f7ea", color: "#1e7a36", border: "1px solid #b8e2c4", padding: "8px 12px", borderRadius: "8px", fontSize: "14px" }}>
                  ✅ 뜻에 맞는 표현을 골랐어요. 직접 쓰기 능력 점수는 아니에요.
                </div>
              ) : (
                <div style={{ background: "#fdecea", color: "#a12a25", border: "1px solid #f2c0bd", padding: "8px 12px", borderRadius: "8px", fontSize: "14px" }}>
                  선택한 표현과 예시 답의 뜻을 비교한 뒤 다시 골라 보세요.
                </div>
              )
            ) : (
              <div style={{ background: "#f1f3f8", color: "#555", border: "1px solid #e5e5e5", padding: "8px 12px", borderRadius: "8px", fontSize: "14px" }}>
                필기 모드에서는 아직 자동 채점이 지원되지 않습니다. 정답과 비교해 직접 확인해 보세요.
              </div>
            )}
          </div>

          <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleNext}
              className="btn"
              style={{ background: "#0070f3", minWidth: "120px" }}
            >
              {currentIndex === PROBLEMS.length - 1 ? "처음으로 돌아가기" : `다음 문제 →`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

