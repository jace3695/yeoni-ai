"use client";

import RecordReplyStatus from './RecordReplyStatus';
import { replySource } from '@/lib/yeoni/record-reply-sources';
import type { SourceSnapshot } from '@/lib/yeoni/generated-record-reply';
import { LANGUAGE_GUIDANCE_KEYS, readLanguageReplySnapshot, type LanguageReplySnapshot } from '@/lib/yeoni/language-reply-source';
import { LEVEL_JOURNEY_EVENT } from '@/utils/japaneseLevelJourney';
import { CHUNK_REVIEW_EVENT } from '@/utils/japaneseChunkReview';
import { isRecordResetRunning, RECORD_RESET_EVENT } from '@/app/data/appRecordReset';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { dietGuidance, fitnessGuidance, guidanceText, languageGuidance, object, unavailable, type Guidance, type RecordState } from '@/lib/yeoni/record-guidance';

// Read-only status from the existing language sync boundary; never starts a request.
export const LanguageRecordReadiness = createContext<RecordState>('loading');
type App = 'fitness' | 'diet' | 'language';
const keys: Record<App, string[]> = {
  fitness: ['ai-fitness-workout-completed-days', 'ai-fitness-daily-condition', 'ai-fitness-recovery-mode-days'],
  diet: ['ai-fitness-diet-completed-days', 'ai-fitness-diet-meal-log', 'ai-fitness-water-intake'],
  language: [...LANGUAGE_GUIDANCE_KEYS],
};
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function LocalRecordGuidance({ app, date, languagePath }: { app: App; date?: string; languagePath?: string }) {
  const languageState = useContext(LanguageRecordReadiness);
  // Only a fresh authenticated mount may resume after session invalidation.
  // A timer, route or readiness change cannot re-adopt leftover owner bytes.
  const sessionInvalid = useRef(false);
  const [snapshot, setSnapshot] = useState<{ app: App; date?: string; path?: string; guidance: Guidance; source?: SourceSnapshot } | null>(null);
  useEffect(() => {
    let stopped = false;
    let observation = 0;
    let pendingRead: AbortController | undefined;
    let lastLanguageInput: LanguageReplySnapshot | undefined;
    const publish = (guidance: Guidance, source?: SourceSnapshot) => {
      if (!stopped) setSnapshot(previous => previous?.app === app && previous.date === date && previous.path === languagePath && JSON.stringify(previous.guidance) === JSON.stringify(guidance) && JSON.stringify(previous.source) === JSON.stringify(source) ? previous : { app, date, path: languagePath, guidance, source });
    };
    const invalidate = () => { observation++; pendingRead?.abort(); lastLanguageInput = undefined; publish(unavailable(app === 'language' ? '학습' : app === 'diet' ? '식단' : '운동', 'loading')!); };
    const read = async () => {
      const ticket = ++observation;
      pendingRead?.abort();
      try {
        if (sessionInvalid.current || isRecordResetRunning()) { invalidate(); return; }
        const owner = localStorage.getItem('fitness-cloud-sync-user');
        const ready = app !== 'language' ? 'ready' : languageState;
        if (localStorage.getItem('yeoni-storage-transaction-v1') !== null || app === 'language' && localStorage.getItem('language-storage-transaction-v1') !== null) { invalidate(); return; }
        if (!owner || app === 'language' && localStorage.getItem('language-cloud-sync-user') !== owner) { invalidate(); return; }
        if (ready !== 'ready') { publish(unavailable('학습', ready)!); return; }
        if (app === 'language') {
          // Never offer the previous input as current while a new locked read waits.
          // Keep the local summary only while its owner/records are still current.
          if (!lastLanguageInput?.stillCurrent()) publish(unavailable('학습', 'loading')!);
          else setSnapshot(previous => previous?.source ? { ...previous, source: undefined } : previous);
          pendingRead = new AbortController();
          const snapshot = await readLanguageReplySnapshot(localStorage, owner, true, pendingRead.signal);
          if (stopped || observation !== ticket) return;
          if (sessionInvalid.current || isRecordResetRunning()) { invalidate(); return; }
          if (!snapshot.source.complete || !snapshot.stillCurrent()) { lastLanguageInput = undefined; publish(unavailable('학습', snapshot.state === 'error' ? 'error' : 'loading')!); return; }
          lastLanguageInput = snapshot;
          const records = snapshot.source.records as Record<string, unknown>;
          const values = LANGUAGE_GUIDANCE_KEYS.map(key => records[key]);
          publish(languageGuidance('ready', todayKey(), values[0], values[1], Date.now(), { routine: values[2], grammar: values[3], savedWords: values[4], wrongWords: values[5], wrongKana: values[6], wrongKanaChars: values[7], reviewed: values[8] }, languagePath), snapshot.source);
          return;
        }
        const values = keys[app].map((key) => {
          const raw = localStorage.getItem(key);
          const value: unknown = raw === null ? {} : JSON.parse(raw);
          if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved record');
          return value;
        });
        const today = todayKey(), selected = date ?? today;
        values.forEach((value, index) => {
          const row = object(value)[selected];
          if (row === undefined) return;
          if (app === 'diet' && index === 2) { if (typeof row !== 'number' || !Number.isFinite(row) || row < 0) throw new Error('Invalid water'); }
          else if (!(app === 'fitness' && index === 0 && typeof row === 'boolean') && (row === null || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid day record');
        });
        publish(app === 'diet' ? dietGuidance('ready', selected, today, object(values[0])[selected], object(values[1])[selected], object(values[2])[selected]) : fitnessGuidance('ready', selected, today, object(values[0])[selected], object(values[1])[selected], object(values[2])[selected]), replySource(owner, app, Object.fromEntries(keys[app].map((key, index) => [key, values[index]])), true));
      } catch { publish(unavailable(app === 'language' ? '학습' : app === 'diet' ? '식단' : '운동', 'error')!); }
    };
    read();
    // Existing writers include same-tab writes without an event. Observe only the
    // app's narrow saved keys; do not patch Storage or change save/sync behavior.
    const timer = window.setInterval(read, 1000);
    const events = ['storage', 'focus', 'yeoni-records-changed', 'yeoni-preference-owner-changed', ...(app === 'language' ? [LEVEL_JOURNEY_EVENT, CHUNK_REVIEW_EVENT] : [])];
    events.forEach(event => window.addEventListener(event, read));
    // Session invalidation fires before old records are removed: never read in it.
    const onSession = () => { sessionInvalid.current = true; invalidate(); };
    const onReset = () => { invalidate(); if (!isRecordResetRunning() && !sessionInvalid.current) void read(); };
    window.addEventListener('yeoni-cloud-session-changed', onSession);
    window.addEventListener(RECORD_RESET_EVENT, onReset);
    return () => { stopped = true; observation++; pendingRead?.abort(); clearInterval(timer); events.forEach(event => window.removeEventListener(event, read)); window.removeEventListener('yeoni-cloud-session-changed', onSession); window.removeEventListener(RECORD_RESET_EVENT, onReset); };
  }, [app, date, languageState, languagePath]);
  const sourceBlocked = sessionInvalid.current || isRecordResetRunning() || app === 'language' && languageState !== 'ready';
  const label = app === 'language' ? '학습' : app === 'diet' ? '식단' : '운동';
  const current = sourceBlocked ? unavailable(label, app === 'language' && languageState === 'error' ? 'error' : 'loading')! : snapshot?.app === app && snapshot.date === date && snapshot.path === languagePath ? snapshot.guidance : unavailable('저장된', 'loading')!;
  const source = !sourceBlocked && snapshot?.app === app && snapshot.date === date && snapshot.path === languagePath ? snapshot.source : undefined;
  return <span data-record-guidance={app}>{guidanceText(current)}<RecordReplyStatus source={source} /></span>;
}
