"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { dietGuidance, fitnessGuidance, guidanceText, languageGuidance, object, unavailable, type Guidance, type RecordState } from '@/lib/yeoni/record-guidance';

// Read-only status from the existing language sync boundary; never starts a request.
export const LanguageRecordReadiness = createContext<RecordState>('loading');
type App = 'fitness' | 'diet' | 'language';
const keys: Record<App, string[]> = {
  fitness: ['ai-fitness-workout-completed-days', 'ai-fitness-daily-condition', 'ai-fitness-recovery-mode-days'],
  diet: ['ai-fitness-diet-completed-days', 'ai-fitness-diet-meal-log', 'ai-fitness-water-intake'],
  language: ['japaneseCurriculumProgressV1', 'japaneseCurriculumReviewV1'],
};
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function LocalRecordGuidance({ app, date }: { app: App; date?: string }) {
  const languageState = useContext(LanguageRecordReadiness);
  const [snapshot, setSnapshot] = useState<{ app: App; date?: string; guidance: Guidance } | null>(null);
  useEffect(() => {
    let stopped = false;
    const publish = (guidance: Guidance) => {
      if (!stopped) setSnapshot(previous => previous?.app === app && previous.date === date && JSON.stringify(previous.guidance) === JSON.stringify(guidance) ? previous : { app, date, guidance });
    };
    const invalidate = () => publish(unavailable(app === 'language' ? '학습' : app === 'diet' ? '식단' : '운동', 'loading')!);
    const read = () => {
      try {
        const owner = localStorage.getItem('fitness-cloud-sync-user');
        const ready = app !== 'language' ? 'ready' : languageState;
        if (localStorage.getItem('yeoni-storage-transaction-v1')) { invalidate(); return; }
        if (!owner || app === 'language' && localStorage.getItem('language-cloud-sync-user') !== owner) { invalidate(); return; }
        if (ready !== 'ready') { publish(unavailable('학습', ready)!); return; }
        const values = keys[app].map((key, index) => {
          const raw = localStorage.getItem(key);
          const value: unknown = raw === null ? (app === 'language' && index === 1 ? [] : {}) : JSON.parse(raw);
          if (app === 'language' && index === 1 ? !Array.isArray(value) : value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved record');
          return value;
        });
        const today = todayKey(), selected = date ?? today;
        if (app !== 'language') values.forEach((value, index) => {
          const row = object(value)[selected];
          if (row === undefined) return;
          if (app === 'diet' && index === 2) { if (typeof row !== 'number' || !Number.isFinite(row) || row < 0) throw new Error('Invalid water'); }
          else if (!(app === 'fitness' && index === 0 && typeof row === 'boolean') && (row === null || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid day record');
        });
        publish(app === 'language' ? languageGuidance('ready', today, values[0], values[1], Date.now()) : app === 'diet' ? dietGuidance('ready', selected, today, object(values[0])[selected], object(values[1])[selected], object(values[2])[selected]) : fitnessGuidance('ready', selected, today, object(values[0])[selected], object(values[1])[selected], object(values[2])[selected]));
      } catch { publish(unavailable(app === 'language' ? '학습' : app === 'diet' ? '식단' : '운동', 'error')!); }
    };
    read();
    // Existing writers include same-tab writes without an event. Observe only the
    // app's narrow saved keys; do not patch Storage or change save/sync behavior.
    const timer = window.setInterval(read, 1000);
    const events = ['storage', 'focus', 'yeoni-records-changed', 'yeoni-preference-owner-changed'];
    events.forEach(event => window.addEventListener(event, read));
    // Session invalidation fires before old records are removed: never read in it.
    window.addEventListener('yeoni-cloud-session-changed', invalidate);
    return () => { stopped = true; clearInterval(timer); events.forEach(event => window.removeEventListener(event, read)); window.removeEventListener('yeoni-cloud-session-changed', invalidate); };
  }, [app, date, languageState]);
  const current = app === 'language' && languageState !== 'ready' ? unavailable('학습', languageState)! : snapshot?.app === app && snapshot.date === date ? snapshot.guidance : unavailable('저장된', 'loading')!;
  return <span data-record-guidance={app}>{guidanceText(current)}</span>;
}
