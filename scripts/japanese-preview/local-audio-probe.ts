/** QA only. No user text, fallback voice, network, storage, or recording. */
export const LOCAL_JAPANESE_SAMPLES = Object.freeze([
  Object.freeze({ id: 'greeting', text: 'こんにちは。今日は日本語を勉強します。', label: '인사 · 가상 수업' }),
  Object.freeze({ id: 'daily', text: '毎朝七時に起きて、学校へ行きます。', label: '일상 · 가상 수업' }),
  Object.freeze({ id: 'reading', text: '図書館で借りた本を、週末に読む予定です。', label: '읽기 · 가상 수업' }),
]);

export interface ProbeVoice {
  name: string; lang: string; voiceURI: string; localService: boolean; default: boolean;
}
export interface ProbeUtterance {
  text: string; lang: string; voice: ProbeVoice | null; rate: number; pitch: number; volume: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}
export interface LocalSpeechPort {
  getVoices(): ProbeVoice[];
  createUtterance(text: string): ProbeUtterance;
  speak(utterance: ProbeUtterance): void;
  cancel(): void;
  state(): { speaking: boolean; pending: boolean; paused: boolean };
  userActivation(): boolean;
  onVoicesChanged(listener: () => void): () => void;
}
export type VoiceChoice = { key: string; name: string; lang: string; localService: true; default: boolean };
export type ProbeState = 'ready' | 'blocked' | 'queued' | 'started' | 'ended' | 'error' | 'cancelled' | 'timed-out';
export interface LocalAudioReport {
  state: ProbeState;
  reason: string;
  sampleId: string;
  text: string;
  voice: VoiceChoice | null;
  requestedCount: 0 | 1;
  startObserved: boolean;
  endObserved: boolean;
  engine: { speaking: boolean; pending: boolean; paused: boolean } | null;
  /** Synthesis events do not prove audible sound, pronunciation, or quality. */
  actualListening: 'not-verified';
}

export function isStrictLocalJapaneseVoice(voice: ProbeVoice): boolean {
  // Deliberately narrower than all BCP-47 tags. Unknown language variants fail closed.
  return voice?.localService === true && typeof voice.default === 'boolean'
    && typeof voice.lang === 'string' && /^ja(?:-JP)?$/i.test(voice.lang)
    && typeof voice.name === 'string' && voice.name.trim().length > 0
    && typeof voice.voiceURI === 'string' && voice.voiceURI.trim().length > 0;
}

function voiceKey(voice: ProbeVoice): string {
  return JSON.stringify([voice.voiceURI, voice.name, voice.lang]);
}
export function strictLocalJapaneseVoices(voices: ProbeVoice[]): VoiceChoice[] {
  const safe = voices.filter(isStrictLocalJapaneseVoice);
  // Never guess between voices with ambiguous identities.
  return safe.filter(voice => voices.filter(other => voiceKey(other) === voiceKey(voice)).length === 1)
    .map(voice => ({ key: voiceKey(voice), name: voice.name, lang: voice.lang, localService: true, default: voice.default }));
}

const errors: Record<string, string> = {
  'not-allowed': '현재 브라우저 또는 격리 화면에서 합성이 허용되지 않았어요. 경계를 바꾸거나 재시도하지 않았어요.',
  'voice-unavailable': '선택한 로컬 음성을 사용할 수 없어요. 다른 음성으로 바꾸지 않았어요.',
  'language-unavailable': '일본어 합성기가 지원되지 않아요. 다른 언어로 바꾸지 않았어요.',
  'audio-busy': '오디오 장치가 사용 중이에요.',
  'audio-hardware': '오디오 출력 장치를 사용할 수 없어요.',
  'network': '로컬 전용 검사 중 네트워크 오류가 보고되어 중단했어요. 원격 서비스로 재시도하지 않았어요.',
};

export function createLocalJapaneseAudioProbe(port: LocalSpeechPort | null, timeoutMs = 15_000) {
  let activeCancel: (() => void) | null = null;
  let disposed = false;
  const inspect = () => {
    if (!port || disposed) return { available: false, voices: [] as VoiceChoice[], reason: '현재 환경에서 로컬 일본어 음성 API를 사용할 수 없어요.' };
    try {
      const voices = strictLocalJapaneseVoices(port.getVoices());
      return { available: true, voices, reason: voices.length ? '브라우저가 로컬로 보고한 일본어 음성이에요. 목록에서 직접 선택해 주세요.' : '허용되는 로컬 일본어 음성이 없어요. 음성을 재생하거나 원격 음성으로 바꾸지 않았어요.' };
    } catch {
      return { available: false, voices: [] as VoiceChoice[], reason: '격리 화면에서 음성 목록을 확인하지 못했어요. 경계는 그대로 유지해요.' };
    }
  };

  async function run(sampleId: string, selectedKey: string, options: {
    signal?: AbortSignal; onUpdate?: (report: LocalAudioReport) => void;
  } = {}): Promise<LocalAudioReport> {
    const sample = LOCAL_JAPANESE_SAMPLES.find(item => item.id === sampleId);
    const report: LocalAudioReport = { state: 'blocked', reason: '', sampleId: sample?.id ?? '', text: sample?.text ?? '', voice: null,
      requestedCount: 0, startObserved: false, endObserved: false, engine: null, actualListening: 'not-verified' };
    function snapshot() { return { ...report, voice: report.voice ? { ...report.voice } : null, engine: report.engine ? { ...report.engine } : null }; }
    function emit() {
      try { options.onUpdate?.(snapshot()); } catch { /* An observer cannot change the playback safety path. */ }
    }
    function block(reason: string) { report.reason = reason; emit(); return snapshot(); }
    if (!sample) return block('미리 정한 가상 수업 문장만 검사할 수 있어요.');
    if (!port || disposed) return block('현재 환경에서 로컬 일본어 음성 API를 사용할 수 없어요.');
    if (options.signal?.aborted) { report.state = 'cancelled'; return block('시작 전에 취소되었어요.'); }
    if (activeCancel) return block('진행 중인 검사 한 번이 끝난 뒤 다시 선택해 주세요.');

    let voice: ProbeVoice;
    let utterance: ProbeUtterance;
    try {
      if (port.userActivation() !== true) return block('재생 버튼을 직접 눌러 한 번씩 검사해 주세요. 자동 재생은 하지 않아요.');
      const voices = port.getVoices();
      const matches = voices.filter(item => voiceKey(item) === selectedKey);
      if (matches.length !== 1 || !isStrictLocalJapaneseVoice(matches[0])) return block('선택한 로컬 일본어 음성을 다시 확인하지 못했어요. 기본·원격 음성으로 바꾸지 않았어요.');
      voice = matches[0];
      report.voice = { key: selectedKey, name: voice.name, lang: voice.lang, localService: true, default: voice.default };
      report.engine = port.state();
      if (report.engine.speaking || report.engine.pending || report.engine.paused) return block('다른 음성이 사용 중이거나 일시 정지되어 있어 검사하지 않았어요.');
      utterance = port.createUtterance(sample.text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 1; utterance.pitch = 1; utterance.volume = 1;
      if (utterance.voice !== voice || utterance.lang !== voice.lang) return block('선택한 로컬 음성을 고정하지 못했어요.');
    } catch { return block('로컬 음성 검사를 준비하지 못했어요. 원격 서비스로 재시도하지 않았어요.'); }

    return new Promise<LocalAudioReport>(resolve => {
      let settled = false;
      let submitted = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let removeVoicesListener = () => {};
      const readState = () => { try { report.engine = port.state(); } catch { report.engine = null; } };
      const finish = (state: ProbeState, reason: string, cancelOwned = false) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener('abort', cancel);
        try { removeVoicesListener(); } catch { /* Listener cleanup cannot turn failure into a hung promise. */ }
        utterance.onstart = null; utterance.onend = null; utterance.onerror = null;
        // No queue was touched before this probe submitted its sole utterance.
        if (cancelOwned && submitted) { try { port.cancel(); } catch { /* Outcome remains unverified. */ } }
        activeCancel = null;
        readState(); report.state = state; report.reason = reason;
        emit(); resolve(snapshot());
      };
      const cancel = () => finish('cancelled', '검사를 취소했어요. 실제 청취는 확인되지 않았어요.', true);
      activeCancel = cancel;
      utterance.onstart = () => {
        if (settled) return;
        report.startObserved = true; report.state = 'started'; report.reason = '합성 시작 이벤트를 확인했어요. 실제 소리와 발음 품질은 아직 확인되지 않았어요.';
        readState(); emit();
      };
      utterance.onend = () => {
        if (settled) return;
        report.endObserved = true;
        finish(report.startObserved ? 'ended' : 'error', report.startObserved
          ? '합성 시작·종료 이벤트를 확인했어요. 실제 청취·발음 품질 검증은 아니에요.'
          : '시작 이벤트 없이 종료되어 재생 확인으로 처리하지 않았어요.');
      };
      utterance.onerror = event => finish('error', errors[event.error ?? ''] ?? '합성 오류가 발생했어요. 다른 음성이나 서버로 재시도하지 않았어요.', true);
      try {
        removeVoicesListener = port.onVoicesChanged(() => {
          try {
            const matches = port.getVoices().filter(item => voiceKey(item) === selectedKey);
            if (matches.length !== 1 || !isStrictLocalJapaneseVoice(matches[0])) finish('error', '선택한 로컬 음성의 정보가 바뀌어 검사를 중단했어요.', true);
          } catch { finish('error', '로컬 음성을 다시 확인할 수 없어 검사를 중단했어요.', true); }
        });
        if (settled) return;
        options.signal?.addEventListener('abort', cancel, { once: true });
        if (options.signal?.aborted) { cancel(); return; }
        timer = setTimeout(() => finish('timed-out', '제한 시간 안에 합성 종료를 확인하지 못했어요. 성공으로 처리하지 않았어요.', true), timeoutMs);
        report.state = 'queued'; report.reason = '선택한 로컬 음성에 표시된 가상 문장 1회만 요청할 준비를 했어요.';
        emit();
        if (settled) return;
        report.requestedCount = 1; submitted = true;
        port.speak(utterance);
        if (!settled) { readState(); emit(); }
      } catch { finish('error', '로컬 합성을 실행하지 못했어요. 다른 음성이나 서버로 재시도하지 않았어요.', true); }
    });
  }
  return { inspect, run, cancel: () => activeCancel?.(), dispose: () => { activeCancel?.(); disposed = true; } };
}
