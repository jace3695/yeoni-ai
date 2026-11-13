"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { captureDailyRoutineCompletion, saveDailyRoutineCompletion, type RoutineId } from '@/utils/dailyRoutineProgress';
import { learningOwner } from '@/utils/japaneseLevelJourney';
import { createRoutineCompletionQueue } from '@/utils/routineCompletionQueue';

const ACTION_SCOPE_ERROR = '저장 공간이나 계정 상태를 확인하지 못해 이번 답안 처리를 멈췄어요. 상태를 확인한 뒤 다시 눌러 주세요. 계정이나 기록을 바꿨다면 학습 화면을 다시 열어 주세요.';

export function useDailyRoutineCompletion(routineId: RoutineId) {
  const [status, setStatus] = useState({ pending: false, saved: false, error: '' });
  const queue = useRef<ReturnType<typeof createRoutineCompletionQueue> | null>(null);
  const current = useRef<() => boolean>(() => false);
  useEffect(() => {
    const controller = new AbortController();
    let owner: string;
    try {
      // Validate readiness before allowing primary answer/review handlers to write.
      // This capture performs no persistence and is not an achievement intent.
      captureDailyRoutineCompletion(routineId);
      owner = learningOwner(localStorage);
    }
    catch { setStatus({ pending: false, saved: false, error: '학습 기록을 읽지 못했어요. 화면을 다시 열어 주세요.' }); return; }
    const isCurrent = () => {
      try { return !controller.signal.aborted && document.documentElement.dataset.recordReset !== 'running' && owner === learningOwner(localStorage); }
      catch { return false; }
    };
    current.current = isCurrent;
    queue.current = createRoutineCompletionQueue({
      capture: date => captureDailyRoutineCompletion(routineId, date),
      save: intent => saveDailyRoutineCompletion(intent, { signal: controller.signal, isCurrent }),
      isCurrent, publish: setStatus,
    });
    const invalidate = () => { controller.abort(); setStatus({ pending: false, saved: false, error: '계정이나 기록이 바뀌었어요. 학습 화면을 다시 열어 주세요.' }); };
    const storage = () => { if (!isCurrent()) invalidate(); };
    window.addEventListener('storage', storage);
    window.addEventListener('yeoni-cloud-session-changed', invalidate);
    window.addEventListener('ai-yeoni-record-reset', invalidate);
    return () => {
      controller.abort(); queue.current = null;
      window.removeEventListener('storage', storage);
      window.removeEventListener('yeoni-cloud-session-changed', invalidate);
      window.removeEventListener('ai-yeoni-record-reset', invalidate);
    };
  }, [routineId]);
  const complete = useCallback((date?: string) => {
    if (!queue.current) return;
    if (!current.current()) { setStatus({ pending: false, saved: false, error: '계정이나 기록을 확인한 뒤 학습 화면을 다시 열어 주세요.' }); return; }
    const now = new Date();
    queue.current?.complete(date ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  }, []);
  const retry = useCallback(() => queue.current?.retry(), []);
  const isDateSaved = useCallback((date: string) => current.current() && (queue.current?.isSaved(date) ?? false), []);
  const isCurrent = useCallback(() => current.current(), []);
  // Event handlers only: render and state updaters must use the pure predicate.
  const ensureCurrent = useCallback(() => {
    if (!queue.current) return false;
    if (current.current()) {
      setStatus(previous => previous.error === ACTION_SCOPE_ERROR ? { ...previous, error: '' } : previous);
      return true;
    }
    setStatus({ pending: false, saved: false, error: ACTION_SCOPE_ERROR });
    return false;
  }, []);
  return { ...status, complete, retry, isDateSaved, isCurrent, ensureCurrent };
}

