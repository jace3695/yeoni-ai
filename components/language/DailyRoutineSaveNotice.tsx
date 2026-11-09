"use client";

export default function DailyRoutineSaveNotice({ pending, error, saved, retry }: { pending: boolean; error: string; saved: boolean; retry: () => void }) {
  if (!error && !pending && !saved) return null;
  const disabled = pending || saved;
  const retryIfAllowed = () => { if (!disabled) retry(); };
  return <div>
    <p>아직 저장하지 못한 일일 완료 요청은 이 화면을 떠나거나 새로고침하면 사라질 수 있어요. 가능하면 화면을 떠나기 전에 다시 저장해 주세요. 이미 저장된 답안을 다시 풀거나 기록을 지우지 마세요.</p>
    <p>답안이나 점수와 별도로 일일 학습 체크·이력 저장 상태를 확인해 주세요. 이미 처리된 답안은 다시 풀 필요는 없어요.</p>
    <button type="button" className="btn" disabled={disabled} onClick={retryIfAllowed}>일일 학습 기록 다시 저장</button>
    <p role="status" aria-live="polite" aria-atomic="true">{error || (pending ? '일일 학습 기록을 저장하고 있어요.' : saved ? '일일 학습 기록이 이 기기에 저장됐어요. 서버 동기화 완료를 뜻하지는 않아요.' : '')}</p>
  </div>;
}
