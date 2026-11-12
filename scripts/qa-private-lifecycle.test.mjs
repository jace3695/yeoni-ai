// Offline control-path tests only. No browser, installer, network, Auth or DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { runPrivateStage, lifecycleLine, terminationGraceMs } from './qa-private-lifecycle.mjs';
import { runStages } from './qa-private-orchestrator.mjs';
import { supervise } from './isolated-chromium-smoke/supervisor.mjs';

const canary = 'SYNTHETIC_PRIVATE_https://private.invalid/?secret=CANARY_eyJtoken\r\n::error::PRIVATE';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function clock(t) {
  let now = 0, next = 1;
  const pending = new Map();
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const id = next++; pending.set(id, { callback, at: now + delay }); return id;
  });
  t.mock.method(globalThis, 'clearTimeout', id => pending.delete(id));
  return { pending, async tick(ms) {
    const end = now + ms;
    while (true) {
      const selected = [...pending].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!selected) break;
      const [id, item] = selected; now = item.at; pending.delete(id); item.callback(); await flush();
    }
    now = end; await flush();
  } };
}
function fakeChild() {
  const child = new EventEmitter();
  child.pid = 123456789; // Signal method is fully mocked in every fake-child test.
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.unrefs = 0; child.unref = () => child.unrefs++;
  return child;
}
function signals(t, error) {
  const calls = [];
  t.mock.method(process, 'kill', (pid, signal) => { calls.push({ pid, signal }); if (error) throw error; return true; });
  return calls;
}

test('lifecycle diagnostics emit only finite labels and bounded numbers, never supplied error content', () => {
  const malicious = { reason: canary, signal: canary, code: canary, durationMs: Infinity, exitMs: NaN,
    closeMs: -Infinity, capture: canary, exited: canary, term: canary, kill: canary, message: canary };
  const line = lifecycleLine('stage-02', malicious);
  assert.match(line, /^stage-02 lifecycle reason=runner-error code=-1 signal=0 durationMs=-1 exitMs=-1 closeMs=-1 durationCapped=0 leader=unobserved capture=unverified processCleanup=unverified term=other kill=other$/);
  for (const part of ['PRIVATE', 'https:', 'eyJ', '::error::', 'secret']) assert.ok(!line.includes(part));
  assert.match(lifecycleLine('stage-02', { code: 255, signal: 'SIGTERM', durationMs: 780001, exitMs: 2.7, closeMs: 780001,
    reason: 'timeout', capture: 'abandoned', exited: true, term: 'accepted', kill: 'missing' }),
  /code=255 signal=15 durationMs=780000 exitMs=2 closeMs=780000 durationCapped=1 leader=exited capture=abandoned processCleanup=unverified/);
  for (const code of [-1, 256, 1.2, NaN, Infinity]) assert.ok(lifecycleLine('stage-02', { code }).includes('code=-1'));
  assert.throws(() => lifecycleLine(canary, {}));
  assert.equal(terminationGraceMs, 5000);
});

test('normal success and nonzero close dispose all deadline and abort listeners', async t => {
  const c = clock(t), sent = signals(t);
  for (const code of [0, 7]) {
    const child = fakeChild(), controller = new AbortController();
    const result = runPrivateStage(async control => ({ code: await control.watch(child) }), { timeoutMs: 100, signal: controller.signal });
    await flush(); child.emit('exit', code, null); child.emit('close', code, null);
    const value = await result;
    assert.equal(value.code, code === 0 ? 0 : 1); assert.equal(value.observation.code, code);
    assert.equal(value.observation.capture, 'drained'); assert.equal(value.observation.exited, true);
    assert.equal(child.listenerCount('exit'), 0); assert.equal(child.listenerCount('close'), 0);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    assert.equal(c.pending.size, 0); assert.equal(child.unrefs, 1);
  }
  assert.deepEqual(sent, []);
});

test('first timeout wins over repeated cancellation and late callbacks; inherited pipes are abandoned at existing grace', async t => {
  const c = clock(t), sent = signals(t), child = fakeChild(), controller = new AbortController();
  let control, settled = 0;
  const result = runPrivateStage(async value => { control = value; return { code: await value.watch(child) }; }, { timeoutMs: 100, signal: controller.signal });
  result.then(() => settled++); await flush();
  await c.tick(100); child.emit('exit', null, 'SIGTERM');
  await c.tick(2000); controller.abort(); control.captureError(); controller.abort();
  await c.tick(2999); assert.equal(settled, 0);
  await c.tick(1); const value = await result;
  assert.equal(settled, 1); assert.equal(value.code, 1); assert.equal(value.observation.reason, 'timeout');
  assert.equal(value.observation.capture, 'abandoned'); assert.equal(value.observation.signal, 'SIGTERM');
  assert.equal(value.observation.closeMs, -1); assert.equal(value.observation.kill, 'accepted');
  assert.equal(child.stdout.destroyed, true); assert.equal(child.stderr.destroyed, true);
  assert.equal(child.listenerCount('exit'), 0); assert.equal(child.listenerCount('close'), 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0); assert.equal(c.pending.size, 0);
  assert.deepEqual(sent.map(item => item.signal), ['SIGTERM', 'SIGKILL']);
  child.emit('exit', 0, null); child.emit('close', 0, null); child.emit('error', new Error(canary));
  control.captureError(); await c.tick(50000);
  assert.equal(settled, 1); assert.equal(sent.length, 2); assert.equal(child.unrefs, 1);
  assert.equal(value.code, 1); assert.ok(lifecycleLine('stage-02', value.observation).includes('processCleanup=unverified'));
});

test('denied or missing group signals never imply process cleanup; no actual OS signal is sent', async t => {
  const c = clock(t);
  for (const errorCode of ['EPERM', 'ESRCH', canary]) {
    const child = fakeChild();
    const mock = t.mock.method(process, 'kill', () => { throw Object.assign(new Error(canary), { code: errorCode }); });
    const result = runPrivateStage(async control => ({ code: await control.watch(child) }), { timeoutMs: 100 });
    await flush(); await c.tick(5100); const value = await result;
    assert.equal(value.code, 1); assert.equal(value.observation.exited, false);
    assert.equal(value.observation.kill, errorCode === 'EPERM' ? 'denied' : errorCode === 'ESRCH' ? 'missing' : 'other');
    const line = lifecycleLine('stage-02', value.observation);
    assert.ok(line.includes('processCleanup=unverified')); assert.ok(!line.includes('PRIVATE'));
    assert.equal(c.pending.size, 0); mock.mock.restore();
  }
});

test('pre-abort and delayed preparation cannot launch a child after failed settlement', async t => {
  const c = clock(t), sent = signals(t), controller = new AbortController(); controller.abort();
  let entered = 0;
  const early = await runPrivateStage(async () => { entered++; return { code: 0 }; }, { timeoutMs: 100, signal: controller.signal });
  assert.equal(early.code, 1); assert.equal(early.observation.reason, 'cancelled'); assert.equal(entered, 0);
  assert.equal(c.pending.size, 0);
  let resume, attempted = 0;
  const wait = new Promise(resolve => { resume = resolve; });
  const late = runPrivateStage(async control => { await wait; control.check(); attempted++; return { code: 0 }; }, { timeoutMs: 100 });
  await flush(); await c.tick(5100); assert.equal((await late).code, 1);
  resume(); await flush(); assert.equal(attempted, 0); assert.equal(c.pending.size, 0); assert.deepEqual(sent, []);
});

test('capture error, runner error and stuck finalization cannot upgrade a failure or retain timers', async t => {
  const c = clock(t), sent = signals(t);
  const child = fakeChild();
  const result = runPrivateStage(async control => {
    const code = await control.watch(child); control.captureError();
    await new Promise(() => {}); return { code };
  }, { timeoutMs: 10000 });
  await flush(); child.emit('exit', 0, null); child.emit('close', 0, null); await flush();
  await c.tick(5000); const value = await result;
  assert.equal(value.code, 1); assert.equal(value.observation.reason, 'capture-error'); assert.equal(value.observation.capture, 'drained');
  assert.equal(c.pending.size, 0); assert.equal(sent.length, 2);
  const failed = fakeChild();
  const spawned = runPrivateStage(async control => ({ code: await control.watch(failed) }), { timeoutMs: 100 });
  await flush(); failed.emit('error', new Error(canary));
  const rejected = await spawned; assert.equal(rejected.code, 1); assert.equal(rejected.observation.reason, 'runner-error');
  assert.equal(c.pending.size, 0);
});

test('abort between synchronous spawn and watch still tracks and releases only its own child', async t => {
  const c = clock(t), sent = signals(t), controller = new AbortController(), child = fakeChild();
  const result = runPrivateStage(async control => {
    controller.abort(); return { code: await control.watch(child) };
  }, { timeoutMs: 100, signal: controller.signal });
  await flush(); await c.tick(5000); assert.equal((await result).code, 1);
  assert.deepEqual(sent.map(item => item.signal), ['SIGTERM', 'SIGKILL']); assert.equal(c.pending.size, 0);
});

test('outer supervisor independently settles a noncooperative runner and ignores its late emissions', async t => {
  const c = clock(t), controller = new AbortController(), output = [];
  let lateEmit, lateResolve, calls = 0, settled = false;
  const result = supervise({ cwd: '', runnerTemp: '', env: {}, deadlineMs: 20, signal: controller.signal, emit: line => output.push(line),
    run: (_items, options) => { calls++; lateEmit = options.emit; return new Promise(resolve => { lateResolve = resolve; }); } });
  result.then(() => { settled = true; }); await flush(); await c.tick(20); await c.tick(4999); assert.equal(settled, false);
  await c.tick(1); assert.equal(await result, 1); assert.equal(calls, 1);
  assert.deepEqual(output, ['stage-02 not-run', 'stage-03 not-run', 'chromium-app-smoke failed browser=playwright-chromium-headless-shell realBrowser=unverified fixtureCleanup=unverified']);
  lateEmit(canary); lateResolve(0); controller.abort(); await c.tick(100000);
  assert.equal(output.length, 3); assert.equal(c.pending.size, 0); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('preparation failure emits only opted-in lifecycle facts; existing output and cleanup behavior stay compatible', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stage-prepare-synthetic-'));
  try {
    const output = [];
    const stage = { id: 'stage-02', command: 'exit 0', lifecycleDiagnostics: true };
    assert.equal(await runStages([stage], { cwd: root, runnerTemp: join(root, 'missing'), env: { PATH: process.env.PATH }, emit: line => output.push(line), timeoutMs: 100 }), 1);
    assert.match(output[0], /stage-02 lifecycle reason=prepare-error code=-1 signal=0/);
    assert.equal(output[1], 'stage-02 failed'); assert.ok(!output.join('').includes(root));
    const ordinary = [];
    assert.equal(await runStages([{ id: 'stage-01', command: 'exit 7' }, { id: 'stage-02', command: 'exit 0', cleanup: true }], {
      cwd: root, runnerTemp: root, env: { PATH: process.env.PATH }, emit: line => ordinary.push(line), timeoutMs: 1000,
    }), 1);
    assert.deepEqual(ordinary, ['stage-01 failed', 'stage-02 passed']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('opted-in installer-shaped failure never exposes hostile raw streams or command channels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stage-private-canary-'));
  try {
    await writeFile(join(root, 'synthetic.mjs'), `import {writeFileSync} from 'node:fs';
console.log(${JSON.stringify(canary)}); console.error(${JSON.stringify(canary)});
for(const key of ['GITHUB_OUTPUT','GITHUB_STATE','GITHUB_STEP_SUMMARY','GITHUB_PATH']) writeFileSync(process.env[key],${JSON.stringify(canary)});
process.exitCode=7;`);
    const output = [];
    assert.equal(await runStages([{ id: 'stage-02', command: `${JSON.stringify(process.execPath)} synthetic.mjs`, lifecycleDiagnostics: true }], {
      cwd: root, runnerTemp: root, env: { PATH: process.env.PATH }, timeoutMs: 1000, emit: line => output.push(line),
    }), 1);
    assert.equal(output.length, 2); assert.equal(output[1], 'stage-02 failed');
    assert.match(output[0], /reason=none code=7 signal=0/); assert.match(output[0], /capture=drained processCleanup=unverified/);
    assert.match(output.join('\n'), /^[a-zA-Z0-9 =\-\n]*$/);
    for (const part of ['PRIVATE', 'https:', 'eyJ', '::error::', 'secret', root]) assert.ok(!output.join('').includes(part));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real same-group and finite detached pipe holders remain failed and settle inside the unchanged grace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stage-owned-processes-'));
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const started = performance.now();
  try {
    await Promise.all(['ordinary', 'ignore-term', 'detached-timeout', 'detached-cancel'].map(async name => {
      const cwd = join(root, name); await mkdir(cwd);
      const detached = name.startsWith('detached');
      const descendant = `const fs=require('node:fs'); setTimeout(()=>{fs.writeFileSync('finished.json','true');process.exit(0)},6500);`;
      const body = detached ? `import {spawn} from 'node:child_process'; import {writeFileSync} from 'node:fs';
const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:['ignore','inherit','inherit']});
writeFileSync('descendant.json',JSON.stringify({pid:child.pid})); child.unref(); setTimeout(()=>{},7500);`
        : `${name === 'ignore-term' ? "process.on('SIGTERM',()=>{});" : ''} setTimeout(()=>{},7500);`;
      await writeFile(join(cwd, 'owned.mjs'), body);
      const output = [], controller = new AbortController();
      const start = performance.now();
      const timer = name === 'detached-cancel' ? setTimeout(() => controller.abort(), 300) : undefined;
      let code;
      try {
        code = await runStages([{ id: 'stage-02', command: `${JSON.stringify(process.execPath)} owned.mjs`, lifecycleDiagnostics: true }], {
          cwd, runnerTemp: cwd, env: { PATH: process.env.PATH }, timeoutMs: name === 'detached-cancel' ? 10000 : 300,
          signal: controller.signal, emit: line => output.push(line),
        });
      } finally { clearTimeout(timer); }
      const elapsed = performance.now() - start;
      assert.equal(code, 1); assert.ok(elapsed < 6000, `Bounded settlement exceeded: ${Math.round(elapsed)}`);
      assert.equal(output.at(-1), 'stage-02 failed');
      assert.ok(output[0].includes(`reason=${name === 'detached-cancel' ? 'cancelled' : 'timeout'}`));
      assert.ok(output[0].includes('processCleanup=unverified'));
      if (detached) {
        assert.ok(output[0].includes('capture=abandoned')); assert.ok(output[0].includes('closeMs=-1'));
        // Wait for only our finite descendant; never kill or inspect another process.
        const { pid } = JSON.parse(await readFile(join(cwd, 'descendant.json'), 'utf8'));
        const until = performance.now() + 8000;
        while (true) {
          try { assert.equal(await readFile(join(cwd, 'finished.json'), 'utf8'), 'true'); break; }
          catch (error) { if (error.code !== 'ENOENT' || performance.now() > until) throw error; await delay(25); }
        }
        await delay(100);
        try { const stat = await readFile(`/proc/${pid}/stat`, 'utf8'); assert.equal(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0], 'Z'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }));
  } finally {
    // Even a failed assertion cannot remove files while a finite owned child still uses them.
    await delay(Math.max(0, 8000 - (performance.now() - started)));
    await rm(root, { recursive: true, force: true });
  }
});
