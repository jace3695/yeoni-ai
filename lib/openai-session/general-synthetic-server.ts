import {createGeneralRouteHandler} from './general-route-handler.ts';
import {createGeneralPrepareHandler} from './general-prepare-handler.ts';
import {createGeneralIdentityAuthority} from './general-identity-authority.ts';
import {registerVerifiedGeneralSession} from './general-session-registration.ts';
import {createVerifiedUserBridge} from './verified-user.ts';
import {createLiveSessionLock} from './live-session-lock.ts';
import {GENERAL_SYNTHETIC_QUESTION,createGeneralSyntheticExecution} from './general-synthetic-execution.ts';
import {prepareGeneralSyntheticProposal,confirmGeneralSyntheticProposal} from './general-synthetic-preparation.ts';
import {readGeneralPrepareOnlyEnvironment} from './general-environment-composition.ts';
type Config={enabled:boolean;snapshotRaceAccepted:boolean;configurationReviewed:boolean;requestId:string;ownerId:string;expiresAt:number;allowedOrigin:string}&({sessionId:string;sessionBinding?:never}|{sessionBinding:'authenticated';sessionId?:never});
type Review=Parameters<typeof createGeneralSyntheticExecution>[1];
type Deps=Parameters<typeof createGeneralSyntheticExecution>[2]&{billing:()=>Promise<{budgetId:string;organization:string;project:string;creditVerifiedUntil:number}>};
function validConfig(c:Config,n:number){
 const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
 const binding=c.sessionBinding==='authenticated'?!Object.hasOwn(c,'sessionId'):!Object.hasOwn(c,'sessionBinding')&&typeof c.sessionId==='string'&&uuid(c.sessionId);
 try{const u=new URL(c.allowedOrigin);return binding&&[c.ownerId,c.requestId].every(uuid)&&Number.isSafeInteger(n)&&Number.isSafeInteger(c.expiresAt)&&c.expiresAt>n&&c.expiresAt-n<=300000&&u.protocol==='https:'&&u.origin===c.allowedOrigin;}catch{return false;}
}
export const denySyntheticExecution=async()=>Response.json({available:false,code:'OPENAI_SYNTHETIC_PREPARE_ONLY'},{status:403,headers:{'Cache-Control':'no-store'}});
const off=()=>Object.freeze({available:false,POST:createGeneralRouteHandler(),PREPARE:createGeneralPrepareHandler()});
/** Explicit server assembly. No normal record loaders; request client has auth only. */
export function createGeneralSyntheticServer(config:Config,review:Review,deps:Deps,mode:'execution'|'prepare-only'='execution'){
 const c=Object.freeze({...config});if(c.enabled!==true||c.snapshotRaceAccepted!==true||c.configurationReviewed!==true)return off();
 if(!validConfig(c,deps.now()))return off();
 // Fixed enums only, after verified owner/session gate. Never log caught errors or input.
 const diagnostic=(stage:'SESSION_REGISTRATION_FAILED'|'IDENTITY_AUTHORITY_FAILED'|'PROPOSAL_PREPARE_FAILED')=>{try{console.warn('YEONI_SYNTHETIC_STAGE',stage)}catch{/* logging cannot change control flow */}};
 const auth=async(r:Request,phase:'prepare'|'execute')=>{
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
  // Only a manual PREPARE can provision a mapping. EXECUTE reuses a verified
  // existing epoch and may not write or extend a mapping, even for the same owner.
  if(phase==='prepare'){
   try{await registerVerifiedGeneralSession(r,async()=>pinned,deps.store,{snapshotRaceAccepted:true},stage=>{try{console.warn('YEONI_SYNTHETIC_REGISTRATION_STAGE',stage)}catch{/* fixed enums only */}});}catch(error){diagnostic('SESSION_REGISTRATION_FAILED');throw error;}
  }
  let authority:Awaited<ReturnType<typeof createGeneralIdentityAuthority>>;
  try{authority=await createGeneralIdentityAuthority(r,async()=>pinned,deps.store,{snapshotRaceAccepted:true});}catch(error){diagnostic('IDENTITY_AUTHORITY_FAILED');throw error;}
  if(authority.identity.ownerId!==live.identity.ownerId||authority.identity.sessionId!==live.identity.sessionId)throw Error('SYNTHETIC_IDENTITY_CHANGED');
  return {client:pinned,authority,bound};
 };
 return Object.freeze({available:true,
 PREPARE:createGeneralPrepareHandler({enabled:true,allowedOrigin:c.allowedOrigin},async(r,raw)=>{
  const x=raw as Record<string,unknown>;
  if(x.feature!=='conversation'||x.question!==GENERAL_SYNTHETIC_QUESTION||x.scope!=='synthetic')throw Error('SYNTHETIC_INPUT_REJECTED');
  const {authority,bound}=await auth(r,'prepare');
  try{return await prepareGeneralSyntheticProposal(authority,bound,deps.billing,review,deps.now);}catch(error){diagnostic('PROPOSAL_PREPARE_FAILED');throw error;}
 }),
 POST:mode==='prepare-only'?denySyntheticExecution:createGeneralRouteHandler({enabled:true,allowedOrigin:c.allowedOrigin,syntheticSettledReceipt:true},async(r,advice,confirmation)=>{
  if(advice.requestId!==c.requestId||advice.question!==GENERAL_SYNTHETIC_QUESTION||advice.feature!=='conversation')throw Error('SYNTHETIC_INPUT_REJECTED');
  const {client,authority,bound}=await auth(r,'execute');
  await confirmGeneralSyntheticProposal(authority,bound,confirmation,deps.now);
  return createGeneralSyntheticExecution(bound,review,{...deps,createClient:async()=>client})(r,advice,confirmation);
 })});
}
async function loadDefault(){const [{default:postgres},m]=await Promise.all([import('postgres'),import('./general-server-dependencies.ts')]);return {postgres,...m};}
/** Reuse existing production Secret names without reading them into responses/logs.
 * Caller must explicitly install approved fixed config. No global activation mutation.
 */
async function composeSynthetic(config:Config,env:Readonly<Record<string,string|undefined>>,now:()=>number,load:typeof loadDefault,mode:'execution'|'prepare-only'){
 if(config.enabled!==true||config.snapshotRaceAccepted!==true||config.configurationReviewed!==true)return off();
 const fixed=Object.freeze({...config});if(!validConfig(fixed,now()))return off();
 let sql:any;
 try{
  const c=readGeneralPrepareOnlyEnvironment(env,now());if(c.scope.ownerId!==fixed.ownerId||fixed.expiresAt>c.scope.creditVerifiedUntil||c.allowedOrigin!==fixed.allowedOrigin)return off();
  const m=await load();sql=m.postgres(c.databaseUrl,{max:1,prepare:false,ssl:c.databaseTls,connect_timeout:10,idle_timeout:20});
  const store=m.createGeneralAccountingStore(sql),billing=m.createGeneralBillingResolver(store,[c.scope],now);
  const userClient=m.createGeneralBearerClient(c.supabase);
  return createGeneralSyntheticServer(fixed,c.review,{store,now,billing:()=>billing(fixed.ownerId),
   createClient:async r=>{const u=await userClient(r);return {auth:u.auth}},
   // The reviewed runtime resolves the key only after authorization and a durable hold.
   credentials:mode==='execution'?m.createGeneralScopedCredentials({organization:c.scope.organization,project:c.scope.project,expiresAt:Math.min(fixed.expiresAt,c.scope.creditVerifiedUntil)},async()=>env.YEONI_OPENAI_API_KEY??null,now):async()=>null,
   transport:mode==='execution'?m.createGeneralProviderTransport():async()=>{throw Error('SYNTHETIC_EXECUTION_DISABLED');}},mode);
 }catch{if(sql)void Promise.resolve().then(()=>sql.end({timeout:0})).catch(()=>{});return off();}
}
export function composeGeneralSyntheticServer(config:Config,env:Readonly<Record<string,string|undefined>>,now:()=>number=Date.now,load=loadDefault){return composeSynthetic(config,env,now,load,'execution');}
/** No provider credential read, construction or use, even if directly called. */
export function composeGeneralSyntheticPrepareOnlyServer(config:Config,env:Readonly<Record<string,string|undefined>>,now:()=>number=Date.now,load=loadDefault){return composeSynthetic(config,env,now,load,'prepare-only');}
export const GENERAL_SYNTHETIC_SERVER=off();
