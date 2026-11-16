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

// OpenAI disabled status CI: actual modules, synthetic transport/hooks only.
// The two original reviewed suites overlap. They are not browser or provider verification.
import { createHash as createOpenAiTestHash } from 'node:crypto';
import { createRequire as createOpenAiTestRequire } from 'node:module';

test("OpenAI disabled status: source preservation and status helper", async (t) => {
  const helper = await import('../lib/openai-advice-status.ts');
  const core = await import('../lib/openai-advice-server.ts');
  const checks: Array<{ name: string; run: () => void | Promise<void> }> = [];
  const localRequire = createOpenAiTestRequire(import.meta.url);
  const source = "for (const [name,body,expected] of [\n ['disabled',{available:false,code:'OPENAI_ADVICE_NOT_CONNECTED'},'not-connected'],\n ['enabled',{available:true,code:'OPENAI_ADVICE_NOT_CONNECTED'},'unconfirmed'],\n ['extra',{available:false,code:'OPENAI_ADVICE_NOT_CONNECTED',secret:'x'},'unconfirmed'],\n ['null',null,'unconfirmed'],['array',[],'unconfirmed'],['unknown',{available:false,code:'READY'},'unconfirmed'],\n]) test(name, async()=>assert.equal(await checkOpenAiAdviceStatus(async()=>({ok:true,json:async()=>body}),new AbortController().signal),expected));\ntest('only fixed credential-free GET',async()=>{let count=0; const signal=new AbortController().signal; await checkOpenAiAdviceStatus(async(url,options)=>{count++;assert.equal(url,'/api/ai/openai-advice');assert.deepEqual(options,{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal});return {ok:true,json:async()=>({available:false,code:'OPENAI_ADVICE_NOT_CONNECTED'})};},signal);assert.equal(count,1);});\ntest('network, HTTP and JSON failures fail closed',async()=>{for(const fetcher of [async()=>{throw Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('json');}})])assert.equal(await checkOpenAiAdviceStatus(fetcher,new AbortController().signal),'unconfirmed');});\ntest('abort after JSON fails closed',async()=>{const c=new AbortController();assert.equal(await checkOpenAiAdviceStatus(async()=>({ok:true,json:async()=>{c.abort();return {available:false,code:'OPENAI_ADVICE_NOT_CONNECTED'};}}),c.signal),'unconfirmed');});\ntest('original Gemini panel bytes preserved after removing two additions',()=>{const after=fs.readFileSync('components/FreeAdvicePanel.tsx','utf8');assert.equal(hash(after.replace(\"import OpenAiAdviceStatus from './OpenAiAdviceStatus';\\n\",'').replace('    <OpenAiAdviceStatus />\\n','')), '1b271e5dcbac607fa2505e193c19609f9c71425b689675365b7a7e79bb80380b');});\ntest('POST entire source prefix preserved and GET executes without request access',async()=>{const before=\"import { createOpenAiAdviceHandler, OPENAI_ADVICE_DEPLOYMENT } from '@/lib/openai-advice-server';\\nexport const dynamic = 'force-dynamic';\\nexport const runtime = 'nodejs';\\n// No environment lookup, credentials, budget adapter or provider transport is installed.\\n// Enabling requires a separately reviewed server-side consent/quote/atomic-ledger integration.\\nexport const POST = createOpenAiAdviceHandler(OPENAI_ADVICE_DEPLOYMENT);\\n\";const after=fs.readFileSync('app/api/ai/openai-advice/route.ts','utf8');assert.ok(after.startsWith(before));const suffix=after.slice(before.length);assert.doesNotMatch(suffix.replace(/\\/\\/[^\\n]*/g,''),/fetch|process\\.|auth|request\\./);const GET=vm.runInNewContext(suffix.replace('export function GET','function GET')+'\\nGET',{Response});const response=GET(new Proxy({}, {get(){throw Error('request read');}}));assert.deepEqual(await response.json(),{available:false,code:'OPENAI_ADVICE_NOT_CONNECTED'});assert.equal(response.headers.get('cache-control'),'no-store');});\ntest('status component has no payload/credentials/state coupling',()=>{const s=fs.readFileSync('components/OpenAiAdviceStatus.tsx','utf8');assert.doesNotMatch(s.replace(/\\/\\*[^]*?\\*\\//g,''),/authenticatedFetch|question|sourceOwnerId|onComplete|process\\.env|method:.*POST/);assert.match(s,/if \\(pending.current\\) return/);assert.match(s,/Promise.race/);assert.match(s,/pending.current === controller/);assert.match(s,/onClick=\\{\\(\\) => void check\\(\\)\\}/);});\n";
  const bindings = {
    test: (name: string, run: () => void | Promise<void>) => checks.push({ name, run }),
    assert, fs: { readFileSync }, vm, ts, helper, core,
    checkOpenAiAdviceStatus: helper.checkOpenAiAdviceStatus,
    hash: (value: string) => createOpenAiTestHash('sha256').update(value).digest('hex'),
    require: (name: string) => {
      assert.ok(['react', 'react-dom/server', 'react/jsx-runtime'].includes(name), `unexpected test import ${name}`);
      return localRequire(name);
    },
    Response, AbortController, Promise,
  };
  // Keep outer assertions in the native realm, like the reviewed standalone tests.
  // The existing inner product sandboxes remain unchanged.
  vm.compileFunction(source, Object.keys(bindings))(...Object.values(bindings));
  assert.equal(checks.length, 12);
  for (const check of checks) await t.test(check.name, check.run);
});

test("OpenAI disabled status: static React render and synthetic lifecycle", async (t) => {
  const helper = await import('../lib/openai-advice-status.ts');
  const core = await import('../lib/openai-advice-server.ts');
  const checks: Array<{ name: string; run: () => void | Promise<void> }> = [];
  const localRequire = createOpenAiTestRequire(import.meta.url);
  const source = "const text=fs.readFileSync('components/OpenAiAdviceStatus.tsx','utf8');\nconst transpile=(s,name)=>ts.transpileModule(s,{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;\nconst js=transpile(text,'OpenAiAdviceStatus.tsx');\nconst deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};\nconst flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};\nfunction flatten(node){if(!node)return[];if(Array.isArray(node))return Array.from(node).flatMap(flatten);if(typeof node!=='object')return[];return[node,...flatten(node.props?.children)]}\nfunction harness(){const slots=[],effects=[],events=[],calls=[],timers=new Map();let cursor=0,tree,fetcher=async()=>Response.json(helper.OPENAI_ADVICE_STATUS),nextTimer=1;\n const hooks={useState:init=>{const i=cursor++;if(!(i in slots))slots[i]=init;return[slots[i],v=>{slots[i]=v;events.push({index:i,value:v})}]},useRef:init=>{const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i]},useEffect:fn=>{const i=cursor++;if(!(i in slots)){slots[i]=true;effects.push(fn)}}};\n const jsx=(type,props,key)=>({type,props,key}),m={exports:{}};\n vm.runInNewContext(js,{module:m,exports:m.exports,require:n=>n==='react'?hooks:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:n==='@/lib/openai-advice-status'?helper:(()=>{throw Error('unexpected import '+n)})(),AbortController,Promise,fetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options)},window:{setTimeout:(fn,delay)=>{const id=nextTimer++;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id)}});\n const cleanup=[];function render(){cursor=0;tree=m.exports.default();while(effects.length)cleanup.push(effects.shift()());return tree}\n render();return{slots,events,calls,timers,render,setFetch:fn=>{fetcher=fn},click:()=>{const button=flatten(tree).find(n=>n.type==='button');assert(button);button.props.onClick()},fireTimeout:()=>{assert.equal(timers.size,1);const t=[...timers.values()][0];assert.equal(t.delay,8000);t.fn()},unmount:()=>cleanup.forEach(fn=>fn?.()),tree:()=>tree};\n}\ntest('actual React static render exposes one manual status button and no automatic provider call',()=>{\n const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),m={exports:{}};let calls=0;\n vm.runInNewContext(js,{module:m,exports:m.exports,require:n=>n==='@/lib/openai-advice-status'?helper:require(n),fetch:()=>{calls++;throw Error('actual fetch forbidden')}});\n const html=renderToStaticMarkup(React.createElement(m.exports.default));assert.equal(calls,0);assert.equal((html.match(/<button\\b/g)||[]).length,1);assert.match(html,/type=\"button\"/);assert.match(html,/aria-label=\"OpenAI 연결 준비\"/);assert.match(html,/role=\"status\"/);assert.match(html,/전송 동의가 아닙니다/);assert.doesNotMatch(html,/<input\\b|<textarea\\b|<form\\b/);\n // Static markup is asserted in memory; the persistent CI test writes no evidence files.\n});\ntest('full component with synthetic hooks uses real helper, manual fixed GET and synchronous single-flight',async()=>{\n const h=harness(),d=deferred();h.setFetch(()=>d.promise);assert.equal(h.calls.length,0);h.click();h.click();assert.equal(h.calls.length,1);assert.equal(h.slots[1],true);const {url,options}=h.calls[0];assert.equal(url,'/api/ai/openai-advice');assert.deepEqual(Object.keys(options).sort(),['cache','credentials','method','redirect','referrerPolicy','signal'].sort());assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.signal.aborted,false);\n d.resolve(Response.json(helper.OPENAI_ADVICE_STATUS));await flush();assert.equal(h.slots[0],'not-connected');assert.equal(h.slots[1],false);assert.equal(h.timers.size,0);h.render();assert.equal(flatten(h.tree()).find(n=>n.type==='button').props.disabled,false);\n});\nfor(const [name,response] of [\n ['enabled',()=>Response.json({available:true,code:'OPENAI_ADVICE_NOT_CONNECTED'})],\n ['string false',()=>Response.json({available:'false',code:'OPENAI_ADVICE_NOT_CONNECTED'})],\n ['extra field',()=>Response.json({...helper.OPENAI_ADVICE_STATUS,token:'synthetic'})],\n ['HTTP 503',()=>new Response('unavailable',{status:503})],\n ['invalid JSON',()=>new Response('invalid')],\n ['network rejection',()=>{throw Error('synthetic offline')}],\n])test('full component actual helper fail-closed: '+name,async()=>{const h=harness();h.setFetch(response);h.click();await flush();assert.equal(h.slots[0],'unconfirmed');assert.equal(h.slots[1],false);assert.equal(h.calls.length,1);h.render();assert.equal(flatten(h.tree()).filter(n=>n.type==='button').length,1);});\ntest('8-second timeout settles an ignoring transport and late old completion cannot clear retry',async()=>{\n const h=harness(),old=deferred(),next=deferred();let n=0;h.setFetch(()=>n++===0?old.promise:next.promise);h.click();h.fireTimeout();await flush();assert.equal(h.slots[0],'unconfirmed');assert.equal(h.slots[1],false);assert.equal(h.calls[0].options.signal.aborted,true);h.render();h.click();const retryToken=h.slots[2].current;assert.equal(h.slots[1],true);\n old.resolve(Response.json(helper.OPENAI_ADVICE_STATUS));await flush();assert.equal(h.slots[2].current,retryToken);assert.equal(h.slots[1],true);assert.equal(h.slots[0],'unconfirmed');next.resolve(Response.json(helper.OPENAI_ADVICE_STATUS));await flush();assert.equal(h.slots[0],'not-connected');assert.equal(h.slots[1],false);assert.equal(h.calls.length,2);\n});\ntest('response body stall is also bounded and late JSON cannot undo unconfirmed status',async()=>{\n const h=harness(),body=deferred();h.setFetch(async()=>({ok:true,json:()=>body.promise}));h.click();await flush();assert.equal(h.slots[1],true);h.fireTimeout();await flush();assert.equal(h.slots[0],'unconfirmed');assert.equal(h.slots[1],false);body.resolve({...helper.OPENAI_ADVICE_STATUS});await flush();assert.equal(h.slots[0],'unconfirmed');\n});\ntest('actual effect cleanup aborts and prevents pending result/finally updates',async()=>{\n const h=harness(),d=deferred();h.setFetch(()=>d.promise);h.click();assert.equal(h.events.length,1);h.unmount();await flush();assert.equal(h.calls[0].options.signal.aborted,true);assert.equal(h.slots[2].current,null);assert.equal(h.events.length,1);d.resolve(Response.json(helper.OPENAI_ADVICE_STATUS));await flush();assert.equal(h.events.length,1);assert.equal(h.timers.size,0);\n});\ntest('real route module GET remains constant and POST stays disabled without any request access',async()=>{\n const source=fs.readFileSync('app/api/ai/openai-advice/route.ts','utf8'),m={exports:{}};\n vm.runInNewContext(transpile(source,'route.ts'),{module:m,exports:m.exports,require:n=>{assert.equal(n,'@/lib/openai-advice-server');return core},Response});let reads=0;const request=new Proxy({}, {get(){reads++;throw Error('request access prohibited')}});\n for(let i=0;i<3;i++){const result=m.exports.GET(request);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');const body=await result.json();assert.deepEqual(body,{available:false,code:'OPENAI_ADVICE_NOT_CONNECTED'});body.available=true;}\n const post=await m.exports.POST(request);assert.equal(post.status,503);assert.equal(reads,0);assert.equal(m.exports.dynamic,'force-dynamic');assert.equal(m.exports.runtime,'nodejs');\n});\n";
  const bindings = {
    test: (name: string, run: () => void | Promise<void>) => checks.push({ name, run }),
    assert, fs: { readFileSync }, vm, ts, helper, core,
    checkOpenAiAdviceStatus: helper.checkOpenAiAdviceStatus,
    hash: (value: string) => createOpenAiTestHash('sha256').update(value).digest('hex'),
    require: (name: string) => {
      assert.ok(['react', 'react-dom/server', 'react/jsx-runtime'].includes(name), `unexpected test import ${name}`);
      return localRequire(name);
    },
    Response, AbortController, Promise,
  };
  // Keep outer assertions in the native realm, like the reviewed standalone tests.
  // The existing inner product sandboxes remain unchanged.
  vm.compileFunction(source, Object.keys(bindings))(...Object.values(bindings));
  assert.equal(checks.length, 12);
  for (const check of checks) await t.test(check.name, check.run);
});
