import { compareChunkGenerations } from "../../utils/japaneseChunkReview";
import { withLanguageRecordLock, recoverLanguageStorage, writeLanguageStorageBatch } from "../data/languageStorageLock";
import { supabase } from "./supabase";
import { APP_RECORD_KEYS, RECORD_RESET_STORAGE_EVENT, resetMarkerKey, type RecordResetApp } from "../data/appRecordReset";
import { getGrowthRoutinesStorageKey, parseGrowthRoutines } from "../data/growthRoutines";
import { pendingBudgetSaveKey } from "../budget/lib/pending-save";

// Bounded, tab-local proof. A cloud-synced marker (or an older client receipt)
// cannot substitute for this client's successful server verification.
let verifiedLanguageReset: { userId: string; marker: string } | null = null;

export function clearGrowthRecordBackup(userId: string, marker: string) {
  const key = getGrowthRoutinesStorageKey(userId);
  const raw = window.localStorage.getItem(key);
  if (raw !== null) window.localStorage.setItem(key, JSON.stringify(parseGrowthRoutines(raw).map(routine => ({ ...routine, completedDates: [] }))));
  window.localStorage.setItem(`${key}:cloud-migrated`, "1");
  window.localStorage.setItem(`${key}:sync-token`, marker);
  window.localStorage.removeItem(`${key}:legacy-import`);
  window.localStorage.setItem(`${key}:record-reset`, marker);
}

export async function resetAppRecords(app: RecordResetApp, requestId: string, expectedUserId: string) {
  if (app === "language") await withLanguageRecordLock(() => undefined);
  const run = () => performReset(app, requestId, expectedUserId);
  return typeof navigator.locks?.request === "function" ? navigator.locks.request(app === "growth" ? "ai-yeoni-growth-sync" : "ai-yeoni-record-reset", { mode: "exclusive" }, run) : run();
}

async function performReset(app: RecordResetApp, requestId: string, expectedUserId: string) {
  let verifiedEmptyLanguageState = false;
  const languageSession = app === "language" ? JSON.stringify(['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch'].map(key => window.localStorage.getItem(key))) : null;
  if (!supabase) throw new Error("클라우드 연결을 확인해 주세요.");
  if (!navigator.onLine) throw new Error("인터넷에 연결한 뒤 초기화해 주세요.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("로그인을 다시 확인해 주세요.");
  const userId = auth.user.id;
  if (!expectedUserId || userId !== expectedUserId) throw new Error("계정이 바뀌었어요. 초기화할 계정을 다시 확인해 주세요.");
  const { data, error } = await supabase.rpc("reset_my_app_records", { p_app: app, p_request_id: requestId, p_confirmation: "초기화" });
  if (error || data?.app !== app || data?.user_id !== userId || typeof data?.marker !== "string") {
    throw new Error("초기화 완료 여부를 확인하지 못했어요. 같은 버튼을 눌러 다시 확인해 주세요.");
  }
  if (app === "language") {
    // A valid receipt from an older server does not prove that newly added
    // record keys were removed. Verify before clearing this device's copy.
    const { data: remote, error: readError } = await supabase.from("language_user_state")
      .select("state").eq("user_id", userId).maybeSingle();
    const state: unknown = remote?.state;
    if (readError || !state || typeof state !== "object" || Array.isArray(state)
      || (state as Record<string, unknown>)[resetMarkerKey(app)] !== data.marker) {
      throw new Error("서버의 일본어 초기화 결과를 확인하지 못했어요. 이 기기의 기록은 지우지 않았으니 같은 버튼으로 다시 확인해 주세요.");
    }
    verifiedEmptyLanguageState = !APP_RECORD_KEYS.language.some(key => Object.hasOwn(state, key));
    // Only this client's own verified receipt permits newer work on retry.
    // A failed old-server reset can otherwise sync its incomplete marker here.
    const verifiedRepeat = verifiedLanguageReset?.userId === userId
      && verifiedLanguageReset.marker === data.marker
      && window.localStorage.getItem(resetMarkerKey(app)) === data.marker;
    if (!verifiedEmptyLanguageState && !verifiedRepeat) {
      throw new Error("서버에 일본어 학습 기록이 남아 있어 초기화를 완료로 표시하지 않았어요. 이 기기의 기록은 지우지 않았습니다. 서버 업데이트 상태를 확인해 주세요. 남은 기록을 모두 삭제하려면 필요한 기록을 먼저 보관하고, 다른 기기와 탭의 학습을 끝낸 뒤 화면을 새로고침해 주세요. 체크박스와 ‘초기화’ 입력으로 다시 확인하면 새로운 삭제 요청이 실행되며, 이전 요청 이후에 새로 만든 기록도 모두 삭제됩니다.");
    }
  }
  const { data: current } = await supabase.auth.getUser();
  if (current.user?.id !== userId) throw new Error("계정이 바뀌었어요. 원래 계정에서 초기화 결과를 확인해 주세요.");
  if (app === "budget") window.localStorage.removeItem(pendingBudgetSaveKey(userId));
  const clearLocal = () => {
    if (app === "language") {
      if (window.localStorage.getItem('language-cloud-sync-user') !== userId) throw new Error('계정이 바뀌었어요. 원래 계정에서 초기화 결과를 확인해 주세요.');
      const currentSession = JSON.stringify(['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch'].map(key => window.localStorage.getItem(key)));
      if (currentSession !== languageSession) throw new Error('계정 세션이 바뀌었어요. 원래 계정에서 초기화 결과를 확인해 주세요.');
      recoverLanguageStorage(window.localStorage);
      if (compareChunkGenerations(window.localStorage.getItem(resetMarkerKey(app)), data.marker) > 0) {
        throw new Error('더 최근의 일본어 초기화 기록이 있어요. 새 기록을 보존했으니 화면을 다시 확인해 주세요.');
      }
    }
    if (window.localStorage.getItem(resetMarkerKey(app)) !== data.marker) {
      if (app === "language") writeLanguageStorageBatch(window.localStorage, {
        ...Object.fromEntries(APP_RECORD_KEYS[app].map(key => [key, null])), [resetMarkerKey(app)]: data.marker,
      });
      else {
        for (const key of APP_RECORD_KEYS[app]) window.localStorage.removeItem(key);
        window.localStorage.setItem(resetMarkerKey(app), data.marker);
      }
    }
  };
  if (app === "language") await withLanguageRecordLock(clearLocal); else clearLocal();
  if (app === "language" && JSON.stringify(['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch'].map(key => window.localStorage.getItem(key))) !== languageSession) {
    throw new Error('계정 세션이 바뀌어 초기화 확인을 멈췄어요. 원래 계정에서 결과를 확인해 주세요.');
  }
  if (app === "language" && verifiedEmptyLanguageState) verifiedLanguageReset = { userId, marker: data.marker };
  if (app === "growth" && window.localStorage.getItem(`${getGrowthRoutinesStorageKey(userId)}:record-reset`) !== data.marker) clearGrowthRecordBackup(userId, data.marker);
  window.localStorage.setItem(RECORD_RESET_STORAGE_EVENT, JSON.stringify({ userId, app, marker: data.marker }));
  window.sessionStorage.setItem(`record-reset-receipt:${userId}:${app}`, "1");
  return data as { app: RecordResetApp; user_id: string; marker: string };
}
