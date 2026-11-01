"use client";
import { useState } from 'react';
import GrammarWritingPractice from './GrammarWritingPractice';
import { CONSOLIDATION_PRACTICES } from '@/data/grammarConsolidation';
const actionStyle = { minHeight: 44, padding: '10px 16px', border: '1px solid #93c5fd', borderRadius: 10, background: '#eff6ff', color: '#1e3a8a' };
export default function GrammarConsolidation({ onListen, onStop }: { onListen: (text: string) => void; onStop: () => void }) {
  const [task, setTask] = useState<'map' | 'travel'>('map');
  return <section aria-label="생활·여행 종합 연습" style={{ display: 'grid', gap: 16 }}>
    <h2>배운 표현을 연결해요 · 종합 연습 2개</h2>
    <p>앞의 수업에서 배운 표현으로 짧은 글을 읽고 써요. 새 문법 수업이나 여행 일본어 전체의 완료 평가는 아니에요.</p>
    <nav aria-label="종합 연습 선택" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" style={actionStyle} aria-pressed={task === 'map'} onClick={() => { onStop(); setTask('map'); }}>1. 안내도 질문</button>
      <button type="button" style={actionStyle} aria-pressed={task === 'travel'} onClick={() => { onStop(); setTask('travel'); }}>2. 여행 기록 두 줄</button>
    </nav>
    {task === 'map' ? <div key="map" style={{ display: 'grid', gap: 12 }}>
      <aside aria-label="가상 안내 카드" style={{ padding: 16, border: '1px solid #cbd5e1', borderRadius: 12 }}>
        <h3>가상 안내 카드</h3><p lang="ja">出口はここです。</p><p>읽는 법: でぐちはここです。</p>
        <p>출구는 여기입니다. 화장실 표지는 있지만 위치는 표시되지 않았어요.</p>
        <button type="button" style={actionStyle} onClick={() => onListen('出口はここです。')}>안내 문장 듣기</button>
      </aside>
      <GrammarWritingPractice practice={CONSOLIDATION_PRACTICES.map} onListen={onListen} />
    </div> : <div key="travel" style={{ display: 'grid', gap: 16 }}>
      <p>기록 재료: 어제 교토에 다녀옴 / 오늘 회사에 가지 않을 계획</p>
      <h3>첫 줄 · 이미 한 일</h3><GrammarWritingPractice practice={CONSOLIDATION_PRACTICES.past} onListen={onListen} />
      <h3>둘째 줄 · 오늘의 계획</h3><GrammarWritingPractice practice={CONSOLIDATION_PRACTICES.plan} onListen={onListen} />
    </div>}
  </section>;
}
