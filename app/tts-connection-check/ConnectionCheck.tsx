'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import OnceAudio from './OnceAudio';

type Status = 'idle' | 'checking' | 'success' | 'failed' | 'login';
export default function ConnectionCheck() {
  const [owner, setOwner] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const active = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const verifiedOwner = useRef<string | null>(null);
  useEffect(() => {
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (verifiedOwner.current && session?.user.id === verifiedOwner.current && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) return;
      verifiedOwner.current = null;
      setOwner(null);
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
    setOwner(null);
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
      const success = body !== null && typeof body === 'object'
        && 'hostMatches' in body && body.hostMatches === true
        && 'authenticated' in body && body.authenticated === true;
      verifiedOwner.current = success ? result?.data.session?.user.id ?? null : null;
      setOwner(verifiedOwner.current);
      setStatus(success ? 'success' : 'failed');
    } catch {
      if (current()) setStatus('failed');
    } finally {
      clearTimeout(timer);
      if (active.current === controller) active.current = null;
    }
  }

  return <main style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px' }}>
    <h1>연결 확인</h1>
    <p>연결 확인 버튼은 로그인 상태와 시험 기능의 연결만 확인해요. 음성 생성은 아래의 별도 버튼을 눌러야 해요.</p>
    <button type="button" onClick={() => void check()} disabled={status === 'checking' || owner !== null}
      style={{ minHeight: 48, padding: '12px 24px', margin: '16px 0' }}>
      {status === 'checking' ? '확인 중…' : '연결 확인'}
    </button>
    <p role="status" aria-live="polite">
      {status === 'idle' && '준비되면 연결 확인을 눌러 주세요.'}
      {status === 'checking' && '잠시 기다려 주세요.'}
      {status === 'success' && '연결 확인에 성공했어요.'}
      {status === 'failed' && '연결을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.'}
      {status === 'login' && '로그인이 필요해요. 로그인한 뒤 이 페이지로 돌아와 주세요.'}
    </p>
    {status === 'login' && <p><a href="/login">로그인하기</a> · 로그인 후 브라우저의 뒤로 가기로 돌아올 수 있어요.</p>}
    {status === 'success' && owner && <OnceAudio key={owner} owner={owner} />}
    <p><a href="/">홈으로</a></p>
  </main>;
}
