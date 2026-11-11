'use client';

import { useEffect, useRef, useState } from 'react';
import { type InbodyRecord, type InbodyRecordStore } from '../data/recordStorage';
import { correctOaSourceDevice, oaCorrectionKeys, OA_CORRECTION_FIELDS } from '../lib/oaSourceCorrection';
import { commitBodySave, isBodySaveScopeCurrent, readBodySaveScope, readBodySaveSnapshot, type BodySaveScope } from '../data/bodyRecordSave';

export default function OaSourceCorrection({ dateKey, record, onSaved }: {
  dateKey: string; record: InbodyRecord; onSaved: (records: InbodyRecordStore) => void;
}) {
  const [scope] = useState<BodySaveScope | null>(() => {
    try { return readBodySaveScope(window.localStorage); } catch { return null; }
  });
  const invalidated = useRef(false);
  const mounted = useRef(true);
  const [review, setReview] = useState<{ scope: BodySaveScope; snapshot: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    mounted.current = true;
    const invalidate = () => {
      invalidated.current = true;
      setReview(null); setConfirmed(false);
      setMessage('계정이나 화면 상태가 바뀌었어요. 기록 화면을 새로 열어 주세요.');
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === 'fitness-cloud-sync-user' || event.key === 'fitness-cloud-sync-epoch') invalidate();
    };
    window.addEventListener('yeoni-cloud-session-changed', invalidate);
    window.addEventListener('pagehide', invalidate);
    window.addEventListener('storage', storageChanged);
    return () => {
      mounted.current = false;
      window.removeEventListener('yeoni-cloud-session-changed', invalidate);
      window.removeEventListener('pagehide', invalidate);
      window.removeEventListener('storage', storageChanged);
    };
  }, []);
  const keys = oaCorrectionKeys(record);
  if (!keys.length) return null;
  function currentScope() {
    return mounted.current && !invalidated.current && scope !== null && isBodySaveScopeCurrent(window.localStorage, scope);
  }
  function openReview() {
    try {
      if (!currentScope() || !scope) throw new Error('scope changed');
      const stored = readBodySaveSnapshot(window.localStorage, scope);
      const snapshot = JSON.stringify(record);
      if (JSON.stringify(stored.inbody[dateKey]) !== snapshot) throw new Error('record changed');
      setReview({ scope, snapshot }); setConfirmed(false); setMessage('');
    } catch {
      setReview(null); setConfirmed(false);
      setMessage('기록을 안전하게 확인하지 못했어요. 기존 기록을 지우지 말고 화면을 새로 열어 확인해 주세요.');
    }
  }
  function save() {
    if (!review || !confirmed) return;
    let next: InbodyRecordStore;
    let notified: boolean;
    try {
      const storage = window.localStorage;
      if (!currentScope() || !isBodySaveScopeCurrent(storage, review.scope)) throw new Error('scope changed');
      // This helper rejects owner/epoch-changing recovery before any mutation.
      const snapshot = readBodySaveSnapshot(storage, review.scope);
      if (JSON.stringify(snapshot.inbody[dateKey]) !== review.snapshot || JSON.stringify(record) !== review.snapshot) {
        setReview(null); setConfirmed(false); setMessage('계정이나 기록이 바뀌었어요. 다시 확인해 주세요.'); return;
      }
      next = { ...snapshot.inbody, [dateKey]: correctOaSourceDevice(snapshot.inbody[dateKey]) };
      notified = commitBodySave(storage, review.scope, snapshot, snapshot.weights, next).notified;
    } catch {
      setMessage('기기 정보를 저장하지 못했어요. 기존 원문과 검토 내용은 유지했어요. 저장 공간과 계정을 확인한 뒤 다시 시도해 주세요.');
      return;
    }
    setReview(null); setConfirmed(false);
    try { onSaved(next); } catch { notified = false; }
    setMessage(notified ? '기기 정보를 저장했습니다. 날짜·수치·메모는 유지했어요.'
      : '기기 정보를 저장했습니다. 화면 갱신을 마치지 못했어요. 다시 저장하지 말고 새로고침하여 확인해 주세요.');
  }
  return <section aria-label="저장된 OA 기기 정보 정정" className="mt-3 rounded border p-3 text-sm">
    <p>원본이 PRO 보고서인 기록의 기기 정보를 정정할 수 있어요. 날짜·수치·메모는 유지해요.</p>
    {!review ? <button type="button" className="min-h-11 underline" onClick={openReview}>기기 정보 정정 검토</button> : <>
      <p>{dateKey} · OA long report → OA Smart Scale PRO</p>
      <ul>{OA_CORRECTION_FIELDS.filter(([key]) => keys.includes(key)).map(([key, label, unit]) =>
        <li key={key}>{label} · {unit} · {record.metricSources?.[key]?.mappingVersion}</li>)}</ul>
      <p>위 항목만 변경해요. 출처·단위·매핑 버전이 누락되거나 일치하지 않는 항목은 제외해요.</p>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
        이 날짜의 원본이 OA Smart Scale PRO 긴 건강보고서임을 직접 확인했어요.</label>
      <button type="button" disabled={!confirmed} onClick={save} className="min-h-11 rounded border px-3 disabled:opacity-50">기기 정보만 저장</button>
      <button type="button" onClick={() => { setReview(null); setConfirmed(false); setMessage(''); }} className="min-h-11 px-3">정정 취소</button>
    </>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
