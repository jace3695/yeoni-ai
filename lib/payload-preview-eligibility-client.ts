import {PAYLOAD_PREVIEW_ELIGIBILITY_PATH} from './openai-payload-preview-contract.ts';
type Session=Readonly<{owner:string;token:string}>;
type Scope={session:Session;state:'pending'|'resolved';controller:AbortController};

/** Browser display hint only. The preview endpoint independently authorizes every click. */
export function createPayloadPreviewEligibility(send:typeof fetch,show:(allowed:boolean)=>void,timeoutMs=9_000){
 let current:Scope|undefined,closed=false;
 function change(event:string,session:Session|null){
  if(closed)return;
  if(event==='SIGNED_OUT'||!session?.owner||!session.token){
   current?.controller.abort();current=undefined;show(false);return;
  }
  if(event!=='INITIAL_SESSION'&&event!=='SIGNED_IN'&&event!=='TOKEN_REFRESHED')return;
  if(current?.session.owner===session.owner){
   const sameToken=current.session.token===session.token;
   // A completed decision does not poll on token refresh within this mounted login.
   if(sameToken)return;
   if(event==='TOKEN_REFRESHED'&&current.state==='resolved'){current.session=session;return;}
  }
  current?.controller.abort();
  const ticket:Scope={session,state:'pending',controller:new AbortController()};
  current=ticket;show(false);
  const done=(allowed:boolean)=>{
   if(closed||ticket!==current||ticket.state!=='pending')return;
   ticket.state='resolved';show(allowed);
  };
  const timer=setTimeout(()=>{ticket.controller.abort();done(false);},timeoutMs);
  const signal=ticket.controller.signal;
  signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  async function check(){
   try{
    if(signal.aborted)return;
    const response=await send(PAYLOAD_PREVIEW_ELIGIBILITY_PATH,{method:'POST',headers:{Authorization:`Bearer ${ticket.session.token}`},
     credentials:'same-origin',cache:'no-store',redirect:'error',signal});
    done(!signal.aborted&&response.status===204&&response.body===null);
   }catch{done(false);}
   finally{clearTimeout(timer);}
  }
  void check();
 }
 return {change,close(){closed=true;current?.controller.abort();current=undefined;}};
}
