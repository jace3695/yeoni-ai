"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import YeoniPreferencesPanel from "@/components/YeoniPreferencesPanel";
import RecordResetPanel from "@/app/components/RecordResetPanel";
import { LanguageRecordReadiness } from "@/components/yeoni/LocalRecordGuidance";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import { isRecordResetRunning } from "@/app/data/appRecordReset";
import { DEFAULT_INTEGRATED_LEARNING_SETTINGS, type IntegratedLearningSettings } from "@/utils/integratedLearningSettings";
import { DEFAULT_SETTINGS, DAILY_GOAL_OPTIONS, isValidTtsRate, isValidRepeatCount, isValidRepeatDelayMs,
  LanguageSettingsPageError, readLanguageSettingsPage, saveLanguageSettingsPage,
  type LearningSection, type CommonSectionSettings, type DetailedSectionSettings, type JapaneseAppSettings,
  type SettingsPageRead, type SettingsPageValues } from "@/utils/languageSettingsPage";

const SECTION_LABELS: Record<LearningSection, string> = {
  kana: "가나",
  words: "단어",
  sentences: "문장",
  speaking: "말하기",
  conversation: "AI 회화",
};

const TTS_RATE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.5, label: "0.5 아주 느리게" },
  { value: 0.6, label: "0.6" },
  { value: 0.7, label: "0.7" },
  { value: 0.8, label: "0.8 느리게" },
  { value: 0.9, label: "0.9" },
  { value: 1, label: "1.0 보통" },
  { value: 1.1, label: "1.1" },
  { value: 1.2, label: "1.2 빠르게" },
];

const REPEAT_COUNT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "1회" },
  { value: 2, label: "2회" },
  { value: 3, label: "3회" },
];

const REPEAT_DELAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "바로 반복" },
  { value: 300, label: "0.3초" },
  { value: 500, label: "0.5초" },
  { value: 1000, label: "1초" },
  { value: 1500, label: "1.5초" },
  { value: 2000, label: "2초" },
];

export default function SettingsPage() {
  const readiness = useContext(LanguageRecordReadiness);
  const ready = useRef(readiness); ready.current = readiness;
  const mounted = useRef(false), sessionInvalid = useRef(false), attemptedRead = useRef(false);
  const loaded = useRef<SettingsPageRead | null>(null);
  const draft = useRef<SettingsPageValues | null>(null);
  const [settings, setSettings] = useState<JapaneseAppSettings>(DEFAULT_SETTINGS);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [dailyGoalCount, setDailyGoalCount] = useState<number>(5);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [readError, setReadError] = useState('');
  const [detailDirty, setDetailDirty] = useState(false);
  const [learningDirty, setLearningDirty] = useState(false);
  const [integratedSettings, setIntegratedSettings] = useState<IntegratedLearningSettings>(DEFAULT_INTEGRATED_LEARNING_SETTINGS);
  useUnsavedChanges(detailDirty || learningDirty);

  const checkReady = useCallback((allowPendingSync = false) => {
    if (!mounted.current || sessionInvalid.current) throw new LanguageSettingsPageError('owner');
    if ((!allowPendingSync && ready.current !== 'ready') || isRecordResetRunning()) throw new LanguageSettingsPageError('not-ready');
  }, []);
  const message = (error: unknown) => error instanceof LanguageSettingsPageError ? error.message : '설정을 확인하지 못했어요. 현재 선택은 화면에 남아 있습니다. 다시 시도해 주세요.';
  useEffect(() => {
    mounted.current = true;
    const invalidate = () => {
      sessionInvalid.current = true;
      setReadError(new LanguageSettingsPageError('owner').message);
      setSaveMessage('');
    };
    window.addEventListener('yeoni-cloud-session-changed', invalidate);
    return () => { mounted.current = false; window.removeEventListener('yeoni-cloud-session-changed', invalidate); };
  }, []);
  const readSettings = useCallback(() => {
    try {
      checkReady();
      const next = readLanguageSettingsPage(loaded.current?.snapshot);
      loaded.current = next;
      draft.current = { japanese: next.japanese, learning: next.learning, integrated: next.integrated };
      setSettings(next.japanese); setDailyGoalCount(next.learning.dailyGoalCount); setIntegratedSettings(next.integrated);
      setIsSettingsLoaded(true); setReadError(''); setSaveError(''); setDetailError(''); setSaveMessage('');
      setDetailDirty(false); setLearningDirty(false);
    } catch (error) { setReadError(error instanceof LanguageSettingsPageError ? error.message : '설정을 읽지 못했어요. 다시 시도해 주세요.'); }
  }, [checkReady]);
  useEffect(() => {
    if (readiness !== 'ready' || attemptedRead.current) return;
    attemptedRead.current = true; readSettings();
  }, [readiness, readSettings]);
  const reread = () => {
    if ((detailDirty || learningDirty) && !window.confirm('화면의 저장하지 않은 선택을 버리고 기기에 저장된 설정을 다시 읽을까요? 일부 설정은 이미 반영됐을 수 있어요.')) return;
    readSettings();
  };
  const saveDetails = () => {
    try {
      // An initialized editor may keep saving while the cloud PATCH is pending.
      // The helper checks the captured owner, epochs, journals and current bytes.
      checkReady(true);
      if (!loaded.current || !draft.current) throw new LanguageSettingsPageError('read');
      saveLanguageSettingsPage(loaded.current.snapshot, { japanese: draft.current.japanese });
      loaded.current.japanese = draft.current.japanese;
      setDetailDirty(false); setDetailError('');
    } catch (error) { setDetailError(message(error)); }
  };
  const changeDetails = (next: JapaneseAppSettings) => {
    if (!draft.current) return;
    draft.current = { ...draft.current, japanese: next };
    setSettings(next); setDetailDirty(true);
    saveDetails();
  };
  const updateCommonSetting = (section: LearningSection, key: keyof CommonSectionSettings, value: number) => {
    const current = draft.current?.japanese; if (!current) return;
    changeDetails({ ...current, sections: { ...current.sections, [section]: { ...current.sections[section], [key]: value } } });
  };
  const updateDetailedSetting = (section: Exclude<LearningSection, 'kana'>, key: 'showKoreanPronunciation' | 'showReading', value: boolean) => {
    const current = draft.current?.japanese; if (!current) return;
    changeDetails({ ...current, sections: { ...current.sections, [section]: { ...current.sections[section], [key]: value } } });
  };
  const changeGoal = (goal: number) => {
    if (!draft.current || !DAILY_GOAL_OPTIONS.includes(goal as 1)) return;
    draft.current = { ...draft.current, learning: { ...draft.current.learning, dailyGoalCount: goal } };
    setDailyGoalCount(goal); setLearningDirty(true); setSaveMessage(''); setSaveError('');
  };
  const changeIntegrated = (patch: Partial<IntegratedLearningSettings>) => {
    if (!draft.current) return;
    const next = { ...draft.current.integrated, ...patch };
    draft.current = { ...draft.current, integrated: next };
    setIntegratedSettings(next); setLearningDirty(true); setSaveMessage(''); setSaveError('');
  };
  const handleSaveLearningSettings = () => {
    setSaveMessage('');
    try {
      checkReady(true);
      if (!loaded.current || !draft.current) throw new LanguageSettingsPageError('read');
      saveLanguageSettingsPage(loaded.current.snapshot, { learning: draft.current.learning, integrated: draft.current.integrated });
      loaded.current.learning = draft.current.learning; loaded.current.integrated = draft.current.integrated;
      setLearningDirty(false); setSaveError(''); setSaveMessage('학습 목표와 통합 과정 설정이 저장됐어요.');
    } catch (error) { setSaveError(message(error)); }
  };
  const handleResetSettings = () => {
    if (!window.confirm('학습 목표 개수는 유지하고 음성·표시·통합 과정 설정을 기본값으로 되돌릴까요?')) return;
    setSaveMessage('');
    try {
      checkReady(true);
      if (!loaded.current || !draft.current) throw new LanguageSettingsPageError('read');
      const current = draft.current;
      const japanese = { ...current.japanese, sections: { ...current.japanese.sections } };
      for (const section of Object.keys(DEFAULT_SETTINGS.sections) as LearningSection[]) {
        Object.defineProperty(japanese.sections, section, { value: { ...current.japanese.sections[section], ...DEFAULT_SETTINGS.sections[section] }, enumerable: true, configurable: true, writable: true });
      }
      const integrated = { ...current.integrated, ...DEFAULT_INTEGRATED_LEARNING_SETTINGS };
      // Failed resets retain the requested defaults as a visible retryable draft.
      draft.current = { ...current, japanese, integrated };
      setSettings(japanese); setIntegratedSettings(integrated); setDetailDirty(true); setLearningDirty(true);
      saveLanguageSettingsPage(loaded.current.snapshot, { japanese, integrated });
      loaded.current.japanese = japanese; loaded.current.integrated = integrated;
      setDetailDirty(false); setLearningDirty(JSON.stringify(current.learning) !== JSON.stringify(loaded.current.learning));
      setSaveError(''); setDetailError(''); setSaveMessage('음성·표시·통합 과정 기본값을 기기에 저장했어요. 학습 목표 개수는 유지했어요.');
    } catch (error) { setSaveError(message(error)); }
  };

  const renderSectionCard = (section: LearningSection) => {
    const sectionSettings = settings.sections[section];
    const isKana = section === "kana";
    const detailedSectionSettings = isKana ? null : (sectionSettings as DetailedSectionSettings);

    return (
      <div key={section} className="card" style={{ display: "grid", gap: "14px" }}>
        <h2 style={{ margin: 0 }}>{SECTION_LABELS[section]} 설정</h2>

        <div>
          <label htmlFor={`${section}-tts-rate`} style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
            음성 재생 속도
          </label>
          <select
            id={`${section}-tts-rate`}
            value={sectionSettings.ttsRate}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!isValidTtsRate(value)) return;
              updateCommonSetting(section, "ttsRate", value);
            }}
            style={{ width: "100%" }}
          >
            {TTS_RATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${section}-repeat-count`} style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
            반복 재생 횟수
          </label>
          <select
            id={`${section}-repeat-count`}
            value={sectionSettings.repeatCount}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!isValidRepeatCount(value)) return;
              updateCommonSetting(section, "repeatCount", value);
            }}
            style={{ width: "100%" }}
          >
            {REPEAT_COUNT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${section}-repeat-delay`} style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
            반복 재생 간격
          </label>
          <select
            id={`${section}-repeat-delay`}
            value={sectionSettings.repeatDelayMs}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!isValidRepeatDelayMs(value)) return;
              updateCommonSetting(section, "repeatDelayMs", value);
            }}
            style={{ width: "100%" }}
          >
            {REPEAT_DELAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {!isKana && (
          <>
            <label
              htmlFor={`${section}-show-reading`}
              style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}
            >
              <input
                id={`${section}-show-reading`}
                type="checkbox"
                checked={detailedSectionSettings?.showReading ?? false}
                onChange={(event) => {
                  updateDetailedSetting(section, "showReading", event.target.checked);
                }}
              />
              읽기 표시
            </label>

            <label
              htmlFor={`${section}-show-korean-pronunciation`}
              style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}
            >
              <input
                id={`${section}-show-korean-pronunciation`}
                type="checkbox"
                checked={detailedSectionSettings?.showKoreanPronunciation ?? false}
                onChange={(event) => {
                  updateDetailedSetting(section, "showKoreanPronunciation", event.target.checked);
                }}
              />
              한글 발음 참고 표시
            </label>
          </>
        )}
      </div>
    );
  };

  if (!isSettingsLoaded) return <section><h1>학습 설정</h1><p role={readError ? "alert" : "status"}>{readError || "학습 설정을 읽을 준비를 하고 있어요."}</p>{readError && <button type="button" disabled={readiness !== "ready" || sessionInvalid.current} onClick={readSettings}>설정 다시 읽기</button>}</section>;

  return (
    <section>
      <div className="page-header">
        <h1>학습 설정</h1>
        <p className="muted settings-page-subtitle" style={{ marginBottom: 0 }}>
          나에게 맞는 하루 학습 목표를 정하고, 매일 꾸준히 학습해 보세요.
        </p>
      </div>

      <div style={{ marginBottom: 20 }}><YeoniPreferencesPanel app="language" /></div>

      <p className="muted">하루 목표·통합 과정은 저장 버튼을 눌러 주세요. 아래 음성·표시 설정은 바꿀 때 기기에 저장합니다.</p>
      <button type="button" className="btn" disabled={readiness !== "ready" || sessionInvalid.current} onClick={reread}>저장된 설정 다시 읽기</button>
      {(readError || saveError || detailError) && <p role="alert">{readError || saveError || detailError}</p>}
      {detailDirty && <button type="button" className="btn" disabled={sessionInvalid.current} onClick={saveDetails}>상세 설정 다시 저장</button>}
      {saveMessage && <p className="muted">기기 저장 확인이며, 서버 반영 상태는 동기화 안내에서 확인해 주세요.</p>}
      {(detailDirty || learningDirty) && <p role="status">아직 저장되지 않았거나 저장 확인이 필요한 선택이 있어요. 다른 화면으로 이동하기 전에 저장 결과를 확인해 주세요.</p>}

      <div className="card daily-goal-card" style={{ display: "grid", gap: "14px" }}>
        <div className="daily-goal-header">
          <h2 style={{ margin: 0 }}>하루 학습 목표</h2>
          <span className="daily-goal-badge">현재 {dailyGoalCount}개</span>
        </div>
        <label htmlFor="daily-goal-count" style={{ display: "block", fontWeight: 600, marginBottom: "4px" }}>
          하루에 완료하고 싶은 루틴 개수
        </label>
        <div className="daily-goal-picker" role="radiogroup" aria-label="하루 목표 개수 선택">
          {DAILY_GOAL_OPTIONS.map((goal) => {
            const isSelected = dailyGoalCount === goal;

            return (
              <button
                key={goal}
                type="button"
                className={`daily-goal-option${isSelected ? " is-selected" : ""}`}
                onClick={() => {
                  changeGoal(goal);
                }}
                aria-pressed={isSelected}
              >
                <strong>{goal}</strong>
                <span>개</span>
              </button>
            );
          })}
        </div>
        <select
          id="daily-goal-count"
          value={dailyGoalCount}
          onChange={(event) => {
            changeGoal(Number(event.target.value));
          }}
          className="sr-only-select"
          aria-hidden="true"
          tabIndex={-1}
        >
          {DAILY_GOAL_OPTIONS.map((goal) => (
            <option key={goal} value={goal}>
              {goal}개
            </option>
          ))}
        </select>
        <p className="muted" style={{ margin: 0 }}>
          하루에 완료하고 싶은 루틴 개수를 선택해 주세요.
        </p>
        <p className="muted" style={{ margin: 0 }}>
          목표는 홈의 진행률과 달력의 목표 달성률에 반영돼요.
        </p>
        <button type="button" className="btn settings-save-btn" disabled={sessionInvalid.current} onClick={handleSaveLearningSettings}>
          설정 저장
        </button>
        {saveMessage && (
          <p className="settings-save-message" style={{ margin: 0 }}>
            {saveMessage}
          </p>
        )}
      </div>

      <div className="card integrated-settings-card">
        <h2 style={{ marginTop: 0 }}>통합 과정 학습 설정</h2>
        <p className="muted">오늘의 수업과 왕초보·회사·여행 과정에 적용됩니다.</p>
        <div className="integrated-settings-grid">
          <label>글자·문제 도움<select value={integratedSettings.learnerMode} onChange={(event) => changeIntegrated({ learnerMode: event.target.value as IntegratedLearningSettings["learnerMode"], hasChosenStart: true })}><option value="starter">처음 배워요 · 고르기부터</option><option value="reader">글자를 읽어요 · 20분 학습에 직접 입력 포함</option></select></label>
          <label>하루 학습 시간<select value={integratedSettings.dailyMinutes} onChange={(event) => changeIntegrated({ dailyMinutes: Number(event.target.value) as 5 | 10 | 20 })}><option value={5}>5분</option><option value={10}>10분</option><option value={20}>20분</option></select></label>
          <label>우선 학습 과정<select value={integratedSettings.preferredTrack} onChange={(event) => changeIntegrated({ preferredTrack: event.target.value as IntegratedLearningSettings["preferredTrack"] })}><option value="foundation">왕초보 기초</option><option value="work">회사 일본어</option><option value="travel">여행 일본어</option></select></label>
          <label>기본 음성 속도<select value={integratedSettings.audioRate} onChange={(event) => changeIntegrated({ audioRate: Number(event.target.value) as 0.8 | 0.9 | 1 })}><option value={0.8}>느리게</option><option value={0.9}>조금 느리게</option><option value={1}>보통</option></select></label>
        </div>
        <div className="integrated-settings-toggles">
          <label><input type="checkbox" checked={integratedSettings.showKoreanHint} onChange={(event) => changeIntegrated({ showKoreanHint: event.target.checked })} /> 수업의 한글 발음 보조 표시</label>
          <label><input type="checkbox" checked={integratedSettings.showReading} onChange={(event) => changeIntegrated({ showReading: event.target.checked })} /> 읽는 법 표시</label>
          <label><input type="checkbox" checked={integratedSettings.showMeaning} onChange={(event) => changeIntegrated({ showMeaning: event.target.checked })} /> 한국어 뜻 표시</label>
        </div>
        <p className="muted">5분은 확인 3문제, 10분은 5문제, 20분은 8문제예요. 시간과 문제 방식은 새로 시작하는 수업에 적용되고, 이어하는 수업은 시작할 때의 분량을 유지해요.</p>
        <button type="button" className="btn settings-save-btn" disabled={sessionInvalid.current} onClick={handleSaveLearningSettings}>학습 설정 저장</button>
        {saveMessage && <p role="status" className="settings-save-message">{saveMessage}</p>}
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {(["kana", "words", "sentences"] as LearningSection[]).map((section) =>
          renderSectionCard(section),
        )}
      </div>

      <div className="card">
        <button type="button" className="btn btn-danger" disabled={sessionInvalid.current} onClick={handleResetSettings} style={{ width: "100%" }}>
          학습 설정만 기본값으로
        </button>
      </div>
      <RecordResetPanel app="language" />
    </section>
  );
}
