"use client";

import { useId, useState } from "react";
import { updateYeoniPreferences, resetAppYeoniPreferences, useYeoniPreferences, useYeoniPreferenceOwner } from "./useYeoniPreferences";
import { YEONI_APPS, type YeoniApp, type YeoniPreferences } from "@/utils/yeoniPreferences";
import styles from "./app-companion.module.css";

export default function YeoniPreferencesPanel({ app }: { app?: YeoniApp }) {
  const owner = useYeoniPreferenceOwner();
  const motionHelpId = useId();
  // Calendar has no character UI; retain its stored preference data for compatibility.
  const apps = (app ? [app] : Object.keys(YEONI_APPS) as YeoniApp[]).filter(target => target !== 'calendar');
  if (apps.length === 0) return null;
  return <section className={styles.preferences} aria-label="연이 캐릭터 설정">
    <h2>앱별 연이 설정</h2>
    <p id={motionHelpId} className={styles.hint}>캐릭터 움직임만 바꾸는 설정이며, 요금이나 AI 사용량과는 관계없어요. 옵션 차이는 아래 도움말에서 확인할 수 있어요.</p>
    <details><summary className="min-h-11 cursor-pointer py-3">움직임 옵션 도움말</summary>
      <p className={styles.hint}><b>기본 · 반복 움직임 없음:</b> 공통 연이는 반복해서 움직이지 않아요. 별도로 표시되는 기존 안내 캐릭터는 안내가 바뀔 때 한 번 반응할 수 있어요.</p>
      <p className={styles.hint}><b>움직임 켜기:</b> 공통 연이의 움직임을 켜요. 입력 중·집중 화면이나 기기의 동작 줄이기 설정에서는 움직임이 제한돼요.</p>
      <p className={styles.hint}><b>모든 움직임 끄기:</b> 기존 안내 캐릭터의 한 번 반응도 꺼요. 캐릭터 그림을 숨기는 설정은 아니에요.</p>
    </details>
    {!app && <p className={styles.hint}>각 앱을 바로 설정하세요. 이 계정·이 기기에만 저장하며 별도 선택이 없는 앱은 기존 공통 설정을 사용해요. 입력 중·집중 화면과 기기의 동작 줄이기 설정도 따릅니다.</p>}
    <div className={styles.appSettingsList}>{apps.map(target => <section key={`${owner}:${target}`} aria-label={`${YEONI_APPS[target]} 설정`} className={styles.appSettingsRow}>
      <h3>{YEONI_APPS[target]}</h3>
      <PreferenceFields app={target} owner={owner} compact={!app} motionHelpId={motionHelpId} />
    </section>)}</div>
  </section>;
}
function PreferenceFields({ app, owner, compact, motionHelpId }: { app: YeoniApp; owner: string | null; compact: boolean; motionHelpId: string }) {
  const preferences = useYeoniPreferences(app);
  const [message, setMessage] = useState('');
  const change = (value: Partial<YeoniPreferences>) => {
    try { updateYeoniPreferences(value, app, owner); setMessage(`${YEONI_APPS[app]} 앱에 저장했어요.`); }
    catch { setMessage('설정을 저장하지 못했어요. 로그인 계정과 기기 저장 공간을 확인해 주세요.'); }
  };
  return <>
    {!compact && <p>{YEONI_APPS[app]}에서 사용할 모습과 움직임을 골라 주세요.</p>}
    <div className={styles.appPreferenceControls}>
    <label className={styles.motion}>연이 모습<select disabled={!owner} value={preferences.appearance ?? 'cat'} onChange={event => change({ appearance: event.target.value as 'cat' | 'human' })}><option value="cat">고양이형</option><option value="human">인간형</option></select></label>
    <label><input type="checkbox" disabled={!owner} checked={preferences.visible} onChange={event => change({ visible: event.target.checked })} />이 앱에서 연이 표시</label>
    <label className={styles.motion}>연이 움직임<select aria-describedby={motionHelpId} value={preferences.motion} disabled={!owner || !preferences.visible} onChange={event => change({ motion: event.target.value as YeoniPreferences['motion'] })}>
      <option value="reactions">기본 · 반복 움직임 없음</option><option value="home">움직임 켜기</option><option value="off">모든 움직임 끄기</option>
    </select></label>
    </div>
    {!compact && <p className={styles.hint}>이 계정·이 기기의 선택한 앱에만 적용돼요. 별도 선택이 없는 앱은 기존 기기 공통 설정을 사용하며, 기존 값과 기록은 지우지 않아요.</p>}
    <button type="button" disabled={!owner} onClick={() => { try { resetAppYeoniPreferences(app, owner); setMessage('이 앱은 기존 기기 공통 설정을 다시 사용해요.'); } catch { setMessage('설정을 바꾸지 못했어요. 계정과 저장 공간을 확인해 주세요.'); } }}>이 앱의 별도 선택 해제</button>
    {!compact && <p className={styles.hint}>입력 중·집중 화면에서는 조용히 기다리고, 기기의 ‘동작 줄이기’도 따라요.</p>}
    {message && <p className={styles.hint} role="status">{message}</p>}
  </>;
}
