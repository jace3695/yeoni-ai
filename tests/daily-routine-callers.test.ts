import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRoutineCompletionQueue } from '../utils/routineCompletionQueue.ts';

const flush = () => new Promise(resolve => setImmediate(resolve));
test('completion and retry deduplicate while pending, retain the exact intent across midnight, and catch rejections', async () => {
  let reject!: (error: Error) => void;
  let resolve!: () => void;
  let owner = 'A';
  const captured: object[] = [];
  const saved: object[] = [];
  const states: { pending: boolean; error: string }[] = [];
  const queue = createRoutineCompletionQueue({
    capture: date => { const intent = Object.freeze({ date, owner }); captured.push(intent); return intent; },
    save: intent => { saved.push(intent); return new Promise<void>((yes, no) => { resolve = yes; reject = no; }); },
    isCurrent: () => owner === 'A', publish: state => states.push(state),
  });
  queue.complete('2026-11-09'); queue.complete('2026-11-09'); queue.retry();
  assert.equal(saved.length, 1); assert.equal(states.at(-1)?.pending, true);
  reject(new Error('quota')); await flush();
  assert.equal(states.at(-1)?.error, 'quota');
  queue.complete('2026-11-09'); assert.equal(saved.length, 1, 'new answers do not retry failures');
  queue.retry(); queue.retry(); assert.equal(saved[1], captured[0]);
  resolve(); await flush();
  queue.complete('2026-11-09'); assert.equal(saved.length, 2);
  queue.complete('2026-11-10'); assert.equal(saved.length, 3);
  assert.deepEqual(captured[0], { date: '2026-11-09', owner: 'A' });
  owner = 'B'; const count = states.length;
  resolve(); await flush();
  queue.retry(); queue.complete('2026-11-11');
  assert.equal(states.length, count, 'late completion cannot publish into another scope');
  assert.equal(captured.length, 2, 'stale screen cannot capture a new owner');
});

test('failed prior day and successful new day coexist; retry does not move old achievement', async () => {
  let fail = true;
  const attempts: string[] = [];
  const queue = createRoutineCompletionQueue({ capture: date => ({ date }), isCurrent: () => true, publish: () => {},
    save: async intent => { attempts.push(intent.date); if (intent.date === '2026-11-09' && fail) throw new Error('fail'); } });
  queue.complete('2026-11-09'); await flush();
  queue.complete('2026-11-10'); await flush();
  fail = false; queue.retry(); await flush();
  assert.deepEqual(attempts, ['2026-11-09', '2026-11-10', '2026-11-09']);
});

function expression(path: string, name: string) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) found = node.initializer.getText(source);
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(found, name); return found;
}
function install(path: string, names: string[], sandbox: Record<string, unknown>) {
  const context = vm.createContext(sandbox);
  for (const name of names) vm.runInContext(ts.transpileModule(`globalThis.${name} = ${expression(path, name)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return (name: string, ...args: unknown[]) => (sandbox[name] as (...args: unknown[]) => unknown)(...args);
}

test('actual sentence handler counts a same-turn double click once without updater persistence', () => {
  const scores: unknown[] = []; let completed = 0;
  const sandbox = { quiz: { selected: null, quizType: 'jp-to-kr', question: { meaning: 'yes' } }, answeredRef: { current: false }, scoreRef: { current: { correct: 2, total: 2 } }, routine: { ensureCurrent: () => true, complete: () => completed++ }, setQuiz: () => {}, setScore: (score: unknown) => scores.push(score), saveWrongSentence: () => {} };
  const call = install('app/language/sentences/page.tsx', ['handleChoiceSelect'], sandbox);
  call('handleChoiceSelect', 'yes'); call('handleChoiceSelect', 'yes');
  assert.equal(scores.length, 1); assert.equal(typeof scores[0], 'object');
  assert.deepEqual(JSON.parse(JSON.stringify(scores[0])), { correct: 3, total: 3 }); assert.equal(completed, 1);
});

test('actual review handler reloads current date, preserves yesterday and reports partial failure honestly', () => {
  const records = new Map([['reviewCompletedItemsByDate', JSON.stringify([{ date: '2026-11-09', items: ['a', 'b', 'c'] }])]]);
  let fail = false; let today = '2026-11-10'; const errors: string[] = []; const completed: string[] = [];
  const sandbox = { localStorage: { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { if (fail) throw new Error('quota'); records.set(key, value); } }, REVIEW_COMPLETED_ITEMS_KEY: 'reviewCompletedItemsByDate', routine: { ensureCurrent: () => true, complete: (date: string) => completed.push(date) }, getTodayLocalDateKey: () => today, reviewedDateRef: { current: '2026-11-09' }, setReviewedItemIds: (items: unknown) => assert.ok(Array.isArray(items)), setReviewSaveError: (error: string) => errors.push(error) };
  const call = install('app/language/review/page.tsx', ['readReviewedItemsByDate', 'writeReviewedItemsByDate', 'getReviewedItemsForDate', 'saveReviewedItemsForDate', 'trackReviewAction'], sandbox);
  call('trackReviewAction', 'd'); call('trackReviewAction', 'd');
  assert.deepEqual(JSON.parse(records.get('reviewCompletedItemsByDate')!), [{ date: '2026-11-09', items: ['a', 'b', 'c'] }, { date: today, items: ['d'] }]);
  assert.equal(completed.length, 0);
  call('trackReviewAction', 'e'); call('trackReviewAction', 'f'); assert.deepEqual(completed, [today]);
  today = '2026-11-11'; fail = true; call('trackReviewAction', 'g');
  assert.match(errors.at(-1)!, /이미 저장되었을 수/);
  fail = false; records.set('reviewCompletedItemsByDate', '{broken'); call('trackReviewAction', 'g');
  assert.equal(records.get('reviewCompletedItemsByDate'), '{broken');
});

test('hook aborts on unmount and session change, fences stale owner before capture, and ignores late acknowledgements', async () => {
  for (const reason of ['unmount', 'session', 'owner'] as const) {
    const effects: (() => (() => void))[] = [];
    const status: unknown[] = [];
    const listeners = new Map<string, () => void>();
    let owner = 'A'; let captures = 0; let finish!: () => void; let signal: AbortSignal | undefined;
    const exports: Record<string, unknown> = {};
    const sandbox = { exports, AbortController, Date, localStorage: {}, document: { documentElement: { dataset: {} } }, window: { addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) }, require: (name: string) => {
      if (name === 'react') return { useCallback: (fn: unknown) => fn, useEffect: (fn: () => () => void) => effects.push(fn), useRef: (value: unknown) => ({ current: value }), useState: () => [{ pending: false, error: '' }, (value: unknown) => status.push(value)] };
      if (name.includes('japaneseLevelJourney')) return { learningOwner: () => owner };
      if (name.includes('routineCompletionQueue')) return { createRoutineCompletionQueue };
      return { captureDailyRoutineCompletion: (_id: string, date: string) => { captures++; return { date }; }, saveDailyRoutineCompletion: (_intent: unknown, guard: { signal: AbortSignal }) => { signal = guard.signal; return new Promise<void>(resolve => { finish = resolve; }); } };
    } };
    vm.runInNewContext(ts.transpileModule(readFileSync('components/language/useDailyRoutineCompletion.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
    const hook = (exports.useDailyRoutineCompletion as (id: string) => { complete: () => void; retry: () => void })('words');
    const cleanup = effects[0](); assert.equal(captures, 1, 'mount validates ownership without saving'); hook.complete(); assert.equal(captures, 2);
    if (reason === 'unmount') cleanup();
    else if (reason === 'session') listeners.get('yeoni-cloud-session-changed')!();
    else owner = 'B';
    const before = status.length;
    finish(); await flush(); assert.equal(status.length, before);
    hook.retry(); assert.equal(captures, 2);
    if (reason !== 'unmount') { hook.complete(); assert.equal(captures, 2); cleanup(); }
    assert.equal(signal?.aborted, true);
  }
});

test('hook rejects unowned or mismatched mount caches before primary answer handlers can write', () => {
  for (const invalid of ['unowned', 'mismatched']) {
    let effect!: () => void;
    let reads = 0;
    let saves = 0;
    const statuses: { error: string }[] = [];
    const exports: Record<string, unknown> = {};
    const sandbox = { exports, AbortController, Date, localStorage: {}, require: (name: string) => {
      if (name === 'react') return { useCallback: (fn: unknown) => fn, useEffect: (fn: () => void) => { effect = fn; }, useRef: (value: unknown) => ({ current: value }), useState: () => [{ pending: false, error: '' }, (value: { error: string }) => statuses.push(value)] };
      if (name.includes('japaneseLevelJourney')) return { learningOwner: () => { reads++; return invalid; } };
      if (name.includes('routineCompletionQueue')) return { createRoutineCompletionQueue };
      return { captureDailyRoutineCompletion: () => { throw new Error(invalid); }, saveDailyRoutineCompletion: () => { saves++; return Promise.resolve(); } };
    } };
    vm.runInNewContext(ts.transpileModule(readFileSync('components/language/useDailyRoutineCompletion.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
    const hook = (exports.useDailyRoutineCompletion as (id: string) => { complete: () => void; isCurrent: () => boolean })('grammar');
    effect(); hook.complete();
    assert.equal(hook.isCurrent(), false); assert.equal(reads, 0); assert.equal(saves, 0);
    assert.ok(statuses.at(-1)?.error);
  }
});

test('transient capture failure retries the original date, clears error and never recaptures a successful intent', async () => {
  let fail = true;
  let current = true;
  let error = '';
  const dates: string[] = [];
  const saved: { date: string }[] = [];
  const queue = createRoutineCompletionQueue({ isCurrent: () => current,
    capture: date => { dates.push(date); if (fail) throw new Error('temporary getItem'); return Object.freeze({ date }); },
    save: async intent => { saved.push(intent); }, publish: state => { error = state.error; } });
  queue.complete('2026-11-09'); await flush(); assert.equal(error, 'temporary getItem');
  fail = false;
  queue.complete('2026-11-10'); await flush(); assert.equal(error, 'temporary getItem', 'old capture failure remains visible');
  queue.retry(); queue.retry(); await flush();
  assert.equal(error, ''); assert.deepEqual(dates, ['2026-11-09', '2026-11-10', '2026-11-09']);
  assert.deepEqual(saved.map(intent => intent.date), ['2026-11-10', '2026-11-09']);
  queue.retry(); await flush(); assert.equal(saved.length, 2);
  fail = true; queue.complete('2026-11-11'); await flush();
  current = false; fail = false; queue.retry(); await flush();
  assert.equal(dates.length, 4, 'invalidated scope cannot retry capture');
  assert.equal(saved.length, 2);
});

test('review preserves date metadata and refuses ambiguous duplicate-day records without writing', () => {
  let raw = JSON.stringify([{ date: '2026-11-09', items: ['a'], origin: { retained: true } }, { date: '2026-11-10', items: ['b'], marker: 7 }]);
  let writes = 0;
  const sandbox = { localStorage: { getItem: () => raw, setItem: (_key: string, value: string) => { writes++; raw = value; } }, REVIEW_COMPLETED_ITEMS_KEY: 'reviewCompletedItemsByDate' };
  const call = install('app/language/review/page.tsx', ['readReviewedItemsByDate', 'writeReviewedItemsByDate', 'getReviewedItemsForDate', 'saveReviewedItemsForDate'], sandbox);
  call('saveReviewedItemsForDate', '2026-11-09', ['c']);
  assert.deepEqual(JSON.parse(raw), [{ date: '2026-11-09', items: ['a', 'c'], origin: { retained: true } }, { date: '2026-11-10', items: ['b'], marker: 7 }]);
  raw = JSON.stringify([{ date: '2026-11-09', items: ['a'], marker: 1 }, { date: '2026-11-09', items: ['z'], marker: 2 }]);
  const before = raw;
  assert.throws(() => call('getReviewedItemsForDate', '2026-11-09'), /중복/);
  assert.throws(() => call('saveReviewedItemsForDate', '2026-11-09', ['c']), /중복/);
  assert.equal(raw, before); assert.equal(writes, 1);
});

test('transient scope reads expose a visible action error while the render predicate stays pure', () => {
  let effect!: () => (() => void);
  let blocked = false;
  let saves = 0;
  const statuses: { error: string }[] = [];
  const exports: Record<string, unknown> = {};
  const sandbox = { exports, AbortController, Date, localStorage: {}, document: { documentElement: { dataset: {} } }, window: { addEventListener: () => {}, removeEventListener: () => {} }, require: (name: string) => {
    if (name === 'react') return { useCallback: (fn: unknown) => fn, useEffect: (fn: () => () => void) => { effect = fn; }, useRef: (value: unknown) => ({ current: value }), useState: () => [{ pending: false, error: '' }, (value: { error: string } | ((previous: { error: string }) => { error: string })) => statuses.push(typeof value === 'function' ? value(statuses.at(-1) ?? { error: '' }) : value)] };
    if (name.includes('japaneseLevelJourney')) return { learningOwner: () => { if (blocked) throw new Error('temporary getItem'); return 'A'; } };
    if (name.includes('routineCompletionQueue')) return { createRoutineCompletionQueue };
    return { captureDailyRoutineCompletion: () => ({ date: '2026-11-09' }), saveDailyRoutineCompletion: () => { saves++; return Promise.resolve(); } };
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync('components/language/useDailyRoutineCompletion.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  const hook = (exports.useDailyRoutineCompletion as (id: string) => { isCurrent: () => boolean; ensureCurrent: () => boolean })('words');
  const cleanup = effect(); blocked = true;
  assert.equal(hook.isCurrent(), false); assert.equal(statuses.length, 0);
  assert.equal(hook.ensureCurrent(), false); assert.match(statuses.at(-1)!.error, /저장 공간이나 계정 상태/); assert.equal(saves, 0);
  blocked = false; assert.equal(hook.ensureCurrent(), true); assert.equal(statuses.at(-1)!.error, '');
  cleanup(); const count = statuses.length; assert.equal(hook.ensureCurrent(), false); assert.equal(statuses.length, count);
  for (const name of ['kana', 'words', 'grammar', 'sentences', 'review']) {
    const source = readFileSync(`app/language/${name}/page.tsx`, 'utf8');
    assert.match(source, /routine.ensureCurrent\(\)/);
    assert.doesNotMatch(source, /routine.isCurrent\(\)/);
  }
  const notice = readFileSync('components/language/DailyRoutineSaveNotice.tsx', 'utf8');
  assert.match(notice, /새로고침하면 사라질 수/);
  assert.match(notice, /이미 저장된 답안을 다시 풀거나 기록을 지우지 마세요/);
});
