"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from 'next/navigation';
import { DEFAULT_YEONI_PREFERENCES, parseYeoniPreferences, YEONI_PREFERENCES_KEY, parseAppYeoniPreferences, yeoniAppPreferencesKey, yeoniAppForPath, YEONI_APP_PREFERENCES_PREFIX, YEONI_PREFERENCE_OWNER_EVENT, type YeoniApp, type YeoniPreferences } from "@/utils/yeoniPreferences";

const initial = { owner: null as string | null, fallback: DEFAULT_YEONI_PREFERENCES, apps: {} as Partial<Record<YeoniApp, YeoniPreferences>> };
let snapshot = initial;
const listeners = new Set<() => void>();
function notify(next: typeof initial) {
  if (JSON.stringify(snapshot) === JSON.stringify(next)) return;
  snapshot = next; listeners.forEach(listener => listener());
}
function refresh() {
  try {
    const owner = localStorage.getItem('fitness-cloud-sync-user');
    notify({ owner, fallback: parseYeoniPreferences(localStorage.getItem(YEONI_PREFERENCES_KEY), localStorage.getItem('integratedLearningSettingsV1')), apps: parseAppYeoniPreferences(localStorage.getItem(yeoniAppPreferencesKey(owner))) });
  } catch { notify(initial); }
}
function onStorage(event: StorageEvent) {
  if (!event.key || event.key === YEONI_PREFERENCES_KEY || event.key === 'integratedLearningSettingsV1' || event.key === 'fitness-cloud-sync-user' || event.key.startsWith(YEONI_APP_PREFERENCES_PREFIX)) refresh();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage);
    window.addEventListener(YEONI_PREFERENCE_OWNER_EVENT, refresh);
    refresh();
  }
  return () => { listeners.delete(listener); if (!listeners.size) {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(YEONI_PREFERENCE_OWNER_EVENT, refresh);
  } };
}
const getSnapshot = () => snapshot;
const getServerSnapshot = () => initial;
export function useYeoniPreferences(app?: YeoniApp) {
  const path = usePathname();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return state.apps[app ?? yeoniAppForPath(path ?? '/')] ?? state.fallback;
}
export function useYeoniPreferenceOwner() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).owner;
}
export function updateYeoniPreferences(change: Partial<YeoniPreferences>, app: YeoniApp = yeoniAppForPath(window.location.pathname), expectedOwner?: string | null) {
  refresh();
  if (!snapshot.owner || (expectedOwner !== undefined && expectedOwner !== snapshot.owner)) throw new Error('설정을 바꿀 계정을 다시 확인해 주세요.');
  const next = parseYeoniPreferences(JSON.stringify({ ...(snapshot.apps[app] ?? snapshot.fallback), ...change }));
  const apps = { ...snapshot.apps, [app]: next };
  const key = yeoniAppPreferencesKey(snapshot.owner);
  localStorage.setItem(key, JSON.stringify(apps));
  notify({ ...snapshot, apps });
}
export function resetAppYeoniPreferences(app: YeoniApp, expectedOwner: string | null) {
  refresh();
  if (!snapshot.owner || expectedOwner !== snapshot.owner) throw new Error('설정을 바꿀 계정을 다시 확인해 주세요.');
  const apps = { ...snapshot.apps }; delete apps[app];
  const key = yeoniAppPreferencesKey(snapshot.owner);
  localStorage.setItem(key, JSON.stringify(apps));
  notify({ ...snapshot, apps });
}
