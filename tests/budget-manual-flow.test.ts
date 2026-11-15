import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import{validBudgetDate}from'../app/budget/lib/manual-entry.ts';
const source=fs.readFileSync(new URL('../app/budget/page.tsx',import.meta.url),'utf8');
function fixture(){const state={items:[] as unknown[],confirm:false,feedback:'',writes:0,rpc:0,resets:0},storage=new Map();const context={user:{id:'A'},aiLoading:false,liveBudgetOwner:{current:'A'},budgetEpoch:{current:0},reviewOwner:{current:null as string|null},reviewWasManual:{current:false},savingRecordsRef:{current:false},pendingSaveRef:{current:null},parsedItems:state.items,validBudgetDate,manualEntry:{clear:()=>{}},setParsedItems:(v:unknown[])=>state.items=v,setFeedback:(v:string)=>state.feedback=v,setShowConfirm:(v:boolean)=>state.confirm=v,setIsSavingRecords:()=>{},setHasPendingSave:()=>{},setInput:()=>{},setManualReset:()=>state.resets++,crypto:{randomUUID:()=> 'synthetic-id'},pendingBudgetSaveKey:(id:string)=>id,window:{localStorage:{setItem:(k:string,v:string)=>{state.writes++;storage.set(k,v)},removeItem:(k:string)=>storage.delete(k)}},supabase:{rpc:async()=>{state.rpc++;return {data:{count:1},error:null}}},fetchIncome:async()=>{},fetchTransactions:async()=>{},fetchSavings:async()=>{}};
const a=source.indexOf('  const handleManualReview ='),b=source.indexOf('  const handleAddTransaction',a);const c=source.indexOf('  const handleConfirmSave ='),d=source.indexOf('  const refreshBudgetRecordList',c);const code=ts.transpileModule(source.slice(a,b)+source.slice(c,d),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;const actions=vm.runInNewContext(code+'\n({review:handleManualReview,save:handleConfirmSave})',context) as {review:(item:unknown,owner:string)=>void;save:()=>Promise<void>};return{state,context,actions};}
const item={type:'expense',date:'2026-10-01',amount:1,place:'synthetic',memo:'preserve',category:'기타'};
test('manual review does not call fetch, RPC or storage; only explicit save uses existing RPC',async()=>{const f=fixture();f.actions.review(item,'A');assert.equal(f.state.confirm,true);assert.deepEqual(structuredClone(f.state.items),[item]);assert.equal(f.state.rpc,0);assert.equal(f.state.writes,0);f.context.parsedItems=f.state.items;await f.actions.save();assert.equal(f.state.rpc,1);assert.equal(f.state.resets,1);});
test('account switch before review or confirmation blocks storage and RPC',async()=>{for(const stage of ['review','confirm']){const f=fixture();if(stage==='confirm'){f.actions.review(item,'A');f.context.parsedItems=f.state.items;}f.context.liveBudgetOwner.current='B';if(stage==='review')f.actions.review(item,'A');await f.actions.save();assert.equal(f.state.rpc,0);assert.equal(f.state.writes,0);}});
test('incomplete edited confirmation does not save',async()=>{for(const patch of [{date:'2026-02-30'},{amount:0},{place:' '}]){const f=fixture();f.actions.review({...item,...patch},'A');f.context.parsedItems=f.state.items;await f.actions.save();assert.equal(f.state.rpc,0);assert.equal(f.state.writes,0);}});

test('late save completion after account generation change cannot reset a new draft',async()=>{const f=fixture();f.actions.review(item,'A');f.context.parsedItems=f.state.items;f.context.supabase.rpc=async()=>{f.state.rpc++;f.context.budgetEpoch.current++;return{data:{count:1},error:null}};await f.actions.save();assert.equal(f.state.rpc,1);assert.equal(f.state.resets,0);assert.equal(f.state.confirm,true);});

test('pending natural-language interpretation cannot race manual review',()=>{const f=fixture();f.context.aiLoading=true;f.actions.review(item,'A');assert.equal(f.state.confirm,false);assert.equal(f.state.rpc,0);});

test('old natural-language success or failure cannot replace manual flow after an account boundary',async()=>{
 for(const fail of [false,true]){let resolve!:(v:unknown)=>void,reject!:(e:Error)=>void;const changes:unknown[]=[];const context={input:'synthetic',savingRecordsRef:{current:false},pendingSaveRef:{current:null},user:{id:'A'},liveBudgetOwner:{current:'A'},budgetEpoch:{current:1},setAiLoading:(v:boolean)=>changes.push(v),setFeedback:(v:string)=>changes.push(v),parseInput:()=>new Promise((r,j)=>{resolve=r;reject=j}),supabase:{from:()=>assert.fail('stale request must not query')},setParsedItems:()=>assert.fail('stale review'),setShowConfirm:()=>assert.fail('stale confirm')};
 const a=source.indexOf('  const handleAddTransaction ='),b=source.indexOf('  const updateParsedItem',a);const code=ts.transpileModule(source.slice(a,b),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;const run=vm.runInNewContext(code+'\nhandleAddTransaction',context) as()=>Promise<void>;const task=run();context.liveBudgetOwner.current='B';context.budgetEpoch.current++;const before=[...changes];if(fail)reject(Error('old'));else resolve([]);await task;assert.deepEqual(changes,before);
 }
});

test('A to B to A late save rejection cannot overwrite a new notice',async()=>{const f=fixture();f.actions.review(item,'A');f.context.parsedItems=f.state.items;let reject!:(reason:Error)=>void;f.context.supabase.rpc=()=>new Promise((_,j)=>{reject=j});const task=f.actions.save();f.context.liveBudgetOwner.current='B';f.context.budgetEpoch.current++;f.context.liveBudgetOwner.current='A';f.context.budgetEpoch.current++;f.state.feedback='new account-generation notice';reject(Error('old save failure'));await task;assert.equal(f.state.feedback,'new account-generation notice');assert.equal(f.state.resets,0);});

test('saving a natural-language review does not discard an unrelated manual draft',async()=>{const f=fixture();f.actions.review(item,'A');f.context.parsedItems=f.state.items;f.context.reviewWasManual.current=false;await f.actions.save();assert.equal(f.state.rpc,1);assert.equal(f.state.resets,0);});

// Parse and execute the exact JSX keyboard handlers, not a duplicated predicate.
// Only synthetic callbacks exist in this VM: no API, auth, storage or paid AI.
function keyboardFixture(kind: 'sentence' | 'question', overrides: Record<string, unknown> = {}) {
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler = '';
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const target = kind === 'sentence' ? ['id', 'ai-record-input'] : ['aria-label', '연이에게 질문할 내용'];
      if (attributes.some(attribute => attribute.name.getText(ast) === target[0] && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === target[1])) {
        const keydown = attributes.find(attribute => attribute.name.getText(ast) === 'onKeyDown');
        assert.ok(keydown?.initializer && ts.isJsxExpression(keydown.initializer) && keydown.initializer.expression);
        handler = keydown.initializer.expression.getText(ast);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler, `missing ${kind} keyboard handler`);
  const calls = { requests: 0, prevented: 0 };
  const context = { input: '합성 문장', aiLoading: false, analyzing: false, handleAddTransaction: () => { calls.requests++; }, handleAnalyze: () => { calls.requests++; }, ...overrides };
  const code = ts.transpileModule(`const keyHandler = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const invoke = vm.runInNewContext(code + '; keyHandler', context) as (event: unknown) => void;
  return { calls, send: (patch: Record<string, unknown> = {}) => invoke({ key: 'Enter', ctrlKey: kind === 'sentence', metaKey: false, repeat: false, nativeEvent: { isComposing: false, keyCode: 13 }, preventDefault: () => { calls.prevented++; }, ...patch }) };
}

test('IME composition and legacy keyCode 229 never send either budget input', () => {
  for (const kind of ['sentence', 'question'] as const) {
    for (const nativeEvent of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }, { isComposing: true, keyCode: 229 }]) {
      const f = keyboardFixture(kind);
      f.send({ nativeEvent });
      assert.equal(f.calls.requests, 0, kind);
      assert.equal(f.calls.prevented, 0, 'composition confirmation must retain native behavior');
      f.send();
      assert.equal(f.calls.requests, 1, 'normal Enter after composition still works');
    }
  }
});

test('existing repeat behavior, shortcuts and busy/empty guards remain unchanged', () => {
  for (const kind of ['sentence', 'question'] as const) {
    const f = keyboardFixture(kind);
    f.send({ repeat: true });
    assert.equal(f.calls.requests, 1, 'non-composing repeat behavior is unchanged');
    f.send({ key: 'a' });
    assert.equal(f.calls.requests, 1);
    f.send();
    assert.equal(f.calls.requests, 2);
    const busy = keyboardFixture(kind, { aiLoading: true, analyzing: true });
    busy.send();
    assert.equal(busy.calls.requests, 0);
  }
  const plain = keyboardFixture('sentence');
  plain.send({ ctrlKey: false });
  assert.equal(plain.calls.requests, 0);
  assert.equal(plain.calls.prevented, 0);
  plain.send({ ctrlKey: false, metaKey: true });
  assert.equal(plain.calls.requests, 1);
  const empty = keyboardFixture('sentence', { input: '  ' });
  empty.send();
  assert.equal(empty.calls.requests, 0);
});
