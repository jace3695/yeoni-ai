const key = 'growth-recovery-qa-v1';
let owner = 'synthetic-growth-a';
const listeners = new Set<(event: string, session: unknown) => void>();
let loseNext = false, failRead = 0, rejectNext = false;
type Row = Record<string, unknown>;
const load = (): { routines: Row[]; sessions: Row[]; inserts: number; marker: string | null } => JSON.parse(localStorage.getItem(key) ?? '{"routines":[],"sessions":[],"inserts":0,"marker":null}');
const save = (data: ReturnType<typeof load>) => { localStorage.setItem(key, JSON.stringify(data)); window.dispatchEvent(new Event('fixture-change')); };
export function metrics() { const db=load();return { owner, rows: db.routines.filter(row=>row.user_id===owner).length, inserts: db.inserts, ids: db.routines.filter(row=>row.user_id===owner).map(row=>row.id) }; }
export function injectLoss() { loseNext=true; }
export function injectRejection() { rejectNext=true; }
export function switchOwner() { owner=owner==='synthetic-growth-a'?'synthetic-growth-b':'synthetic-growth-a'; for(const fn of listeners) fn('SIGNED_IN',{user:{id:owner}}); window.dispatchEvent(new Event('fixture-change')); }
export function renamePending() { const db=load(); const row=db.routines.filter(row=>row.user_id===owner).at(-1);if(row){row.title='다른 화면에서 수정한 가상 활동';row.enabled=false;row.preferred_days=[5];save(db);} }
export function resetAfterRequest() { const db=load();db.marker='synthetic-reset-'+Date.now();save(db); }
export const supabase = { auth: { getUser: async()=>({data:{user:{id:owner}},error:null}), onAuthStateChange:(fn:(event:string,session:unknown)=>void)=>{listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};} },from:(table:string)=>{
 let op='read',payload:Row|null=null,single=false;const filters:Array<(row:Row)=>boolean>=[];
 const execute=async()=>{
  const db=load();if(table==='user_app_state') return {data:{state:{'ai-fitness-record-reset-growth':db.marker}},error:null};
  if(!['growth_routines','growth_sessions'].includes(table)) throw Error('unexpected table '+table);
  const bucket=table==='growth_routines'?db.routines:db.sessions;
  let rows=bucket.filter(row=>filters.every(fn=>fn(row)));
  if(op==='insert') { db.inserts++;if(!rejectNext && !bucket.some(row=>row.id===payload!.id))bucket.push({...payload,created_at:payload!.updated_at});const fail=loseNext||rejectNext;if(loseNext)failRead=1;loseNext=false;rejectNext=false;save(db);return {data:fail?null:payload,error:fail?Error('synthetic lost response'):null}; }
  if(op==='update') {rows.forEach(row=>Object.assign(row,payload));save(db);}
  if(op==='read'&&failRead>0&&single){failRead--;return {data:null,error:Error('synthetic read failure')};}
  rows=rows.map(row=>({...row}));return {data:single?rows[0]??null:rows,error:null};
 };
 const q={select:()=>q,eq:(k:string,v:unknown)=>{filters.push(row=>row[k]===v);return q;},gte:(k:string,v:string)=>{filters.push(row=>String(row[k])>=v);return q;},in:(k:string,v:unknown[])=>{filters.push(row=>v.includes(row[k]));return q;},order:()=>q,abortSignal:()=>q,insert:(v:Row)=>{op='insert';payload=v;return q;},update:(v:Row)=>{op='update';payload=v;return q;},single:()=>{single=true;return execute();},maybeSingle:()=>{single=true;return execute();},then:(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown)=>execute().then(resolve,reject)};return q;
} };
