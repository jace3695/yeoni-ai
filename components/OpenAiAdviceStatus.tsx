"use client";
import { useEffect, useRef, useState } from 'react';
import { checkOpenAiAdviceStatus, type OpenAiStatusResult } from '@/lib/openai-advice-status';

/** Separate from Google consent, question state and all advice dispatch callbacks. */
export default function OpenAiAdviceStatus() {
  const [result, setResult] = useState<OpenAiStatusResult | null>(null);
  const [checking, setChecking] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  async function check() {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setChecking(true);
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      // Bound UI wait even if a transport does not settle on abort.
      const status = await Promise.race([
        checkOpenAiAdviceStatus(fetch, controller.signal),
        new Promise<OpenAiStatusResult>(resolve => controller.signal.addEventListener('abort', () => resolve('unconfirmed'), { once: true })),
      ]);
      if (pending.current === controller) setResult(status);
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) { pending.current = null; setChecking(false); }
    }
  }
  return <aside aria-label="OpenAI 연결 준비" className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
    <p className="font-bold">OpenAI 조언·대화 · 연결 준비 중</p>
    <p className="mt-1 leading-6">조직·비용 한도·전송 동의 검증 전에는 사용할 수 없어요. 여기서는 질문이나 기록을 OpenAI에 전송하지 않아요. 기존 무료 AI와 Google 음성은 그대로 이용할 수 있어요.</p>
    <button type="button" disabled={checking} onClick={() => void check()} className="mt-2 min-h-11 rounded-xl border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">{checking ? '연결 상태 확인 중…' : 'OpenAI 준비 상태 확인'}</button>
    <p role="status" aria-live="polite" className="mt-2 leading-6">{result === 'not-connected' ? '아직 연결되지 않았어요. 질문·기록은 보내지 않았으며 유료 AI 요청도 실행하지 않았어요.' : result === 'unconfirmed' ? '상태를 확인하지 못했어요. OpenAI 사용은 계속 차단되며 질문·기록은 보내지 않아요.' : '준비 상태만 확인하며, 사용 신청이나 전송 동의가 아닙니다.'}</p>
  </aside>;
}
