"use client";
import { useState } from 'react';
import GrammarWritingPractice from './GrammarWritingPractice';
import { TRAVEL_CONSOLIDATION } from '@/data/grammarTravelConsolidation';
const actionStyle = { minHeight: 44, padding: '10px 16px', border: '1px solid #93c5fd', borderRadius: 10, background: '#eff6ff', color: '#1e3a8a' };
export default function GrammarTravelConsolidation({ onListen, onStop }: { onListen: (text: string) => void; onStop: () => void }) {
  const [task, setTask] = useState<'shop' | 'room'>('shop');
  const fields = task === 'shop' ? ['shopPrice', 'shopQuantity'] : ['roomObject', 'roomAnimal'];
  return <section aria-label="생활·여행 적용 연습" style={{ display: 'grid', gap: 16 }}>
    <h2>배운 표현으로 메모 두 줄 · 적용 연습 2개</h2>
    <p>생활·여행 기초 6수업에서 배운 말을 조합해요. 실제 주문·전송이나 여행 회화 전체의 완료 평가가 아니에요.</p>
    <nav aria-label="적용 연습 선택" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" style={actionStyle} aria-pressed={task === 'shop'} onClick={() => { onStop(); setTask('shop'); }}>1. 가상 가게 메모</button>
      <button type="button" style={actionStyle} aria-pressed={task === 'room'} onClick={() => { onStop(); setTask('room'); }}>2. 방 안내 메모</button>
    </nav>
    <p>{task === 'shop' ? '가격을 묻는 말과 수량을 요청하는 말을 구분해 보세요.' : '놓인 물건과 사람·동물의 존재 표현을 구분해 보세요.'}</p>
    {fields.map((id, index) => <div key={id}><h3>{index === 0 ? '첫 줄' : '둘째 줄'}</h3><GrammarWritingPractice practice={TRAVEL_CONSOLIDATION[id]} onListen={onListen} /></div>)}
  </section>;
}
