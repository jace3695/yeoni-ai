/** Server SDK bridge, not a session-revocation authority. Uninstalled.
 * The caller must create a fresh SDK client bound to this exact HTTP request.
 * Never inject getSession(), decoded JWTs, cached browser identity or service-role user lookup.
 */
export type AuthClient={auth:{getUser():Promise<unknown>}};
const fail=():never=>{throw Error('VERIFIED_IDENTITY_UNAVAILABLE');};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function createVerifiedUserBridge(request:Request,createRequestClient:(r:Request)=>Promise<AuthClient>){
 let started=false;
 return {async getUser(r:Request){
  if(started||r!==request||request.signal.aborted)return fail();
  started=true;
  try{
   const client=await createRequestClient(request);
   if(request.signal.aborted)return fail();
   const raw=await client.auth.getUser();
   if(request.signal.aborted||!record(raw)||raw.error!==null||!record(raw.data)||!record(raw.data.user))return fail();
   const user=raw.data.user;
   if(typeof user.id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)||user.is_anonymous!==false)return fail();
   // Emit only verified UUID. Email, metadata, session/token and provider fields are not propagated.
   return {data:{user:{id:user.id}},error:null};
  }catch{return fail();}
 }};
}
