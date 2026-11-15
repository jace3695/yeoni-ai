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

// Exact panel request/effect and authenticatedFetch, with synthetic auth/events/fetch/timers only.
// This is not React, SDK, provider, or browser verification.
test('free advice panel: 53 request, owner-generation and lifetime regressions', async () => {
  const panelSource = readFileSync('components/FreeAdvicePanel.tsx', 'utf8');
  const helperSource = readFileSync('lib/supabase.ts', 'utf8');
  const moduleSource = String.raw`'use strict';
const vm=require('node:vm'),assert=require('node:assert/strict');
module.exports=async function verifyFreeAdviceBoundary(panel,transport,ts){
 const ast=ts.createSourceFile('panel.tsx',panel,99,true,ts.ScriptKind.TSX);
 function extract(source,name){const a=ts.createSourceFile('input.tsx',source,99,true,ts.ScriptKind.TSX),out=[];function walk(n){if((ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))&&n.name?.text===name)out.push(n.getText(a).replace(/^export /,''));ts.forEachChild(n,walk)}walk(a);assert.equal(out.length,1,name);return out[0]}
 const effects=[];function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect')effects.push(n.arguments[0].getText(ast));ts.forEachChild(n,walk)}walk(ast);assert.equal(effects.length,1);
 const code=ts.transpileModule([extract(transport,'AuthenticatedFetchBoundaryError'),extract(transport,'authenticatedFetch'),extract(panel,'requestAdvice'),'const startEffect='+effects[0]+';'].join('\n'),{compilerOptions:{target:99}}).outputText;
 const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});promise.catch(()=>{});return {promise,resolve,reject}};
 const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
 const contextBody={recordSource:'user-records',metrics:[],notes:[],recordCount:1};
 const adviceBody={summary:'SYNTHETIC_ADVICE',nextSteps:[],basis:'synthetic',limitations:'not real'};
 function harness({complete=false,ignoreAbort=false,sourceOwnerId}={}){
  const props={sourceOwnerId};
  const refs={questionOriginOwner:{current:sourceOwnerId},accountEpoch:{current:0},mounted:{current:false},identity:{current:undefined},requestNumber:{current:0},inFlight:{current:false},controller:{current:null}};
  const state={accountScope:null,question:'SYNTHETIC_A_QUESTION',preview:{context:contextBody,configured:true,fingerprint:'SYNTHETIC_A_FINGERPRINT'},acknowledged:true,advice:null,notice:'',busy:false},changes=[],auths=[],sessions=[],fetches=[],completions=[],timers=new Map();let nextTimer=0;
  const callbackState=[];
  function render(scope='assistant'){
   const c={Headers,AbortController,Error,Promise,Date,...refs,...state,scope,sourceOwnerId:props.sourceOwnerId,
    window:{setTimeout:(f,ms)=>{assert.equal(ms,45000);const id=++nextTimer;timers.set(id,f);return id},clearTimeout:id=>timers.delete(id)},
    onBusyChange:v=>callbackState.push(v),
    onComplete:complete?((...args)=>{const d=deferred();completions.push({...d,args});return d.promise}):undefined,
    createClient:()=>({auth:{onAuthStateChange:fn=>{const s={fn,active:true};auths.push(s);return {data:{subscription:{unsubscribe(){s.active=false}}}}},getSession:()=>{const d=deferred();sessions.push(d);return d.promise}}}),
    fetch:(url,init)=>{const d=deferred(),j=deferred();const response={ok:true,json:()=>j.promise};const row={...d,url,init,json:j,response};fetches.push(row);if(!ignoreAbort)init.signal.addEventListener('abort',()=>d.reject(new Error('synthetic AbortError')),{once:true});return d.promise},
   };
   for(const [setter,key] of Object.entries({setAccountScope:'accountScope',setBusy:'busy',setNotice:'notice',setAdvice:'advice',setPreview:'preview',setAcknowledged:'acknowledged',setQuestion:'question'}))c[setter]=v=>{state[key]=v;changes.push([key,v])};
   return vm.runInNewContext(code+';({request:requestAdvice,startEffect})',c,{timeout:1000});
  }
  let effect=render(),cleanup=effect.startEffect();
  return {props,refs,state,changes,sessions,fetches,completions,callbackState,timers,render,auths,
   request:(...args)=>render().request(...args),
   auth(owner='A'){for(const s of auths)if(s.active)s.fn('SYNTHETIC_AUTH',owner===null?null:{user:{id:owner}})},
   session(i,owner='A'){sessions[i].resolve({data:{session:owner?{user:{id:owner},access_token:'INVALID_SYNTHETIC_'+owner}:null}})},
   cleanup(){cleanup()},remount(){cleanup();effect=render();cleanup=effect.startEffect()},
   timeout(){assert.equal(timers.size,1);timers.values().next().value()},
   async response(i,body,ok=true){const row=fetches[i];row.response.ok=ok;row.resolve(row.response);await tick();row.json.resolve(body)},
  };
 }
 const rows=[];async function scenario(name,fn){try{await fn()}catch(e){e.message=name+': '+e.message;throw e}rows.push({name,pass:true})}
 for(const identity of [undefined,null,'','   '])await scenario('initial identity not ready '+String(identity),async()=>{const h=harness();if(identity!==undefined)h.auth(identity);const blocked=h.request('preview');blocked.catch(()=>{});assert.equal(h.sessions.length,0);await blocked;assert.equal(h.fetches.length,0);assert.match(h.state.notice,/로그인 계정/);assert.equal(h.state.busy,false)});
 for(const action of ['preview','analyze'])for(const mode of ['normal','session-B','event-B','logout','ABA','unmount','replay'])await scenario(action+':auth-await:'+mode,async()=>{
  const h=harness();h.auth();const p=h.request(action);assert.equal(h.sessions.length,1);
  if(mode==='event-B')h.auth('B');if(mode==='logout')h.auth(null);if(mode==='ABA'){h.auth('B');h.auth('A')}if(mode==='unmount')h.cleanup();if(mode==='replay')h.remount();const changeAt=h.changes.length;h.session(0,mode==='session-B'?'B':'A');await tick();
  if(mode==='normal'){assert.equal(h.fetches.length,1);assert.equal(h.fetches[0].init.headers.get('Authorization'),'Bearer INVALID_SYNTHETIC_A');assert.equal(JSON.parse(h.fetches[0].init.body).question,'SYNTHETIC_A_QUESTION');await h.response(0,action==='preview'?{context:contextBody,configured:true,fingerprint:'fresh'}:{advice:adviceBody});await p;assert.equal(h.state.busy,false);if(action==='preview')assert.equal(h.state.preview.fingerprint,'fresh');else assert.equal(h.state.advice.summary,'SYNTHETIC_ADVICE');}
  else {await p;assert.equal(h.fetches.length,0);if(mode==='session-B'){assert.match(h.state.notice,/요청 계정/);assert.equal(h.state.busy,false)}else assert.equal(h.changes.length,changeAt)}assert.equal(h.timers.size,0);
 });
 for(const mode of ['no-preview','unacknowledged','unconfigured'])await scenario('analyze precondition '+mode,async()=>{const h=harness();h.auth();if(mode==='no-preview')h.state.preview=null;if(mode==='unacknowledged')h.state.acknowledged=false;if(mode==='unconfigured')h.state.preview.configured=false;await h.request('analyze');assert.equal(h.sessions.length,0);assert.equal(h.state.busy,false)});
 await scenario('same-tick duplicate and retry after current error',async()=>{const h=harness();h.auth();const fn=h.render().request,p=fn('preview');await fn('preview');assert.equal(h.sessions.length,1);h.session(0);await tick();await h.response(0,{error:'SYNTHETIC_ERROR'},false);await p;assert.equal(h.state.notice,'SYNTHETIC_ERROR');assert.equal(h.state.busy,false);const next=h.request('preview');h.session(1);await tick();await h.response(1,{context:contextBody,configured:true,fingerprint:'retry'});await next;assert.equal(h.state.preview.fingerprint,'retry')});
 for(const stage of ['auth','fetch','json'])await scenario('timeout '+stage,async()=>{const h=harness();h.auth();const p=h.request('preview');if(stage!=='auth'){h.session(0);await tick()}if(stage==='json'){h.fetches[0].resolve(h.fetches[0].response);await tick()}h.timeout();if(stage==='auth')h.session(0);if(stage==='json')h.fetches[0].json.reject(new Error('synthetic body abort'));await p;assert.equal(h.state.busy,false);assert.equal(h.state.preview,null);assert.equal(h.timers.size,0);assert.match(h.state.notice,/시간이 오래/)});
 for(const stage of ['fetch-error','json-answer','json-error'])await scenario('old completion versus new request '+stage,async()=>{const h=harness({complete:true,ignoreAbort:true});h.auth();const old=h.request('analyze');h.session(0);await tick();if(stage.startsWith('json')){h.fetches[0].resolve(h.fetches[0].response);await tick()}h.auth('B');const next=h.request('preview'),token=h.refs.requestNumber.current,changeAt=h.changes.length,busyAt=h.callbackState.length;if(stage==='fetch-error')h.fetches[0].reject(Error('old'));else if(stage==='json-error')h.fetches[0].json.reject(Error('old'));else h.fetches[0].json.resolve({advice:adviceBody});await old;assert.equal(h.changes.length,changeAt);assert.equal(h.callbackState.length,busyAt);assert.equal(h.refs.requestNumber.current,token);assert.equal(h.refs.inFlight.current,true);assert.equal(h.completions.length,0);h.session(1,'B');await tick();await h.response(1,{context:contextBody,fingerprint:'B',configured:true});await next;assert.equal(h.state.busy,false)});
 for(const mode of ['normal','B','unmount','reject-B'])await scenario('onComplete await '+mode,async()=>{const h=harness({complete:true});h.auth();const p=h.request('analyze');h.session(0);await tick();await h.response(0,{advice:adviceBody,performance:{synthetic:true}});await tick();assert.equal(h.completions.length,1);if(mode==='B'||mode==='reject-B')h.auth('B');if(mode==='unmount')h.cleanup();const changes=h.changes.length,busy=h.callbackState.length;if(mode==='reject-B')h.completions[0].reject(Error('old callback'));else h.completions[0].resolve();await p;if(mode==='normal'){assert.equal(h.state.busy,false);assert.equal(h.callbackState.at(-1),false)}else{assert.equal(h.changes.length,changes);assert.equal(h.callbackState.length,busy)}assert.equal(h.state.advice,null)});
 await scenario('auth events and calls after cleanup are ignored',async()=>{const h=harness();h.auth();const callback=h.auths[0].fn;h.cleanup();const before=h.changes.length;callback('FAKE',{user:{id:'B'}});await h.request('preview');assert.equal(h.changes.length,before);assert.equal(h.sessions.length,0)});
 for(const mode of ['B','ABA'])await scenario('retained render callback is rejected '+mode,async()=>{const h=harness();h.auth();const retained=h.render().request;h.auth('B');if(mode==='ABA')h.auth('A');const before=h.changes.length;const completion=retained('analyze');completion.catch(()=>{});assert.equal(h.sessions.length,0);await completion;assert.equal(h.fetches.length,0);assert.equal(h.changes.length,before)});
 await scenario('initial auth event enables a fresh render and preserves initial question',async()=>{const h=harness();const before=h.render().request;h.auth();await before('preview');assert.equal(h.sessions.length,0);const p=h.request('preview');assert.equal(h.sessions.length,1);h.session(0);await tick();assert.equal(JSON.parse(h.fetches[0].init.body).question,'SYNTHETIC_A_QUESTION');await h.response(0,{context:contextBody,fingerprint:'initial',configured:true});await p;assert.equal(h.state.preview.fingerprint,'initial')});
 await scenario('effect replay waits for new auth scope then resumes same-owner requests',async()=>{const h=harness();h.auth();const retiredCallback=h.auths[0].fn,retained=h.render().request,epoch=h.refs.accountEpoch.current;h.remount();assert.ok(h.refs.accountEpoch.current>epoch);const changeAt=h.changes.length;retiredCallback('OLD',{user:{id:'B'}});assert.equal(h.changes.length,changeAt);assert.equal(h.refs.identity.current,'A');await retained('preview');await h.request('preview');assert.equal(h.sessions.length,0);h.auth();const p=h.request('preview');assert.equal(h.sessions.length,1);h.session(0);await tick();await h.response(0,{context:contextBody,fingerprint:'replay',configured:true});await p;assert.equal(h.state.preview.fingerprint,'replay')});
 await scenario('same-owner token refresh preserves scope and current request',async()=>{const h=harness();h.auth();const epoch=h.refs.accountEpoch.current,p=h.request('preview');h.auth();assert.equal(h.refs.accountEpoch.current,epoch);h.session(0);await tick();await h.response(0,{context:contextBody,fingerprint:'refresh',configured:true});await p;assert.equal(h.state.preview.fingerprint,'refresh')});
 for(const beforeOwner of [undefined,null])await scenario('stale missing-owner render cannot change new-owner notice '+String(beforeOwner),async()=>{const h=harness();if(beforeOwner===null)h.auth(null);const old=h.render().request;h.auth('B');h.state.notice='NEW_B_NOTICE';const before=h.changes.length;await old('preview');assert.equal(h.state.notice,'NEW_B_NOTICE');assert.equal(h.changes.length,before);assert.equal(h.sessions.length,0);assert.equal(h.fetches.length,0)});
 await scenario('initial unknown render is revoked by cleanup before first auth event',async()=>{const h=harness();const old=h.render().request;h.remount();h.state.notice='CURRENT_NOTICE';const before=h.changes.length;await old('preview');await h.request('preview');assert.equal(h.changes.length,before);assert.equal(h.sessions.length,0);h.auth();const p=h.request('preview');h.session(0);await tick();await h.response(0,{context:contextBody,fingerprint:'ready-after-initial-replay',configured:true});await p;assert.equal(h.state.preview.fingerprint,'ready-after-initial-replay')});
 for(const action of ['preview','analyze'])await scenario('private initial payload normal owner '+action,async()=>{const h=harness({sourceOwnerId:'A'});h.auth('A');const p=h.request(action);h.session(0);await tick();assert.equal(JSON.parse(h.fetches[0].init.body).question,'SYNTHETIC_A_QUESTION');assert.equal(h.fetches[0].init.headers.get('Authorization'),'Bearer INVALID_SYNTHETIC_A');await h.response(0,action==='preview'?{context:contextBody,fingerprint:'private-A',configured:true}:{advice:adviceBody});await p;assert.equal(h.state.busy,false)});
 for(const action of ['preview','analyze'])await scenario('private initial payload A versus first auth B '+action,async()=>{const h=harness({sourceOwnerId:'A'});h.auth('B');const before=h.changes.length;const blocked=h.request(action);blocked.catch(()=>{});assert.equal(h.sessions.length,0);await blocked;assert.equal(h.fetches.length,0);assert.equal(h.changes.length,before)});
 for(const owner of [null,''])await scenario('private unknown origin cannot be attributed to authenticated owner '+String(owner),async()=>{const h=harness({sourceOwnerId:owner});h.auth('A');const blocked=h.request('preview');blocked.catch(()=>{});assert.equal(h.sessions.length,0);await blocked;assert.equal(h.fetches.length,0)});
 for(const mode of ['new-prop-same-auth','new-prop-new-auth','omitted-prop-new-auth'])await scenario('private original text cannot be relabeled '+mode,async()=>{const h=harness({sourceOwnerId:'A'});h.auth('A');if(mode!=='new-prop-same-auth')h.auth('B');h.props.sourceOwnerId=mode==='omitted-prop-new-auth'?undefined:'B';const before=h.changes.length;const blocked=h.request('preview');blocked.catch(()=>{});assert.equal(h.sessions.length,0);await blocked;assert.equal(h.fetches.length,0);assert.equal(h.changes.length,before)});
 for(const action of ['preview','analyze'])await scenario('private initial payload session B without auth event '+action,async()=>{const h=harness({sourceOwnerId:'A'});h.auth('A');const p=h.request(action);h.session(0,'B');await p;assert.equal(h.fetches.length,0);assert.match(h.state.notice,/요청 계정/)});
 await scenario('public fixed question remains compatible with first auth B',async()=>{const h=harness();h.state.question='PUBLIC_FIXED_QUESTION';h.auth('B');const p=h.request('preview');h.session(0,'B');await tick();assert.equal(JSON.parse(h.fetches[0].init.body).question,'PUBLIC_FIXED_QUESTION');assert.equal(h.fetches[0].init.headers.get('Authorization'),'Bearer INVALID_SYNTHETIC_B');await h.response(0,{context:contextBody,fingerprint:'public-B',configured:true});await p;assert.equal(h.state.preview.fingerprint,'public-B')});
 return {cases:rows,observations:[]};
};
`;
  type RegressionResult = { cases: Array<{ name: string; pass: boolean }>; observations: unknown[] };
  type RegressionModule = { exports: (panel: string, helper: string, compiler: typeof ts) => Promise<RegressionResult> };
  const regressionModule = { exports: undefined } as unknown as RegressionModule;
  vm.runInNewContext(moduleSource, {
    module: regressionModule, Headers, AbortController,
    require: (name: string) => {
      if (name === 'node:vm') return vm;
      if (name === 'node:assert/strict') return assert;
      throw new Error(`Unexpected regression dependency: ${name}`);
    },
  }, { timeout: 1000 });
  const result = await regressionModule.exports(panelSource, helperSource, ts);
  assert.equal(result.cases.length, 53);
  assert.ok(result.cases.every(entry => entry.pass));
  assert.equal(result.observations.length, 0);
});

// Keep private text tied to the request owner at the single producer and JSX consumer.
test('free advice producer: source owner and five delayed-auth regressions', async () => {
  const parentSource = readFileSync('app/assistant/AssistantClient.tsx', 'utf8');
  const producerModuleSource = String.raw`'use strict';
const vm=require('node:vm'),assert=require('node:assert/strict');
module.exports=async function verifyAdviceProducer(source,ts){
const a=ts.createSourceFile('AssistantClient.tsx',source,99,true,ts.ScriptKind.TSX);let send='';const calls=[],props=[];function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(a)==='sendChat')send='const '+n.getText(a)+';';if(ts.isCallExpression(n)&&n.expression.getText(a)==='setActiveAdvice'&&n.arguments[0]&&ts.isObjectLiteralExpression(n.arguments[0]))calls.push(n.arguments[0].getText(a));if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(a)==='FreeAdvicePanel')props.push(n.getText(a));ts.forEachChild(n,walk)}walk(a);assert.equal(calls.length,1);assert.ok(calls[0].includes('ownerId: replyOwner'));assert.equal(props.length,1);assert.ok(props[0].includes('sourceOwnerId={activeAdvice.ownerId}'));
const js=ts.transpileModule(send,{compilerOptions:{target:99}}).outputText;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}},tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
async function scenario(mode){const auth=deferred(),response=deferred(),fetches=[],created=[],messages=[];const c={chatInput:'SYNTHETIC_A_QUESTION',chatLock:{current:false},adviceBusy:false,chatHistoryLoading:false,pending:{ready:true,ownerId:'A'},shouldUseLocalBodyConversation:()=>false,localBodyActive:false,clearCharacter(){},chatEpoch:{current:1},chatSendId:{current:0},localBodyOwner:{current:'A'},remoteChatHistory:()=>[],chatMessages:[],crypto:{randomUUID:()=> 'SYNTHETIC_ID'},characterAudio:false,isLocalBodyQuestion:()=>false,isFreeAdviceScope:scope=>scope==='assistant',supabase:{auth:{getSession:()=>auth.promise}},fetch:(...args)=>{fetches.push(args);return response.promise},setActiveAdvice:value=>{if(value)created.push(value)},setChatInput(){},setChatSending(){},setChatMessages:fn=>fn(messages),setCharacterReply(){},setChatHistoryNotice(){},setLocalBodyActive(){},load:()=>assert.fail('unexpected load')};const run=vm.runInNewContext(js+';sendChat',c,{timeout:1000});const task=run();if(mode==='auth-transition'){c.localBodyOwner.current='B';c.chatEpoch.current++}if(mode==='auth-ABA')c.chatEpoch.current+=2;auth.resolve({data:{session:{user:{id:mode==='session-B'?'B':'A'},access_token:'INVALID_SYNTHETIC'}}});await tick();if(mode==='late-response'){c.localBodyOwner.current='B';c.chatEpoch.current++}response.resolve({ok:true,json:async()=>({reply:'synthetic reply',adviceRequest:{scope:'assistant'}})});await task;
assert.equal(created.length,mode==='normal'?1:0);assert.equal(fetches.length,['normal','late-response'].includes(mode)?1:0);if(created.length){assert.equal(created[0].ownerId,'A');assert.equal(created[0].question,'SYNTHETIC_A_QUESTION')}return {mode,created:created.length,fetches:fetches.length,pass:true};}
const rows=[];for(const mode of ['normal','session-B','auth-transition','auth-ABA','late-response'])rows.push(await scenario(mode));return rows;
};
`;
  type ProducerModule = { exports: (source: string, compiler: typeof ts) => Promise<Array<{ mode: string; pass: boolean }>> };
  const producerModule = { exports: undefined } as unknown as ProducerModule;
  vm.runInNewContext(producerModuleSource, {
    module: producerModule,
    require: (name: string) => {
      if (name === 'node:vm') return vm;
      if (name === 'node:assert/strict') return assert;
      throw new Error(`Unexpected producer regression dependency: ${name}`);
    },
  }, { timeout: 1000 });
  const rows = await producerModule.exports(parentSource, ts);
  assert.equal(rows.length, 5);
  assert.ok(rows.every(entry => entry.pass));
});
