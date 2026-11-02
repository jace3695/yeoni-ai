"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import AppIdentity from "../components/AppIdentity";
import { GROWTH_ROUTINE_LIMIT, isRetiredGrowthRoutine } from "../data/growthRoutines";
import { ALL_GROWTH_WEEKDAYS, GROWTH_WEEKDAYS, formatGrowthPreferredDays, isGrowthRoutineScheduled } from "../data/growthSchedule";
import { shiftDateKey } from "../data/growthPlatform";
import type { GrowthRoutineRow } from "../data/growthPlatform";
import { checklistCompleted } from "@/lib/growth-checklist";
import { getLocalDateKey } from "@/utils/dateKey";
import { useGrowthData } from "./useGrowthData";
import styles from "./checklist.module.css";

export default function GrowthPage() {
  const growth = useGrowthData(90);
  const [today, setToday] = useState(getLocalDateKey);
  const [date, setDate] = useState(getLocalDateKey);
  const [editing, setEditing] = useState<string | null>(null);
  const [category, setCategory] = useState<"custom" | "handwriting">("custom");
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<number[]>([...ALL_GROWTH_WEEKDAYS]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const viewEpoch = useRef(0);
  const editor = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refreshDate = () => {
      const next = getLocalDateKey();
      setToday(previous => {
        if (previous !== next) setDate(selected => selected === previous ? next : selected);
        return next;
      });
    };
    const timer = setInterval(refreshDate, 1000);
    window.addEventListener('focus', refreshDate);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshDate); };
  }, []);

  useEffect(() => {
    viewEpoch.current += 1;
    inFlight.current = false;
    setBusy(false); setMessage(""); setEditing(null); setCategory("custom"); setTitle(""); setDays([...ALL_GROWTH_WEEKDAYS]);
    return () => { viewEpoch.current += 1; };
  }, [growth.user?.id]);

  const routines = growth.routines.filter(row => !isRetiredGrowthRoutine(row));
  const active = routines.filter(row => row.enabled);
  const archived = routines.filter(row => !row.enabled);
  const scheduled = active.filter(row => isGrowthRoutineScheduled(row, date));
  const other = active.filter(row => !isGrowthRoutineScheduled(row, date));
  const ready = growth.dataReady && !growth.loading && !busy;
  const run = async (action: (isCurrent: () => boolean) => Promise<void>, success: string) => {
    if (inFlight.current || !growth.dataReady) return;
    const epoch = viewEpoch.current;
    inFlight.current = true;
    setBusy(true); setMessage(""); growth.setNotice("");
    try { await action(() => epoch === viewEpoch.current); if (epoch === viewEpoch.current) setMessage(success); }
    catch { if (epoch === viewEpoch.current) setMessage("저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요."); }
    finally { if (epoch === viewEpoch.current) { inFlight.current = false; setBusy(false); } }
  };
  const resetEditor = () => { setEditing(null); setCategory("custom"); setTitle(""); setDays([...ALL_GROWTH_WEEKDAYS]); };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !days.length || (!editing && routines.length >= GROWTH_ROUTINE_LIMIT)) return;
    if (isRetiredGrowthRoutine({ title })) { setMessage("종료된 기본 과정 이름이에요. 다른 활동 이름을 입력해 주세요."); return; }
    void run(async (isCurrent) => {
      const result = editing
        ? await growth.updateRoutine(editing, { title: title.trim(), preferred_days: [...days].sort((a,b) => a-b), target_sessions_per_week: days.length })
        : await growth.addRoutine({ title, category, targetMinutes: 5, preferredDays: days, targetSessionsPerWeek: days.length });
      if (result.error) throw result.error;
      if (isCurrent()) resetEditor();
    }, editing ? "활동을 수정했어요. 이전 완료 기록은 그대로예요." : "활동을 추가했어요.");
  };
  const edit = (routine: GrowthRoutineRow) => {
    setEditing(routine.id); setTitle(routine.title); setDays([...routine.preferred_days]);
    editor.current?.focus();
    editor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const archive = (routine: GrowthRoutineRow) => void run(async (isCurrent) => {
    const result = await growth.updateRoutine(routine.id, { enabled: !routine.enabled });
    if (result.error) throw result.error;
    if (isCurrent() && editing === routine.id) resetEditor();
  }, routine.enabled ? "보관했어요. 완료 기록과 요일은 유지됩니다." : "활동을 복원했어요.");
  const renderActivity = (routine: GrowthRoutineRow) => {
    const checked = checklistCompleted(growth.sessions, routine.id, date);
    return <li key={routine.id} className={styles.activity}>
      <label className={styles.check}><input type="checkbox" checked={checked} disabled={!ready} onChange={event => {
        const completed = event.target.checked;
        void run(() => growth.setCompleted(routine, date, completed), completed ? `${date} 완료로 저장했어요.` : `${date} 완료 체크를 해제했어요.`);
      }} /><span><strong>{routine.title}</strong><small>{formatGrowthPreferredDays(routine.preferred_days)}{checked ? " · 완료" : ""}</small></span></label>
      <div className={styles.actions}><button disabled={!ready} onClick={() => edit(routine)}>수정</button><button disabled={!ready} onClick={() => archive(routine)}>보관</button></div>
    </li>;
  };

  return <main className={styles.page}>
    <header className={styles.header}><AppIdentity kind="growth" title="자기계발" subtitle="내가 정하는 작은 실천" /><Link href="/">홈</Link></header>
    <section className={styles.hero}><h1>내가 하고 싶은 일, 하나씩</h1><p>활동과 요일을 정하고, 마친 날에 체크해요.</p></section>
    <section className={styles.panel} aria-label="기본 학습과 연습"><h2>앱에 있는 기본 기능</h2><p>활동을 등록하지 않아도 바로 시작할 수 있어요. 직접 정할 활동과 요일은 아래에서 관리해요.</p>
      <nav className={styles.actions} aria-label="기본 기능"><Link href="/growth/handwriting">손글씨 수업 · 53개 수업</Link><Link href="/growth/handwriting/free">손글씨 자유 연습</Link><Link href="/language">일본어 학습</Link><Link href="/fitness">운동</Link><Link href="/growth/resources">내 자료</Link></nav>
      {growth.dataReady && !routines.some(row => row.category === 'handwriting') && <button disabled={!ready} onClick={() => { resetEditor(); setCategory('handwriting'); setTitle('손글씨 연습'); editor.current?.focus(); }}>선택: 손글씨를 내 요일 일정에도 추가</button>}
    </section>
    <form className={styles.panel} onSubmit={save}>
      <h2>{editing ? "활동 수정" : category === "handwriting" ? "손글씨 요일 일정 추가" : "직접 정하는 활동"}</h2>
      <fieldset disabled={!ready}><label className={styles.name}>활동 이름<input ref={editor} value={title} maxLength={60} required placeholder="예: 책 10쪽 읽기" onChange={event => setTitle(event.target.value)} /></label>
      <fieldset className={styles.days}><legend>진행할 요일 · 하나 이상 선택</legend>{GROWTH_WEEKDAYS.map(day => <label key={day.id}><input type="checkbox" checked={days.includes(day.id)} onChange={event => setDays(previous => event.target.checked ? [...new Set([...previous, day.id])] : previous.filter(value => value !== day.id))} /><span>{day.label}</span></label>)}</fieldset>
      {!days.length && <p role="status">진행할 요일을 하나 이상 선택해 주세요.</p>}
      <div className={styles.actions}><button className={styles.primary} disabled={!title.trim() || !days.length || (!editing && routines.length >= GROWTH_ROUTINE_LIMIT)}>{editing ? "수정 저장" : "활동 추가"}</button>{(editing || category === "handwriting") && <button type="button" onClick={resetEditor}>취소</button>}</div>
      {!editing && routines.length >= GROWTH_ROUTINE_LIMIT && <p>활동은 보관한 항목을 포함해 {GROWTH_ROUTINE_LIMIT}개까지 등록할 수 있어요. 기존 활동을 수정해 주세요.</p>}</fieldset>
    </form>
    {(message || growth.notice) && <p role="status" className={styles.notice}>{growth.notice || message}</p>}
    {growth.loading && <p role="status">기록을 불러오고 있어요.</p>}
    {!growth.loading && !growth.dataReady && <button onClick={() => void growth.refresh()}>다시 불러오기</button>}
    {growth.legacyBackupAvailable && <button disabled={busy} onClick={() => void run(async () => { const result = await growth.importLegacyBackup(); if (result.error) throw result.error; }, "이전 기록을 가져왔어요.")}>이전 기기 기록 가져오기</button>}
    <section className={styles.panel}>
      <div className={styles.dateRow}><h2>{date === today ? "오늘 할 일" : "날짜별 체크"}</h2><label>날짜<input type="date" value={date} max={today} min={shiftDateKey(today, -89)} onChange={event => { if (event.target.value >= shiftDateKey(today, -89) && event.target.value <= today) setDate(event.target.value); }} /></label></div>
      <p className={styles.hint}>기기의 현지 날짜를 기준으로 저장해요. 최근 90일을 확인할 수 있어요.</p>
      {growth.dataReady && <><p>{scheduled.filter(row => checklistCompleted(growth.sessions, row.id, date)).length} / {scheduled.length} 완료</p>
      {scheduled.length ? <ul>{scheduled.map(renderActivity)}</ul> : <p className={styles.empty}>{active.length ? "이 날짜에 예정된 활동이 없어요. 편하게 쉬어도 좋아요." : "아직 활동이 없어요. 위에서 하고 싶은 일을 추가해 주세요."}</p>}
      {!!other.length && <details><summary>다른 요일의 활동 ({other.length})</summary><p className={styles.hint}>예정에 없는 날은 미완료로 계산하지 않아요. 원하면 체크할 수 있어요.</p><ul>{other.map(renderActivity)}</ul></details>}</>}
    </section>
    {!!archived.length && <details className={styles.panel}><summary>보관한 활동 ({archived.length})</summary><p className={styles.hint}>다시 시작하면 기존 요일과 완료 기록이 이어져요.</p><ul>{archived.map(row => <li key={row.id} className={styles.activity}><span>{row.title}<small>{formatGrowthPreferredDays(row.preferred_days)}</small></span><button disabled={!ready} onClick={() => archive(row)}>복원</button></li>)}</ul></details>}
    <nav className={styles.actions} aria-label="다른 기록"><Link href="/fitness">운동</Link><Link href="/language">일본어</Link><Link href="/growth/settings">기록 설정</Link></nav>
  </main>;
}
