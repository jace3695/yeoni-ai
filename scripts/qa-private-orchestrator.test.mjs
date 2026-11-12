import './qa-private-lifecycle.test.mjs';
import './qa-private-diagnostics.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runStages, parseEnvironment } from './qa-private-orchestrator.mjs';
const canary = 'SYNTHETIC_PRIVATE_CANARY_123';
const fixture = async () => { const dir = await mkdtemp(join(tmpdir(), 'private-supervisor-test-')); return { cwd: dir, runnerTemp: dir, env: { PATH: process.env.PATH }, emit: () => {} }; };
const stage = (command, cleanup = false, id = 'stage-01') => ({ command, cleanup, id });
test('raw streams, errors and command channels stay local; public output fixed', async () => {
 const options = await fixture(), output = []; options.emit = line => output.push(line);
 const code = await runStages([stage(`printf '${canary}\\n::error::${canary}\\n::add-mask::${canary}\\n'; printf '${canary}' >&2; for key in GITHUB_OUTPUT GITHUB_STATE GITHUB_STEP_SUMMARY GITHUB_PATH; do printf '${canary}' > "\${!key}"; done; exit 9`)], options);
 assert.equal(code, 1); assert.deepEqual(output, ['stage-01 failed']); assert.ok(!output.join('').includes(canary));
 const [sub] = await readdir(options.runnerTemp); const local = join(options.runnerTemp, sub, 'stage-01');
 assert.ok((await readFile(join(local,'stdout'),'utf8')).includes(canary));
 for (const key of ['GITHUB_OUTPUT','GITHUB_STATE','GITHUB_STEP_SUMMARY','GITHUB_PATH']) assert.equal(await readFile(join(local,key),'utf8'), canary);
});
test('unexpected env injection fails and cleanup still runs', async () => {
 const options = await fixture(), output = []; options.emit = line => output.push(line);
 const code = await runStages([stage(`echo 'UNEXPECTED=${canary}' >> "$GITHUB_ENV"`),stage('exit 0',false,'stage-02'),stage('touch cleaned',true,'stage-03')], options);
 assert.equal(code,1);assert.deepEqual(output,['stage-01 failed','stage-02 not-run','stage-03 passed']); await readFile(join(options.cwd,'cleaned'));
});
test('validated library env reaches later child only', async () => {
 const options = await fixture();options.env.RUNNER_TEMP=options.runnerTemp;
 const command = '# meson install -C .e2e/libsoup-build\nprintf "QA_SOUP_LIBRARY=%s/webkit-soup/lib/libsoup-3.0.so.0\\n" "$RUNNER_TEMP" >> "$GITHUB_ENV"';
 assert.equal(await runStages([stage(command),stage('test "$QA_SOUP_LIBRARY" = "$RUNNER_TEMP/webkit-soup/lib/libsoup-3.0.so.0"',false,'stage-02')],options),0);
 assert.equal(options.env.QA_SOUP_LIBRARY,undefined);
});
test('stack env parser accepts anon only; rejects extra, duplicate, multiline and service role', () => {
 const stack = stage('node scripts/e2e-stack.mjs start');
 const jwt = role => `e30.${Buffer.from(JSON.stringify({role})).toString('base64url')}.synthetic`;
 const values = role => `YEONI_E2E=1\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${jwt(role)}\n`;
 assert.equal(parseEnvironment(values('anon'),stack,'/tmp').YEONI_E2E,'1');
 for (const bad of [values('service_role'),values('anon')+'YEONI_E2E=1\n',values('anon')+'OTHER=x\n','YEONI_E2E<<EOF\n1\nEOF',values('anon').replace('54321','54322')]) assert.throws(()=>parseEnvironment(bad,stack,'/tmp'));
});
test('bounded stream retention does not truncate execution; exit failure preserved',async()=>{
 const options=await fixture();
 const code=await runStages([stage(`node -e "process.stdout.write('x'.repeat(2*1024*1024));process.stderr.write('y'.repeat(2*1024*1024));process.exitCode=7"`)],options);
 assert.equal(code,1);const [sub]=await readdir(options.runnerTemp);
 for(const name of ['stdout','stderr'])assert.equal((await readFile(join(options.runnerTemp,sub,'stage-01',name))).length,1024*1024);
});
test('timeout, cancellation and cleanup failure are not success',async()=>{
 let options=await fixture();options.timeoutMs=30;
 assert.equal(await runStages([stage('sleep 5'),stage('touch cleaned',true,'stage-02')],options),1);await readFile(join(options.cwd,'cleaned'));
 options=await fixture();const controller=new AbortController(); options.signal=controller.signal;
 setTimeout(()=>controller.abort(),30);
 assert.equal(await runStages([stage('sleep 5'),stage('touch cleaned',true,'stage-02')],options),1);await readFile(join(options.cwd,'cleaned'));
 options=await fixture();assert.equal(await runStages([stage('exit 0'),stage('exit 2',true,'stage-02')],options),1);
});
test('real entry point refuses local environment without spoofing guards',()=>{
 const result=spawnSync(process.execPath,[new URL('./qa-private-orchestrator.mjs',import.meta.url).pathname,'browser'],{env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(result.status,1);assert.equal(result.stdout,'verification failed\n');assert.equal(result.stderr,'');
});

test('synthetic stack env passes to children without global command-file writes or mask output', async () => {
 const options=await fixture(), output=[];options.emit=line=>output.push(line);
 await mkdir(join(options.cwd,'scripts'));
 const token=`e30.${Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')}.synthetic`;
 const body=`import { appendFileSync } from 'node:fs'; appendFileSync(process.env.GITHUB_ENV, ${JSON.stringify('YEONI_E2E=1\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY='+token+'\n')}); console.log('::add-mask::'+${JSON.stringify(token)});`;
 await writeFile(join(options.cwd,'scripts/e2e-stack.mjs'),body);
 const outer=join(options.cwd,'outer-env');await writeFile(outer,'unchanged');options.env.GITHUB_ENV=outer;
 const result=await runStages([stage('node scripts/e2e-stack.mjs start'),stage(`test "$YEONI_E2E" = 1; test "$NEXT_PUBLIC_SUPABASE_ANON_KEY" = '${token}'; test -z "$SUPABASE_SERVICE_ROLE_KEY"`,false,'stage-02')],options);
 assert.equal(result,0);assert.equal(await readFile(outer,'utf8'),'unchanged');assert.deepEqual(output,['stage-01 passed','stage-02 passed']);assert.ok(!output.join('').includes(token));
});

test('abort during asynchronous setup cannot start a non-cleanup child or report success', async () => {
 const options=await fixture(), output=[], controller=new AbortController();
 let firstCheck=true;
 options.emit=line=>output.push(line);
 options.signal={
  get aborted() {
   if(firstCheck){firstCheck=false;queueMicrotask(()=>controller.abort());return false;}
   return controller.signal.aborted;
  },
  addEventListener: (...args)=>controller.signal.addEventListener(...args),
  removeEventListener: (...args)=>controller.signal.removeEventListener(...args),
 };
 const code=await runStages([stage('touch must-not-start'),stage('touch cleaned',true,'stage-02')],options);
 assert.equal(code,1);assert.deepEqual(output,['stage-01 failed','stage-02 passed']);
 await assert.rejects(readFile(join(options.cwd,'must-not-start')), {code:'ENOENT'});
 await readFile(join(options.cwd,'cleaned'));
});
test('abort already fired at listener registration is caught by immediate state check', async () => {
 const options=await fixture(), controller=new AbortController();
 options.signal={
  get aborted(){return controller.signal.aborted;},
  addEventListener(...args){controller.abort();return controller.signal.addEventListener(...args);},
  removeEventListener:(...args)=>controller.signal.removeEventListener(...args),
 };
 assert.equal(await runStages([stage('sleep 5'),stage('touch cleaned',true,'stage-02')],options),1);
 await readFile(join(options.cwd,'cleaned'));
});
