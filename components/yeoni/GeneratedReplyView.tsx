'use client';
import type { Outcome } from '@/lib/yeoni/generated-record-reply';
import { RECORD_AI_DISABLED } from '@/lib/yeoni/generated-record-reply';
/** Mock answers are visibly marked. No production provider or voice resolver. */
export default function GeneratedReplyView({ outcome, onMockListen }: { outcome: Outcome; onMockListen?: (text: string) => void }) {
  if (outcome.status !== 'ready') return <span className="block text-sm leading-6" data-record-ai-mode="disabled">
    {outcome.status === 'disabled' ? RECORD_AI_DISABLED : outcome.status === 'deleted' ? '삭제한 답변은 복원하지 않아요. 같은 기록으로 자동 재생성하지도 않아요.' : '생성형 답변을 확인하지 못했어요. 아래 규칙 요약은 AI가 작성한 답변이 아니에요.'}
    <button type="button" disabled className="ml-2 min-h-11 rounded-lg border px-3" aria-label="답변 듣기 — 음성 연결 전">답변 듣기 · 연결 전</button>
  </span>;
  const a = outcome.answer;
  return <span className="block space-y-2 text-sm leading-6" data-record-ai-mode="mock">
    <strong className="block">모의 AI 시험 응답 · 실제 AI가 생성하지 않았어요</strong>
    <span className="block whitespace-pre-wrap break-words">{a.text}</span>
    <span className="block">작성 시각 {a.generatedAt} · 기록 분석 기준일 {a.analysisDate}{outcome.reused ? ' · 저장 답변 재사용' : ''}</span>
    <span className="block">현재 상태가 아닌 위 기준일의 기록에 대한 답변이에요.</span>
    <button type="button" disabled={!onMockListen} onClick={() => onMockListen?.(a.text)} className="min-h-11 rounded-lg border px-3">모의 답변 듣기 시험</button>
  </span>;
}
