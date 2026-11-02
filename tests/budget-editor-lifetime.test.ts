import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parseExpenseField, EDIT_FIELDS } from '../app/budget/lib/history-edit.ts';
import { pendingCategoryKey } from '../app/budget/lib/category-memory.ts';
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(done=>{resolve=done});return {promise,resolve}; }
function fixture() {
 const auth=deferred<{data:{user:{id:string}},error:null}>(),rpc=deferred<{data:{count:number,undone:boolean}|null,error:unknown}>();
 const state={auth:0,rpc:0,refresh:0,message:'',pending:null as unknown}, store=new Map<string,string>();
 const loadGeneration={current:0},operationGeneration={current:0};
 const client={auth:{getUser:()=>{state.auth++;return auth.promise}},rpc:()=>{state.rpc++;return rpc.promise}};
 const source=readFileSync(new URL('../app/budget/components/category-editor.tsx',import.meta.url),'utf8');
 const perform=source.slice(source.indexOf('  const perform ='),source.indexOf('  const undo ='));
 const cleanup=source.match(/return \(\) => \{([\s\S]*?)\};\n  }, \[load\]\);/)![1];
 const context={client,userId:'synthetic-A',busyRef:{current:false},loadGeneration,operationGeneration,field:'amount',fieldInput:'200',category:'기타',remember:false,pending:null,selected:[{id:'synthetic-row',user_id:'synthetic-A',amount:100}],history:[],parseExpenseField,EDIT_FIELDS,pendingCategoryKey,crypto:{randomUUID:()=> 'synthetic-request'},window:{localStorage:{setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)}},
 setBusy:()=>{},setLoaded:()=>{},setError:()=>{},setMessage:(s:string)=>{state.message=s},setSelected:()=>{},setConfirmation:()=>{},setUndoId:()=>{},setForgetRule:()=>{},setPending:(p:unknown)=>{state.pending=p},onChanged:async()=>{state.refresh++},load:async()=>true};
 const code=ts.transpileModule(perform+'\n;({save,perform,dispose:()=>{'+cleanup+'}})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const handlers=vm.runInNewContext(code,context) as {save:()=>Promise<void>;perform:(fn:()=>Promise<string>)=>Promise<void>;dispose:()=>void};
 return {auth,rpc,state,store,...handlers};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('closing editor during auth prevents stale save RPC and pending journal write',async()=>{
 const f=fixture();const saved=f.save();f.dispose();f.auth.resolve({data:{user:{id:'synthetic-A'}},error:null});await tick();f.rpc.resolve({data:{count:1,undone:false},error:null});await saved;
 assert.equal(f.state.rpc,0);assert.equal(f.store.size,0);assert.equal(f.state.refresh,0);
});
test('closing after dispatch retains pending reconciliation and ignores late completion',async()=>{
 const f=fixture();const saved=f.save();f.auth.resolve({data:{user:{id:'synthetic-A'}},error:null});await tick();assert.equal(f.state.rpc,1);assert.equal(f.store.size,1);f.dispose();f.rpc.resolve({data:{count:1,undone:false},error:null});await saved;
 assert.equal(f.store.size,1);assert.equal(f.state.refresh,0);assert.equal(f.state.message,'');
});
test('mounted confirmed save succeeds and clears its pending request',async()=>{
 const f=fixture();const saved=f.save();f.auth.resolve({data:{user:{id:'synthetic-A'}},error:null});await tick();f.rpc.resolve({data:{count:1,undone:false},error:null});await saved;
 assert.equal(f.state.rpc,1);assert.equal(f.store.size,0);assert.equal(f.state.refresh,1);assert.match(f.state.message,/1건/);
});
test('different authenticated owner cannot dispatch old editor intent',async()=>{
 const f=fixture();const saved=f.save();f.auth.resolve({data:{user:{id:'synthetic-B'}},error:null});await saved;assert.equal(f.state.rpc,0);assert.equal(f.store.size,0);
});
test('duplicate confirm while auth pending starts only one operation',async()=>{
 const f=fixture();const a=f.save(),b=f.save();f.auth.resolve({data:{user:{id:'synthetic-A'}},error:null});await tick();f.rpc.resolve({data:{count:1,undone:false},error:null});await Promise.all([a,b]);assert.equal(f.state.auth,1);assert.equal(f.state.rpc,1);
});
test('uncertain RPC response retains same request for reconciliation',async()=>{
 const f=fixture();const saved=f.save();f.auth.resolve({data:{user:{id:'synthetic-A'}},error:null});await tick();f.rpc.resolve({data:null,error:{code:'NETWORK'}});await saved;assert.equal(f.store.size,1);assert.equal(f.state.message,'');
});
