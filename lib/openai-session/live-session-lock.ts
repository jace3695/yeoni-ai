/** Uninstalled server-only live-session lock, based on the app's existing live_session predicate.
 * This proves session/user eligibility only, NOT an account epoch or consent/budget grant.
 * getClaims must be Supabase's verified SDK method on the same request client as getUser.
 * Never pass decoded JWTs, getSession(), browser metadata or raw HTTP claims.
 */
export type Transaction={query(text:string,values:readonly unknown[]):Promise<{rows:unknown[]}>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const denied=():never=>{throw Error('LIVE_SESSION_REQUIRED');};
export const LIVE_SESSION_LOCK_SQL=`SELECT s.id::text AS session_id,s.user_id::text AS owner_id
FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
WHERE s.id=$1::uuid AND s.user_id=$2::uuid
AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp())
AND NOT coalesce(u.is_anonymous,false)
AND to_timestamp($3::double precision)>clock_timestamp()
FOR SHARE OF s,u`;
// Read-only predicate: EXECUTE must already be authorized; no auth table UPDATE grant.
// Snapshot cannot prevent logout between its completion and external transmission.
export const LIVE_SESSION_SNAPSHOT_SQL=`SELECT yeoni_connector.live_session($1::uuid,$2::uuid) AS live,
 to_timestamp($3::double precision)>clock_timestamp() AS unexpired`;
export async function createLiveSessionLock(request:Request,verifiedUserId:string,
 verifiedSdk:{getClaims():Promise<unknown>},mode:'locked'|'reviewed-snapshot'='locked'){
 if(request.signal.aborted||!uuid(verifiedUserId))return denied();
 let raw:unknown;try{raw=await verifiedSdk.getClaims();}catch{return denied();}
 if(request.signal.aborted||!obj(raw)||raw.error!==null||!obj(raw.data)||!obj(raw.data.claims))return denied();
 const claims=raw.data.claims;
 if(claims.sub!==verifiedUserId||!uuid(claims.session_id)||claims.role!=='authenticated'||claims.is_anonymous!==false||
 typeof claims.exp!=='number'||!Number.isSafeInteger(claims.exp)||claims.exp<=0||claims.exp>8640000000000)return denied();
 const sessionId=claims.session_id,expiresAt=claims.exp;
 return Object.freeze({
  identity:Object.freeze({ownerId:verifiedUserId,sessionId}),
  async assertAndLock(tx:Transaction,r:Request):Promise<boolean>{
   if(r!==request||request.signal.aborted)return false;
   try{
    const result=await tx.query(mode==='reviewed-snapshot'?LIVE_SESSION_SNAPSHOT_SQL:LIVE_SESSION_LOCK_SQL,[sessionId,verifiedUserId,expiresAt]);
    if(request.signal.aborted||result.rows.length!==1||!obj(result.rows[0]))return false;
    const row=result.rows[0];
    return mode==='reviewed-snapshot'?row.live===true&&row.unexpired===true:row.session_id===sessionId&&row.owner_id===verifiedUserId;
   }catch{return false;}
  },
 });
}
