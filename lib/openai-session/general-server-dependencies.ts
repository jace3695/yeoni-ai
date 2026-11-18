import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {createPostgresJsPool,type DedicatedSql} from './postgres-js-pool.ts';
import {createPgTransaction} from './pg-transaction.ts';
import type {ReservationStore} from './general-reservation.ts';
import {createGeneralAppFlow} from './general-app-flow.ts';
import {createGeneralAppHandlers} from './general-app-installation.ts';
/** Explicit server-only assembly. Never reads env, creates a pool, installs SQL,
 * stores credentials or enables the deployed handlers. Public-key/user RLS only.
 * Bearer-only intentionally matches authenticatedFetch; no cookie fallback.
 */
export function createGeneralBearerClient(config:{url:string;publicKey:string},factory:typeof createClient=createClient){
 const {url,publicKey}=config;
 let origin:URL;try{origin=new URL(url)}catch{throw Error('USER_CLIENT_CONFIG_REQUIRED')}
 if(origin.protocol!=='https:'||origin.origin!==url||origin.username||origin.password||!publicKey||publicKey.startsWith('sb_secret_'))throw Error('USER_CLIENT_CONFIG_REQUIRED');
 return async(request:Request):Promise<SupabaseClient>=>{
  const header=request.headers.get('authorization');
  if(request.signal.aborted||!header||!/^Bearer [^\s]+$/.test(header))throw Error('BEARER_REQUIRED');
  const token=header.slice(7);
  const client=factory(url,publicKey,{global:{headers:{Authorization:header}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  // getUser()/getClaims() without an explicit JWT may look for a local SDK
  // session even though the REST client has a global Authorization header.
  const auth=new Proxy(client.auth,{get(target,prop){
   if(prop==='getUser')return ()=>{if(request.signal.aborted)throw Error('REQUEST_CANCELLED');return target.getUser(token)};
   if(prop==='getClaims')return ()=>{if(request.signal.aborted)throw Error('REQUEST_CANCELLED');return target.getClaims(token)};
   const v=Reflect.get(target,prop,target);return typeof v==='function'?v.bind(target):v;
  }});
  return new Proxy(client,{get(target,prop){if(prop==='auth')return auth;const v=Reflect.get(target,prop,target);return typeof v==='function'?v.bind(target):v;}});
 };
}
export function createGeneralAccountingStore(sql:DedicatedSql):ReservationStore{
 const transaction=createPgTransaction(createPostgresJsPool(sql),{statementTimeoutMs:10000,lockTimeoutMs:3000});
 return {transaction:work=>transaction(tx=>work({query:async(q,p)=>{
  const result=await tx.query(q,p);
  if(result.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('INVALID_DATABASE_ROW');
  return {rows:result.rows as Record<string,unknown>[]};
 }}))};
}
export function createGeneralProviderTransport(send:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{
  if(typeof input!=='string'||input!=='https://api.openai.com/v1/chat/completions'||init?.method!=='POST'||init.redirect!=='error'||!init.signal||init.signal.aborted||typeof init.body!=='string')throw Error('PROVIDER_TRANSPORT_DENIED');
  return send(input,{...init,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
 };
}
type FlowDeps=Parameters<typeof createGeneralAppFlow>[2];
type Review=Parameters<typeof createGeneralAppFlow>[1];
/** Caller must supply reviewed public (not service-role) Supabase key, dedicated
 * least-privilege accounting pool, exact server billing resolver and scoped vault
 * credential callback. No secrets in source/config exports. OFF returns before
 * SDK/pool/transport construction. Production route still uses its OFF singleton.
 */
export function createGeneralServerHandlers(config:{enabled:boolean;snapshotRaceAccepted:boolean;allowedOrigin?:string},review:Review,deps:{
 supabase:{url:string;publicKey:string};sql:DedicatedSql;
 billing:FlowDeps['billing'];credentials:FlowDeps['credentials'];now:()=>number;
}){
 if(config.enabled!==true)return createGeneralAppHandlers();
 if(config.snapshotRaceAccepted!==true)throw Error('SNAPSHOT_REVIEW_REQUIRED');
 const store=createGeneralAccountingStore(deps.sql);
 const flow=createGeneralAppFlow({enabled:true,snapshotRaceAccepted:true},review,{store,createUserClient:createGeneralBearerClient(deps.supabase),billing:deps.billing,credentials:deps.credentials,now:deps.now,transport:createGeneralProviderTransport()});
 return createGeneralAppHandlers({enabled:true,allowedOrigin:config.allowedOrigin},flow);
}

export type ReviewedGeneralBillingScope=Readonly<{ownerId:string;budgetId:string;organization:string;project:string;creditVerifiedUntil:number}>;
/** Static server-reviewed mapping, never derived from HTTP owner/project fields.
 * Does not create/enable/refill a budget. Rechecks the existing accounting row.
 */
export function createGeneralBillingResolver(store:ReservationStore,scopes:readonly ReviewedGeneralBillingScope[],now:()=>number):FlowDeps['billing']{
 const byOwner=new Map<string,ReviewedGeneralBillingScope>();
 for(const raw of scopes){const s=Object.freeze({...raw});if(![s.ownerId,s.budgetId,s.organization,s.project].every(x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=200)||!Number.isSafeInteger(s.creditVerifiedUntil)||byOwner.has(s.ownerId))throw Error('BILLING_SCOPE_INVALID');byOwner.set(s.ownerId,s);}
 return async(ownerId)=>{
  const s=byOwner.get(ownerId);if(!s||now()>=s.creditVerifiedUntil)throw Error('BILLING_SCOPE_UNAVAILABLE');
  await store.transaction(async tx=>{
   const result=await tx.query(`SELECT id FROM yeoni_openai_general.budgets
    WHERE id=$1 AND owner_id=$2 AND organization=$3 AND project=$4 AND currency='USD'
     AND enabled=true AND expires_at>clock_timestamp()
     AND to_timestamp($5::double precision/1000.0)>clock_timestamp()
     AND held_micros<cap_micros`,[s.budgetId,s.ownerId,s.organization,s.project,s.creditVerifiedUntil]);
   if(result.rows.length!==1||result.rows[0].id!==s.budgetId)throw Error('BILLING_SCOPE_UNAVAILABLE');
  });
  if(now()>=s.creditVerifiedUntil)throw Error('BILLING_SCOPE_UNAVAILABLE');
  return {budgetId:s.budgetId,organization:s.organization,project:s.project,creditVerifiedUntil:s.creditVerifiedUntil};
 };
}
/** Scope wrapper for a separately installed secret-store callback. No environment
 * lookup, caching, fallback key, logging or key creation. Expiry after the secret
 * read is checked too. The callback itself must use the approved secret store.
 */
export function createGeneralScopedCredentials(scope:{organization:string;project:string;expiresAt:number},read:FlowDeps['credentials'],now:()=>number):FlowDeps['credentials']{
 const s=Object.freeze({...scope});if(!s.organization?.trim()||!s.project?.trim()||!Number.isSafeInteger(s.expiresAt))throw Error('CREDENTIAL_SCOPE_INVALID');
 return async(organization,project)=>{
  const valid=()=>organization===s.organization&&project===s.project&&now()<s.expiresAt;
  if(!valid())throw Error('CREDENTIAL_SCOPE_REJECTED');
  const result=await read(organization,project);
  if(!valid())throw Error('CREDENTIAL_SCOPE_REJECTED');
  if(result!==null&&(typeof result!=='string'||!result.trim()||/[\r\n]/.test(result)))throw Error('CREDENTIAL_UNAVAILABLE');
  return result;
 };
}
