import {GENERAL_DATABASE_POOLER_CA} from './general-database-pooler-ca.ts';
import {generalDatabaseTlsOptions} from './general-database-tls.ts';
/** Server-only installation adapter. Lazy route composition; deployed service remains unchanged until approved deployment.
 * Explicit opt-in; OFF never loads drivers, secrets, auth or the database.
 */
type Env=Readonly<Record<string,string|undefined>>;
export type GeneralEnvironmentHandlers={available:boolean;POST:(r:Request)=>Promise<Response>;PREPARE:(r:Request)=>Promise<Response>};
const unavailable=async()=>Response.json({available:false,code:'OPENAI_ADVICE_NOT_CONNECTED'},{status:503,headers:{'Cache-Control':'no-store'}});
const off=()=>Object.freeze({available:false,POST:unavailable,PREPARE:unavailable});
export function readGeneralEnvironment(e:Env,now:number){
 if(e.YEONI_OPENAI_GENERAL_ENABLED!=='true')return null;
 const required=(k:string)=>{const v=e[k];if(!v||v.trim()!==v||/[\r\n]/.test(v))throw Error('GENERAL_CONFIGURATION_REQUIRED');return v};
 const httpsOrigin=(s:string)=>{const u=new URL(s);if(u.protocol!=='https:'||u.origin!==s||u.username||u.password)throw Error('GENERAL_CONFIGURATION_REQUIRED');return s};
 const publicKey=e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||e.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!publicKey||publicKey.trim()!==publicKey||/[\r\n]/.test(publicKey)||!isPublicSupabaseKey(publicKey))throw Error('GENERAL_USER_CLIENT_REQUIRED');
 const databaseUrl=required('YEONI_OPENAI_DATABASE_URL'),u=new URL(databaseUrl);
 const host=required('YEONI_OPENAI_DATABASE_HOST');
 if(!/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(host)||u.hostname!==host||u.protocol!=='postgresql:'||u.port!=='6543'||decodeURIComponent(u.username)!=='yeoni_openai_general_server.piqqukiiacncfbztktga'||!u.password||u.pathname!=='/postgres'||u.search||u.hash)throw Error('GENERAL_DATABASE_SCOPE_REQUIRED');
 if(required('YEONI_OPENAI_SNAPSHOT_REVIEWED')!=='true'||required('YEONI_OPENAI_GLOBAL_PRICING_REVIEWED')!=='true')throw Error('GENERAL_REVIEW_REQUIRED');
 const verifiedAt=Number(required('YEONI_OPENAI_PRICE_VERIFIED_AT_MS')),expiresAt=Number(required('YEONI_OPENAI_PRICE_EXPIRES_AT_MS'));
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(verifiedAt)||!Number.isSafeInteger(expiresAt)||verifiedAt>now||expiresAt<=now||expiresAt-verifiedAt>86400000)throw Error('GENERAL_REVIEW_REQUIRED');
 const scope=JSON.parse(required('YEONI_OPENAI_BILLING_SCOPE'));
 if(!scope||Object.keys(scope).sort().join('|')!=='budgetId|creditVerifiedUntil|organization|ownerId|project'||![scope.ownerId,scope.budgetId,scope.organization,scope.project].every((v:unknown)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=200)||!Number.isSafeInteger(scope.creditVerifiedUntil)||scope.creditVerifiedUntil<=now)throw Error('GENERAL_BILLING_SCOPE_REQUIRED');
 if(required('NEXT_PUBLIC_SUPABASE_URL')!=='https://piqqukiiacncfbztktga.supabase.co'||!isPublicSupabaseKey(publicKey))throw Error('GENERAL_USER_CLIENT_REQUIRED');
 return Object.freeze({databaseUrl,host,databaseTls:generalDatabaseTlsOptions(GENERAL_DATABASE_POOLER_CA),allowedOrigin:httpsOrigin(required('YEONI_OPENAI_ALLOWED_ORIGIN')),supabase:Object.freeze({url:httpsOrigin(required('NEXT_PUBLIC_SUPABASE_URL')),publicKey:publicKey}),review:Object.freeze({verifiedAt,expiresAt,globalStandardPricingReviewed:true}),scope:Object.freeze({...scope}),apiKey:required('YEONI_OPENAI_API_KEY')});
}
async function defaultLoader(){const [{default:postgres},m]=await Promise.all([import('postgres'),import('./general-server-dependencies.ts')]);return {postgres,...m};}
/** Loader is injectable solely for isolated tests; default is real official drivers.
 * Environment snapshot stays private. Never return/log config or connection errors.
 */
export async function composeGeneralEnvironment(env:Env,now:()=>number=Date.now,load:()=>Promise<any>=defaultLoader):Promise<GeneralEnvironmentHandlers>{
 if(env.YEONI_OPENAI_GENERAL_ENABLED!=='true')return off();
 const e=Object.freeze({...env});let c:ReturnType<typeof readGeneralEnvironment>;
 try{c=readGeneralEnvironment(e,now());if(!c)return off();}catch{return off();}
 let sql:any;
 try{
  const m=await load();
  // Dedicated pool only; validate TLS peer/hostname, no prepared/pipelined queries.
  sql=m.postgres(c.databaseUrl,{max:1,prepare:false,max_pipeline:1,ssl:c.databaseTls,connect_timeout:10,idle_timeout:20});
  const store=m.createGeneralAccountingStore(sql);
  const billing=m.createGeneralBillingResolver(store,[c.scope],now);
  const credentials=m.createGeneralScopedCredentials({organization:c.scope.organization,project:c.scope.project,expiresAt:c.scope.creditVerifiedUntil},async()=>c!.apiKey,now);
  return Object.freeze({available:true,...m.createGeneralServerHandlers({enabled:true,snapshotRaceAccepted:true,allowedOrigin:c.allowedOrigin},c.review,{supabase:c.supabase,sql,billing,credentials,now})});
 }catch{if(sql)void Promise.resolve().then(()=>sql.end({timeout:0})).catch(()=>{});return off();}
}

/** Format/role guard only, not JWT authentication. */
export function isPublicSupabaseKey(key:string):boolean{
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return true;
 try{const parts=key.split('.');if(parts.length!==3)return false;return JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')).role==='anon';}catch{return false;}
}
