"use client";
import { useState } from 'react';
import { normalizeGrammarInput, type GrammarWritingPractice as Practice } from '@/data/grammarWritingPractice';
const button = {minHeight:44,padding:'10px 14px',border:'1px solid #93c5fd',borderRadius:10,background:'#eff6ff',color:'#1e3a8a'};
export default function GrammarWritingPractice({ practice: firstPractice, alternate, onListen }: { practice: Practice; alternate?: Practice; onListen: (text:string)=>void }) {
 const [another,setAnother] = useState(false);
 const practice = another && alternate ? alternate : firstPractice;
 const [help,setHelp] = useState(true);
 const [answer,setAnswer] = useState('');
 const [checked,setChecked] = useState(false);
 const [reflection,setReflection] = useState('');
 const normalizedAnswer = normalizeGrammarInput(answer);
 const correct = practice.answers.includes(normalizedAnswer);
 const completedSentence = correct ? practice.before + normalizedAnswer + practice.after : practice.result;
 return <section aria-label="직접 써 보기" style={{padding:16,border:'1px solid #bfdbfe',borderRadius:12,lineHeight:1.8}}>
  <h3>상황에 맞게 직접 써 보기</h3><p>이번 수업에서 배운 표현으로 빈칸을 완성해요.</p><p>{practice.context}</p><button type="button" style={button} aria-expanded={help} onClick={()=>setHelp(value=>!value)}>도움말 {help ? "가리기" : "보기"}</button>{help && <p>필요한 말: {practice.words}</p>}
  <form onSubmit={event=>{event.preventDefault();setChecked(true);setReflection('');}}>
   <label htmlFor="grammar-written-answer">{practice.prompt}</label>
   <p lang="ja">{practice.before}<input id="grammar-written-answer" aria-label="빈칸에 들어갈 일본어" value={answer} maxLength={30} onChange={event=>{setAnswer(event.target.value);setChecked(false);setReflection('');}} style={{width:'6em',maxWidth:'100%',minHeight:44,border:'1px solid #64748b',margin:'0 6px',padding:6}} />{practice.after}</p>
   <button type="submit" style={button} disabled={!answer.trim()}>쓴 답 확인</button>
  </form>
  {checked && <div role="status"><strong>{correct ? '맞게 썼어요.' : '이번 연습의 예시 답과 비교해 보세요.'}</strong><p lang="ja">{completedSentence}</p><p>{practice.reason}</p><button type="button" style={button} onClick={()=>onListen(completedSentence)}>완성 문장 듣기</button></div>}
  {checked && alternate && <button type="button" style={button} onClick={()=>{setAnother(value=>!value);setHelp(false);setAnswer('');setChecked(false);setReflection('');}}>다른 예문으로 다시 써 보기</button>}
  {checked && <fieldset style={{marginTop:16}}><legend>오늘 목표를 스스로 확인해요</legend>{['뜻을 생각하며 혼자 쓸 수 있어요','아직 예문을 보며 더 연습할래요'].map(value=><label key={value} style={{display:'block',padding:'8px 0'}}><input type="radio" name="grammar-reflection" checked={reflection===value} onChange={()=>setReflection(value)} /> {value}</label>)}{reflection && <p>이 선택은 이번 연습의 자기 점검이에요. 다음에는 예문을 가리고 다시 써 보세요.</p>}</fieldset>}
 </section>;
}
