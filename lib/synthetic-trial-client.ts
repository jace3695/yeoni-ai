// Browser-only protocol: never imports server configuration, records or credentials.
export const TRIAL_QUESTION='가상 연결시험입니다. 실제 기록 없이 연결 확인이라고 답하세요.';
export const TRIAL_CAP=302304;
export type TrialPreview={requestId:string;fingerprint:string;feature:'conversation';question:string;summary:string;model:string;maxCostMicros:number;expiresAt:number;notice:string;healthNotice:string};
export function validateTrialPreview(v:unknown,now=Date.now()):TrialPreview{
 const p=v as TrialPreview;
 if(!p||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.requestId)||!/^[a-f0-9]{64}$/.test(p.fingerprint)||p.feature!=='conversation'||p.question!==TRIAL_QUESTION||p.summary!=='{}'||p.model!=='gpt-5.4-mini-2026-03-17'||p.maxCostMicros!==TRIAL_CAP||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=now||p.expiresAt-now>300000||p.healthNotice!==''||typeof p.notice!=='string')throw Error('PREVIEW_REJECTED');
 return Object.freeze({...p});
}
export function createTrialClient(auth:()=>Promise<{token:string;owner:string}|null>,send:typeof fetch,now=Date.now,timeoutMs=30000){
 let generation=0,owner='',prepared=false,attempted=false,preview:TrialPreview|undefined;
 const invalidate=()=>{generation++;preview=undefined;owner='';};
 const call=async(path:string,body:unknown,g:number)=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const work=async()=>{
  const session=await auth();if(controller.signal.aborted||g!==generation||!session||!session.token||(owner&&owner!==session.owner))throw Error('SESSION_CHANGED');owner=session.owner;
  const response=await send(path,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`},credentials:'same-origin',cache:'no-store',redirect:'error',body:JSON.stringify(body)});
  if(controller.signal.aborted||g!==generation)throw Error('SESSION_CHANGED');
  const data=await response.json();if(controller.signal.aborted||g!==generation)throw Error('SESSION_CHANGED');
  const current=await auth();if(g!==generation||!current||current.owner!==owner||current.token!==session.token)throw Error('SESSION_CHANGED');
  if(!response.ok)throw Error(data?.code==='OPENAI_NOT_ACTIVATED'?'OPENAI_NOT_ACTIVATED':'OUTCOME_UNKNOWN');return data;
  };
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();invalidate();reject(Error('OUTCOME_UNKNOWN'));},Math.max(1,Math.min(timeoutMs,30000)));})]);}finally{clearTimeout(timer);}
 };
 return {invalidate,async prepare(){if(prepared)throw Error('ALREADY_ATTEMPTED');prepared=true;const g=generation;const d=await call('/api/ai/openai-general-synthetic/prepare',{feature:'conversation',question:TRIAL_QUESTION,scope:'synthetic'},g);if(d.provider!=='openai'||d.sent!==false)throw Error('PREVIEW_REJECTED');preview=validateTrialPreview(d.preview,now());return preview;},async execute(accepted:boolean){if(attempted||!accepted||!preview)throw Error('CONSENT_REQUIRED');const p=validateTrialPreview(preview,now());attempted=true;const g=generation;const result=await call('/api/ai/openai-general-synthetic',{request:{requestId:p.requestId,feature:'conversation',question:TRIAL_QUESTION},confirmation:{accepted:true,healthAccepted:false,requestId:p.requestId,fingerprint:p.fingerprint}},g);if(result.provider!=='openai'||result.recordActionsPerformed!==false||!result.advice||typeof result.advice.summary!=='string')throw Error('OUTCOME_UNKNOWN');return result;}};
}
