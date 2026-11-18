import type {Pool} from './pg-transaction.ts';
/** Adapt the app's installed postgres.js reserve/unsafe API; never constructs SQL credentials.
 * MUST receive a dedicated OpenAI accounting pool, not the shared application pool.
 * postgres.js has no per-reserved-connection destroy API. Uncertain release tombstones
 * this adapter and closes the dedicated pool; it never returns that connection for reuse.
 */
type Reserved={unsafe(text:string,parameters?:unknown[]):PromiseLike<unknown[]>;release():void};
export type DedicatedSql={reserve():Promise<Reserved>;end(options:{timeout:number}):Promise<void>};
export function createPostgresJsPool(sql:DedicatedSql):Pool{
 let poisoned=false;
 const poison=()=>{if(poisoned)return;poisoned=true;void Promise.resolve().then(()=>sql.end({timeout:0})).catch(()=>{});};
 return {async connect(){
  if(poisoned)throw Error('ACCOUNTING_POOL_QUARANTINED');
  const reserved=await sql.reserve();
  if(poisoned){ // Another transaction became uncertain while this checkout was pending.
   // Pool shutdown owns teardown; never release a possibly contaminated checkout.
   throw Error('ACCOUNTING_POOL_QUARANTINED');
  }
  let released=false;
  return {
   async query(text:string,values:unknown[]=[]){
    if(released||poisoned)throw Error('ACCOUNTING_POOL_QUARANTINED');
    const rows=await reserved.unsafe(text,values);
    if(!Array.isArray(rows))throw Error('INVALID_DATABASE_RESULT');
    return {rows:Array.from(rows)};
   },
   release(destroy=false){
    if(released)return;released=true;
    if(destroy){poison();return;}
    if(poisoned)return;
    try{reserved.release();}catch{poison();}
   },
  };
 }};
}
