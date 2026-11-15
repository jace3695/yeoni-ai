"use client";

import RecordReplyStatus from '@/components/yeoni/RecordReplyStatus';
import { collectionGuidance, guidanceText } from "@/lib/yeoni/record-guidance";
import AppCompanion from "@/components/AppCompanion";
import GrowthResourceUsage from "@/components/GrowthResourceUsage";
import { resourceUsage } from "@/app/data/growthResourceUsage";
import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppIdentity from "../../components/AppIdentity";
import { type GrowthResourceClassification, type GrowthResourceRow } from "../../data/growthPlatform";
import { growthCategoryLabel, isRetiredGrowthRoutine, type GrowthCategoryId } from "../../data/growthRoutines";
import { supabase } from "../../lib/supabase";
import { readPendingResourceUpload, saveResourceUpload, type PendingResourceUpload } from "@/lib/growth-resource-upload";
import { useGrowthData } from "../useGrowthData";

const CLASSIFICATIONS: Array<{ id: GrowthResourceClassification; label: string }> = [
  { id: "direct", label: "바로 활용" },
  { id: "partial", label: "일부 활용" },
  { id: "reference", label: "참고" },
  { id: "duplicate", label: "중복" },
  { id: "deferred", label: "나중에" },
];

function normalizedMimeType(file: File) {
  const allowed = new Set(["application/pdf", "text/plain", "text/markdown", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
  if (allowed.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ({ md: "text/markdown", txt: "text/plain", pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as Record<string, string>)[extension || ""] || file.type;
}

function formatSize(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export default function GrowthResourcesPage() {
  const growth = useGrowthData(30);
  return <GrowthResourcesContent key={growth.user?.id ?? "signed-out"} growth={growth} />;
}

function GrowthResourcesContent({ growth }: { growth: ReturnType<typeof useGrowthData> }) {
  const availableRoutines = growth.routines.filter((routine) => !isRetiredGrowthRoutine(routine));
  const ownerId = growth.user?.id;
  const setGrowthNotice = growth.setNotice;
  const [resources, setResources] = useState<GrowthResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadGeneration = useRef(0);
  const [saving, setSaving] = useState(false);
  const uploadWorking = useRef(false);
  const uploadGeneration = useRef(0);
  const currentOwner = useRef(ownerId);
  if (currentOwner.current !== ownerId) { currentOwner.current = ownerId; uploadGeneration.current++; }
  const [pendingUpload, setPendingUpload] = useState<PendingResourceUpload | null>(null);
  const [journalError, setJournalError] = useState("");
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const refreshPending = useCallback(() => {
    try {
      setPendingUpload(ownerId ? readPendingResourceUpload(sessionStorage, ownerId) : null);
      setJournalError("");
    } catch (error) { setJournalError(error instanceof Error ? error.message : "미확인 업로드 정보를 읽지 못했어요."); }
  }, [ownerId]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [routineId, setRoutineId] = useState("");
  const [classification, setClassification] = useState<GrowthResourceClassification>("reference");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GrowthResourceClassification | "all">("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "revisit" | "unknown">("all");

  useEffect(() => {
    const deactivate = () => { uploadGeneration.current++; uploadWorking.current = false; };
    const invalidate = () => { deactivate(); setSaving(false); };
    const visibility = () => { if (document.visibilityState === "hidden") invalidate(); else refreshPending(); };
    const auth = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== ownerId) invalidate();
    });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", invalidate);
    return () => {
      deactivate();
      auth?.data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", invalidate);
    };
  }, [ownerId, refreshPending]);

  const load = useCallback(async () => {
    refreshPending();
    const generation = ++loadGeneration.current;
    if (!supabase || !ownerId) { setResources([]); setLoading(false); return; }
    setLoading(true);
    setLoadError("");
    try {
      const result = await supabase.from("growth_resources").select("*").eq("user_id", ownerId).order("created_at", { ascending: false }).abortSignal(AbortSignal.timeout(15_000));
      if (generation !== loadGeneration.current) return;
      if (result.error) setLoadError("자료 목록을 불러오지 못했어요. 다시 시도해 주세요.");
      else setResources((result.data ?? []) as GrowthResourceRow[]);
    } catch {
      if (generation !== loadGeneration.current) return;
      setLoadError("자료 목록을 불러오지 못했어요. 다시 시도해 주세요.");
    }
    setLoading(false);
  }, [ownerId, refreshPending]);

  const invalidateLoad = useCallback(() => { loadGeneration.current++; }, []);
  useEffect(() => { void load(); return invalidateLoad; }, [load, invalidateLoad]);

  const visibleResources = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    return resources.filter((resource) => resource.user_id === ownerId && (filter === "all" || resource.classification === filter) && (usageFilter === "all" || resourceUsage(resource.last_used_on).kind === usageFilter) && (!keyword || `${resource.title} ${resource.notes}`.toLocaleLowerCase("ko-KR").includes(keyword)));
  }, [filter, query, resources, ownerId, usageFilter]);

  const replaceResource = (row: GrowthResourceRow) => setResources(current => current.map(item => item.id === row.id ? row : item));

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > 10_485_760) { growth.setNotice("파일은 10MB 이하만 저장할 수 있어요."); event.target.value = ""; setFile(null); return; }
    setFile(selected);
    if (selected && !title) setTitle(selected.name.slice(0, 120));
  };

  const runUpload = async (mode: "new" | "check" | "retry") => {
    if (!supabase || !ownerId || saving || uploadWorking.current || journalError || document.visibilityState === "hidden") return;
    if (mode === "new" && (!file || !title.trim() || pendingUpload)) return;
    if (mode === "retry" && !retryConfirmed) return;
    uploadWorking.current = true;
    const generation = ++uploadGeneration.current;
    const owner = ownerId;
    const check = () => {
      if (generation !== uploadGeneration.current || currentOwner.current !== owner || document.visibilityState === "hidden") throw new Error("화면이나 계정이 변경되어 이전 업로드 처리를 중단했어요.");
    };
    setSaving(true); growth.setNotice("");
    try {
      const routine = availableRoutines.find((item) => item.id === routineId);
      const row = await saveResourceUpload(supabase, owner, sessionStorage, {
        ...(mode === "new" ? { input: {
          routine_id: routine?.id ?? null, title, category: (routine?.category ?? "reference") as GrowthCategoryId | "reference",
          mime_type: normalizedMimeType(file!), classification, notes,
        } } : {}), file, retryMissing: mode === "retry",
      }, check);
      check();
      setResources(current => [row, ...current.filter(item => item.id !== row.id)]);
      setFile(null); setTitle(""); setRoutineId(""); setClassification("reference"); setNotes(""); setRetryConfirmed(false);
      const input = document.getElementById("growth-resource-file") as HTMLInputElement | null;
      if (input) input.value = "";
      growth.setNotice("파일과 자료 정보의 저장을 확인했어요.");
    } catch (error) {
      if (generation === uploadGeneration.current && currentOwner.current === owner) growth.setNotice(error instanceof Error ? error.message : "저장 결과를 확인하지 못했어요. 파일을 자동 삭제하지 않았어요.");
    } finally {
      if (generation === uploadGeneration.current && currentOwner.current === owner) {
        refreshPending(); uploadWorking.current = false; setSaving(false);
      }
    }
  };
  const upload = (event: FormEvent) => { event.preventDefault(); void runUpload("new"); };

  const openResource = async (resource: GrowthResourceRow) => {
    if (!supabase) return;
    const result = await supabase.storage.from("growth-resources").createSignedUrl(resource.storage_path, 60);
    if (result.error || !result.data?.signedUrl) { growth.setNotice("자료를 열 수 있는 주소를 만들지 못했어요."); return; }
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const changeClassification = async (resource: GrowthResourceRow, value: GrowthResourceClassification) => {
    if (!supabase || !growth.user || saving) return;
    setSaving(true);
    const result = await supabase.from("growth_resources").update({ classification: value, updated_at: new Date().toISOString() }).eq("id", resource.id).eq("user_id", growth.user.id).select("*").single();
    if (result.error) growth.setNotice("분류를 바꾸지 못했어요.");
    else setResources((current) => current.map((item) => item.id === resource.id ? result.data as GrowthResourceRow : item));
    setSaving(false);
  };

  const remove = async (resource: GrowthResourceRow) => {
    if (!supabase || !growth.user || saving || uploadWorking.current || pendingUpload || journalError) return;
    setSaving(true);
    const fileResult = await supabase.storage.from("growth-resources").remove([resource.storage_path]);
    const rowResult = fileResult.error ? { error: fileResult.error } : await supabase.from("growth_resources").delete().eq("id", resource.id).eq("user_id", growth.user.id);
    if (rowResult.error) growth.setNotice("자료를 삭제하지 못했어요.");
    else { setResources((current) => current.filter((item) => item.id !== resource.id)); growth.setNotice("자료를 삭제했어요."); }
    setSaving(false);
  };

  return <main className="min-h-dvh bg-yeoni-bg pb-10 text-[#242231]">
    <header className="app-module-header"><div className="app-module-header-inner"><AppIdentity kind="growth" title="내 자료" subtitle="비공개 자료·활용일·다시 살펴보기" /><Link href="/growth" className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">자기계발 홈</Link></div></header>
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-9">
      <AppCompanion compact quiet>{guidanceText(collectionGuidance("자료", growth.loading || loading ? "loading" : !growth.dataReady || !ownerId || loadError ? "error" : "ready", resources.filter(row => row.user_id === ownerId).length))}<RecordReplyStatus /></AppCompanion>
      <section className="rounded-[28px] bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-bold text-emerald-600">비공개 자료함</p><h1 className="mt-1 text-2xl font-bold">자료 추가</h1><p className="mt-2 text-sm text-gray-500">PDF·텍스트·Word·JPG·PNG·WebP, 파일당 최대 10MB</p><form onSubmit={upload} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2"><input id="growth-resource-file" type="file" required disabled={saving} accept=".pdf,.txt,.md,.docx,.jpg,.jpeg,.png,.webp" onChange={chooseFile} className="min-h-12 min-w-0 w-full rounded-xl bg-gray-50 p-3 text-sm ring-1 ring-gray-200" /><input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="자료 이름" className="min-h-12 min-w-0 w-full rounded-xl bg-gray-50 px-4 text-sm ring-1 ring-gray-200" /><select value={routineId} onChange={(event) => setRoutineId(event.target.value)} className="min-h-12 min-w-0 w-full rounded-xl bg-gray-50 px-3 text-sm ring-1 ring-gray-200"><option value="">루틴 연결 없음</option>{availableRoutines.map((routine) => <option key={routine.id} value={routine.id}>{routine.title}</option>)}</select><select value={classification} onChange={(event) => setClassification(event.target.value as GrowthResourceClassification)} className="min-h-12 min-w-0 w-full rounded-xl bg-gray-50 px-3 text-sm ring-1 ring-gray-200">{CLASSIFICATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="메모(선택)" className="min-h-20 min-w-0 w-full rounded-xl bg-gray-50 p-3 text-sm ring-1 ring-gray-200 sm:col-span-2" /><button disabled={saving || !file || !title.trim() || !!pendingUpload || !!journalError} className="min-h-12 min-w-0 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:bg-gray-300 sm:col-span-2">{saving ? "저장 중…" : "비공개 자료 저장"}</button></form>
        {(pendingUpload || journalError) && <div role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">{journalError || `미확인 업로드: ${pendingUpload?.row.title}`}</p>
          <p className="mt-2">파일을 자동 삭제하지 않았어요. 자료 정보 없이 파일만 남았거나 이미 저장됐을 수 있어요. 새 업로드 대신 같은 요청을 확인해 주세요.</p>
          <p className="mt-2">이 탭의 확인 정보는 탭을 닫으면 사라질 수 있어요. 다른 탭·기기에서 새로 올리면 중복될 수 있어요.</p>
          {pendingUpload && !journalError && <>
            <button type="button" disabled={saving} onClick={() => void runUpload("check")} className="mt-3 min-h-11 rounded-xl bg-white px-3 font-bold disabled:opacity-50">저장 결과만 확인</button>
            <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={retryConfirmed} disabled={saving} onChange={event => setRetryConfirmed(event.target.checked)} className="mt-1" /><span>다른 곳에서 삭제한 자료가 아님을 확인했어요. 없으면 같은 자료를 다시 저장할게요.</span></label>
            <p className="mt-2 text-xs">파일도 없으면 위에서 처음 선택한 원본 파일을 다시 골라 주세요. 수정한 제목·메모 대신 처음 요청한 정보로 재시도해요.</p>
            <button type="button" disabled={saving || !retryConfirmed} onClick={() => void runUpload("retry")} className="mt-3 min-h-11 rounded-xl bg-amber-800 px-3 font-bold text-white disabled:opacity-50">같은 자료 저장 재시도</button>
          </>}
        </div>}
        {growth.notice && <p role="status" className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{growth.notice}</p>}</section>

      <section aria-label="저장된 자료" className="mt-5 rounded-[28px] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">자료 다시 살펴보기</h2><button disabled={loading || saving} onClick={() => void load()} className="min-h-10 rounded-xl bg-gray-100 px-3 text-xs font-bold text-gray-600 disabled:opacity-50">자료 새로고침</button></div>
        <p className="mb-4 text-xs leading-5 text-gray-500">직접 기록한 마지막 활용일에서 30일 이상 지난 자료를 모아볼 수 있어요. 미기록 자료의 실제 사용 여부는 알 수 없어요. 열기만으로 활용일이 바뀌지는 않아요.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input aria-label="자료 검색" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="자료 이름이나 메모 검색" className="min-h-12 min-w-0 flex-1 rounded-xl bg-gray-50 px-4 text-sm ring-1 ring-gray-200" />
          <select aria-label="자료 분류 필터" value={filter} onChange={(event) => setFilter(event.target.value as GrowthResourceClassification | "all")} className="min-h-12 rounded-xl bg-gray-50 px-3 text-sm ring-1 ring-gray-200"><option value="all">분류 전체</option>{CLASSIFICATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select aria-label="활용일 필터" value={usageFilter} onChange={event => setUsageFilter(event.target.value as typeof usageFilter)} className="min-h-12 rounded-xl bg-gray-50 px-3 text-sm ring-1 ring-gray-200"><option value="all">활용일 전체</option><option value="revisit">30일 이상 지난 자료</option><option value="unknown">활용일 미기록·확인 필요</option></select>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {loading || growth.loading ? <p className="py-8 text-sm text-gray-400">자료를 불러오고 있어요…</p> : loadError ? <p role="alert" className="py-8 text-sm text-amber-800 sm:col-span-2">{loadError}</p> : visibleResources.length ? visibleResources.map((resource) => {
            const routine = growth.routines.find((item) => item.id === resource.routine_id);
            return <article key={resource.id} aria-label={resource.title} className="min-w-0 rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-emerald-600">{resource.category === "reference" ? "참고 자료" : growthCategoryLabel(resource.category)}</p><h3 className="mt-1 break-words font-bold">{resource.title}</h3><p className="mt-1 text-xs text-gray-500">{formatSize(resource.size_bytes)}{routine ? ` · ${routine.title}` : ""}</p></div><button disabled={saving || !!pendingUpload || !!journalError} onClick={() => void remove(resource)} className="text-xl text-gray-300" aria-label="자료 삭제">×</button></div>
              {resource.notes && <p className="mt-3 line-clamp-2 text-xs leading-5 text-gray-600">{resource.notes}</p>}
              <div className="mt-4 flex gap-2"><select disabled={saving} aria-label={`${resource.title} 분류`} value={resource.classification} onChange={(event) => void changeClassification(resource, event.target.value as GrowthResourceClassification)} className="min-h-10 min-w-0 flex-1 rounded-xl bg-white px-2 text-xs ring-1 ring-gray-200">{CLASSIFICATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button onClick={() => void openResource(resource)} className="min-h-10 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white">열기</button></div>
              {ownerId && <GrowthResourceUsage resource={resource} owner={ownerId} disabled={saving} onBusy={setSaving} onRow={replaceResource} onNotice={setGrowthNotice} />}
            </article>;
          }) : <p className="py-8 text-center text-sm text-gray-400 sm:col-span-2">조건에 맞는 자료가 없습니다.</p>}
        </div>
      </section>
    </div>
  </main>;
}
