import {createVerifiedUserBridge} from './verified-user.ts';
import {createLiveSessionLock} from './live-session-lock.ts';
import type {ReservationStore,ReservationTransaction} from './general-reservation.ts';
type Client={auth:{getUser():Promise<unknown>;getClaims():Promise<unknown>}};
export type GeneralIdentity=Readonly<{ownerId:string;sessionId:string;epoch:number}>;
/** Request-bound server authority. No browser epoch or JWT decoding accepted.
 * Epoch mapping must already be provisioned by a reviewed server auth lifecycle;
 * this module NEVER creates or updates it, and fails closed when absent.
 * Snapshot mode is explicit and does not lock logout across external transmission.
 */
export async function createGeneralIdentityAuthority(request:Request,createClient:(r:Request)=>Promise<Client>,store:ReservationStore,review:{snapshotRaceAccepted:boolean}){
 if(review?.snapshotRaceAccepted!==true)throw Error('SNAPSHOT_REVIEW_REQUIRED');
 if(request.signal.aborted)throw Error('LIVE_SESSION_REQUIRED');
 const client=await createClient(request);
 const user=await createVerifiedUserBridge(request,async()=>client).getUser(request);
 const live=await createLiveSessionLock(request,user.data.user.id,{getClaims:()=>client.auth.getClaims()},'reviewed-snapshot');
 let identity:GeneralIdentity|undefined;
 const read=async(tx:ReservationTransaction)=>{
  if(!await live.assertAndLock(tx,request))throw Error('LIVE_SESSION_REQUIRED');
  const r=await tx.query(`SELECT epoch FROM yeoni_openai_general.session_epochs
   WHERE owner_id=$1 AND session_id=$2 AND active=true AND expires_at>clock_timestamp() FOR SHARE`,[live.identity.ownerId,live.identity.sessionId]);
  if(r.rows.length!==1)throw Error('SESSION_EPOCH_UNAVAILABLE');
  const raw=r.rows[0].epoch;
  if((typeof raw!=='number'&&typeof raw!=='string')||!/^\d+$/.test(String(raw)))throw Error('SESSION_EPOCH_UNAVAILABLE');
  const epoch=Number(raw);
  if(!Number.isSafeInteger(epoch)||epoch<0)throw Error('SESSION_EPOCH_UNAVAILABLE');
  if(identity&&identity.epoch!==epoch)throw Error('SESSION_EPOCH_CHANGED');
  return Object.freeze({...live.identity,epoch});
 };
 const guarded:ReservationStore={transaction:work=>store.transaction(async tx=>{
  await read(tx);const result=await work(tx);await read(tx);return result;
 })};
 identity=await store.transaction(async tx=>{const i=await read(tx);if(!await live.assertAndLock(tx,request))throw Error('LIVE_SESSION_REQUIRED');return i;});
 return Object.freeze({identity,store:guarded,settlementStore:store,
  // Synchronous legacy hook is ONLY local cancellation/identity equality, never a
  // fresh auth proof. Async guarded transactions and final check remain mandatory.
  isLocallyCurrent:(i:{ownerId:string;epoch:number})=>!request.signal.aborted&&i.ownerId===identity!.ownerId&&i.epoch===identity!.epoch,
  assertCurrent:()=>guarded.transaction(async()=>undefined),
 });
}
