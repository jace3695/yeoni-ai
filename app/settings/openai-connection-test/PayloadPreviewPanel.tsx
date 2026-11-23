'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {requestPayloadPreview,type PayloadPreview} from '../../../lib/openai-payload-preview-contract';
import {createPayloadPreviewAuthState} from '../../../lib/payload-preview-auth-state';
import {remainingPreviewDisplay,startPreviewDisplay,type PreviewDisplayDeadline} from '../../../lib/payload-preview-display-expiry';

type VisiblePreview={data:PayloadPreview;deadline:PreviewDisplayDeadline};

export default function PayloadPreviewPanel(){
 const [trial]=useState(createPayloadPreviewAuthState);
 const [preview,setPreview]=useState<VisiblePreview|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>{
  const subscription=supabase?.auth.onAuthStateChange((event,session)=>{
   const change=trial.event(event,session?.user.id);
   if(change==='ignore')return;
   setBusy(false);setPreview(null);
   setStatus(change==='refreshed'?'로그인이 갱신됐어요. 다시 눌러 확인할 수 있어요.':'');
  });
  return ()=>{trial.cancel();subscription?.data.subscription.unsubscribe();};
 },[trial]);
 useEffect(()=>{
  if(!preview)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const recheck=()=>{
   clearTimeout(timer);
   const remaining=remainingPreviewDisplay(preview.deadline);
   if(remaining>0){timer=setTimeout(recheck,Math.ceil(remaining));return;}
   setPreview(current=>current===preview?null:current);
  };
  recheck();
  document.addEventListener('visibilitychange',recheck);
  window.addEventListener('pageshow',recheck);
  window.addEventListener('focus',recheck);
  return ()=>{
   clearTimeout(timer);
   document.removeEventListener('visibilitychange',recheck);
   window.removeEventListener('pageshow',recheck);
   window.removeEventListener('focus',recheck);
  };
 },[preview]);

 async function run(){
  if(!supabase)return;
  const client=supabase,signal=trial.begin();
  if(!signal)return;
  setBusy(true);setPreview(null);setStatus('미리보기를 계산하고 있어요.');
  const timeout=setTimeout(()=>{
   if(!trial.current(signal))return;
   trial.cancel();setBusy(false);setStatus('미리보기를 확인하지 못했어요. 자동으로 다시 요청하지 않아요.');
  },10000);
  try{
   const result=await requestPayloadPreview(async()=>{
    const {data,error}=await client.auth.getSession(),s=data.session;
    return !error&&s&&trial.bind(signal,s.user.id)?{owner:s.user.id,token:s.access_token}:null;
   },fetch,signal);
   if(trial.current(signal)){setPreview({data:result,deadline:startPreviewDisplay()});setStatus('전송 없이 요청 내용을 계산했어요.');}
  }catch{if(trial.current(signal))setStatus('이 계정에서 미리보기를 확인하지 못했어요.');}
  finally{clearTimeout(timeout);if(trial.finish(signal))setBusy(false);}
 }
 return <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
  <h2 className="text-xl font-bold">전송 전 요청 내용 보기</h2>
  <p className="mt-3">앱의 요청 생성 코드로 고정 가상 문장을 계산해요. 개인 기록을 불러오거나 승인안을 저장하지 않고, OpenAI에 보내지 않아요.</p>
  <button className="btn mt-4" disabled={busy} onClick={()=>void run()}>저장·전송 없이 보기</button>
  <p className="mt-3" role="status">{status==='전송 없이 요청 내용을 계산했어요.'&&!preview?'미리보기 표시 시간이 끝났어요. 다시 눌러 확인할 수 있어요.':status}</p>
  {preview&&<div className="mt-4 rounded-xl bg-gray-50 p-4">
   <p>모델: {preview.data.model} · 최대 응답 토큰: {preview.data.maximumOutputTokens}</p>
   <p>가상 문장: {preview.data.question}</p>
   <p>기록 요약: 비어 있음 · 표시 시간: 5분</p>
   <p>OpenAI 응답, 연결 또는 비용이 확인된 것은 아니에요.</p>
  </div>}
 </section>;
}
