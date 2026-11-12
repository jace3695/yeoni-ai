"use client";
import { useId, useState } from 'react';
import type { GrammarWritingPractice as Practice } from '@/data/grammarWritingPractice';
import { getGrammarChoicePractice } from '@/data/grammarChoicePractice';

const button = { minHeight: 44, padding: '10px 14px', border: '1px solid #93c5fd', borderRadius: 10, background: '#eff6ff', color: '#1e3a8a' };
type Props = { practice: Practice; alternate?: Practice; onListen: (text: string) => void };

/** The historical name/data contract stays intact; this component no longer accepts typed answers. */
export default function GrammarWritingPractice(props: Props) {
  return <ChoiceSequence key={JSON.stringify([props.practice, props.alternate])} {...props} />;
}
function ChoiceSequence({ practice, alternate, onListen }: Props) {
  const [attempt, setAttempt] = useState(0);
  const active = alternate && attempt % 2 ? alternate : practice;
  return <ChoiceCard key={attempt} practice={active} onListen={onListen} alternate={!!alternate} onRetry={() => setAttempt(value => value + 1)} />;
}
function ChoiceCard({ practice, onListen, alternate, onRetry }: { practice: Practice; onListen: Props['onListen']; alternate: boolean; onRetry: () => void }) {
  const questionId = useId();
  const [help, setHelp] = useState(false);
  const [helpUsed, setHelpUsed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [reflection, setReflection] = useState('');
  const question = getGrammarChoicePractice(practice);
  if (!question) return <p role="status">이 표현의 선택 연습을 준비하고 있어요. 설명과 예문을 먼저 살펴보세요.</p>;
  const correct = answer === question.answer;
  const reading = practice.answerReadings?.[question.answer] ?? practice.reading;
  return <section aria-label="상황에 맞는 표현 고르기" style={{ padding: 16, border: '1px solid #bfdbfe', borderRadius: 12, lineHeight: 1.8 }}>
    <h3>상황에 맞는 표현 고르기</h3>
    <p>{practice.fragmentInput ? '상황에 맞는 명사나 제목을 골라요.' : practice.sentenceInput ? '상황에 맞는 한 문장을 골라요.' : '빈칸에 들어갈 표현을 골라요.'} 선택 답과 자기점검은 이번 화면에서만 사용하며 저장하지 않아요.</p>
    <p>{practice.context}</p>
    <button type="button" style={button} aria-expanded={help} onClick={() => { setHelp(value => !value); setHelpUsed(true); }}>도움말 {help ? '가리기' : '보기'}</button>
    {help && <p>필요한 말: {practice.words}</p>}
    <p id={questionId}>{question.prompt}</p>
    {!practice.sentenceInput && (practice.before || practice.after) && <p lang="ja" style={{ overflowWrap: 'anywhere' }}>{practice.before}<span aria-label="빈칸">（　）</span>{practice.after}</p>}
    <div role="group" aria-labelledby={questionId} style={{ display: 'grid', gap: 8 }}>
      {question.choices.map(choice => <button type="button" key={choice} lang="ja" aria-pressed={answer === choice} disabled={checked} style={{ ...button, textAlign: 'left', overflowWrap: 'anywhere', border: answer === choice ? '2px solid #2563eb' : button.border }} onClick={() => { setAnswer(choice); setReflection(''); }}>{choice}</button>)}
    </div>
    <button type="button" style={{ ...button, marginTop: 12 }} disabled={!answer || checked} onClick={() => setChecked(true)}>선택한 답 확인</button>
    {checked && <div role="status">
      <strong>{correct ? '상황에 맞게 골랐어요.' : '선택한 표현과 예시 답의 뜻을 비교해 보세요.'}</strong>
      <p lang="ja">{practice.result}</p>{reading && <p>읽는 법: {reading}</p>}<p>{practice.reason}</p>
      <p>{helpUsed ? '도움말을 참고한 선택 연습이에요.' : '도움말 없이 선택한 이번 연습의 결과예요.'} 직접 쓰기 능력이나 숙달 점수는 아니에요.</p>
      <button type="button" style={button} onClick={() => onListen(practice.result)}>완성 문장 듣기</button>
    </div>}
    {checked && <button type="button" style={button} onClick={onRetry}>{alternate ? '다른 예문으로 다시 고르기' : '도움 없이 다시 고르기'}</button>}
    {checked && <fieldset style={{ marginTop: 16 }}><legend>오늘 목표를 스스로 확인해요</legend>{['뜻을 생각하며 표현을 고를 수 있어요', '아직 예문을 보며 더 연습할래요'].map(value => <label key={value} style={{ display: 'block', padding: '8px 0' }}><input type="radio" name={`${questionId}-reflection`} checked={reflection === value} onChange={() => setReflection(value)} /> {value}</label>)}{reflection && <p>이 선택은 이번 연습의 자기점검이에요. 다음에는 예문을 가리고 다시 골라 보세요.</p>}</fieldset>}
  </section>;
}
