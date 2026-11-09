"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { LEVEL_JOURNEY_EVENT, LEVEL_JOURNEY_KEY, learningOwner, type LevelJourney } from '@/utils/japaneseLevelJourney';
import { assertLevelJourneyOwner, readLevelJourneySafely, writeLevelJourneySafely } from '@/utils/japaneseLevelJourneyStorage';

export function useLevelJourney() {
  const [state, setState] = useState<{ owner: string; value: LevelJourney }>();
  const [readError, setReadError] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const saving = useRef(false);
  const reload = useCallback(async () => {
    const signal = lifetime.current?.signal;
    const ticket = ++revision.current;
    if (!signal || signal.aborted) return;
    try {
      const owner = learningOwner(localStorage);
      setState(previous => previous?.owner === owner ? previous : undefined);
      const assertCurrent = () => {
        if (document.documentElement.dataset.recordReset === 'running') throw new Error('기록을 초기화하는 중이에요. 완료 후 다시 읽어 주세요.');
      };
      const value = await readLevelJourneySafely(localStorage, owner, { signal, assertCurrent });
      if (signal.aborted || ticket !== revision.current) return;
      assertLevelJourneyOwner(localStorage, owner, { signal, assertCurrent });
      setState({ owner, value }); setReadError('');
    } catch (error) {
      if (signal.aborted || ticket !== revision.current) return;
      setState(undefined);
      setReadError(error instanceof Error ? error.message : '학습 기록을 읽지 못했어요. 기존 기록은 보존합니다.');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void reload();
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key === LEVEL_JOURNEY_KEY || /^(language|fitness)-cloud-sync-(user|epoch)$/.test(event.key) || event.key === 'languageRecordResetV1') void reload();
    };
    // Session events precede cache cleanup. Latch invalid until a fresh mount;
    // focus/retry must never re-adopt the departing account's bytes.
    const sessionChanged = () => {
      controller.abort(); ++revision.current; setState(undefined);
      setReadError('계정 연결이 바뀌었어요. 학습 화면을 다시 열어 주세요.');
    };
    window.addEventListener('yeoni-cloud-session-changed', sessionChanged);
    const events = ['focus', LEVEL_JOURNEY_EVENT, 'ai-yeoni-record-reset'];
    window.addEventListener('storage', storage);
    events.forEach(event => window.addEventListener(event, reload));
    return () => {
      controller.abort();
      window.removeEventListener('yeoni-cloud-session-changed', sessionChanged);
      window.removeEventListener('storage', storage);
      events.forEach(event => window.removeEventListener(event, reload));
    };
  }, [reload]);
  const renderLifetime = lifetime.current;
  const update = async (change: (latest: LevelJourney) => LevelJourney, callerSignal?: AbortSignal) => {
    const controller = renderLifetime;
    if (!state || readError || !controller || controller.signal.aborted || controller !== lifetime.current) throw new Error('학습 기록을 먼저 확인해 주세요.');
    if (saving.current) throw new Error('학습 기록을 저장하고 있어요. 잠시 기다려 주세요.');
    const assertCurrent = () => {
      if (controller.signal.aborted || callerSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (document.documentElement.dataset.recordReset === 'running') throw new Error('기록을 초기화하는 중이에요. 완료 후 다시 시도해 주세요.');
    };
    const combined = new AbortController();
    const cancel = () => combined.abort();
    controller.signal.addEventListener('abort', cancel, { once: true });
    callerSignal?.addEventListener('abort', cancel, { once: true });
    if (controller.signal.aborted || callerSignal?.aborted) cancel();
    saving.current = true;
    ++revision.current;
    try {
      const value = await writeLevelJourneySafely(localStorage, state.owner, change, { signal: combined.signal, assertCurrent });
      assertLevelJourneyOwner(localStorage, state.owner, { signal: combined.signal, assertCurrent });
      ++revision.current;
      setState({ owner: state.owner, value });
      window.dispatchEvent(new Event(LEVEL_JOURNEY_EVENT));
      return value;
    } catch (error) {
      // A failed acknowledgement may follow an already-persisted local write.
      // Invalidate observers immediately; this event is not save confirmation.
      window.dispatchEvent(new Event(LEVEL_JOURNEY_EVENT));
      throw error;
    } finally {
      controller.signal.removeEventListener('abort', cancel);
      callerSignal?.removeEventListener('abort', cancel);
      saving.current = false;
    }
  };
  return { state, readError, reload, update };
}
