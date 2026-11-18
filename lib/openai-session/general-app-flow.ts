import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadFreeAdviceContext} from '../free-advice-records.ts';
import {isFreeAdviceScope} from '../free-advice-context.ts';
import {registerVerifiedGeneralSession} from './general-session-registration.ts';
import {createGeneralIdentityAuthority} from './general-identity-authority.ts';
import {prepareGeneralProposal} from './general-proposal.ts';
import {saveGeneralProposal,confirmStoredGeneralProposal} from './general-proposal-store.ts';
import {createReviewedGeneralRuntime} from './general-reviewed-runtime.ts';
import type {AdviceRequest} from '../openai-advice-server.ts';
type RuntimeDeps=Parameters<typeof createReviewedGeneralRuntime>[2];
type Review=Parameters<typeof createReviewedGeneralRuntime>[1];
/** Uses the app's existing user-RLS record aggregation. createUserClient MUST
 * return this request's user-scoped SDK (never service role), same auth and reads.
 * No automatic configuration/env/permissions/keys. Dependencies remain uninstalled.
 */
export function createGeneralAppFlow(config:{enabled:boolean;snapshotRaceAccepted:boolean},review:Review,deps:Omit<RuntimeDeps,'createClient'>&{
 createUserClient:(r:Request)=>Promise<SupabaseClient>;
 billing:(ownerId:string)=>Promise<{budgetId:string;organization:string;project:string;creditVerifiedUntil:number}>;
}){
 const enabled=config.enabled===true,snapshot=config.snapshotRaceAccepted===true,checkedReview=Object.freeze({...review}),d=Object.freeze({...deps});
 const auth=async(r:Request)=>{if(!enabled||!snapshot)throw Error('OPENAI_NOT_ACTIVATED');const client=await d.createUserClient(r);const createClient=async()=>client;
 await registerVerifiedGeneralSession(r,createClient,d.store,{snapshotRaceAccepted:true});
 const authority=await createGeneralIdentityAuthority(r,createClient,d.store,{snapshotRaceAccepted:true});return {client,authority};};
 return Object.freeze({
  async prepare(request:Request,raw:unknown){const x=raw as Record<string,unknown>;if(!x||typeof x!=='object'||Object.keys(x).sort().join('|')!=='feature|question|scope'||!isFreeAdviceScope(x.scope))throw Error('INVALID_SCOPE');const scope=x.scope;
   const {client,authority}=await auth(request);
   const proposal=await prepareGeneralProposal(authority,{feature:x.feature,question:x.question},async identity=>{
    const context=await loadFreeAdviceContext(client,identity.ownerId,scope,new Date(d.now()));const summary=JSON.stringify(context);
    return {...await d.billing(identity.ownerId),summary,revision:createHash('sha256').update(summary).digest('hex')};
   },checkedReview,d.now);
   await saveGeneralProposal(authority,proposal.serverProposal);return proposal.view;
  },
  async execute(request:Request,advice:AdviceRequest,confirmation:unknown){const {client,authority}=await auth(request);
   await confirmStoredGeneralProposal(authority,advice,confirmation,d.now());
   return createReviewedGeneralRuntime({enabled:true,snapshotRaceAccepted:true},checkedReview,{...d,createClient:async()=>client})(request,advice,confirmation);
  },
 });
}
