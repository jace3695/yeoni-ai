/** Uninstalled server-only PostgreSQL transaction adapter. No credentials, pool or network is created.
 * Pool must provide an exclusively checked-out node-postgres-compatible client.
 * A rejection never implies rollback succeeded: callers must retain uncertain reservations.
 */
export type Client = {
 query(text:string, values?:unknown[]):Promise<{rows:unknown[]}>;
 release(destroy?:boolean):void;
};
export type Pool = {connect():Promise<Client>};
export class TransactionFailure extends Error {
 readonly outcome:'not-started'|'rolled-back'|'uncertain';
 constructor(outcome:'not-started'|'rolled-back'|'uncertain') {
  super('DATABASE_TRANSACTION_UNAVAILABLE');this.outcome=outcome;this.name='TransactionFailure';
 }
}
export function createPgTransaction(pool:Pool, options:{statementTimeoutMs:number;lockTimeoutMs:number}) {
 const {statementTimeoutMs,lockTimeoutMs}=options;
 if(!Number.isSafeInteger(statementTimeoutMs)||statementTimeoutMs<1||statementTimeoutMs>15000||
 !Number.isSafeInteger(lockTimeoutMs)||lockTimeoutMs<1||lockTimeoutMs>statementTimeoutMs)throw new Error('INVALID_DATABASE_TIMEOUT');
 return async function transaction<T>(work:(tx:{query(text:string,values:readonly unknown[]):Promise<{rows:unknown[]}>})=>Promise<T>):Promise<T>{
  let client:Client;
  try {client=await pool.connect();}catch{throw new TransactionFailure('not-started');}
  let destroy=false, began=false, commitStarted=false, active=true, busy=false, poisoned=false;
  try {
   await client.query('BEGIN');began=true;
   // Transaction-local values only. Never alter session defaults or server configuration.
   await client.query("SELECT set_config('statement_timeout',$1,true), set_config('lock_timeout',$2,true)",
    [`${statementTimeoutMs}ms`,`${lockTimeoutMs}ms`]);
   const tx={query:async(text:string,values:readonly unknown[])=>{
    // The callback must await each query. Never queue concurrent or post-callback statements.
    if(!active||busy){poisoned=true;throw new Error('TRANSACTION_QUERY_ORDER');}
    busy=true;
    try{return await client.query(text,[...values]);}catch(error){poisoned=true;throw error;}finally{busy=false;}
   }};
   const result=await work(tx);active=false;
   if(busy||poisoned)throw new Error('TRANSACTION_CALLBACK_INCOMPLETE');
   commitStarted=true;
   await client.query('COMMIT');
   return result;
  }catch{
   active=false;
   // No ROLLBACK/retry after COMMIT was sent: acknowledgment may have been lost.
   if(commitStarted||busy){destroy=true;throw new TransactionFailure('uncertain');}
   if(!began){destroy=true;throw new TransactionFailure('uncertain');}
   try{await client.query('ROLLBACK');}catch{destroy=true;throw new TransactionFailure('uncertain');}
   throw new TransactionFailure('rolled-back');
  }finally{
   active=false;
   // Release failure must not mask a successful commit or trigger a replay.
   try{client.release(destroy);}catch{ /* pool implementation must evict on destroy */ }
  }
 };
}
