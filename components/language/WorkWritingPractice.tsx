"use client";
import { useEffect, useRef, useState } from 'react';
import GrammarWritingPractice from './GrammarWritingPractice';
import { WORK_MESSAGE, WORK_WRITING_UNITS } from '@/data/workWriting';
const button = { minHeight: 44, padding: '10px 14px', border: '1px solid #93c5fd', borderRadius: 10, background: '#eff6ff', color: '#1e3a8a' };
const ownerKeys = ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch'];
function currentOwner() {
  try { return JSON.stringify(ownerKeys.map(key => localStorage.getItem(key))); } catch { return ''; }
}
export default function WorkWritingPractice({ onListen, onStop }: { onListen: (text: string) => void; onStop: () => void }) {
  const [selected, setSelected] = useState(0);
  const [practice, setPractice] = useState(false);
  const [revision, setRevision] = useState(0);
  const [integration, setIntegration] = useState(false);
  const [reflection, setReflection] = useState(false);
  const owner = useRef('');
  useEffect(() => {
    owner.current = currentOwner();
    const clear = () => { owner.current = currentOwner(); onStop(); setRevision(value => value + 1); setSelected(0); setPractice(false); setIntegration(false); setReflection(false); };
    const storage = (event: StorageEvent) => { if (event.key === null || ownerKeys.includes(event.key)) clear(); };
    const focus = () => { if (owner.current !== currentOwner()) clear(); };
    window.addEventListener('yeoni-cloud-session-changed', clear);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', focus);
    return () => { window.removeEventListener('yeoni-cloud-session-changed', clear); window.removeEventListener('storage', storage); window.removeEventListener('focus', focus); };
  }, [onStop]);
  const choose = (index: number) => { onStop(); setSelected(index); setPractice(false); setIntegration(false); setReflection(false); };
  const unit = WORK_WRITING_UNITS[selected];
  return <section aria-label="내부 업무 글 응용" style={{ display: 'grid', gap: 16, lineHeight: 1.8 }}>
    <header><h2>내부 업무 글 읽기·표현 선택</h2><strong>가상 업무 연습 · 실제로 전송되지 않아요.</strong><p>배운 문법을 활용하는 응용 5개와 통합 읽기 1개예요. 실제 본사 업무 수행 능력이나 모든 경어를 인증하는 과정은 아니에요. 답안·자기점검은 이번 화면에서만 사용하며 저장하지 않아요.</p></header>
    <label>업무 응용 선택 <select style={{ width: '100%', minHeight: 44 }} value={integration ? 'reading' : String(selected)} onChange={event => { if (event.target.value === 'reading') { onStop(); setIntegration(true); setReflection(false); } else choose(Number(event.target.value)); }}>{WORK_WRITING_UNITS.map((item, index) => <option value={index} key={item.id}>{index + 1}. {item.title}</option>)}<option value="reading">통합 읽기 · 제목과 본문 일부</option></select></label>
    {integration ? <article aria-label="통합 읽기" style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 16 }}>
      <h3>제목과 본문 일부 읽기</h3><p>서로 아는 동료에게 쓰는 글을 가정한 조각이에요. 수신자·서명·첨부가 있는 전체 업무 메일이 아니에요.</p>
      <dl><dt>件名(けんめい) · 제목</dt><dd lang="ja" style={{ margin: 0 }}>{WORK_MESSAGE.subject}</dd><dd style={{ margin: 0 }}>읽기: {WORK_MESSAGE.subjectReading}</dd><dt>本文(ほんぶん) · 본문</dt><dd lang="ja" style={{ margin: 0 }}>{WORK_MESSAGE.body}</dd><dd style={{ margin: 0 }}>읽기: {WORK_MESSAGE.bodyReading}</dd></dl>
      <button type="button" style={button} onClick={() => onListen(WORK_MESSAGE.subject)}>제목 듣기</button>{' '}<button type="button" style={button} onClick={() => onListen(WORK_MESSAGE.body)}>본문 듣기</button>
      <p>{WORK_MESSAGE.meaning}</p><p>{WORK_MESSAGE.explanation}</p><p>{WORK_MESSAGE.selfCheck}</p>
      <label><input type="checkbox" checked={reflection} onChange={event => setReflection(event.target.checked)} /> 누가 무엇을 했는지 스스로 살펴봤어요.</label><p>추가 채점 문항이나 숙달 점수가 아닌 자기점검이에요.</p><button type="button" style={button} onClick={() => choose(0)}>업무 응용 처음부터 보기</button>
    </article> : <article key={`${revision}-${unit.id}`} style={{ display: 'grid', gap: 14 }}>
      <h3>{selected + 1}. {unit.title}</h3><nav aria-label="업무 응용 단계" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" style={button} aria-current={!practice ? 'step' : undefined} onClick={() => { onStop(); setPractice(false); }}>설명과 예문</button><button type="button" style={button} aria-current={practice ? 'step' : undefined} onClick={() => { onStop(); setPractice(true); }}>표현 고르기</button></nav>
      {!practice ? <><p>{unit.explanation}</p>{unit.tasks.map(task => <section key={task.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}><p>{task.context}</p><p>필요한 말: {task.words}</p><p lang="ja">{task.result}</p><p>읽기: {task.reading}</p><p>뜻: {task.meaning}</p><button type="button" style={button} onClick={() => onListen(task.result)}>예문 듣기</button><p>{task.reason}</p></section>)}<button type="button" style={button} onClick={() => { onStop(); setPractice(true); }}>예문을 가리고 표현 고르기</button></> : <><p>일본어 문장의 뜻과 조사를 비교하며 상황에 맞는 표현을 골라요. 이번 화면의 선택 연습은 직접 쓰기 능력 평가가 아니에요.</p>{unit.tasks.map((task, index) => <div key={task.id}><h4>{index + 1}번 · {task.meaning}</h4><GrammarWritingPractice practice={task} onListen={onListen} /></div>)}<p>{unit.selfCheck}</p></>}
      <nav aria-label="업무 응용 이동" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{selected > 0 && <button type="button" style={button} onClick={() => choose(selected - 1)}>이전 응용</button>}{selected < WORK_WRITING_UNITS.length - 1 ? <button type="button" style={button} onClick={() => choose(selected + 1)}>다음 응용</button> : <button type="button" style={button} onClick={() => { onStop(); setIntegration(true); setReflection(false); }}>통합 읽기로 이어가기</button>}</nav>
    </article>}
    <details><summary>범위와 참고 자료</summary><p>대학의 공개 메일 작성 안내에서 제목·본문 역할과 상대의 지위·친숙함·부담을 고려하는 원칙을 참고했어요. 대학생활 자료가 모든 기업의 규정은 아니에요. 한국어 풀이와 문제는 앱을 위해 새로 작성했으며 교사 감수·학습 효과 우월성을 검증한 과정은 아니에요.</p><a href="https://plaza.cme.osaka-u.ac.jp/2024/11/20/essay08/" target="_blank" rel="noreferrer">오사카대학교 메일 작성 안내</a>{' · '}<a href="https://alc.chiba-u.jp/eyr/2020/10/29/01mail.html" target="_blank" rel="noreferrer">지바대학교 연락 글 안내</a></details>
  </section>;
}
