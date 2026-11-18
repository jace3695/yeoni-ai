import {createGeneralRouteHandler} from './general-route-handler.ts';
import {createGeneralPrepareHandler} from './general-prepare-handler.ts';
import {createGeneralIdentityAuthority} from './general-identity-authority.ts';
import {registerVerifiedGeneralSession} from './general-session-registration.ts';
import {createVerifiedUserBridge} from './verified-user.ts';
import {createLiveSessionLock} from './live-session-lock.ts';
import {GENERAL_SYNTHETIC_QUESTION,createGeneralSyntheticExecution} from './general-synthetic-execution.ts';
import {prepareGeneralSyntheticProposal,confirmGeneralSyntheticProposal} from './general-synthetic-preparation.ts';
import {readGeneralEnvironment} from './general-environment-composition.ts';
type Config={enabled:boolean;snapshotRaceAccepted:boolean;configurationReviewed:boolean;requestId:string;ownerId:string;expiresAt:number;allowedOrigin:string}&({sessionId:string;sessionBinding?:never}|{sessionBinding:'authenticated';sessionId?:never});
type Review=Parameters<typeof createGeneralSyntheticExecution>[1];
type Deps=Parameters<typeof createGeneralSyntheticExecution>[2]&{billing:()=>Promise<{budgetId:string;organization:string;project:string;creditVerifiedUntil:number}>};
function validConfig(c:Config,n:number){
 const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
 const binding=c.sessionBinding==='authenticated'?!Object.hasOwn(c,'sessionId'):!Object.hasOwn(c,'sessionBinding')&&typeof c.sessionId==='string'&&uuid(c.sessionId);
 try{const u=new URL(c.allowedOrigin);return binding&&[c.ownerId,c.requestId].every(uuid)&&Number.isSafeInteger(n)&&Number.isSafeInteger(c.expiresAt)&&c.expiresAt>n&&c.expiresAt-n<=300000&&u.protocol==='https:'&&u.origin===c.allowedOrigin;}catch{return false;}
}
const off=()=>Object.freeze({available:false,POST:createGeneralRouteHandler(),PREPARE:createGeneralPrepareHandler()});
/** Explicit server assembly. No normal record loaders; request client has auth only. */
export function createGeneralSyntheticServer(config:Config,review:Review,deps:Deps){
 const c=Object.freeze({...config});if(c.enabled!==true||c.snapshotRaceAccepted!==true||c.configurationReviewed!==true)return off();
 if(!validConfig(c,deps.now()))return off();
 const auth=async(r:Request)=>{
  if(r.signal.aborted||deps.now()>=c.expiresAt)throw Error('SYNTHETIC_SCOPE_EXPIRED');
  const client=await deps.createClient(r);
  const user=await createVerifiedUserBridge(r,async()=>client).getUser(r);
  const live=await createLiveSessionLock(r,user.data.user.id,{getClaims:()=>client.auth.getClaims()},'reviewed-snapshot');
  if(live.identity.ownerId!==c.ownerId||(c.sessionBinding!=='authenticated'&&live.identity.sessionId!==c.sessionId))throw Error('SYNTHETIC_IDENTITY_REJECTED');
  // Pin every subsequent SDK result to the initial verified identity, before any registration write.
  const pinned={auth:{
   getUser:async()=>{const result=await client.auth.getUser();if(r.signal.aborted||deps.now()>=c.expiresAt||(result as any)?.data?.user?.id!==live.identity.ownerId)throw Error('SYNTHETIC_IDENTITY_CHANGED');return result;},
   getClaims:async()=>{const result=await client.auth.getClaims(),claims=(result as any)?.data?.claims;if(r.signal.aborted||deps.now()>=c.expiresAt||claims?.sub!==live.identity.ownerId||claims?.session_id!==live.identity.sessionId)throw Error('SYNTHETIC_IDENTITY_CHANGED');return result;}
  }};
  const bound=Object.freeze({...c,sessionId:live.identity.sessionId});
  // Registration can write only after exact verified identity match.
  await registerVerifiedGeneralSession(r,async()=>pinned,deps.store,{snapshotRaceAccepted:true});
  const authority=await createGeneralIdentityAuthority(r,async()=>pinned,deps.store,{snapshotRaceAccepted:true});
  if(authority.identity.ownerId!==live.identity.ownerId||authority.identity.sessionId!==live.identity.sessionId)throw Error('SYNTHETIC_IDENTITY_CHANGED');
  return {client:pinned,authority,bound};
 };
 return Object.freeze({available:true,
 PREPARE:createGeneralPrepareHandler({enabled:true,allowedOrigin:c.allowedOrigin},async(r,raw)=>{
  const x=raw as Record<string,unknown>;
  if(x.feature!=='conversation'||x.question!==GENERAL_SYNTHETIC_QUESTION||x.scope!=='synthetic')throw Error('SYNTHETIC_INPUT_REJECTED');
  const {authority,bound}=await auth(r);return prepareGeneralSyntheticProposal(authority,bound,deps.billing,review,deps.now);
 }),
 POST:createGeneralRouteHandler({enabled:true,allowedOrigin:c.allowedOrigin},async(r,advice,confirmation)=>{
  if(advice.requestId!==c.requestId||advice.question!==GENERAL_SYNTHETIC_QUESTION||advice.feature!=='conversation')throw Error('SYNTHETIC_INPUT_REJECTED');
  const {client,authority,bound}=await auth(r);
  await confirmGeneralSyntheticProposal(authority,bound,confirmation,deps.now);
  return createGeneralSyntheticExecution(bound,review,{...deps,createClient:async()=>client})(r,advice,confirmation);
 })});
}
async function loadDefault(){const [{default:postgres},m]=await Promise.all([import('postgres'),import('./general-server-dependencies.ts')]);return {postgres,...m};}
/** Reuse existing production Secret names without reading them into responses/logs.
 * Caller must explicitly install approved fixed config. No global activation mutation.
 */
export async function composeGeneralSyntheticServer(config:Config,env:Readonly<Record<string,string|undefined>>,now:()=>number=Date.now,load=loadDefault){
 if(config.enabled!==true||config.snapshotRaceAccepted!==true||config.configurationReviewed!==true)return off();
 const fixed=Object.freeze({...config});if(!validConfig(fixed,now()))return off();
 let sql:any;
 try{
  const c=readGeneralEnvironment({...env,YEONI_OPENAI_GENERAL_ENABLED:'true'},now());if(!c||c.scope.ownerId!==fixed.ownerId||fixed.expiresAt>c.scope.creditVerifiedUntil||c.allowedOrigin!==fixed.allowedOrigin)return off();
  const m=await load();sql=m.postgres(c.databaseUrl,{max:1,prepare:false,ssl:{rejectUnauthorized:true},connect_timeout:10,idle_timeout:20});
  const store=m.createGeneralAccountingStore(sql),billing=m.createGeneralBillingResolver(store,[c.scope],now);
  const userClient=m.createGeneralBearerClient(c.supabase);
  return createGeneralSyntheticServer(fixed,c.review,{store,now,billing:()=>billing(fixed.ownerId),
   createClient:async r=>{const u=await userClient(r);return {auth:u.auth}},
   credentials:m.createGeneralScopedCredentials({organization:c.scope.organization,project:c.scope.project,expiresAt:c.scope.creditVerifiedUntil},async()=>c.apiKey,now),transport:m.createGeneralProviderTransport()});
 }catch{if(sql)void Promise.resolve().then(()=>sql.end({timeout:0})).catch(()=>{});return off();}
}
export const GENERAL_SYNTHETIC_SERVER=off();
