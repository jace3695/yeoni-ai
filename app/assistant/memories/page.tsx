'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useUnsavedChanges } from '@/components/useUnsavedChanges';
import {
  completeMemoryChange, memoryResetMarker, readMemoryJournal, recoverMemory, rememberMemoryChange,
  waitForMemory, type AssistantMemory, type MemoryChange, type MemoryRecoveryState, type MemoryTransport,
} from '@/lib/assistant-memory-recovery';

const resultNotice: Record<MemoryRecoveryState, string> = {
  saved: '서버에서 확인한 내용이 요청한 상태와 같습니다.',
  missing: '현재 같은 ID의 기억이 보이지 않습니다. 이전 요청의 취소를 뜻하지 않습니다. 확인 정보와 원래 ID를 유지합니다.',
  before: '서버에는 아직 변경 전 내용이 있습니다. 같은 요청을 다시 보내려면 아래 버튼을 눌러 주세요.',
  conflict: '서버 내용이 변경 전·후 어느 쪽과도 다릅니다. 최신 내용을 덮어쓰지 않습니다. 요청을 보류하고 다른 기억을 관리할 수 있습니다.',
  reset: '기억 초기화 시점이 달라졌습니다. 이전 요청의 취소 여부는 알 수 없습니다. 현재 결과를 다시 확인하거나, 같은 ID·변경 내용으로 초기화 이후에도 반영할지 명시해 주세요.',
  unknown: '저장 결과를 확인하지 못했습니다. 같은 요청의 서버 결과를 다시 조회해 주세요. 자동 재전송하지 않습니다.',
  stale: '',
};

export default function MemoriesPage() {
  const [rows, setRows] = useState<AssistantMemory[]>([]), [owner, setOwner] = useState('');
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<AssistantMemory | null>(null), [topic, setTopic] = useState('일반'), [content, setContent] = useState('');
  const [change, setChange] = useState<MemoryChange | null>(null), [journal, setJournal] = useState<MemoryChange[]>([]);
  const [journalReady, setJournalReady] = useState(false), [outcome, setOutcome] = useState<MemoryRecoveryState | null>(null), [busy, setBusy] = useState(false);
  const mounted = useRef(false), generation = useRef(0), ownerRef = useRef(''), resetRef = useRef('null');
  const readEpoch = useRef(0), readController = useRef<AbortController | null>(null), operation = useRef<AbortController | null>(null);
  useUnsavedChanges(Boolean(content || (change && !change.attempted)));

  const clearForm = useCallback(() => { setEditing(null); setTopic('일반'); setContent(''); }, []);
  const invalidate = useCallback(() => {
    generation.current++; readEpoch.current++;
    readController.current?.abort(); operation.current?.abort();
    readController.current = null; operation.current = null;
  }, []);
  const load = useCallback(async (completionNotice = '') => {
    if (!mounted.current || operation.current) return;
    const epoch = ++readEpoch.current, life = generation.current;
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    const current = () => mounted.current && generation.current === life && readEpoch.current === epoch && !controller.signal.aborted;
    setLoading(true); setReady(false); setJournalReady(false);
    try {
      if (!supabase) throw Error('연결을 확인해 주세요.');
      const auth = await waitForMemory(supabase.auth.getUser(), controller.signal);
      if (!current()) return;
      if (auth.error || !auth.data.user) throw Error('로그인 상태를 확인해 주세요.');
      const id = auth.data.user.id; ownerRef.current = id; setOwner(id);
      let entries: MemoryChange[] = [];
      let journalError = '';
      try { entries = readMemoryJournal(window.sessionStorage, id); setJournalReady(true); }
      catch (error) { journalError = error instanceof Error ? error.message : '이 탭의 확인 정보를 읽지 못했습니다.'; }
      setJournal(entries); setChange(entries[0] ?? null); setOutcome(null);
      const state = await waitForMemory(supabase.from('user_app_state').select('state').eq('user_id', id).abortSignal(controller.signal).maybeSingle(), controller.signal);
      if (!current()) return;
      if (state.error || state.data === undefined) throw Error('초기화 상태를 확인하지 못했습니다.');
      resetRef.current = memoryResetMarker(state.data?.state);
      const result = await waitForMemory(supabase.from('assistant_memories').select('id,user_id,topic,content').eq('user_id', id).order('created_at', { ascending: false }).abortSignal(controller.signal), controller.signal);
      if (!current()) return;
      if (result.error || !Array.isArray(result.data)) throw Error('기억 목록 조회에 실패했습니다.');
      setRows(result.data); setReady(true);
      setNotice(journalError || (entries.length ? '이 탭에 남은 요청을 복구했습니다. 재진입 시 쓰지 않습니다. 같은 요청의 서버 결과 확인 버튼을 눌러 주세요.' : completionNotice));
    } catch (error) {
      if (current()) setNotice(`${error instanceof Error ? error.message : ''} 기억을 불러오지 못했습니다. 빈 목록으로 판단하지 않습니다. 다시 불러와 주세요.`);
    } finally {
      if (current()) { setLoading(false); readController.current = null; }
      controller.abort();
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      const nextOwner = session?.user.id ?? '';
      if (nextOwner === ownerRef.current) return;
      invalidate(); ownerRef.current = nextOwner;
      setOwner(''); setRows([]); setReady(false); setJournalReady(false); setJournal([]); setChange(null); setOutcome(null); setBusy(false); clearForm();
      // Never await Supabase work inside its auth callback.
      setTimeout(() => { if (mounted.current) void load(); }, 0);
    });
    return () => { mounted.current = false; invalidate(); subscription?.data.subscription.unsubscribe(); };
  }, [clearForm, invalidate, load]);

  const review = (before: AssistantMemory | null, remove = false) => {
    if (!ready || !journalReady || operation.current) return;
    const after = remove ? null : { topic: topic.trim(), content: content.trim() };
    if (after && (!after.topic || after.topic.length > 80 || !after.content || after.content.length > 2000)) { setNotice('주제는 1~80자, 기억은 1~2,000자로 입력해 주세요.'); return; }
    const prior = journal.find(entry => before ? entry.id === before.id : entry.before === null && entry.after?.topic === after?.topic && entry.after?.content === after?.content);
    if (prior) { setChange(prior); setOutcome(null); setNotice('이 기억의 이전 요청을 먼저 확인해 주세요. 같은 요청에 새 ID를 만들지 않습니다.'); return; }
    setChange({ owner, id: before?.id ?? crypto.randomUUID(), before, after, originalReset: resetRef.current, reset: resetRef.current, attempted: false });
    setOutcome(null); setNotice('');
  };

  const confirm = async (mode: 'send' | 'check' | 'retry' | 'renew') => {
    if (!supabase || !change || operation.current || !journalReady) return;
    const client = supabase;
    const selected = change, life = generation.current, controller = new AbortController();
    operation.current = controller;
    const current = () => mounted.current && generation.current === life && ownerRef.current === selected.owner && operation.current === controller && !controller.signal.aborted;
    setBusy(true); setNotice('');
    const transport: MemoryTransport = {
      auth: async () => { const result = await client.auth.getUser(); if (result.error) throw Error('로그인 확인에 실패했습니다.'); return result.data.user?.id ?? null; },
      reset: async signal => {
        const result = await client.from('user_app_state').select('state').eq('user_id', selected.owner).abortSignal(signal).maybeSingle();
        if (result.error || result.data === undefined) throw Error('초기화 상태를 확인하지 못했습니다.');
        return memoryResetMarker(result.data?.state);
      },
      find: async (entry, signal) => {
        const result = await client.from('assistant_memories').select('id,user_id,topic,content').eq('id', entry.id).eq('user_id', entry.owner).abortSignal(signal).maybeSingle();
        if (result.error || result.data === undefined) throw Error('같은 요청의 결과를 조회하지 못했습니다.');
        return result.data;
      },
      write: async (entry, signal) => {
        if (!current()) throw Error('memory-stale');
        if (!entry.before) return await client.from('assistant_memories').insert({ id: entry.id, user_id: entry.owner, ...entry.after! }).abortSignal(signal);
        const query = entry.after ? client.from('assistant_memories').update(entry.after) : client.from('assistant_memories').delete();
        return await query.eq('id', entry.id).eq('user_id', entry.owner).eq('topic', entry.before.topic).eq('content', entry.before.content).abortSignal(signal);
      },
    };
    try {
      const result = await recoverMemory(selected, mode, transport, entry => {
        if (!current()) throw Error('memory-stale');
        const entries = rememberMemoryChange(window.sessionStorage, entry);
        setJournal(entries); setChange(entry);
      }, current, controller.signal);
      if (!current() || result.state === 'stale') return;
      setOutcome(result.state); setNotice(resultNotice[result.state]);
      if (result.state === 'saved') {
        const entries = completeMemoryChange(window.sessionStorage, result.change);
        setJournal(entries); setChange(null); clearForm();
        // Refresh only after releasing this operation; no write is made on re-entry.
        operation.current = null; setBusy(false); controller.abort();
        const message = result.change.after ? '서버에서 요청한 기억 내용을 확인했습니다.' : '서버에서 해당 기억이 없는 상태를 확인했습니다.';
        setNotice(message);
        void load(message);
      }
    } catch (error) {
      if (current()) { setOutcome('unknown'); setNotice(error instanceof Error ? error.message : resultNotice.unknown); }
    } finally {
      if (operation.current === controller) { operation.current = null; if (mounted.current && generation.current === life) setBusy(false); }
      controller.abort();
    }
  };

  const closeReview = () => { if (busy) return; setChange(null); setOutcome(null); clearForm(); setNotice('확인 화면을 닫았습니다. 이미 보낸 요청은 취소되지 않습니다.'); };
  const disabled = busy || Boolean(change) || !journalReady;
  return <main className="mx-auto min-h-dvh max-w-3xl px-4 py-6 text-gray-900">
    <Link href="/assistant" className="text-sm font-bold text-violet-700">← AI 연이</Link>
    <h1 className="mt-4 text-2xl font-bold">연이 기억 관리</h1>
    <p className="mt-2 text-sm leading-6 text-gray-500">직접 저장한 기억을 관련 답변에 사용합니다. 기억을 고쳐도 원본 일정·운동·식단 기록은 바뀌지 않습니다.</p>
    <button type="button" disabled={loading || busy || Boolean(change)} onClick={() => void load()} className="my-3 min-h-11 rounded-xl bg-violet-50 px-4 text-sm font-bold">기억 다시 불러오기</button>
    {notice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">{notice}</p>}
    {journal.length > 0 && <section aria-label="보관된 기억 요청" className="my-3 rounded-xl border p-3 text-sm">
      <h2 className="font-bold">확인이 남은 요청 {journal.length}개</h2>
      <p className="mt-2">현재 계정의 이 탭에만 보관됩니다. 탭을 닫거나 브라우저 저장공간을 지우면 복구 정보가 사라질 수 있습니다.</p>
      <ul>{journal.map(entry => <li key={entry.id}><button disabled={busy} onClick={() => { setChange(entry); setOutcome(null); }} className="min-h-11 break-words py-2 text-left font-bold text-violet-700">{entry.after?.topic ?? entry.before?.topic} · 같은 요청 확인 열기</button></li>)}</ul>
    </section>}
    <section aria-label="기억 입력" className="my-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-bold">{editing ? '기억 수정' : '새 기억'}</h2>
      <label className="mt-3 block text-sm">주제<input aria-label="기억 주제" disabled={disabled} maxLength={80} value={topic} onChange={e => setTopic(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border p-2" /></label>
      <label className="mt-3 block text-sm">내용<textarea aria-label="기억 내용" disabled={disabled} maxLength={2000} value={content} onChange={e => setContent(e.target.value)} className="mt-1 min-h-28 w-full rounded-xl border p-2" /></label>
      <div className="mt-3 flex flex-wrap gap-2"><button disabled={!ready || disabled || !content.trim()} onClick={() => review(editing)} className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-50">기억 저장 검토</button><button disabled={busy || Boolean(change)} onClick={clearForm} className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm">입력 취소</button></div>
    </section>
    {change && <section aria-label="기억 변경 확인" className="my-4 rounded-2xl bg-amber-50 p-4 text-sm">
      <h2 className="font-bold">{change.after ? '기억 저장 확인' : '기억 삭제 확인'}</h2>
      <p className="mt-2 whitespace-pre-wrap break-words">변경 전: {change.before ? `${change.before.topic} · ${change.before.content}` : '새 기억'}</p>
      <p className="mt-2 whitespace-pre-wrap break-words">변경 후: {change.after ? `${change.after.topic} · ${change.after.content}` : '삭제'}</p>
      {!change.after && <p className="mt-2">삭제한 기억은 복구되지 않습니다.</p>}
      {change.attempted && <p className="mt-2">이전 요청이 늦게 반영될 수 있습니다. 재확인은 조회만 합니다. 다시 보내더라도 원래 ID와 변경 전 조건을 그대로 유지합니다.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void confirm(change.attempted ? 'check' : 'send')} className="min-h-11 rounded-xl bg-violet-700 px-4 font-bold text-white">{busy ? '결과 확인 중…' : change.attempted ? '기억 서버 결과 재확인' : '확인 후 기억 반영'}</button>
        {change.attempted && (outcome === 'before' || (outcome === 'missing' && !change.before)) && <button disabled={busy} onClick={() => void confirm('retry')} className="min-h-11 rounded-xl border border-violet-400 bg-white px-4 font-bold">원래 ID로 같은 요청 다시 보내기</button>}
        {outcome === 'reset' && <button disabled={busy} onClick={() => void confirm('renew')} className="min-h-11 rounded-xl border border-amber-700 bg-white px-4 font-bold">초기화 이후에도 같은 ID·내용 반영 확인</button>}
        <button disabled={busy} onClick={closeReview} className="min-h-11 rounded-xl bg-white px-4">{change.attempted ? '요청 보관하고 다른 기억 관리' : '확인 화면 닫기'}</button>
      </div>
      {outcome === 'missing' && change.before && change.after && <p className="mt-2">수정할 원래 기억이 없어 새 기억으로 바꾸어 저장하지 않습니다. 이 요청을 보관하고 다른 기억을 관리할 수 있습니다.</p>}
    </section>}
    <section aria-label="저장된 기억"><h2 className="font-bold">저장된 기억</h2>
      {loading ? <p>기억을 불러오는 중…</p> : !ready ? <p>현재 기억을 확인하지 못했습니다.</p> : !rows.length ? <p className="py-3 text-sm">저장한 기억이 없습니다.</p> : <ul className="mt-3 space-y-3">{rows.map(row => <li key={row.id} className="rounded-2xl bg-white p-4 shadow-sm"><strong>{row.topic}</strong><p className="mt-2 whitespace-pre-wrap break-words text-sm">{row.content}</p><div className="mt-3 flex gap-2"><button disabled={disabled} onClick={() => { setEditing(row); setTopic(row.topic); setContent(row.content); setNotice(''); }} className="min-h-11 rounded-xl bg-violet-50 px-4 text-sm">기억 수정</button><button disabled={disabled} onClick={() => review(row, true)} className="min-h-11 rounded-xl bg-red-50 px-4 text-sm text-red-700">기억 삭제 검토</button></div></li>)}</ul>}
    </section>
  </main>;
}
