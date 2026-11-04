"use client";

import { useState } from "react";
import { updateYeoniPreferences, resetAppYeoniPreferences, useYeoniPreferences, useYeoniPreferenceOwner } from "./useYeoniPreferences";
import { YEONI_APPS, type YeoniApp, type YeoniPreferences } from "@/utils/yeoniPreferences";
import styles from "./app-companion.module.css";

export default function YeoniPreferencesPanel({ app }: { app?: YeoniApp }) {
  const [selected, setSelected] = useState<YeoniApp>(app ?? 'assistant');
  const target = app ?? selected;
  const owner = useYeoniPreferenceOwner();
  return <section className={styles.preferences} aria-label="연이 캐릭터 설정">
    <h2>앱별 연이 설정</h2>
    {!app && <label className={styles.motion}>설정할 앱<select value={target} onChange={event => setSelected(event.target.value as YeoniApp)}>{Object.entries(YEONI_APPS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
    <PreferenceFields key={`${owner}:${target}`} app={target} owner={owner} />
  </section>;
}
function PreferenceFields({ app, owner }: { app: YeoniApp; owner: string | null }) {
  const preferences = useYeoniPreferences(app);
  const [message, setMessage] = useState('');
  const change = (value: Partial<YeoniPreferences>) => {
    try { updateYeoniPreferences(value, app, owner); setMessage(`${YEONI_APPS[app]} 앱에 저장했어요.`); }
    catch { setMessage('설정을 저장하지 못했어요. 로그인 계정과 기기 저장 공간을 확인해 주세요.'); }
  };
  return <>
    <p>{YEONI_APPS[app]}에서 사용할 모습과 움직임을 골라 주세요.</p>
    <label className={styles.motion}>연이 모습<select disabled={!owner} value={preferences.appearance ?? 'cat'} onChange={event => change({ appearance: event.target.value as 'cat' | 'human' })}><option value="cat">고양이형</option><option value="human">인간형</option></select></label>
    <label><input type="checkbox" disabled={!owner} checked={preferences.visible} onChange={event => change({ visible: event.target.checked })} />이 앱에서 연이 표시</label>
    <label className={styles.motion}>연이 움직임<select value={preferences.motion} disabled={!owner || !preferences.visible} onChange={event => change({ motion: event.target.value as YeoniPreferences['motion'] })}>
      <option value="reactions">절약 · 필요할 때만</option><option value="home">홈에서 가끔 반복</option><option value="off">모든 움직임 끄기</option>
    </select></label>
    <p className={styles.hint}>이 계정·이 기기의 선택한 앱에만 적용돼요. 별도 선택이 없는 앱은 기존 기기 공통 설정을 사용하며, 기존 값과 기록은 지우지 않아요.</p>
    <button type="button" disabled={!owner} onClick={() => { try { resetAppYeoniPreferences(app, owner); setMessage('이 앱은 기존 기기 공통 설정을 다시 사용해요.'); } catch { setMessage('설정을 바꾸지 못했어요. 계정과 저장 공간을 확인해 주세요.'); } }}>이 앱의 별도 선택 해제</button>
    <p className={styles.hint}>입력 중·집중 화면에서는 조용히 기다리고, 기기의 ‘동작 줄이기’도 따라요.</p>
    {message && <p className={styles.hint} role="status">{message}</p>}
  </>;
}
