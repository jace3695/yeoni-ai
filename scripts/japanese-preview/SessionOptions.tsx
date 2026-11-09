import { useEffect, useState } from 'react';
import type { LearnerMode, LearningMinutes } from '../../utils/learningSession';
import { qaLocalStorage } from './runtime';
import { applyPreviewSessionOptions, readPreviewSessionOptions, type PreviewSessionOptions } from './session-options';

export default function SessionOptions() {
  const [options, setOptions] = useState<PreviewSessionOptions>({ minutes: 10, mode: 'starter' });
  const [applied, setApplied] = useState<PreviewSessionOptions | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    try { const value = readPreviewSessionOptions(qaLocalStorage); setOptions(value); setApplied(value); }
    catch { setError('기존 검사 설정을 읽지 못했어요. 설정과 기록은 바꾸지 않았어요.'); }
  }, []);
  const apply = () => {
    try {
      applyPreviewSessionOptions(qaLocalStorage, options);
      setApplied(options); setError('');
      setNotice(`${options.minutes}분 · ${options.mode}를 다음 새 본수업에 적용했어요. 현재 수업과 이어하기 기록은 그대로예요.`);
    } catch { setNotice(''); setError('검사 설정을 저장하지 못했어요. 기존 설정과 기록은 그대로예요. 같은 선택으로 다시 시도해 주세요.'); }
  };
  return <details className="qa-session-options">
    <summary>본수업 검사 분량·모드 선택</summary>
    <p>아직 열지 않았거나 완료 후 다시 여는 본수업부터 적용해요. 이미 열린 수업과 이어하기는 기존 분량·모드·답을 유지하며, 이 버튼으로 재시작하거나 기록을 지우지 않아요.</p>
    <p>20분은 모든 확인 문제를 보여주는 분량 설정이며 시간제한이 아니에요. 예전 입력 종류 문제도 지금은 선택형으로 풀어요. 읽기·표현 조각 단원에는 적용하지 않아요.</p>
    <div className="qa-session-fields">
      <label>새 본수업 분량<select value={options.minutes} onChange={event => { setOptions(value => ({ ...value, minutes: Number(event.target.value) as LearningMinutes })); setNotice(''); }}>
        <option value={5}>5분 · 짧은 확인</option><option value={10}>10분 · 기본 확인</option><option value={20}>20분 · 모든 확인 문제</option>
      </select></label>
      <label>새 본수업 모드<select value={options.mode} onChange={event => { setOptions(value => ({ ...value, mode: event.target.value as LearnerMode })); setNotice(''); }}>
        <option value="starter">starter · 쉬운 선택 문제</option><option value="reader">reader · 읽기형 선택 문제</option>
      </select></label>
    </div>
    <p>현재 새 수업 기본값: {applied ? `${applied.minutes}분 · ${applied.mode}` : '확인 중'}</p>
    <button type="button" onClick={apply}>다음 새 본수업에 적용</button>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <p>설정도 이 화면의 메모리에만 남아요. 새로고침하거나 가상 오답 예시로 초기화하면 기본값으로 돌아가요.</p>
  </details>;
}
