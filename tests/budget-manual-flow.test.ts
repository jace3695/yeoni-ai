import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import{validBudgetDate}from'../app/budget/lib/manual-entry.ts';
const source=fs.readFileSync(new URL('../app/budget/page.tsx',import.meta.url),'utf8');
const transportSource = fs.readFileSync(new URL('../lib/supabase.ts', import.meta.url), 'utf8');
const boundaryClassSource = transportSource.slice(transportSource.indexOf('export class AuthenticatedFetchBoundaryError'), transportSource.indexOf('export async function authenticatedFetch')).replace('export class', 'class');
const AuthenticatedFetchBoundaryError = vm.runInNewContext(ts.transpileModule(boundaryClassSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '; AuthenticatedFetchBoundaryError') as new () => Error;

function fixture(){const state={items:[] as unknown[],confirm:false,feedback:'',writes:0,rpc:0,resets:0},storage=new Map();const context={parseRequestRef:{current:null as null|{owner:string;epoch:number}},user:{id:'A'},aiLoading:false,liveBudgetOwner:{current:'A'},budgetEpoch:{current:0},reviewOwner:{current:null as string|null},reviewWasManual:{current:false},savingRecordsRef:{current:false},pendingSaveRef:{current:null},parsedItems:state.items,validBudgetDate,manualEntry:{clear:()=>{}},setParsedItems:(v:unknown[])=>state.items=v,setFeedback:(v:string)=>state.feedback=v,setShowConfirm:(v:boolean)=>state.confirm=v,setIsSavingRecords:()=>{},setHasPendingSave:()=>{},setInput:()=>{},setManualReset:()=>state.resets++,crypto:{randomUUID:()=> 'synthetic-id'},pendingBudgetSaveKey:(id:string)=>id,window:{localStorage:{setItem:(k:string,v:string)=>{state.writes++;storage.set(k,v)},removeItem:(k:string)=>storage.delete(k)}},supabase:{rpc:async()=>{state.rpc++;return {data:{count:1},error:null}}},fetchIncome:async()=>{},fetchTransactions:async()=>{},fetchSavings:async()=>{}};
const a=source.indexOf('  const handleManualReview ='),b=source.indexOf('  const handleAddTransaction',a);const c=source.indexOf('  const handleConfirmSave ='),d=source.indexOf('  const refreshBudgetRecordList',c);const code=ts.transpileModule(source.slice(a,b)+source.slice(c,d),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;const actions=vm.runInNewContext(code+'\n({review:handleManualReview,save:handleConfirmSave})',context) as {review:(item:unknown,owner:string)=>void;save:()=>Promise<void>};return{state,context,actions};}
const item={type:'expense',date:'2026-10-01',amount:1,place:'synthetic',memo:'preserve',category:'기타'};
test('manual review does not call fetch, RPC or storage; only explicit save uses existing RPC',async()=>{const f=fixture();f.actions.review(item,'A');assert.equal(f.state.confirm,true);assert.deepEqual(structuredClone(f.state.items),[item]);assert.equal(f.state.rpc,0);assert.equal(f.state.writes,0);f.context.parsedItems=f.state.items;await f.actions.save();assert.equal(f.state.rpc,1);assert.equal(f.state.resets,1);});
test('account switch before review or confirmation blocks storage and RPC',async()=>{for(const stage of ['review','confirm']){const f=fixture();if(stage==='confirm'){f.actions.review(item,'A');f.context.parsedItems=f.state.items;}f.context.liveBudgetOwner.current='B';if(stage==='review')f.actions.review(item,'A');await f.actions.save();assert.equal(f.state.rpc,0);assert.equal(f.state.writes,0);}});
test('incomplete edited confirmation does not save',async()=>{for(const patch of [{date:'2026-02-30'},{amount:0},{place:' '}]){const f=fixture();f.actions.review({...item,...patch},'A');f.context.parsedItems=f.state.items;await f.actions.save();assert.equal(f.state.rpc,0);assert.equal(f.state.writes,0);}});

test('late save completion after account generation change cannot reset a new draft',async()=>{const f=fixture();f.actions.review(item,'A');f.context.parsedItems=f.state.items;f.context.supabase.rpc=async()=>{f.state.rpc++;f.context.budgetEpoch.current++;return{data:{count:1},error:null}};await f.actions.save();assert.equal(f.state.rpc,1);assert.equal(f.state.resets,0);assert.equal(f.state.confirm,true);});

test('pending natural-language interpretation cannot race manual review',()=>{const f=fixture();f.context.aiLoading=true;f.actions.review(item,'A');assert.equal(f.state.confirm,false);assert.equal(f.state.rpc,0);});

test('old natural-language success or failure cannot replace manual flow after an account boundary',async()=>{
 for(const fail of [false,true]){let resolve!:(v:unknown)=>void,reject!:(e:Error)=>void;const changes:unknown[]=[];const context={AuthenticatedFetchBoundaryError,input:'synthetic',budgetMounted:{current:true},parseRequestRef:{current:null},savingRecordsRef:{current:false},pendingSaveRef:{current:null},user:{id:'A'},liveBudgetOwner:{current:'A'},budgetEpoch:{current:1},setAiLoading:(v:boolean)=>changes.push(v),setFeedback:(v:string)=>changes.push(v),parseInput:()=>new Promise((r,j)=>{resolve=r;reject=j}),supabase:{from:()=>assert.fail('stale request must not query')},setParsedItems:()=>assert.fail('stale review'),setShowConfirm:()=>assert.fail('stale confirm')};
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

function parseRequestFixture(rulesError = false) {
  const state = { parses: 0, rules: 0, confirms: 0, items: [] as unknown[], loading: [] as boolean[], feedback: [] as string[] };
  const pending: { resolve: (value: unknown[]) => void; reject: (error: Error) => void }[] = [];
  const context = { AuthenticatedFetchBoundaryError, aiLoading: false, input: 'synthetic', budgetMounted: { current: true }, user: { id: 'A' } as { id: string } | null, liveBudgetOwner: { current: 'A' }, budgetEpoch: { current: 1 }, parseRequestRef: { current: null as null | { owner: string; epoch: number } }, savingRecordsRef: { current: false }, pendingSaveRef: { current: null }, reviewOwner: { current: null }, reviewWasManual: { current: false }, setAiLoading: (value: boolean) => state.loading.push(value), setFeedback: (value: string) => state.feedback.push(value), setParsedItems: (items: unknown[]) => { state.items = items; }, setShowConfirm: () => { state.confirms++; }, applyCategoryMemory: (items: unknown[]) => items, parseInput: () => { state.parses++; return new Promise<unknown[]>((resolve, reject) => pending.push({ resolve, reject })); }, supabase: { from: () => { state.rules++; return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: rulesError ? { message: 'synthetic' } : null, count: 0 }) }) }) }) }; } } };
  const start = source.indexOf('  const handleManualReview ='), end = source.indexOf('  const updateParsedItem', start);
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const actions = vm.runInNewContext(code + '; ({run:handleAddTransaction, manual:handleManualReview})', context) as { run: () => Promise<void>; manual: (item: unknown, owner: string) => void };
  return { state, context, pending, ...actions };
}

test('same-generation overlapping sentence requests invoke parser only once and allow retry after settlement', async () => {
  const f = parseRequestFixture();
  const first = f.run(); const duplicate = f.run();
  assert.equal(f.state.parses, 1);
  f.pending[0].resolve([]); await Promise.all([first, duplicate]);
  assert.equal(f.state.rules, 1); assert.equal(f.state.confirms, 1);
  assert.equal(f.context.parseRequestRef.current, null);
  const retry = f.run(); assert.equal(f.state.parses, 2);
  f.pending[1].reject(Error('synthetic failure')); await retry;
  assert.equal(f.context.parseRequestRef.current, null);
  const afterFailure = f.run(); assert.equal(f.state.parses, 3);
  f.pending[2].resolve([]); await afterFailure;
});

test('old request completion cannot clear a new owner/epoch request or change its feedback', async () => {
  for (const rejects of [false, true]) {
    const f = parseRequestFixture(); const old = f.run();
    f.context.budgetEpoch.current++; // A -> B -> A still changes generation
    const current = f.run(); const token = f.context.parseRequestRef.current;
    const loading = [...f.state.loading], feedback = [...f.state.feedback];
    if (rejects) f.pending[0].reject(Error('stale')); else f.pending[0].resolve([]);
    await old;
    assert.equal(f.context.parseRequestRef.current, token);
    assert.deepEqual(f.state.loading, loading); assert.deepEqual(f.state.feedback, feedback);
    assert.equal(f.state.rules, 0); assert.equal(f.state.confirms, 0);
    await f.run(); assert.equal(f.state.parses, 2, 'new generation remains locked');
    f.pending[1].resolve([]); await current;
    assert.equal(f.context.parseRequestRef.current, null);
  }
});

test('missing or changed owner blocks interpretation before any callback or request', async () => {
  for (const missing of [false, true]) {
    const f = parseRequestFixture();
    if (missing) f.context.user = null; else f.context.liveBudgetOwner.current = 'B';
    await f.run(); assert.equal(f.state.parses, 0); assert.equal(f.state.rules, 0);
    assert.deepEqual(f.state.loading, []); assert.deepEqual(f.state.feedback, []);
  }
});


test('category-read failure and synchronous parser failure release only their own lock', async () => {
  const f = parseRequestFixture(true); const first = f.run(); f.pending[0].resolve([]); await first;
  assert.equal(f.context.parseRequestRef.current, null); assert.equal(f.state.confirms, 0);
  assert.equal(f.state.loading.at(-1), false); assert.ok(f.state.feedback.at(-1)?.includes('분류'));
  const retry = f.run(); assert.equal(f.state.parses, 2); f.pending[1].resolve([]); await retry;
  const sync = parseRequestFixture(); sync.context.parseInput = () => { throw Error('synchronous synthetic'); };
  await sync.run(); assert.equal(sync.context.parseRequestRef.current, null);
  assert.equal(sync.state.loading.at(-1), false);
});


test('unmounted dashboard rejects a retained sentence callback before interpretation', async () => {
  const f = parseRequestFixture(); f.context.budgetMounted.current = false; f.context.budgetEpoch.current++;
  await f.run(); assert.equal(f.state.parses, 0); assert.equal(f.state.rules, 0);
  assert.deepEqual(f.state.loading, []); assert.deepEqual(f.state.feedback, []);
});

function authDispatchFixture() {
  const authWaits: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  const state = { fetches: 0, queries: 0, reviews: 0, fallbacks: 0, authReads: 0, modelFails: false, networkFails: false, changes: [] as unknown[], sent: [] as { input: unknown; init: RequestInit }[] };
  const context = {
    Headers, Date, API_BASE_URL: '', input: 'SYNTHETIC_A_ONLY', user: { id: 'A' } as { id: string } | null,
    budgetMounted: { current: true }, liveBudgetOwner: { current: 'A' as string | null }, budgetEpoch: { current: 1 }, parseRequestRef: { current: null as null | { owner: string; epoch: number } }, savingRecordsRef: { current: false }, pendingSaveRef: { current: null }, reviewOwner: { current: null }, reviewWasManual: { current: false },
    createClient: () => ({ auth: { getSession: () => { state.authReads++; return new Promise((resolve, reject) => authWaits.push({ resolve, reject })); } } }),
    fetch: async (input: unknown, init: RequestInit) => { state.fetches++; state.sent.push({ input, init }); if (state.networkFails) throw Error('synthetic network failure'); return { json: async () => state.modelFails ? {} : { content: [{ text: '{"items":[{"type":"income","amount":1,"place":"synthetic"}]}' }] } }; },
    buildTransactionParseSystem: () => 'synthetic system', hasLocalExpenseMetaSignal: () => false, detectLocalExpenseCategory: () => '기타', inferExpenseMeta: () => ({ payment: '', transaction_type: '' }), getLocalDateKey: () => '2026-11-15', parseInputLocally: () => { state.fallbacks++; return [{ type: 'income', amount: 1, place: 'synthetic fallback' }]; }, applyCategoryMemory: (items: unknown[]) => items,
    setAiLoading: (value: boolean) => state.changes.push(['loading', value]), setFeedback: (value: string) => state.changes.push(['feedback', value]), setParsedItems: (value: unknown) => state.changes.push(['items', value]), setShowConfirm: () => { state.reviews++; },
    supabase: { from: () => { state.queries++; return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], count: 0, error: null }) }) }) }) }; } },
  };
  const parseStart = source.indexOf('  const parseInput ='), parseEnd = source.indexOf('  const handleManualReview', parseStart);
  const runStart = source.indexOf('  const handleAddTransaction ='), runEnd = source.indexOf('  const updateParsedItem', runStart);
  const code = boundaryClassSource + '\n' + transportSource.slice(transportSource.indexOf('export async function authenticatedFetch')).replace('export async', 'async') + '\n' + source.slice(parseStart, parseEnd) + source.slice(runStart, runEnd);
  const actual = vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '; ({run:handleAddTransaction, transport:authenticatedFetch})', context) as { run: () => Promise<void>; transport: (url: string, init?: RequestInit, boundary?: { ownerId: string; isCurrent: () => boolean }) => Promise<unknown> };
  const session = (owner = 'A', token = 'SYNTHETIC_INVALID_TOKEN_A') => ({ data: { session: { user: { id: owner }, access_token: token, expires_at: Date.now() / 1000 + 3600 } }, error: null });
  return { state, context, authWaits, ...actual, session };
}

test('exact guarded chain blocks stale auth dispatch, session mismatch and auth errors without local fallback', async () => {
  for (const mode of ['switch', 'logout', 'unmount', 'ABA', 'session-only-B', 'missing-session', 'empty-token', 'whitespace-token', 'expired-token', 'auth-error', 'auth-reject']) {
    const f = authDispatchFixture(); const pending = f.run();
    assert.equal(f.state.authReads, 1); assert.equal(f.state.fetches, 0);
    if (mode === 'switch') { f.context.liveBudgetOwner.current = 'B'; f.context.budgetEpoch.current++; }
    if (mode === 'logout') { f.context.user = null; f.context.liveBudgetOwner.current = null; f.context.budgetEpoch.current++; }
    if (mode === 'unmount') { f.context.budgetMounted.current = false; f.context.budgetEpoch.current++; }
    if (mode === 'ABA') f.context.budgetEpoch.current += 2;
    const before = [...f.state.changes];
    if (mode === 'auth-reject') f.authWaits[0].reject(Error('synthetic auth error'));
    else if (mode === 'missing-session') f.authWaits[0].resolve({ data: { session: null }, error: null });
    else if (mode === 'expired-token') { const expired = f.session(); expired.data.session.expires_at = 1; f.authWaits[0].resolve(expired); }
    else if (mode === 'auth-error') f.authWaits[0].resolve({ ...f.session(), error: { message: 'synthetic' } });
    else f.authWaits[0].resolve(f.session(mode === 'session-only-B' ? 'B' : 'A', mode === 'empty-token' ? '' : mode === 'whitespace-token' ? '  ' : 'SYNTHETIC_INVALID_TOKEN_A'));
    await pending;
    assert.equal(f.state.fetches, 0, mode); assert.equal(f.state.fallbacks, 0, mode); assert.equal(f.state.queries, 0, mode); assert.equal(f.state.reviews, 0, mode);
    assert.equal(f.context.parseRequestRef.current, null);
    if (['switch', 'logout', 'unmount', 'ABA'].includes(mode)) assert.deepEqual(f.state.changes, before, mode);
  }
});

test('current guarded chain sends once and preserves ordinary model/network fallback and retry', async () => {
  for (const failure of ['none', 'model', 'network']) {
    const f = authDispatchFixture(); f.state.modelFails = failure === 'model'; f.state.networkFails = failure === 'network';
    const pending = f.run(); await f.run(); assert.equal(f.state.authReads, 1);
    f.authWaits[0].resolve(f.session()); await pending;
    assert.equal(f.state.fetches, 1); assert.equal(f.state.queries, 1); assert.equal(f.state.reviews, 1);
    assert.equal(f.state.fallbacks, failure === 'none' ? 0 : 1);
    assert.equal(new Headers(f.state.sent[0].init.headers).get('Authorization'), 'Bearer SYNTHETIC_INVALID_TOKEN_A');
    assert.ok(!('boundary' in f.state.sent[0].init));
    assert.equal(f.context.parseRequestRef.current, null);
  }
});

test('old authentication completion cannot unlock or apply over a new generation', async () => {
  const f = authDispatchFixture(); const old = f.run(); f.context.budgetEpoch.current++;
  const current = f.run(); const token = f.context.parseRequestRef.current, before = [...f.state.changes];
  f.authWaits[0].resolve(f.session()); await old;
  assert.equal(f.state.fetches, 0); assert.equal(f.context.parseRequestRef.current, token); assert.deepEqual(f.state.changes, before);
  await f.run(); assert.equal(f.state.authReads, 2);
  f.authWaits[1].resolve(f.session()); await current;
  assert.equal(f.state.fetches, 1); assert.equal(f.state.reviews, 1);
});

test('unguarded authenticatedFetch retains optional auth/header/body compatibility', async () => {
  for (const hasSession of [false, true]) {
    const f = authDispatchFixture(); const pending = f.transport('/synthetic', { method: 'POST', body: 'synthetic', headers: { 'X-Synthetic': 'yes', Authorization: 'existing-synthetic' } });
    f.authWaits[0].resolve(hasSession ? f.session('B', 'SYNTHETIC_B') : { data: { session: null }, error: null }); await pending;
    assert.equal(f.state.fetches, 1); assert.equal(f.state.sent[0].init.body, 'synthetic');
    const headers = new Headers(f.state.sent[0].init.headers);
    assert.equal(headers.get('X-Synthetic'), 'yes'); assert.equal(headers.get('Authorization'), hasSession ? 'Bearer SYNTHETIC_B' : 'existing-synthetic');
  }
});

test('guarded transport rejects cancellation and checks current scope immediately before dispatch', async () => {
  const f = authDispatchFixture(); const controller = new AbortController();
  const pending = f.transport('/synthetic', { signal: controller.signal }, { ownerId: 'A', isCurrent: () => true });
  controller.abort(); f.authWaits[0].resolve(f.session());
  await assert.rejects(pending, { name: 'AuthenticatedFetchBoundaryError' }); assert.equal(f.state.fetches, 0);
  const final = authDispatchFixture(); let checks = 0;
  const finalPending = final.transport('/synthetic', {}, { ownerId: 'A', isCurrent: () => ++checks < 3 });
  final.authWaits[0].resolve(final.session());
  await assert.rejects(finalPending, { name: 'AuthenticatedFetchBoundaryError' }); assert.equal(final.state.fetches, 0);
});


test('guarded transport rejects already stale scope before auth lookup; failed auth allows explicit retry', async () => {
  const stale = authDispatchFixture();
  await assert.rejects(stale.transport('/synthetic', {}, { ownerId: 'A', isCurrent: () => false }), { name: 'AuthenticatedFetchBoundaryError' });
  assert.equal(stale.state.authReads, 0); assert.equal(stale.state.fetches, 0);
  const f = authDispatchFixture(); const first = f.run(); f.authWaits[0].reject(Error('synthetic auth')); await first;
  assert.equal(f.state.fallbacks, 0); const retry = f.run(); f.authWaits[1].resolve(f.session()); await retry;
  assert.equal(f.state.fetches, 1); assert.equal(f.state.reviews, 1);
});


test('guarded owner IDs require nonblank strings before any auth or current-scope callback', async () => {
  for (const ownerId of [1, 0, ' ', '', null, {}]) {
    const f = authDispatchFixture(); let currentCalls = 0;
    await assert.rejects(f.transport('/synthetic', {}, { ownerId: ownerId as string, isCurrent: () => { currentCalls++; return true; } }), { name: 'AuthenticatedFetchBoundaryError' });
    assert.equal(currentCalls, 0); assert.equal(f.state.authReads, 0); assert.equal(f.state.fetches, 0);
  }
  const normal = authDispatchFixture(); const pending = normal.transport('/synthetic', {}, { ownerId: 'synthetic-not-uuid', isCurrent: () => true });
  normal.authWaits[0].resolve(normal.session('synthetic-not-uuid')); await pending; assert.equal(normal.state.fetches, 1);
  const untrimmed = authDispatchFixture(); const mismatch = untrimmed.transport('/synthetic', {}, { ownerId: ' A ', isCurrent: () => true });
  untrimmed.authWaits[0].resolve(untrimmed.session('A'));
  await assert.rejects(mismatch, { name: 'AuthenticatedFetchBoundaryError' }); assert.equal(untrimmed.state.fetches, 0);
});


test('a same-render manual callback cannot open review while parsing holds the current-generation lock', async () => {
  const f = parseRequestFixture(); const pending = f.run();
  f.manual(item, 'A');
  const prematureManualReviews = f.state.confirms;
  f.pending[0].resolve([{ ...item, place: 'synthetic parsed' }]); await pending;
  assert.equal(prematureManualReviews, 0, 'manual callback must consult synchronous lock before aiLoading rerenders');
  assert.equal(f.state.confirms, 1);
});


test('manual review resumes after parser settlement and ignores obsolete owner-generation locks', async () => {
  for (const fail of [false, true]) {
    const f = parseRequestFixture(); const pending = f.run();
    f.manual(item, 'A'); assert.equal(f.state.confirms, 0);
    if (fail) f.pending[0].reject(Error('synthetic')); else f.pending[0].resolve([]);
    await pending; const before = f.state.confirms;
    f.manual(item, 'A'); assert.equal(f.state.confirms, before + 1); assert.deepEqual(structuredClone(f.state.items), [item]);
  }
  for (const token of [{ owner: 'A', epoch: -1 }, { owner: 'B', epoch: 0 }]) {
    const old = fixture(); old.context.parseRequestRef.current = token;
    old.actions.review(item, 'A'); assert.equal(old.state.confirm, true);
    assert.equal(old.state.rpc, 0); assert.equal(old.state.writes, 0);
  }
});

test('manual review is excluded while category lookup retains the parse lock', async () => {
  const f = parseRequestFixture(); let resolveRules!: (value: { data: never[]; error: null; count: number }) => void;
  f.context.supabase.from = () => { f.state.rules++; return { select: () => ({ eq: () => ({ order: () => ({ limit: () => new Promise(resolve => { resolveRules = resolve; }) }) }) }) }; };
  const pending = f.run(); f.pending[0].resolve([]); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.state.rules, 1); f.manual(item, 'A'); assert.equal(f.state.confirms, 0);
  resolveRules({ data: [], error: null, count: 0 }); await pending;
  assert.equal(f.state.confirms, 1);
});
