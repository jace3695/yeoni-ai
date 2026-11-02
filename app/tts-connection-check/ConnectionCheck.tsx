'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Status = 'idle' | 'checking' | 'success' | 'failed' | 'login';
export default function ConnectionCheck() {
  const [status, setStatus] = useState<Status>('idle');
  const active = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    const subscription = supabase?.auth.onAuthStateChange(() => {
      epoch.current++;
      active.current?.abort();
      active.current = null;
      setStatus('idle');
    });
    return () => {
      epoch.current++;
      active.current?.abort();
      active.current = null;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  async function check() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const version = epoch.current;
    const current = () => version === epoch.current && active.current === controller && !controller.signal.aborted;
    const timer = setTimeout(() => {
      if (current()) {
        controller.abort();
        active.current = null;
        setStatus('failed');
      }
    }, 15000);
    setStatus('checking');
    try {
      const result = await supabase?.auth.getSession();
      if (!current()) return;
      const token = result?.data.session?.access_token;
      if (result?.error || !token) { setStatus('login'); return; }
      const response = await fetch('/api/tts/once-28/preflight', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal, cache: 'no-store', redirect: 'error', credentials: 'same-origin',
      });
      if (!current()) return;
      if (!response.ok) { setStatus(response.status === 401 ? 'login' : 'failed'); return; }
      const body: unknown = await response.json();
      if (!current()) return;
      setStatus(body !== null && typeof body === 'object'
        && 'hostMatches' in body && body.hostMatches === true
        && 'authenticated' in body && body.authenticated === true ? 'success' : 'failed');
    } catch {
      if (current()) setStatus('failed');
    } finally {
      clearTimeout(timer);
      if (active.current === controller) active.current = null;
    }
  }

  return <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px' }}>
    <h1>연결 확인</h1>
    <p>로그인 상태와 시험 기능의 연결을 확인해요. 음성을 만들거나 재생하지 않아요.</p>
    <button type="button" onClick={() => void check()} disabled={status === 'checking'}
      style={{ minHeight: 48, padding: '12px 24px', margin: '16px 0' }}>
      {status === 'checking' ? '확인 중…' : '연결 확인'}
    </button>
    <p role="status" aria-live="polite">
      {status === 'idle' && '준비되면 연결 확인을 눌러 주세요.'}
      {status === 'checking' && '잠시 기다려 주세요.'}
      {status === 'success' && '연결 확인에 성공했어요. 음성 생성은 실행하지 않았어요.'}
      {status === 'failed' && '연결을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.'}
      {status === 'login' && '로그인이 필요해요. 로그인한 뒤 이 페이지로 돌아와 주세요.'}
    </p>
    {status === 'login' && <p><a href="/login">로그인하기</a> · 로그인 후 브라우저의 뒤로 가기로 돌아올 수 있어요.</p>}
    <p><a href="/">홈으로</a></p>
  </main>;
}
