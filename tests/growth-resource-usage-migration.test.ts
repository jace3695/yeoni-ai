import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { transformSync } from 'esbuild';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pendingResourceUploadKey, readPendingResourceUpload, saveResourceUpload, type ResourceUploadInput } from '../lib/growth-resource-upload.ts';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000101';
const other = '00000000-0000-4000-8000-000000000102';
const id = '00000000-0000-4000-8000-000000000103';
let original: unknown;
const sql = (file: string) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');

before(async () => {
  await db.exec(`create role authenticated; create role anon; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values('${owner}'),('${other}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_user', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  await db.exec(sql('20260902120000_add_growth_platform.sql').split('insert into storage.buckets')[0]);
  await db.exec(sql('20260902223000_harden_growth_routine_links.sql'));
  await db.query(`insert into public.growth_resources(id,user_id,title,storage_path,mime_type,size_bytes,notes)
    values ($1,$2,'기존 자료',$3,'text/plain',100,'기존 메모')`, [id, owner, `${owner}/original.txt`]);
  original = (await db.query('select to_jsonb(r) row from public.growth_resources r')).rows[0];
  await db.exec(sql('20260917084426_growth_resource_usage.sql'));
});
after(async () => { await db.close(); });

test('기존 행의 파일·분류·생성 시각은 그대로이고 활용일만 미기록으로 추가된다', async () => {
  assert.deepEqual((await db.query("select to_jsonb(r)-'last_used_on' row from public.growth_resources r")).rows[0], original);
  assert.equal((await db.query<{ last_used_on: string | null }>('select last_used_on from public.growth_resources')).rows[0].last_used_on, null);
});

test('소유자는 활용일을 저장하고 미기록으로 되돌릴 수 있다', async () => {
  await db.exec(`set app.test_user='${owner}'; set role authenticated;`);
  await db.query('update public.growth_resources set last_used_on=$1 where id=$2', ['2026-01-02', id]);
  assert.equal((await db.query<{ value: string }>("select last_used_on::text value from public.growth_resources")).rows[0].value, '2026-01-02');
  await db.query('update public.growth_resources set last_used_on=null where id=$1', [id]);
  assert.deepEqual((await db.query("select to_jsonb(r)-'last_used_on' row from public.growth_resources r")).rows[0], original);
});

test('미래·잘못된 날짜와 범위 밖 날짜는 DB에서도 차단한다', async () => {
  await db.exec(`set app.test_user='${owner}'; set role authenticated;`);
  for (const value of ['9999-12-31', '2026-02-30', '1899-12-31', 'infinity']) {
    await assert.rejects(db.query('update public.growth_resources set last_used_on=$1 where id=$2', [value, id]));
  }
  await assert.rejects(db.query("update public.growth_resources set last_used_on=((current_timestamp at time zone 'Asia/Seoul')::date+1) where id=$1", [id]));
  await db.query("update public.growth_resources set last_used_on=(current_timestamp at time zone 'Asia/Seoul')::date where id=$1", [id]);
  await db.query('update public.growth_resources set last_used_on=null where id=$1', [id]);
});

test('오래된 화면은 다른 세션의 날짜·메모 변경을 덮어쓰지 못한다', async () => {
  await db.exec(`set app.test_user='${owner}'; set role authenticated;`);
  const old = (await db.query<{ updated_at: string }>('select updated_at::text from public.growth_resources')).rows[0].updated_at;
  await db.query("update public.growth_resources set notes='다른 세션 메모', last_used_on='2026-01-03', updated_at=updated_at+interval '1 second' where id=$1", [id]);
  const result = await db.query('update public.growth_resources set last_used_on=$1 where id=$2 and updated_at=$3 and last_used_on is null returning id', ['2026-01-02', id, old]);
  assert.equal(result.rows.length, 0);
  assert.equal((await db.query<{ notes: string }>('select notes from public.growth_resources')).rows[0].notes, '다른 세션 메모');
});

test('다른 계정과 비로그인 사용자는 자료를 읽거나 활용일을 변경하지 못한다', async () => {
  await db.exec(`set app.test_user='${other}'; set role authenticated;`);
  assert.equal((await db.query('select id from public.growth_resources')).rows.length, 0);
  assert.equal((await db.query('update public.growth_resources set last_used_on=null where id=$1 returning id', [id])).rows.length, 0);
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select id from public.growth_resources'));
  await assert.rejects(db.query('update public.growth_resources set last_used_on=null where id=$1', [id]));
  await db.exec('reset role;');
});

test('활용일 권한 추가가 파일·소유자·생성 시각 변경이나 다른 루틴 연결을 허용하지 않는다', async () => {
  await db.exec(`reset role; insert into public.growth_routines(id,user_id,category,title) values('${other}','${other}','custom','다른 루틴');
    set app.test_user='${owner}'; set role authenticated;`);
  for (const change of ["storage_path='other/file.txt'", `user_id='${other}'`, "created_at=now()", "size_bytes=1", `routine_id='${other}'`]) {
    await assert.rejects(db.query(`update public.growth_resources set ${change} where id=$1`, [id]));
  }
});

// Synthetic provider only: no credentials, external requests or real files.
function uploadFixture() {
  const journal = new Map<string, string>();
  const storage = { getItem: (key: string) => journal.get(key) ?? null, setItem: (key: string, value: string) => { journal.set(key, value); }, removeItem: (key: string) => { journal.delete(key); } };
  const files = new Map<string, Blob>();
  const rows = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  const file = new File(['virtual resource'], 'virtual.txt', { type: 'text/plain' });
  const input: ResourceUploadInput = { title: '가상 자료', notes: '가상 메모', routine_id: null, category: 'reference', classification: 'reference', mime_type: 'text/plain' };
  const state = { account: owner, insert: 'ok', upload: 'ok', readError: false, downloadError: false, onUpload: () => {}, onInsert: () => {} };
  const delayed: Array<() => void> = [];
  const client = {
    auth: { async getUser() { calls.push('auth'); return { data: { user: { id: state.account } }, error: null }; } },
    storage: { from(bucket: string) { assert.equal(bucket, 'growth-resources'); return {
      async upload(path: string, value: Blob, options: { contentType: string; upsert: boolean }) {
        calls.push(`upload:${path}`); assert.equal(options.upsert, false); assert.equal(value.type, options.contentType); state.onUpload();
        const commit = () => { if (!files.has(path)) files.set(path, new Blob([value], { type: options.contentType })); };
        if (state.upload === 'delay') { delayed.push(commit); return { error: { message: 'lost' } }; }
        if (state.upload !== 'reject') commit();
        if (state.upload === 'throw') throw new Error('lost upload response');
        return { error: state.upload === 'ok' ? null : { message: 'lost' } };
      },
      async download(path: string, _options: unknown, parameters: { cache: string }) { assert.equal(parameters.cache, 'no-store'); calls.push(`download:${path}`); return state.downloadError ? { data: null, error: { statusCode: '500' } } : files.has(path) ? { data: files.get(path), error: null } : { data: null, error: { statusCode: '404' } }; },
      remove() { calls.push('REMOVE'); throw new Error('No automatic removal allowed'); },
    }; } },
    from(table: string) {
      assert.equal(table, 'growth_resources');
      const filters: Record<string, string> = {}; let inserted: Record<string, unknown> | null = null;
      const query = {
        select() { return query; }, eq(key: string, value: string) { filters[key] = value; return query; }, abortSignal() { return query; },
        insert(row: Record<string, unknown>) { inserted = { ...row }; calls.push(`insert:${row.id}`); return query; },
        async maybeSingle() { calls.push('read'); const row = rows.get(filters.id); return { data: row?.user_id === filters.user_id ? row : null, error: state.readError ? { message: 'lost read' } : null }; },
        async single() {
          assert.ok(inserted); const row = inserted; state.onInsert();
          const commit = () => { if (!rows.has(row.id as string) && ![...rows.values()].some(item => item.storage_path === row.storage_path)) rows.set(row.id as string, { ...row, created_at: '2026-11-16T00:00:00Z', updated_at: '2026-11-16T00:00:00Z', last_used_on: null }); };
          if (state.insert === 'delay') { delayed.push(commit); return { data: null, error: { message: 'lost' } }; }
          if (state.insert !== 'reject') commit();
          if (state.insert === 'throw') throw new Error('lost insert response');
          return { data: null, error: state.insert === 'ok' ? null : { message: 'lost' } };
        },
      }; return query;
    },
  } as unknown as SupabaseClient;
  const save = (options: Parameters<typeof saveResourceUpload>[3] = { input, file }, check?: () => void) => saveResourceUpload(client, owner, storage, options, check);
  return { journal, storage, files, rows, calls, file, input, state, delayed, save, client };
}

test('자료 저장 성공 응답 유실·예외에도 실제 행과 파일을 확인하고 자동 삭제하지 않는다', async () => {
  for (const insert of ['ok', 'lost', 'throw']) {
    const f = uploadFixture(); f.state.insert = insert;
    const row = await f.save();
    assert.equal(f.rows.size, 1); assert.equal(f.files.size, 1); assert.equal(row.title, f.input.title);
    assert.equal(f.journal.size, 0); assert.ok(!f.calls.includes('REMOVE'));
  }
});

test('미확인 메타데이터는 파일과 요청을 보존하고 확인 버튼은 쓰기·삭제하지 않는다', async () => {
  const f = uploadFixture(); f.state.insert = 'reject'; await assert.rejects(f.save(), /확인되지/);
  assert.equal(f.rows.size, 0); assert.equal(f.files.size, 1); assert.equal(f.journal.size, 1);
  const before = f.calls.filter(x => /^(upload|insert):/.test(x));
  await assert.rejects(f.save({}), /확인되지/);
  assert.deepEqual(f.calls.filter(x => /^(upload|insert):/.test(x)), before);
  await assert.rejects(f.save(), /확인되지/);
  assert.equal(f.journal.size, 1); assert.ok(!f.calls.includes('REMOVE'));
});

test('두 지연 commit 순서 모두 명시 재시도는 원래 ID·경로의 한 행만 만든다', async () => {
  for (const oldFirst of [true, false]) {
    const f = uploadFixture(); f.state.insert = 'delay'; await assert.rejects(f.save());
    const pending = readPendingResourceUpload(f.storage, owner)!;
    f.state.insert = 'ok'; if (oldFirst) f.delayed.splice(0).forEach(fn => fn());
    const row = await f.save({ retryMissing: true });
    f.delayed.splice(0).forEach(fn => fn());
    assert.equal(row.id, pending.row.id); assert.equal(row.storage_path, pending.row.storage_path);
    assert.equal(f.rows.size, 1); assert.equal(f.files.size, 1); assert.equal(f.journal.size, 0);
    assert.equal(f.calls.filter(x => x.startsWith('upload:')).length, 1);
  }
});

test('파일 응답 유실은 SHA·크기·MIME로 확인하고 메타데이터를 한 번 저장한다', async () => {
  for (const upload of ['lost', 'throw']) {
    const f = uploadFixture(); f.state.upload = upload; await f.save();
    assert.equal(f.rows.size, 1); assert.equal(f.files.size, 1); assert.equal(f.journal.size, 0);
  }
});

test('파일 선택기가 MIME을 비워도 동일 바이트를 검증된 MIME의 multipart 본문으로 보낸다', async () => {
  const f = uploadFixture();
  const file = new File([f.file], 'virtual.txt', { type: '' });
  const row = await f.save({ input: f.input, file });
  assert.equal(row.mime_type, 'text/plain'); assert.equal(f.files.size, 1);
  const saved = [...f.files.values()][0]; assert.equal(saved.type, 'text/plain'); assert.deepEqual(new Uint8Array(await saved.arrayBuffer()), new Uint8Array(await file.arrayBuffer()));
});

test('파일 지연 commit 뒤 같은 원본 재선택·같은 경로 재시도는 덮어쓰지 않는다', async () => {
  const f = uploadFixture(); f.state.upload = 'delay'; await assert.rejects(f.save());
  const pending = readPendingResourceUpload(f.storage, owner)!;
  await assert.rejects(f.save({ retryMissing: true, file: new File(['DIFFERENT FILE!!'], 'virtual.txt', { type: 'text/plain' }) }), /원본 파일/);
  assert.equal(f.calls.filter(x => x.startsWith('upload:')).length, 1);
  f.state.upload = 'ok'; await f.save({ retryMissing: true, file: f.file });
  f.delayed.splice(0).forEach(fn => fn());
  assert.equal(f.rows.size, 1); assert.equal(f.files.size, 1); assert.ok(f.files.has(pending.row.storage_path));
});

test('후기 제목·분류 수정은 확인 결과로 유지하며 파일 계약 불일치는 보류한다', async () => {
  const f = uploadFixture(); f.state.insert = 'delay'; await assert.rejects(f.save()); f.delayed.splice(0).forEach(fn => fn());
  const stored = [...f.rows.values()][0]; stored.title = '다른 탭에서 수정'; stored.classification = 'direct';
  const row = await f.save({}); assert.equal(row.title, stored.title); assert.equal(row.classification, 'direct');
  const g = uploadFixture(); g.state.insert = 'delay'; await assert.rejects(g.save()); g.delayed.splice(0).forEach(fn => fn());
  [...g.rows.values()][0].size_bytes = 1;
  await assert.rejects(g.save({ retryMissing: true }), /파일 정보가 달라/); assert.equal(g.journal.size, 1);
});

test('알 수 없는 파일 읽기 실패와 내용·MIME 불일치는 부재로 간주하거나 수정하지 않는다', async () => {
  for (const mode of ['network', 'content', 'mime']) {
    const f = uploadFixture(); f.state.insert = 'reject'; await assert.rejects(f.save());
    const path = [...f.files.keys()][0];
    if (mode === 'network') f.state.downloadError = true;
    else f.files.set(path, new Blob([mode === 'content' ? 'DIFFERENT FILE!!' : f.file], { type: mode === 'mime' ? 'application/pdf' : 'text/plain' }));
    const before = f.calls.filter(x => /^(upload|insert):/.test(x));
    await assert.rejects(f.save({ retryMissing: true, file: f.file }));
    assert.deepEqual(f.calls.filter(x => /^(upload|insert):/.test(x)), before); assert.equal(f.journal.size, 1);
  }
});

test('다른 곳에서 삭제된 자료의 결과 확인은 재생성하지 않고 명시 재시도만 허용한다', async () => {
  const f = uploadFixture(); f.state.insert = 'delay'; await assert.rejects(f.save()); f.delayed.splice(0).forEach(fn => fn());
  f.rows.clear(); f.files.clear(); const writes = f.calls.filter(x => /^(upload|insert):/.test(x)).length;
  await assert.rejects(f.save({})); assert.equal(f.calls.filter(x => /^(upload|insert):/.test(x)).length, writes);
  f.state.insert = 'ok'; await f.save({ retryMissing: true, file: f.file }); assert.equal(f.rows.size, 1); assert.equal(f.files.size, 1);
});

test('저널 손상·저장 차단·다른 계정은 파일 전송 전에 중단하고 원문을 보존한다', async () => {
  const f = uploadFixture(); f.storage.setItem(pendingResourceUploadKey(owner), '{broken');
  await assert.rejects(f.save(), /읽지 못/); assert.equal(f.journal.get(pendingResourceUploadKey(owner)), '{broken'); assert.equal(f.calls.length, 0);
  const g = uploadFixture(); g.storage.setItem = () => { throw new Error('quota'); }; await assert.rejects(g.save(), /quota/);
  assert.equal(g.files.size, 0); assert.equal(g.rows.size, 0);
  const h = uploadFixture(); h.state.account = other; await assert.rejects(h.save(), /계정/); assert.equal(h.journal.size, 0); assert.equal(h.files.size, 0);
});

test('전송 중 화면·계정 수명이 바뀌면 후속 insert·저널 삭제를 중단한다', async () => {
  const f = uploadFixture(); let active = true; f.state.onUpload = () => { active = false; };
  await assert.rejects(f.save(undefined, () => { if (!active) throw new Error('inactive'); }), /inactive/);
  assert.equal(f.files.size, 1); assert.equal(f.rows.size, 0); assert.equal(f.journal.size, 1);
  const g = uploadFixture(); let valid = true; g.state.onInsert = () => { valid = false; };
  await assert.rejects(g.save(undefined, () => { if (!valid) throw new Error('inactive'); }), /inactive/);
  assert.equal(g.files.size, 1); assert.equal(g.rows.size, 1); assert.equal(g.journal.size, 1);
});

test('서버 조회 실패·저널 해제 실패도 기존 파일과 요청을 보존한다', async () => {
  const f = uploadFixture(); f.state.readError = true; await assert.rejects(f.save()); assert.equal(f.files.size, 0); assert.equal(f.journal.size, 1);
  const g = uploadFixture(); g.storage.removeItem = () => {}; await assert.rejects(g.save(), /표시를 정리/);
  assert.equal(g.files.size, 1); assert.equal(g.rows.size, 1); assert.equal(g.journal.size, 1);
});

function pageUploadHarness(f: ReturnType<typeof uploadFixture>, overrides: Record<string, unknown> = {}) {
  const source = readFileSync(new URL('../app/growth/resources/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const runUpload = async'); const end = source.indexOf('  const openResource =', start);
  assert.ok(start > 0 && end > start);
  const values: Record<string, unknown> = { supabase: f.client, ownerId: owner, saving: false,
    uploadWorking: { current: false }, uploadGeneration: { current: 0 }, currentOwner: { current: owner },
    journalError: '', pendingUpload: null, retryConfirmed: false, file: f.file, title: f.input.title,
    classification: f.input.classification, notes: f.input.notes, routineId: '', availableRoutines: [],
    sessionStorage: f.storage, saveResourceUpload, normalizedMimeType: () => 'text/plain',
    document: { visibilityState: 'visible', getElementById: () => null },
    setFile() {}, setTitle() {}, setRoutineId() {}, setClassification() {}, setNotes() {}, setRetryConfirmed() {},
  };
  const notices: string[] = []; const busy: boolean[] = []; const rows: unknown[] = []; let refreshed = 0;
  Object.assign(values, { growth: { setNotice: (value: string) => notices.push(value) }, setSaving: (value: boolean) => busy.push(value),
    setResources: (update: (rows: unknown[]) => unknown[]) => { rows.splice(0, rows.length, ...update(rows)); }, refreshPending: () => { refreshed++; } }, overrides);
  const run = Function(...Object.keys(values), `${transformSync(source.slice(start, end), { loader: 'ts' }).code}; return runUpload;`)(...Object.values(values)) as (mode: string) => Promise<void>;
  return { run, values, notices, busy, rows, refreshed: () => refreshed };
}

test('실제 업로드 handler의 연속 호출은 한 요청이며 완료 후 busy와 입력을 정리한다', async () => {
  const f = uploadFixture(); let clears = 0;
  const h = pageUploadHarness(f, { setFile: (value: unknown) => { assert.equal(value, null); clears++; } });
  await Promise.all([h.run('new'), h.run('new')]);
  assert.equal(f.rows.size, 1); assert.equal(f.files.size, 1); assert.equal(f.calls.filter(x => x.startsWith('upload:')).length, 1);
  assert.deepEqual(h.busy, [true, false]); assert.equal(clears, 1); assert.equal(h.rows.length, 1); assert.equal(h.refreshed(), 1);
  assert.match(h.notices.at(-1)!, /저장을 확인/);
});

test('실제 handler의 실패는 finally로 busy를 해제하고 원본 입력·미확인 요청을 보존한다', async () => {
  const f = uploadFixture(); f.state.insert = 'reject'; let clears = 0;
  const h = pageUploadHarness(f, { setFile: () => { clears++; } }); await h.run('new');
  assert.deepEqual(h.busy, [true, false]); assert.equal(clears, 0); assert.equal(f.files.size, 1); assert.equal(f.journal.size, 1);
  assert.equal(h.rows.length, 0); assert.equal(h.refreshed(), 1); assert.match(h.notices.at(-1)!, /자동 삭제하지/);
});

test('실제 handler는 재생성 동의·가시성·계정수명 없이 새 쓰기나 성공 UI를 진행하지 않는다', async () => {
  const f = uploadFixture(); const h = pageUploadHarness(f); await h.run('retry'); assert.equal(f.calls.length, 0);
  const hidden = pageUploadHarness(f, { document: { visibilityState: 'hidden' } }); await hidden.run('new'); assert.equal(f.calls.length, 0);
  f.state.onInsert = () => { (h.values.currentOwner as { current: string }).current = other; };
  await h.run('new'); assert.equal(h.rows.length, 0); assert.equal(f.rows.size, 1); assert.equal(f.files.size, 1); assert.equal(f.journal.size, 1);
  assert.ok(!h.notices.some(value => value.includes('저장을 확인')));
});

test('큰 파일 재선택은 이전 File도 지우고 화면은 탭·중복·명시 재생성 한계를 안내한다', () => {
  const source = readFileSync(new URL('../app/growth/resources/page.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const chooseFile ='); const end = source.indexOf('  const runUpload =', start);
  let selected: unknown = 'previous'; const notices: string[] = [];
  const choose = Function('growth', 'setFile', 'title', 'setTitle', `${transformSync(source.slice(start, end), { loader: 'ts' }).code}; return chooseFile;`)({ setNotice: (value: string) => notices.push(value) }, (value: unknown) => { selected = value; }, '', () => {}) as (event: unknown) => void;
  const event = { target: { files: [{ size: 10_485_761 }], value: 'new file' } }; choose(event);
  assert.equal(selected, null); assert.equal(event.target.value, ''); assert.equal(notices.length, 1);
  for (const text of ['다른 곳에서 삭제한 자료가 아님', '탭을 닫으면 사라질 수', '중복될 수', '자료 정보 없이 파일만', '저장 결과만 확인', '처음 요청한 정보로 재시도']) assert.ok(source.includes(text), text);
  assert.ok(source.includes('key={growth.user?.id ?? "signed-out"}'));
});
