import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../app/budget/page.tsx',import.meta.url),'utf8');
const start=source.indexOf('  const fetchRecordKind =');
const end=source.indexOf('  const fetchTransactions =',start);
function deferred(){let resolve!:(v:unknown)=>void,reject!:(e:Error)=>void;const promise=new Promise((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject};}
function fixture(){
 const state={expense:[] as unknown[],income:[] as unknown[],saving:[] as unknown[],loads:{} as Record<string,string>};const pending:ReturnType<typeof deferred>[]=[];
 const context={recordReadVersions:{current:{expense:0,income:0,saving:0}},budgetEpoch:{current:1},liveBudgetOwner:{current:'A'},supabase:{auth:{getUser:async()=>({data:{user:{id:context.liveBudgetOwner.current}},error:null})}},BUDGET_RECORD_TABLE:{expense:'budget_transactions',income:'budget_income',saving:'budget_savings'},loadBudgetRows:()=>{const d=deferred();pending.push(d);return d.promise;},setTransactions:(v:unknown[])=>state.expense=v,setIncomeList:(v:unknown[])=>state.income=v,setSavings:(v:unknown[])=>state.saving=v,setRecurringTransactions:()=>{},getLocalDateKey:()=> '2026-01-01',setRecordLoads:(fn:(x:Record<string,string>)=>Record<string,string>)=>state.loads=fn(state.loads)};
 const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const run=vm.runInNewContext(code+';fetchRecordKind',context) as(kind:string)=>Promise<boolean>;
 return{context,state,pending,run};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('a slower old refresh cannot replace a newer same-account list',async()=>{const f=fixture();const old=f.run('expense');await tick();const fresh=f.run('expense');await tick();f.pending[1].resolve([{id:'new',date:'2026-10-23'}]);assert.equal(await fresh,true);f.pending[0].resolve([{id:'old',date:'2026-10-01'}]);assert.equal(await old,false);assert.deepEqual(structuredClone(f.state.expense),[{id:'new',date:'2026-10-23'}]);});
test('old refresh failure cannot replace latest ready status',async()=>{const f=fixture();const old=f.run('expense');await tick();const fresh=f.run('expense');await tick();f.pending[1].resolve([]);await fresh;f.pending[0].reject(Error('old'));await old;assert.equal(f.state.loads.expense,'ready');});
test('A to B to A generation boundary ignores old rows and errors',async()=>{for(const fail of [false,true]){const f=fixture();const task=f.run('expense');await tick();f.context.liveBudgetOwner.current='B';f.context.budgetEpoch.current++;f.context.liveBudgetOwner.current='A';f.context.budgetEpoch.current++;f.state.loads.expense='new generation';if(fail)f.pending[0].reject(Error('old'));else f.pending[0].resolve([{id:'old'}]);assert.equal(await task,false);assert.deepEqual(f.state.expense,[]);assert.equal(f.state.loads.expense,'new generation');}});
test('income and expense refreshes do not cancel one another',async()=>{const f=fixture();const expense=f.run('expense'),income=f.run('income');await tick();f.pending[0].resolve([{id:'e',date:'2026-10-23'}]);f.pending[1].resolve([{id:'i'}]);assert.equal(await expense,true);assert.equal(await income,true);assert.equal(f.state.loads.income,'ready');assert.equal(f.state.loads.expense,'ready');});
test('latest failure retains previous rows and offers load-error state',async()=>{const f=fixture();f.state.expense=[{id:'keep'}];const task=f.run('expense');await tick();f.pending[0].reject(Error('offline'));assert.equal(await task,false);assert.deepEqual(f.state.expense,[{id:'keep'}]);assert.match(f.state.loads.expense,/다시 불러와/);});
test('visible load retry refreshes three lists without reloading or losing an unsaved draft',async()=>{
 const section=source.slice(source.indexOf('{dataLoadError && !isOffline && ('),source.indexOf('{deleteUndo && !isOffline'));
 const expression=section.match(/onClick={(.*?)}/)?.[1];assert.ok(expression);
 const state={draft:'unsaved synthetic draft',reads:0,reloads:0};
 const read=async()=>{state.reads++;return true;};
 const run=vm.runInNewContext('('+expression+')',{fetchIncome:read,fetchTransactions:read,fetchSavings:read,window:{location:{reload(){state.reloads++;state.draft='';}}}}) as()=>void;
 run();await tick();assert.equal(state.reloads,0);assert.equal(state.draft,'unsaved synthetic draft');assert.equal(state.reads,3);
});
test('page-exit epoch invalidation ignores late completion',async()=>{const f=fixture();const task=f.run('expense');await tick();assert.match(source,/useEffect\(\(\) => \(\) => { budgetEpoch.current \+= 1 }, \[\]\)/);f.context.budgetEpoch.current++;f.pending[0].resolve([{id:'late'}]);assert.equal(await task,false);assert.deepEqual(f.state.expense,[]);});

// Actual recurring-decision callbacks with a deferred in-memory provider. This
// is not a React renderer, Supabase integration test or browser timing claim.
type Preference = { signature: string; name: string; category: string; status: string; average_amount: number; last_detected_on: string | null };
const preference = (status = 'confirmed'): Preference => ({ signature: 'telecom:synthetic', name: '가상 통신사', category: '통신비', status, average_amount: 10000, last_detected_on: '2026-11-01' });
const candidate = { key: 'telecom:synthetic', place: '가상 통신사', category: '통신비', avgAmount: 10000, lastDate: '2026-11-01' };
function recurringFixture() {
  const begin = source.indexOf('  const fetchRecurringExpensePreferences =');
  const finish = source.indexOf('  const fetchSavings =', begin);
  assert.ok(begin > 0 && finish > begin);
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect = '', dependencies = '';
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('recurringReadVersion.current += 1')) {
      effect = node.arguments[0].getText(ast); dependencies = node.arguments[1].getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(effect); assert.equal(dependencies, '[user?.id]');
  const state = { rows: [] as Preference[], phase: 'loading', busy: '', notice: '', error: '', stored: [] as Preference[], authenticatedOwner: 'A', holdAuth: false };
  const reads: ReturnType<typeof deferred>[] = [], auth: ReturnType<typeof deferred>[] = [];
  const writes: { kind: string; owner: string; signature: string; value?: Preference; gate: ReturnType<typeof deferred> }[] = [];
  const context = {
    user: { id: 'A' }, liveBudgetOwner: { current: 'A' }, budgetMounted: { current: true }, budgetEpoch: { current: 1 },
    recurringReadyRef: { current: false }, recurringReadVersion: { current: 0 }, recurringDecisionRef: { current: null as symbol | null },
    setRecurringExpensePreferences: (next: Preference[] | ((rows: Preference[]) => Preference[])) => { state.rows = typeof next === 'function' ? next(state.rows) : next; },
    setRecurringDecisionSavingKey: (next: string) => { state.busy = next; }, setRecurringLoadState: (next: string) => { state.phase = next; },
    setActionError: (next: string | ((value: string) => string)) => { state.error = typeof next === 'function' ? next(state.error) : next; }, setPageNotice: (next: string) => { state.notice = next; },
    supabase: {
      auth: { getUser: () => { if (state.holdAuth) { const d = deferred(); auth.push(d); return d.promise; } return Promise.resolve({ data: { user: { id: state.authenticatedOwner } }, error: null }); } },
      from: (table: string) => {
        assert.equal(table, 'budget_recurring_expense_preferences');
        let kind = 'read', owner = '', signature = '', value: Preference | undefined;
        const dispatch = () => { const gate = deferred(); writes.push({ kind, owner, signature, value, gate }); return gate.promise; };
        const query = {
          select: () => query,
          eq: (field: string, next: string) => { if (field === 'user_id') owner = next; else if (field === 'signature') signature = next; else assert.fail('Unexpected filter'); return query; },
          order: () => { assert.equal(owner, state.authenticatedOwner); const gate = deferred(); reads.push(gate); return gate.promise; },
          upsert: (next: Preference & { user_id: string }, options: { onConflict: string }) => { assert.equal(options.onConflict, 'user_id,signature'); kind = 'save'; value = structuredClone(next); owner = next.user_id; signature = next.signature; return query; },
          delete: () => { kind = 'delete'; return query; }, single: dispatch,
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => dispatch().then(resolve, reject),
        };
        return query;
      },
    },
  };
  const code = ts.transpileModule(source.slice(begin, finish) + `;({read:fetchRecurringExpensePreferences,save:saveRecurringExpenseDecision,restore:restoreRecurringExpenseCandidate,effect:${effect}})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const handlers = vm.runInNewContext(code, context) as { read: () => Promise<boolean>; save: (item: typeof candidate, status: string) => Promise<boolean>; restore: (signature: string) => Promise<boolean>; effect: () => () => void };
  async function ready(rows: Preference[] = []) { const task = handlers.read(); await tick(); reads.at(-1)!.resolve({ data: rows, error: null }); assert.equal(await task, true); }
  function completeWrite(index: number, options: { loseResponse?: boolean; throwResponse?: boolean; commit?: boolean; wrongData?: boolean } = {}) {
    const write = writes[index]; assert.ok(write); assert.equal(write.owner, 'A');
    if (options.commit !== false) state.stored = write.kind === 'delete' ? state.stored.filter(row => row.signature !== write.signature) : [write.value!, ...state.stored.filter(row => row.signature !== write.signature)];
    if (options.throwResponse) write.gate.reject(Error('synthetic response loss'));
    else write.gate.resolve({ data: options.wrongData ? preference('different') : write.value ?? null, error: options.loseResponse ? { code: 'SYNTHETIC_RESPONSE_LOSS' } : null });
  }
  return { context, state, reads, writes, auth, ready, completeWrite, ...handlers };
}

test('recurring decisions wait for owner-scoped successful initial load, including an empty list', async () => {
  const f = recurringFixture(); const cleanup = f.effect(); await tick();
  assert.equal(f.state.phase, 'loading'); assert.equal(await f.save(candidate, 'confirmed'), false);
  assert.equal(await f.restore(candidate.key), false); assert.equal(f.writes.length, 0);
  f.reads[0].resolve({ data: [], error: null }); await tick(); assert.equal(f.state.phase, 'ready');
  const saved = f.save(candidate, 'confirmed'); await tick(); f.completeWrite(0); assert.equal(await saved, true);
  assert.equal(f.state.rows[0].status, 'confirmed'); assert.equal(f.state.stored[0].status, 'confirmed'); cleanup();
});
test('newer recurring load supersedes an old initial response before explicit confirmation, exclusion and restore', async () => {
  for (const action of ['confirmed', 'excluded', 'restore']) {
    const f = recurringFixture(); const old = f.read(); await tick(); await f.ready([preference()]);
    const task = action === 'restore' ? f.restore(candidate.key) : f.save(candidate, action);
    await tick(); f.completeWrite(0); assert.equal(await task, true); const after = JSON.stringify(f.state.rows);
    f.reads[0].resolve({ data: [preference('old')], error: null }); assert.equal(await old, false);
    assert.equal(JSON.stringify(f.state.rows), after); assert.equal(f.state.phase, 'ready'); assert.equal(f.state.busy, '');
  }
});
test('a pending recurring decision is synchronously serialized and cannot start a competing read', async () => {
  const f = recurringFixture(); await f.ready(); const first = f.save(candidate, 'confirmed');
  assert.equal(await f.save(candidate, 'excluded'), false); assert.equal(await f.restore(candidate.key), false);
  assert.equal(await f.read(), false); await tick(); assert.equal(f.writes.length, 1);
  f.completeWrite(0); assert.equal(await first, true); assert.equal(f.state.rows[0].status, 'confirmed');
});
test('recurring read errors retain known rows, block writes and permit read-only retry', async () => {
  for (const reject of [false, true]) {
    const f = recurringFixture(); await f.ready([preference()]); const read = f.read(); await tick();
    if (reject) f.reads[1].reject(Error('offline')); else f.reads[1].resolve({ data: null, error: { code: 'OFFLINE' } });
    assert.equal(await read, false); assert.equal(f.state.phase, 'error'); assert.equal(f.state.rows.length, 1);
    assert.equal(await f.save(candidate, 'excluded'), false); assert.equal(f.writes.length, 0);
    await f.ready([preference()]); assert.equal(f.state.phase, 'ready'); assert.equal(f.writes.length, 0);
  }
});
test('committed recurring writes with a lost or rejected response require read-only confirmation without automatic replay', async () => {
  for (const action of ['confirmed', 'excluded', 'restore']) for (const thrown of [false, true]) {
    const f = recurringFixture(); f.state.stored = [preference()]; await f.ready([preference()]);
    const task = action === 'restore' ? f.restore(candidate.key) : f.save(candidate, action); await tick();
    f.completeWrite(0, { loseResponse: !thrown, throwResponse: thrown }); assert.equal(await task, false);
    assert.equal(f.state.phase, 'error'); assert.equal(f.state.busy, ''); assert.equal(f.state.notice, '');
    assert.equal(await f.save(candidate, 'confirmed'), false); assert.equal(f.writes.length, 1);
    await f.ready(structuredClone(f.state.stored)); assert.deepEqual(structuredClone(f.state.rows), f.state.stored);
    assert.equal(f.writes.length, 1); assert.equal(f.state.error, '');
  }
});
test('recurring owner or lifetime changes during auth stop dispatch; late writes cannot touch new state', async () => {
  for (const change of ['owner', 'epoch', 'unmount']) {
    const f = recurringFixture(); await f.ready(); f.state.holdAuth = true; const task = f.save(candidate, 'confirmed');
    if (change === 'owner') f.context.liveBudgetOwner.current = 'B';
    else if (change === 'epoch') f.context.budgetEpoch.current++;
    else f.context.budgetMounted.current = false;
    f.auth[0].resolve({ data: { user: { id: 'A' } }, error: null }); assert.equal(await task, false); assert.equal(f.writes.length, 0);
  }
  const f = recurringFixture(); await f.ready(); const old = f.save(candidate, 'confirmed'); await tick();
  f.context.budgetEpoch.current++; f.context.recurringDecisionRef.current = Symbol('new'); f.state.rows = [preference('new')]; f.state.busy = 'new';
  f.completeWrite(0); assert.equal(await old, false); assert.equal(f.state.rows[0].status, 'new'); assert.equal(f.state.busy, 'new');
});
test('recurring auth mismatch and malformed write success cannot be applied as a confirmed decision', async () => {
  const f = recurringFixture(); await f.ready(); f.state.authenticatedOwner = 'B'; assert.equal(await f.save(candidate, 'confirmed'), false);
  assert.equal(f.writes.length, 0); assert.equal(f.state.phase, 'error'); assert.equal(f.state.busy, '');
  const g = recurringFixture(); await g.ready(); const task = g.save(candidate, 'confirmed'); await tick(); g.completeWrite(0, { wrongData: true });
  assert.equal(await task, false); assert.equal(g.state.phase, 'error'); assert.equal(g.state.rows.length, 0);
});
test('recurring effect cleanup rejects old reads and starts only in a committed owner generation', async () => {
  const f = recurringFixture(); const cleanup = f.effect(); await tick(); cleanup();
  f.reads[0].resolve({ data: [preference('old')], error: null }); await tick(); assert.equal(f.state.rows.length, 0);
  const ownEffect = source.indexOf('    reviewWasManual.current = false');
  const recurringEffect = source.indexOf('    recurringReadVersion.current += 1');
  assert.ok(recurringEffect > ownEffect);
  const bootstrapStart = source.indexOf('    const checkUser =');
  const bootstrapEnd = source.indexOf('    checkUser()', bootstrapStart);
  assert.doesNotMatch(source.slice(bootstrapStart, bootstrapEnd), /fetchRecurringExpensePreferences\(/);
});
test('all recurring decision controls share readiness gate and retry remains a read-only explicit action', () => {
  const panel = source.slice(source.indexOf('>📌 반복지출 관리</p>'), source.indexOf("      {tab === 'settings'"));
  assert.equal((panel.match(/disabled={recurringDecisionBlocked}/g) || []).length, 4);
  assert.match(panel, /설정 다시 불러오기/); assert.match(panel, /void fetchRecurringExpensePreferences\(\)/);
  const expression = source.match(/const recurringDecisionBlocked = (.*)/)![1];
  for (const phase of ['loading', 'ready', 'error']) for (const key of ['', 'pending']) {
    assert.equal(vm.runInNewContext(expression, { recurringLoadState: phase, recurringDecisionSavingKey: key }), phase !== 'ready' || Boolean(key));
  }
});
