/** Client fence for the no-send panel. Never establishes authorization. */
export function createPayloadPreviewAuthState(){
 let owner:string|undefined,active:{controller:AbortController;owner?:string}|undefined;
 function cancel(){const last=active;active=undefined;last?.controller.abort();}
 return {
  begin(){if(active)return null;const controller=new AbortController();active={controller,owner};return controller.signal;},
  bind(signal:AbortSignal,next:string){
   if(!active||active.controller.signal!==signal||!next||(active.owner!==undefined&&active.owner!==next))return false;
   active.owner=owner=next;return true;
  },
  current(signal:AbortSignal){return active?.controller.signal===signal&&!signal.aborted;},
  finish(signal:AbortSignal){if(active?.controller.signal!==signal)return false;active=undefined;return true;},
  cancel,
  event(event:string,next?:string){
   if(event==='INITIAL_SESSION'&&owner===undefined&&!active){owner=next;return 'ignore';}
   const same=!!next&&next===owner;
   if(same&&(event==='TOKEN_REFRESHED'||event==='SIGNED_IN')){
    if(!active)return 'ignore';
    cancel();return 'refreshed';
   }
   owner=next;cancel();return 'changed';
  },
 };
}
