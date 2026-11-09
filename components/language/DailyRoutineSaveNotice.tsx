"use client";

export default function DailyRoutineSaveNotice({ pending, error, retry }: { pending: boolean; error: string; retry: () => void }) {
  if (!error && !pending) return null;
  return <div role={error ? 'alert' : 'status'} aria-live="polite">
    <p>아직 저장하지 못한 일일 완료 요청은 이 화면을 떠나거나 새로고침하면 사라질 수 있어요. 가능하면 화면을 떠나기 전에 다시 저장해 주세요. 이미 저장된 답안을 다시 풀거나 기록을 지우지 마세요.</p>
    {error ? <><p>답안이나 점수와 별도로 일일 학습 체크·이력 저장을 확인해야 해요. 이미 처리된 답안은 다시 풀 필요는 없어요.</p><p>{error}</p><button type="button" className="btn" disabled={pending} onClick={retry}>일일 학습 기록 다시 저장</button></> : <p>일일 학습 기록을 저장하고 있어요.</p>}
  </div>;
}
