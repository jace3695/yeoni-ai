import React, { useEffect, useState } from 'react';
import { createLocalJapaneseAudioProbe, LOCAL_JAPANESE_SAMPLES } from './local-audio-probe';
import type { LocalAudioReport } from './local-audio-probe';
import { browserLocalSpeechPort } from './native-local-audio';

/** Separate from the real lesson adapter: a completed probe never completes a lesson. */
export default function LocalAudioProbe({ isOpen }: { isOpen: boolean }) {
  const [port] = useState(browserLocalSpeechPort);
  const [probe] = useState(() => createLocalJapaneseAudioProbe(port));
  const [inventory, setInventory] = useState(() => probe.inspect());
  const [selectedVoice, setSelectedVoice] = useState('');
  const [sampleId, setSampleId] = useState<string>(LOCAL_JAPANESE_SAMPLES[0].id);
  const [report, setReport] = useState<LocalAudioReport | null>(null);
  const [history, setHistory] = useState<LocalAudioReport[]>([]);
  const [busy, setBusy] = useState(false);
  const sample = LOCAL_JAPANESE_SAMPLES.find(item => item.id === sampleId)!;
  const choice = inventory.voices.find(item => item.key === selectedVoice);

  useEffect(() => {
    if (!isOpen) probe.cancel();
  }, [isOpen, probe]);

  useEffect(() => {
    const refresh = () => setInventory(probe.inspect());
    const cancel = () => probe.cancel();
    let removeListener = () => {};
    try { removeListener = port?.onVoicesChanged(refresh) ?? removeListener; } catch { refresh(); }
    window.addEventListener('pagehide', cancel);
    window.addEventListener('hashchange', cancel);
    return () => {
      removeListener(); probe.cancel();
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('hashchange', cancel);
    };
  }, [port, probe]);

  const run = async () => {
    if (!isOpen || busy || !choice) return;
    setBusy(true);
    try {
      const result = await probe.run(sampleId, selectedVoice, { onUpdate: setReport });
      setHistory(previous => [...previous.slice(-9), result]);
    } finally { setBusy(false); }
  };
  return <section aria-label="로컬 일본어 음성 검사" data-testid="qa-local-audio" className="qa-unsupported">
    <h2>기기 내 일본어 음성 검사</h2>
    <p>브라우저가 로컬로 보고한 일본어 음성만 직접 선택해요. 기본 음성 자동 선택, 원격·분류 불명 음성, 서버 TTS, 마이크와 녹음은 사용하지 않아요. 학습 화면의 음성 버튼과는 별도 검사예요.</p>
    <p role="status">{inventory.reason}</p>
    <button type="button" disabled={busy} onClick={() => { setInventory(probe.inspect()); setSelectedVoice(''); }}>로컬 음성 목록 다시 확인</button>
    <p><label>검사할 로컬 일본어 음성 <select value={selectedVoice} disabled={busy || !inventory.voices.length} onChange={event => setSelectedVoice(event.target.value)}>
      <option value="">음성을 직접 선택하세요</option>
      {inventory.voices.map(item => <option key={item.key} value={item.key}>{item.name} · {item.lang} · 로컬{item.default ? ' · 기기 기본 음성' : ''}</option>)}
    </select></label></p>
    <p><label>가상 수업 문장 <select value={sampleId} disabled={busy} onChange={event => setSampleId(event.target.value)}>
      {LOCAL_JAPANESE_SAMPLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label></p>
    <p lang="ja">{sample.text}</p>
    <p>선택 음성: {choice ? `${choice.name} · ${choice.lang} · localService=true · default=${choice.default}` : '미선택'} / 요청 횟수: 버튼을 누를 때 표시된 문장 1회</p>
    <div className="qa-actions"><button type="button" onClick={run} disabled={!isOpen || busy || !choice}>선택한 로컬 음성으로 1회 검사</button><button type="button" disabled={!busy} onClick={() => probe.cancel()}>음성 검사 취소</button></div>
    <p><strong>합성 시작·종료 이벤트와 재생 상태만 표시해요. 실제 소리 청취와 발음·음질은 별도로 확인해야 해요.</strong></p>
    {report && <div role="status" aria-label="로컬 음성 검사 결과">
      <p>{report.reason}</p><p>상태: {report.state} / 요청: {report.requestedCount}회 / 시작 이벤트: {report.startObserved ? '있음' : '없음'} / 종료 이벤트: {report.endObserved ? '있음' : '없음'} / 실제 청취: 미검증</p>
      <p>브라우저 재생: {report.engine ? `speaking=${report.engine.speaking}, pending=${report.engine.pending}, paused=${report.engine.paused}` : '확인 불가'}</p>
    </div>}
    {history.length > 0 && <details><summary>최근 검사 기록 {history.length}개 · 이 화면 메모리에만 보관</summary><ol>
      {history.map((item, index) => <li key={index}>{item.text} / {item.voice?.name ?? '미선택'} · {item.voice?.lang ?? ''} / 요청 {item.requestedCount}회 / {item.state} / 시작 {String(item.startObserved)} · 종료 {String(item.endObserved)} / 실제 청취 미검증</li>)}
    </ol></details>}
  </section>;
}
