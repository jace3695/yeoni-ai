import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync('app/assistant/AssistantClient.tsx','utf8');
function deferred(){let resolve!:(v:unknown)=>void;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function fixture(){
 const auth=deferred(),save=deferred(),writes:unknown[]=[];const state={messages:[] as unknown[],effects:0};
 const context={chatEpoch:{current:1},chatSendId:{current:0},chatDraftLease:{current:null},entryLock:{current:null},localBodyOwner:{current:'A'},pending:{ownerId:'A'},crypto:{randomUUID:()=> 'synthetic-id'},supabase:{auth:{getUser:()=>auth.promise},from:()=>({insert:(value:unknown)=>{writes.push(value);return save.promise}})},authSubscription:{data:{subscription:{unsubscribe(){}}}},window:{removeEventListener(){}},RECORDS_CHANGED_EVENT:'synthetic',clear(){},invalidate(){},storage(){},characterAudio:false,setCharacterReply(){state.effects++},adviceSpokenText:()=>'',setChatMessages:(fn:(v:unknown[])=>unknown[])=>{state.messages=fn(state.messages)},setActiveAdvice(){state.effects++},setAdviceBusy(){state.effects++},setChatHistoryNotice(){state.effects++}};
 const finish=source.slice(source.indexOf('  const finishAdvice ='),source.indexOf('\n  const signOut ='));
 const effect=source.slice(source.indexOf('    const authSubscription ='),source.indexOf('  }, [pending.ownerId, clearCharacter, setChatInput]);'));
 const cleanup=effect.slice(effect.indexOf('    return () => {')+'    return '.length).trim().replace(/;$/,'');
 const code=ts.transpileModule(finish+'\nglobalThis.run=finishAdvice;globalThis.leave='+cleanup+';', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const sandbox=vm.createContext(context);vm.runInContext(code,sandbox);const api=sandbox as unknown as {run:(a:unknown,s:string)=>Promise<void>;leave:()=>void};
 const run=()=>api.run({summary:'synthetic',nextSteps:[],basis:'fixture',limitations:'not real'},'example');
 return{...api,run,auth,save,writes,state,context};
}
const authA={data:{user:{id:'A'}}};
test('leaving during advice authentication cannot start a history insert',async()=>{const f=fixture();const task=f.run().catch(()=>{});f.leave();f.auth.resolve(authA);f.save.resolve({error:null});await task;assert.equal(f.writes.length,0);assert.equal(f.state.effects,0);});
test('leaving after dispatch ignores late advice history response',async()=>{const f=fixture();const task=f.run();f.auth.resolve(authA);await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);f.leave();f.save.resolve({error:null});await task;assert.deepEqual(f.state.messages,[]);assert.equal(f.state.effects,0);});
test('current advice completion still stores and presents the result',async()=>{const f=fixture();const task=f.run();f.auth.resolve(authA);f.save.resolve({error:null});await task;assert.equal(f.writes.length,1);assert.equal(f.state.messages.length,1);});
test('account change rejects old advice before dispatch',async()=>{const f=fixture();const task=f.run().catch(()=>{});f.context.localBodyOwner.current='B';f.context.chatEpoch.current++;f.auth.resolve(authA);await task;assert.equal(f.writes.length,0);});
