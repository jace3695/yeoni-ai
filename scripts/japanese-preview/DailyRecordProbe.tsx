import { useState } from 'react';
import { qaLocalStorage } from './runtime';
import { readDailyRecordProbe, seedDailyReviewScenario } from './daily-records';

/** Visible inspection controls for disposable QA bytes, not a product history UI. */
export default function DailyRecordProbe({ onReset }: { onReset: () => void }) {
  const [snapshot, setSnapshot] = useState(readDailyRecordProbe);
  const [notice, setNotice] = useState('');
  return <details className="qa-daily-records">
    <summary>오늘 체크·날짜별 이력의 가상 저장 검사</summary>
    <p>이 화면의 가상 메모리만 확인해요. 실제 홈·캘린더·계정 기록·클라우드 동기화 검증은 아니에요. 저장 동작을 마친 뒤 기록을 다시 읽어 비교하세요.</p>
    <div className="qa-actions">
      <button type="button" onClick={() => { qaLocalStorage.failNextHistoryWrite(); setNotice('다음 날짜별 학습 이력 저장만 1회 실패시켜요. 답안·점수는 별도로 확인하고, 오류 안내 후 같은 일일 체크를 다시 저장하세요.'); }}>다음 학습 이력 저장 실패시키기</button>
      <button type="button" onClick={() => { setSnapshot(readDailyRecordProbe()); setNotice('현재 가상 기록을 다시 읽었어요.'); }}>가상 일일 기록 다시 읽기</button>
      <button type="button" onClick={() => { seedDailyReviewScenario(); onReset(); setSnapshot(readDailyRecordProbe()); setNotice('이 화면의 이전 가상 기록 대신 복습용 단어 3개를 넣었어요. 실제 기록은 연결하지 않았어요.'); }}>가상 기록 초기화·복습 단어 3개 준비</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    <p>오늘 체크: <output data-qa-daily="routine">{snapshot.routine ?? '기록 없음'}</output></p>
    <p>날짜별 이력: <output data-qa-daily="history">{snapshot.history ?? '기록 없음'}</output></p>
    <p>중단된 저장 복구: <output data-qa-daily="journal">{snapshot.recoveryPending ? '복구가 필요해요' : '대기 기록 없음'}</output></p>
  </details>;
}
