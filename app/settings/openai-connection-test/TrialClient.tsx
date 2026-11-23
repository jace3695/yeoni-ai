"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import AuthGate from '../../components/AuthGate';
import AppIdentity from '../../components/AppIdentity';
import {supabase} from '../../lib/supabase';
import {createTrialClient,TRIAL_QUESTION,type TrialPreview} from '../../../lib/synthetic-trial-client';
function Trial({children}:{children:ReactNode}){
 const [preview,setPreview]=useState<TrialPreview|null>(null),[consent,setConsent]=useState(false),[status,setStatus]=useState('아직 연결 상태를 확인하지 않았어요.'),[busy,setBusy]=useState(false),[started,setStarted]=useState(false),[sent,setSent]=useState(false);
 const [answer,setAnswer]=useState('');
 const client=useRef<ReturnType<typeof createTrialClient>|null>(null),generation=useRef(0);
 useEffect(()=>{
  client.current=createTrialClient(async()=>{if(!supabase)return null;const {data,error}=await supabase.auth.getSession();const s=data.session;return error||!s?null:{token:s.access_token,owner:s.user.id};},fetch);
  const sub=supabase?.auth.onAuthStateChange((event)=>{if(event==='INITIAL_SESSION')return;generation.current++;client.current?.invalidate();setPreview(null);setAnswer('');setConsent(false);setBusy(false);setStatus('로그인 상태가 바뀌어 시험을 중단했어요. 이미 전송된 요청은 취소되지 않을 수 있어요.');});
  return()=>{generation.current++;client.current?.invalidate();client.current=null;sub?.data.subscription.unsubscribe();};
 },[]);
 async function run(execute:boolean){if(!client.current||busy)return;const g=generation.current;setBusy(true);if(execute)setSent(true);else setStarted(true);
  try{if(execute){const result=await client.current.execute(consent);if(g===generation.current){setAnswer(result.advice.summary.slice(0,4000));setStatus('서버에서 시험 응답을 받았어요. 전체 AI 기능 검증 완료를 뜻하지는 않아요.');}}else{const p=await client.current.prepare();if(g===generation.current){setPreview(p);setStatus('가상 시험 미리보기가 준비됐어요. 아직 OpenAI에 보내지 않았어요.');}}}
  catch(e){if(g===generation.current)setStatus(e instanceof Error&&e.message==='OPENAI_NOT_ACTIVATED'?'서버의 가상 연결 시험이 아직 활성화되지 않았어요. 실제 AI 호출은 하지 않았어요.':'시험을 완료했다고 확인할 수 없어요. 자동 재전송하지 않습니다. 이미 전송된 요청의 취소나 비용 환급은 보장되지 않아요. 상태 확인 전 다시 시도하지 마세요.');}
  finally{if(g===generation.current)setBusy(false);}
 }
 return <main className="min-h-dvh bg-yeoni-bg text-[#242231]"><header className="app-module-header"><div className="app-module-header-inner"><AppIdentity kind="settings" title="OpenAI 연결 시험" subtitle="가상 문장으로 한 번만 확인" /></div></header><div className="mx-auto max-w-3xl px-4 py-7"><Link href="/settings">← 통합 설정</Link><section className="mt-6 rounded-3xl bg-white p-5 shadow-sm"><h1 className="text-xl font-bold">내 기록 없이 연결 확인</h1><p className="mt-3">이 시험은 가계부·건강·운동·학습 기록을 읽거나 보내지 않아요. 일반 AI 조언 기능과 별도의 제한된 시험입니다.</p><p className="mt-3 text-sm text-gray-600">미리보기 버튼은 서버에 가상 시험 승인안을 저장합니다. OpenAI 전송은 이후 별도 동의 버튼을 누를 때만 진행합니다.</p><blockquote className="my-4 rounded-xl bg-gray-50 p-4">{TRIAL_QUESTION}</blockquote>{answer&&<p className="my-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4">{answer}</p>}<p role="status" className="my-4">{status}</p><button className="btn" disabled={busy||started} onClick={()=>void run(false)}>시험 미리보기 만들기</button>{preview&&<div className="mt-5 rounded-xl bg-[#EEEDFE] p-4"><p>제공사: OpenAI · 모델: {preview.model}</p><p>최대 비용: US$0.302304 (302,304 microUSD). 실제 비용이 아니라 이번 요청의 보수적 상한입니다.</p><p>전송 자료: 위 고정 문장과 빈 기록 요약 {'{}'}</p><p>유효 기한: {new Date(preview.expiresAt).toLocaleString('ko-KR')}</p><p>미리보기는 시험 승인 원장에 저장됩니다. 실행은 유효한 서버 예산·크레딧 범위에서만 허용됩니다.</p><label className="my-4 flex gap-3"><input type="checkbox" checked={consent} disabled={busy||sent} onChange={e=>setConsent(e.target.checked)}/>가상 자료의 OpenAI 전송과 위 비용 상한 내 1회 시험에 동의합니다.</label><button className="btn" disabled={!consent||busy||sent} onClick={()=>void run(true)}>동의하고 한 번 시험하기</button></div>}</section>{children}</div></main>;
}
export default function TrialClient({children}:{children:ReactNode}){return <AuthGate><Trial>{children}</Trial></AuthGate>;}
