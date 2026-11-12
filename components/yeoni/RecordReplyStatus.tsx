'use client';
import type { SourceSnapshot } from '@/lib/yeoni/generated-record-reply';
import { RECORD_AI_DISABLED } from '@/lib/yeoni/generated-record-reply';
/** No fetch, speech synthesis, TTS resolver or auto-play in the disabled path. */
export default function RecordReplyStatus({ source }: { source?: SourceSnapshot }) {
  return <span data-record-ai-mode="disabled" data-source-app={source?.app} data-source-ready={source?.complete ?? false} className="mt-2 block text-sm font-normal leading-6 text-gray-600">
    {RECORD_AI_DISABLED}
    <span className="block"><button type="button" disabled aria-label="답변 듣기 — 음성 연결 전" className="min-h-11 rounded-lg border border-gray-300 px-3 py-2">답변 듣기 · 연결 전</button></span>
  </span>;
}
