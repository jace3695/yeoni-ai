import {composeGeneralSyntheticPrepareOnlyServer,denySyntheticExecution,GENERAL_SYNTHETIC_SERVER} from './general-synthetic-server.ts';
type Env=Readonly<Record<string,string|undefined>>;
type Config=Parameters<typeof composeGeneralSyntheticPrepareOnlyServer>[0];
type Handlers=Awaited<ReturnType<typeof composeGeneralSyntheticPrepareOnlyServer>>;
/** Server-only trial activation. Never use NEXT_PUBLIC variables for identity or secrets. */
export function readSyntheticTrialConfig(env:Env,now:number):Config|null{
 if(env.YEONI_OPENAI_SYNTHETIC_ENABLED!=='true')return null;
 try{
  const x=JSON.parse(env.YEONI_OPENAI_SYNTHETIC_TRIAL||'');
  if(!x)return null;
  const shape=Object.keys(x).sort().join('|');
  const authenticated=shape==='allowedOrigin|expiresAt|ownerId|requestId|sessionBinding'&&x.sessionBinding==='authenticated';
  const fixed=shape==='allowedOrigin|expiresAt|ownerId|requestId|sessionId';
  if(!authenticated&&!fixed)return null;
  const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  if(![x.ownerId,x.requestId].every(uuid)||(!authenticated&&!uuid(x.sessionId))||!Number.isSafeInteger(now)||!Number.isSafeInteger(x.expiresAt)||x.expiresAt<=now||x.expiresAt-now>300000)return null;
  if(typeof x.allowedOrigin!=='string')return null;
  const u=new URL(x.allowedOrigin);if(u.protocol!=='https:'||u.origin!==x.allowedOrigin)return null;
  if(env.YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED!=='true'||env.YEONI_OPENAI_SNAPSHOT_REVIEWED!=='true')return null;
  return Object.freeze({...x,enabled:true,snapshotRaceAccepted:true,configurationReviewed:true});
 }catch{return null;}
}
/** One private snapshot and one lazy pool per module instance. Never roll an expired trial
 * forward automatically; durable request/grant ledger controls replay across instances. */
export function createSyntheticInstallation(env:Env,now:()=>number=Date.now,compose:typeof composeGeneralSyntheticPrepareOnlyServer=composeGeneralSyntheticPrepareOnlyServer){
 // Snapshot only configuration used by this no-send route; never read a provider key or unrelated secrets.
 const prepareOnlyKeys=['YEONI_OPENAI_SYNTHETIC_ENABLED','YEONI_OPENAI_SYNTHETIC_TRIAL',
  'YEONI_OPENAI_SYNTHETIC_CONFIGURATION_REVIEWED','YEONI_OPENAI_SNAPSHOT_REVIEWED',
  'YEONI_OPENAI_DATABASE_URL','YEONI_OPENAI_DATABASE_HOST','YEONI_OPENAI_GLOBAL_PRICING_REVIEWED',
  'YEONI_OPENAI_PRICE_VERIFIED_AT_MS','YEONI_OPENAI_PRICE_EXPIRES_AT_MS','YEONI_OPENAI_BILLING_SCOPE',
  'YEONI_OPENAI_ALLOWED_ORIGIN','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
 const e=Object.freeze(Object.fromEntries(prepareOnlyKeys.map(key=>[key,env[key]])));let loaded:Promise<Handlers>|undefined;
 const prepare=async(r:Request)=>{
  const c=readSyntheticTrialConfig(e,now());
  if(!c)return GENERAL_SYNTHETIC_SERVER.PREPARE(r);
  try{const handlers=loaded??(loaded=compose(c,e,now));return await (await handlers).PREPARE(r);}catch{return GENERAL_SYNTHETIC_SERVER.PREPARE(r);}
 };
 // This build is PREPARE-only even if a trial flag is enabled or mistyped.
 // Keep disabled trials' existing OFF response and never consult the composed POST.
 const blockExecution=async(r:Request)=>{
  if(!readSyntheticTrialConfig(e,now()))return GENERAL_SYNTHETIC_SERVER.POST(r);
  return denySyntheticExecution();
 };
 return Object.freeze({POST:blockExecution,PREPARE:prepare});
}
