"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/app/lib/supabase";
import { stableState } from "@/app/data/cloudSync";
import {
  applyLanguageState,
  prepareLanguageLocalState,
  readLanguageCacheOverview,
  readLanguageStateSafely,
  readLanguageSyncBase,
  saveLanguageSyncBase,
  mergeLanguageState,
  mergeLanguageStateFromBase,
} from "@/app/data/languageCloudSync";
import { LanguageStorageUnavailableError } from "@/app/data/languageStorageLock";
import { requestSafeReload } from "@/app/lib/unsavedChanges";
import { isRecordResetRunning, RECORD_RESET_EVENT } from "@/app/data/appRecordReset";

import { LanguageRecordReadiness } from "@/components/yeoni/LocalRecordGuidance";

type SyncStatus = "pending" | "syncing" | "synced" | "error" | "readonly";
type RemoteRow = { state: Record<string, unknown>; updated_at: string };

/** Do not mount ordinary lessons here: some legacy effects still write records.
 * This component is deliberately a small, read-only cache summary. */
function ReadOnlyLanguageCache({ userId }: { userId: string }) {
  const [overview, setOverview] = useState<ReturnType<typeof readLanguageCacheOverview>>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let invalidated = false;
    const read = () => {
      if (invalidated) return;
      try { setOverview(readLanguageCacheOverview(localStorage, userId)); setError(''); }
      catch { setOverview(null); setError('저장한 기록의 요약을 읽지 못했어요. 원본 기록은 변경하지 않았습니다.'); }
    };
    const invalidate = () => { invalidated = true; setOverview(null); };
    const events = ['storage', 'focus', 'ai-yeoni-record-reset'];
    read();
    events.forEach(event => window.addEventListener(event, read));
    window.addEventListener('yeoni-cloud-session-changed', invalidate);
    const interval = setInterval(read, 1000);
    return () => {
      invalidated = true;
      clearInterval(interval);
      events.forEach(event => window.removeEventListener(event, read));
      window.removeEventListener('yeoni-cloud-session-changed', invalidate);
    };
  }, [userId]);
  return <section className="mt-5 rounded-2xl border bg-white p-5" aria-live="polite">
    <h2 className="font-bold">이 기기의 학습 기록 요약 · 읽기 전용</h2>
    {overview ? <ul className="mt-3 space-y-2 text-sm">
      {overview.selectedLevel && <li>직접 선택한 단계: {overview.selectedLevel}</li>}
      <li>완료한 수업: {overview.completedLessons}개</li>
      <li>기록이 남은 학습일: {overview.studyDays}일</li>
      <li>저장한 단어: {overview.savedWords}개</li>
    </ul> : <p className="mt-3 text-sm">{error || '이 계정의 기기 기록을 안전하게 확인할 수 없어 표시하지 않았어요.'}</p>}
    <p className="mt-3 text-sm text-slate-600">기기에 남은 기록의 요약이며 최신 서버 기록 확인은 아닙니다. 새 답 저장·단계 변경·기록 초기화·동기화는 저장소 연결 후 이용할 수 있어요.</p>
  </section>;
}

export default function LanguageCloudSync({ children }: { children?: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>("syncing");
  const [initialized, setInitialized] = useState(false);
  const [readOnlyUser, setReadOnlyUser] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [syncRequest, setSyncRequest] = useState(0);

  useEffect(() => {
    setInitialized(false);
    setReadOnlyUser(null);
    setStatus("syncing");
    if (!supabase) { setStatus("error"); setMessage("학습 기록 연결 설정을 확인해 주세요."); return; }
    const authClient = supabase;
    let active = true;
    let resetVersion = 0;
    let syncing = false;
    let storageUnavailable = false;
    let verifiedUserId: string | undefined;
    let lastSnapshot = "";
    let observedLocal = "";
    let followUpTimer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let localWatch: ReturnType<typeof setInterval> | undefined;
    let localWatching = false;
    let syncVisibleChanges: (() => void) | undefined;
    const onReset = () => { resetVersion += 1; };
    window.addEventListener(RECORD_RESET_EVENT, onReset);

    const initialize = async () => {
      const { data: auth } = await authClient.auth.getUser();
      if (!active) return;
      if (!auth.user) {
        setStatus("error");
        setMessage("로그인 상태를 확인하지 못했습니다.");
        return;
      }
      const userId = auth.user.id;
      verifiedUserId = userId;
      const enterReadOnly = (error: LanguageStorageUnavailableError) => {
        storageUnavailable = true;
        setInitialized(false);
        setReadOnlyUser(userId);
        setStatus("readonly");
        setMessage(error.message);
      };
      try {
        await prepareLanguageLocalState(userId, () => { if (!active) throw new Error("학습 기록 요청이 종료됐어요."); });
      } catch (error) {
        if (active && error instanceof LanguageStorageUnavailableError) {
          enterReadOnly(error);
          return;
        }
        throw error;
      }
      if (!active) return;
      const sessionEpoch = window.localStorage.getItem("language-cloud-sync-epoch");
      const fitnessEpoch = window.localStorage.getItem("fitness-cloud-sync-epoch");
      const fitnessOwner = window.localStorage.getItem("fitness-cloud-sync-user");
      observedLocal = stableState(await readLanguageStateSafely(() => {
        if (!active || window.localStorage.getItem("language-cloud-sync-user") !== userId) throw new Error("학습 기록 요청이 종료됐어요.");
      }));
      if (!active) return;

      const isOwner = () => {
        try { return window.localStorage.getItem("language-cloud-sync-user") === userId
          && window.localStorage.getItem("language-cloud-sync-epoch") === sessionEpoch
          && window.localStorage.getItem("fitness-cloud-sync-epoch") === fitnessEpoch
          && window.localStorage.getItem("fitness-cloud-sync-user") === fitnessOwner; }
        catch { return false; }
      };
      const getRemote = async (check: () => void): Promise<RemoteRow | null> => {
        check();
        const { data, error } = await authClient.from("language_user_state")
          .select("state, updated_at").eq("user_id", userId).maybeSingle();
        check();
        if (error) throw error;
        return data as RemoteRow | null;
      };

      const verifyRemote = async (expected: Record<string, unknown>, check: () => void) => {
        const confirmed = await getRemote(check);
        if (!confirmed || stableState(confirmed.state) !== stableState(expected)) {
          throw new Error("저장 후 서버 학습 기록이 달라졌습니다. 기기 기록은 보존했으니 다시 시도해 주세요.");
        }
      };

      const insertRemote = async (state: Record<string, unknown>, check: () => void) => {
        check();
        const { error } = await authClient.from("language_user_state").insert({
          user_id: userId,
          state,
          updated_at: new Date().toISOString(),
        });
        check();
        if (error) throw error;
        await verifyRemote(state, check);
      };

      const updateRemote = async (state: Record<string, unknown>, expectedUpdatedAt: string, check: () => void) => {
        check();
        const { data, error } = await authClient.from("language_user_state")
          .update({ state, updated_at: new Date().toISOString() })
          .eq("user_id", userId).eq("updated_at", expectedUpdatedAt)
          .select("updated_at").maybeSingle();
        check();
        if (error) throw error;
        if (!data) return false;
        await verifyRemote(state, check);
        return true;
      };

      const scheduleFollowUp = (delay = 250) => {
        if (!active || storageUnavailable || isRecordResetRunning()) return;
        setStatus("pending");
        clearTimeout(followUpTimer);
        followUpTimer = setTimeout(() => void sync(), delay);
      };

      const sync = async (initial = false) => {
        if (syncing || !active || storageUnavailable || isRecordResetRunning()) return;
        const version = resetVersion;
        const cancelled = () => !active || storageUnavailable || !isOwner() || version !== resetVersion || isRecordResetRunning();
        const check = () => { if (cancelled()) throw new Error("학습 기록 요청이 종료됐어요."); };
        syncing = true;
        setStatus("syncing");
        setMessage("");
        try {
          let local = await readLanguageStateSafely(check);
          let remoteRow = await getRemote(check);
          if (cancelled()) return;
          local = await readLanguageStateSafely(check);
          let remote = remoteRow?.state ?? {};
          const localHash = stableState(local);
          const remoteHash = stableState(remote);

          if (!remoteRow) {
            await insertRemote(local, check);
            if (cancelled()) return;
            lastSnapshot = localHash;
            await saveLanguageSyncBase(userId, local, check);
            check();
          } else if (!lastSnapshot || initial) {
            const base = readLanguageSyncBase(userId);
            let merged = base ? mergeLanguageStateFromBase(base, remote, local) : mergeLanguageState(remote, local);
            let saved = stableState(merged) === remoteHash;
            for (let attempt = 0; attempt < 4 && !saved; attempt += 1) {
              saved = await updateRemote(merged, remoteRow.updated_at, check);
              if (cancelled()) return;
              if (!saved) {
                remoteRow = await getRemote(check);
                if (!remoteRow) break;
                remote = remoteRow.state;
                merged = mergeLanguageStateFromBase(base ?? {}, remote, local);
              }
            }
            if (!saved) throw new Error("다른 기기의 학습 기록이 변경됐습니다. 다시 동기화해 주세요.");
            if (cancelled()) return;
            await applyLanguageState(merged, local, check);
            check();
            lastSnapshot = stableState(merged);
            await saveLanguageSyncBase(userId, merged, check);
            check();
            if (local.languageRecordResetV1 !== merged.languageRecordResetV1) requestSafeReload();
          } else {
            const localChanged = localHash !== lastSnapshot;
            const remoteChanged = remoteHash !== lastSnapshot;
            if (localChanged && remoteChanged) {
              const base = readLanguageSyncBase(userId) ?? {};
              let merged = mergeLanguageStateFromBase(base, remote, local);
              let saved = false;
              for (let attempt = 0; attempt < 4 && !saved; attempt += 1) {
                saved = await updateRemote(merged, remoteRow.updated_at, check);
                if (cancelled()) return;
                if (!saved) {
                  remoteRow = await getRemote(check);
                  if (!remoteRow) break;
                  merged = mergeLanguageStateFromBase(base, remoteRow.state, local);
                }
              }
              if (!saved) throw new Error("다른 기기의 학습 기록이 변경됐습니다. 다시 동기화해 주세요.");
              if (cancelled()) return;
              await applyLanguageState(merged, local, check);
              check();
              lastSnapshot = stableState(merged);
              await saveLanguageSyncBase(userId, merged, check);
              check();
              if (local.languageRecordResetV1 !== merged.languageRecordResetV1) requestSafeReload();
            } else if (localChanged) {
              const saved = await updateRemote(local, remoteRow.updated_at, check);
              if (!saved) throw new Error("다른 기기의 학습 기록이 변경됐습니다. 다시 동기화해 주세요.");
              if (cancelled()) return;
              lastSnapshot = localHash;
              await saveLanguageSyncBase(userId, local, check);
              check();
            } else if (remoteChanged) {
              await applyLanguageState(remote, local, check);
              check();
              lastSnapshot = remoteHash;
              await saveLanguageSyncBase(userId, remote, check);
              check();
              if (local.languageRecordResetV1 !== remote.languageRecordResetV1) requestSafeReload();
            }
          }

          if (!cancelled()) {
            const latestHash = stableState(await readLanguageStateSafely(check));
            check();
            observedLocal = latestHash;
            const pending = latestHash !== lastSnapshot;
            setStatus(pending ? "pending" : "synced");
            if (pending) scheduleFollowUp();
          }
        } catch (error) {
          if (!cancelled()) {
            if (error instanceof LanguageStorageUnavailableError) { enterReadOnly(error); return; }
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "학습 기록 동기화에 실패했습니다.");
          }
        } finally {
          syncing = false;
        }
      };

      await sync(true);
      if (!active || !isOwner() || storageUnavailable) return;
      setInitialized(true);
      syncVisibleChanges = () => {
        if (document.visibilityState === "visible") void sync();
      };
      interval = setInterval(syncVisibleChanges, 30_000);
      localWatch = setInterval(() => {
        if (localWatching || !active || storageUnavailable || !isOwner() || document.visibilityState !== "visible" || isRecordResetRunning()) return;
        localWatching = true;
        void (async () => {
          try {
            const next = stableState(await readLanguageStateSafely(() => {
              if (!active || storageUnavailable || !isOwner() || isRecordResetRunning()) throw new Error("학습 기록 요청이 종료됐어요.");
            }));
            if (!active || storageUnavailable || !isOwner() || isRecordResetRunning()) return;
            if (next === observedLocal) return;
            observedLocal = next;
            scheduleFollowUp();
          } catch (error) {
            if (active && !storageUnavailable && isOwner() && !isRecordResetRunning()) {
              if (error instanceof LanguageStorageUnavailableError) { enterReadOnly(error); return; }
              setStatus("error");
              setMessage(error instanceof Error ? error.message : "기존 학습 기록을 확인해 주세요.");
            }
          } finally { localWatching = false; }
        })();
      }, 500);
      document.addEventListener("visibilitychange", syncVisibleChanges);
      window.addEventListener("focus", syncVisibleChanges);
      window.addEventListener("online", syncVisibleChanges);
    };

    void initialize().catch((error) => {
      if (!active) return;
      if (error instanceof LanguageStorageUnavailableError && verifiedUserId) {
        storageUnavailable = true;
        setInitialized(false);
        setReadOnlyUser(verifiedUserId);
        setStatus("readonly");
      } else setStatus("error");
      setMessage(error instanceof Error ? error.message : "학습 기록 연결에 실패했습니다.");
    });
    return () => {
      active = false;
      window.removeEventListener(RECORD_RESET_EVENT, onReset);
      clearTimeout(followUpTimer);
      if (interval) clearInterval(interval);
      if (localWatch) clearInterval(localWatch);
      if (syncVisibleChanges) {
        document.removeEventListener("visibilitychange", syncVisibleChanges);
        window.removeEventListener("focus", syncVisibleChanges);
        window.removeEventListener("online", syncVisibleChanges);
      }
    };
  }, [syncRequest]);

  const retry = () => { setInitialized(false); setSyncRequest(value => value + 1); };
  const needsAttention = status === "error" || status === "readonly";
  const label = status === "readonly" ? "학습 기록 · 읽기 전용" : status === "syncing"
    ? "학습 기록 · 서버 반영 중…"
    : status === "synced"
      ? "학습 기록 · 서버 저장 확인"
      : status === "pending"
        ? "학습 기록 · 기기 저장, 서버 반영 대기"
        : "학습 기록 · 동기화 확인 필요";

  return <LanguageRecordReadiness.Provider value={!initialized || status === "syncing" ? "loading" : needsAttention ? "error" : "ready"}>
    {initialized && status !== "readonly" ? children : <section style={{ padding: 24 }} aria-live="polite"><p>{needsAttention ? message || "학습 기록 연결을 확인하지 못했어요. 잠시 후 다시 열어 주세요." : "이 계정의 학습 기록을 준비하고 있어요."}</p>{needsAttention && <button type="button" className="btn" onClick={retry}>다시 연결하기</button>}{needsAttention && <a href="/" className="btn ml-2">홈으로 돌아가기</a>}{status === "readonly" && readOnlyUser && <ReadOnlyLanguageCache userId={readOnlyUser} />}</section>}
    <div role={needsAttention ? "alert" : "status"} className={`yeoni-sync-notice fixed z-[95] flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold shadow-md ring-1 backdrop-blur ${needsAttention ? "bg-red-50/95 text-red-700 ring-red-200" : status === "synced" ? "bg-emerald-50/95 text-emerald-700 ring-emerald-200" : "bg-amber-50/95 text-amber-700 ring-amber-200"}`}>
      <span>{label}</span>
      {needsAttention && <button type="button" onClick={retry} className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-red-700 shadow-sm">다시 시도</button>}
    </div>
    {needsAttention && message && <span className="sr-only">{message}</span>}
  </LanguageRecordReadiness.Provider>;
}
