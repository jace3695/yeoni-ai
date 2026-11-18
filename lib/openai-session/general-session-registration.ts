import {createVerifiedUserBridge} from './verified-user.ts';
import {createLiveSessionLock} from './live-session-lock.ts';
import type {ReservationStore} from './general-reservation.ts';
type Client={auth:{getUser():Promise<unknown>;getClaims():Promise<unknown>}};
/** Server login lifecycle candidate, no endpoint installed. Requires freshly
 * verified SDK and live session before and after mapping write. Mapping alone
 * never authenticates. Disabled mappings cannot be reactivated here.
 * Sequence/table must already exist under separately approved setup.
 */
export async function registerVerifiedGeneralSession(request:Request,createClient:(r:Request)=>Promise<Client>,store:ReservationStore,review:{snapshotRaceAccepted:boolean}){
 if(review?.snapshotRaceAccepted!==true||request.signal.aborted)throw Error('SESSION_REGISTRATION_DENIED');
 const client=await createClient(request),user=await createVerifiedUserBridge(request,async()=>client).getUser(request);
 const live=await createLiveSessionLock(request,user.data.user.id,{getClaims:()=>client.auth.getClaims()},'reviewed-snapshot');
 return store.transaction(async tx=>{
  if(!await live.assertAndLock(tx,request))throw Error('LIVE_SESSION_REQUIRED');
  const r=await tx.query(`INSERT INTO yeoni_openai_general.session_epochs(owner_id,session_id,epoch,active,expires_at)
   VALUES($1,$2,nextval('yeoni_openai_general.session_epoch_sequence'),true,clock_timestamp()+interval '5 minutes')
   ON CONFLICT(owner_id,session_id) DO UPDATE SET expires_at=clock_timestamp()+interval '5 minutes'
   WHERE yeoni_openai_general.session_epochs.active=true RETURNING epoch`,[live.identity.ownerId,live.identity.sessionId]);
  if(r.rows.length!==1)throw Error('SESSION_REGISTRATION_DENIED');
  const raw=r.rows[0].epoch,n=Number(raw);
  if((typeof raw!=='number'&&typeof raw!=='string')||!/^\d+$/.test(String(raw))||!Number.isSafeInteger(n)||n<1)throw Error('SESSION_REGISTRATION_DENIED');
  if(!await live.assertAndLock(tx,request))throw Error('LIVE_SESSION_REQUIRED');
  return Object.freeze({...live.identity,epoch:n});
 });
}
// Revalidation is still required for every monetary operation and transmission.
// No auto reactivation, auth security settings, account mutation or data migration.
