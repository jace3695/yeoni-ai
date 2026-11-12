'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ZEPHYR_ONCE } from '../../lib/zephyr-28-policy';

const attemptKey = 'yeoni-zephyr-28-ui-attempted';
type State = 'ready' | 'working' | 'audio' | 'stopped';
export default function OnceAudio({ owner }: { owner: string }) {
  const [state, setState] = useState<State>('ready');
  const [url, setUrl] = useState<string | null>(null);
  const [playError, setPlayError] = useState(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    try { if (sessionStorage.getItem(attemptKey)) { busy.current = true; setState('stopped'); } }
    catch { busy.current = true; setState('stopped'); }
    return () => {
      alive.current = false;
      controller.current?.abort();
      audio.current?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  async function generate() {
    if (busy.current) return;
    busy.current = true;
    setState('working');
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => { abort.abort(); if (alive.current) setState('stopped'); }, 30000);
    try {
      const session = await supabase?.auth.getSession();
      if (!alive.current || abort.signal.aborted) return;
      if (session?.error || session?.data.session?.user.id !== owner || !session.data.session.access_token) throw Error('blocked');
      // Persist only a fixed attempt marker, never credentials or account data.
      // Mark before dispatch: a lost response must not offer regeneration.
      if (sessionStorage.getItem(attemptKey)) throw Error('attempted');
      sessionStorage.setItem(attemptKey, '1');
      const response = await fetch('/api/tts/once-28', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.session.access_token}` },
        body: JSON.stringify({ requestId: ZEPHYR_ONCE.requestId }), signal: abort.signal,
        redirect: 'error', cache: 'no-store', credentials: 'same-origin',
      });
      if (!alive.current || abort.signal.aborted) return;
      if (!response.ok) throw Error('unavailable');
      const result: unknown = await response.json();
      if (!alive.current || abort.signal.aborted) return;
      if (!result || typeof result !== 'object' || !('code' in result) || result.code !== 'AUDIO_READY'
        || !('audioContent' in result) || typeof result.audioContent !== 'string'
        || !result.audioContent.length || result.audioContent.length > 2_000_000
        || result.audioContent.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audioContent)) throw Error('invalid');
      const bytes = Uint8Array.from(atob(result.audioContent), character => character.charCodeAt(0));
      objectUrl.current = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      setUrl(objectUrl.current);
      setState('audio');
    } catch { if (alive.current && !abort.signal.aborted) setState('stopped'); }
    finally { clearTimeout(timer); }
  }
  return <section aria-labelledby="once-title">
    <h2 id="once-title">음성 1회 시험</h2>
    <p>{ZEPHYR_ONCE.text}</p>
    <p>음성: {ZEPHYR_ONCE.voice} · MP3 · 28자</p>
    <p>이번 시험 총 허용액은 US$0.01이에요. 서버의 계정·승인·만료·비용 확인을 통과한 경우에만 생성해요.</p>
    <p>생성은 한 번뿐이고 자동 재시도는 없어요. 예약 후 실패하거나 응답을 잃어도 기회가 소모돼요. 완료 전에는 화면을 닫지 마세요.</p>
    <button type="button" onClick={() => void generate()} disabled={state !== 'ready'} style={{ minHeight: 48, padding: '12px 20px' }}>음성 1회 생성</button>
    <p role="status" aria-live="polite">{state === 'working' ? '생성 결과를 기다리고 있어요…' : state === 'stopped' ? '다시 생성하지 않아요. 결과를 확인하지 못했거나 이미 요청한 시험이에요. 담당자에게 확인해 주세요.' : state === 'audio' ? '음성을 받았어요. 재생하거나 MP3를 저장해 주세요.' : '버튼을 눌러야 생성 요청을 보내요.'}</p>
    {url && <div>
      <audio ref={audio} controls src={url} preload="metadata" aria-label="연이 시험 음성" onError={() => setPlayError(true)} />
      <p><a href={url} download="yeoni-zephyr-28.mp3">MP3 다운로드</a></p>
      <p>이 화면을 떠나면 받은 파일이 사라져요. 먼저 다운로드해 주세요. 재생과 다운로드는 새 음성을 생성하지 않아요.</p>
      {playError && <p>이 브라우저에서 재생하지 못했어요. MP3를 다운로드해서 확인해 주세요.</p>}
    </div>}
  </section>;
}
