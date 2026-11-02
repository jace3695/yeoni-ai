"use client";
import { useId, useState } from 'react';
import { normalizeGrammarInput, type GrammarWritingPractice as Practice } from '@/data/grammarWritingPractice';
const button = {minHeight:44,padding:'10px 14px',border:'1px solid #93c5fd',borderRadius:10,background:'#eff6ff',color:'#1e3a8a'};
export default function GrammarWritingPractice({ practice: firstPractice, alternate, onListen }: { practice: Practice; alternate?: Practice; onListen: (text:string)=>void }) {
 const inputId = useId();
 const [another,setAnother] = useState(false);
 const practice = another && alternate ? alternate : firstPractice;
 const [help,setHelp] = useState(true);
 const [answer,setAnswer] = useState('');
 const [checked,setChecked] = useState(false);
 const [reflection,setReflection] = useState('');
 const normalizedAnswer = normalizeGrammarInput(answer, practice.sentenceInput, practice.questionInput);
 const correct = practice.answers.includes(normalizedAnswer);
 const reading = correct ? practice.answerReadings?.[normalizedAnswer] ?? practice.reading : practice.reading;
 const completedSentence = correct ? practice.before + normalizedAnswer + practice.after : practice.result;
 return <section aria-label="직접 써 보기" style={{padding:16,border:'1px solid #bfdbfe',borderRadius:12,lineHeight:1.8}}>
  <h3>상황에 맞게 직접 써 보기</h3><p>{practice.fragmentInput ? '제시된 명사나 제목만 써요. 문장부호는 붙이지 않아요.' : practice.sentenceInput ? '주어진 표현으로 한 문장을 써요. 문장 끝 。는 생략해도 돼요.' : '이번 수업에서 배운 표현으로 빈칸을 완성해요.'}</p><p>{practice.context}</p><button type="button" style={button} aria-expanded={help} onClick={()=>setHelp(value=>!value)}>도움말 {help ? "가리기" : "보기"}</button>{help && <p>필요한 말: {practice.words}</p>}
  <form onSubmit={event=>{event.preventDefault();setChecked(true);setReflection('');}}>
   <label htmlFor={inputId}>{practice.prompt}</label>
   <p lang="ja" style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6}}>{practice.before && <span style={{whiteSpace:"nowrap"}}>{practice.before}</span>}<input id={inputId} aria-label={practice.prompt} value={answer} maxLength={80} onChange={event=>{setAnswer(event.target.value);setChecked(false);setReflection('');}} style={{width:practice.sentenceInput ? '100%' : '12em',maxWidth:'100%',minHeight:44,border:'1px solid #64748b',padding:6}} />{!practice.sentenceInput && <span style={{whiteSpace:"nowrap"}}>{practice.after}</span>}</p>
   <button type="submit" style={button} disabled={!answer.trim()}>쓴 답 확인</button>
  </form>
  {checked && <div role="status"><strong>{correct ? '맞게 썼어요.' : '이번 연습의 예시 답과 비교해 보세요.'}</strong><p lang="ja">{completedSentence}</p>{reading && <p>읽는 법: {reading}</p>}<p>{practice.reason}</p>{!correct && <p>목록에 없는 다른 표현이 가능한 경우도 있어요. 이번 수업의 목표 표현을 연습해 보세요.</p>}<button type="button" style={button} onClick={()=>onListen(completedSentence)}>완성 문장 듣기</button></div>}
  {checked && <button type="button" style={button} onClick={()=>{if(alternate) setAnother(value=>!value);setHelp(false);setAnswer('');setChecked(false);setReflection('');}}>{alternate ? '다른 예문으로 다시 써 보기' : '도움 없이 다시 쓰기'}</button>}
  {checked && <fieldset style={{marginTop:16}}><legend>오늘 목표를 스스로 확인해요</legend>{['뜻을 생각하며 혼자 쓸 수 있어요','아직 예문을 보며 더 연습할래요'].map(value=><label key={value} style={{display:'block',padding:'8px 0'}}><input type="radio" name={`${inputId}-reflection`} checked={reflection===value} onChange={()=>setReflection(value)} /> {value}</label>)}{reflection && <p>이 선택은 이번 연습의 자기 점검이에요. 다음에는 예문을 가리고 다시 써 보세요.</p>}</fieldset>}
 </section>;
}
