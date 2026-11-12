"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { learningOwner } from '@/utils/japaneseLevelJourney';
import { CHUNK_REVIEW_EVENT, CHUNK_REVIEW_KEY, readChunkReview, writeChunkReview, type ChunkReviewState } from '@/utils/japaneseChunkReview';
import { recoverLanguageStorage, withLanguageRecordLock } from '@/app/data/languageStorageLock';

export function useChunkReview() {
  const [state, setState] = useState<{ owner: string; value: ChunkReviewState }>();
  const [readError, setReadError] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  const loadRevision = useRef(0);
  const reload = useCallback(async () => {
    const signal = lifetime.current?.signal;
    const revision = ++loadRevision.current;
    if (!signal || signal.aborted) return;
    if (document.documentElement.dataset.recordReset === 'running') {
      setState(undefined); setReadError(''); return;
    }
    try {
      const currentOwner = learningOwner(localStorage);
      setState(previous => previous && previous.owner !== currentOwner ? undefined : previous);
      const read = () => {
        if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
        recoverLanguageStorage(localStorage);
        const owner = learningOwner(localStorage);
        const value = readChunkReview(localStorage);
        if (owner !== learningOwner(localStorage)) throw new Error('계정이나 기록이 바뀌었어요. 화면을 다시 열어 주세요.');
        return { owner, value };
      };
      // Reads and recovery participate in the same IDB gate, including browsers
      // without Web Locks. The outer boundary owns any read-only fallback.
      const next = await withLanguageRecordLock(read, signal);
      if (signal.aborted || revision !== loadRevision.current) return;
      if (next.owner !== learningOwner(localStorage)) { setState(undefined); return; }
      if (document.documentElement.dataset.recordReset !== 'running') {
        setState(next); setReadError('');
      }
    } catch (error) {
      if (signal.aborted || revision !== loadRevision.current) return;
      setState(undefined);
      setReadError(error instanceof Error ? error.message : '보충 오답 기록을 읽지 못했어요. 기존 기록은 보존합니다.');
    }
  }, []);
  useEffect(() => {
    lifetime.current = new AbortController();
    void reload();
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key === CHUNK_REVIEW_KEY || /^(language|fitness)-cloud-sync-(user|epoch)$/.test(event.key) || event.key === 'languageRecordResetV1') void reload();
    };
    const events = ['focus', 'yeoni-cloud-session-changed', CHUNK_REVIEW_EVENT, 'ai-yeoni-record-reset'];
    window.addEventListener('storage', storage);
    events.forEach(event => window.addEventListener(event, reload));
    return () => {
      lifetime.current?.abort();
      window.removeEventListener('storage', storage);
      events.forEach(event => window.removeEventListener(event, reload));
    };
  }, [reload]);
  const update = async (change: (latest: ChunkReviewState) => ChunkReviewState) => {
    const signal = lifetime.current?.signal;
    if (!state || readError || !signal || signal.aborted) throw new Error('보충 오답 기록을 먼저 확인해 주세요.');
    if (document.documentElement.dataset.recordReset === 'running') throw new Error('기록을 초기화하는 중이에요. 완료 후 다시 시도해 주세요.');
    const value = await writeChunkReview(localStorage, state.owner, latest => {
      if (document.documentElement.dataset.recordReset === 'running') throw new Error('기록을 초기화하는 중이에요. 완료 후 다시 시도해 주세요.');
      return change(latest);
    }, signal);
    if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (learningOwner(localStorage) !== state.owner) throw new Error('계정이나 기록이 바뀌어 이전 답의 저장 결과를 표시하지 않았어요. 새 화면에서 기록을 확인해 주세요.');
    setState({ owner: state.owner, value });
    window.dispatchEvent(new Event(CHUNK_REVIEW_EVENT));
    return value;
  };
  return { state, readError, reload, update };
}
