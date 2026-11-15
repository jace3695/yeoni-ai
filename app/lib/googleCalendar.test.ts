import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleEventResource,
  getCalendarMonthBounds,
  getGoogleCalendarDayPreview,
  isSameGoogleCalendarEvent,
  mapGoogleCalendarEvent,
  parseGoogleCalendarEventInput,
} from "../../lib/google-calendar.ts";

test("달력 칸에는 첫 Google 일정 제목과 나머지 개수를 보여준다", () => {
  const preview = getGoogleCalendarDayPreview([
    { id: "event-1", title: "Google 연동 테스트", date: "2026-08-30", startLabel: "종일", allDay: true },
    { id: "event-2", title: "저녁 운동", date: "2026-08-30", startLabel: "20:00", allDay: false },
  ]);

  assert.deepEqual(preview, { title: "Google 연동 테스트", additionalCount: 1 });
  assert.equal(getGoogleCalendarDayPreview([]), null);
});

test("시간 일정 입력을 검증하고 Google 일정 형식으로 바꾼다", () => {
  const parsed = parseGoogleCalendarEventInput({
    title: "  아침 운동  ",
    date: "2026-08-31",
    allDay: false,
    startTime: "07:30",
    endTime: "08:20",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(buildGoogleEventResource(parsed.value), {
    summary: "아침 운동",
    extendedProperties: { private: { jaceAiFitnessApp: "calendar" } },
    start: { dateTime: "2026-08-31T07:30:00+09:00", timeZone: "Asia/Seoul" },
    end: { dateTime: "2026-08-31T08:20:00+09:00", timeZone: "Asia/Seoul" },
  });
});

test("끝 시간이 시작 시간보다 빠르면 거부한다", () => {
  const parsed = parseGoogleCalendarEventInput({
    title: "운동",
    date: "2026-08-31",
    allDay: false,
    startTime: "09:00",
    endTime: "08:00",
  });
  assert.deepEqual(parsed, { ok: false, error: "끝 시간은 시작 시간보다 늦어야 합니다." });
});

test("종일 일정의 종료일과 월 경계를 정확히 계산한다", () => {
  const parsed = parseGoogleCalendarEventInput({ title: "휴식", date: "2026-12-31", allDay: true });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const resource = buildGoogleEventResource(parsed.value);
  assert.equal(resource.end?.date, "2027-01-01");
  assert.deepEqual(getCalendarMonthBounds("2026-12"), {
    timeMin: "2026-12-01T00:00:00+09:00",
    timeMax: "2027-01-01T00:00:00+09:00",
  });
});

test("UTC Google 일정을 서울 날짜와 시간으로 표시한다", () => {
  const mapped = mapGoogleCalendarEvent({
    id: "event-1",
    summary: "저녁 운동",
    start: { dateTime: "2026-08-30T15:30:00Z" },
    end: { dateTime: "2026-08-30T16:30:00Z" },
  });
  assert.equal(mapped?.date, "2026-08-31");
  assert.equal(mapped?.startLabel, "00:30");
});

test("제목과 시간이 같은 일정은 중복으로 판단한다", () => {
  assert.equal(isSameGoogleCalendarEvent({
    id: "event-1",
    summary: "아침 운동",
    start: { dateTime: "2026-08-30T22:30:00Z" },
    end: { dateTime: "2026-08-30T23:20:00Z" },
  }, {
    title: "아침 운동",
    date: "2026-08-31",
    allDay: false,
    startTime: "07:30",
    endTime: "08:20",
  }), true);
});

// All external services below are fake; run real mapper, route and panel callbacks.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as calendar from '../../lib/google-calendar.ts';
const multi = { id: 'synthetic-multi', etag: '"v1"', summary: '가상 휴가', start: { date: '2026-11-20' }, end: { date: '2026-11-24' }, description: 'keep', location: 'synthetic-place', attendees: [{ email: 'synthetic.invalid' }], reminders: { useDefault: true }, extendedProperties: { private: { keep: 'yes' } } };
const edit = (extra: Record<string, unknown> = {}) => ({ id: multi.id, expectedEtag: multi.etag, title: '제목만 변경', date: '2026-11-20', endDate: '2026-11-23', allDay: true, description: 'keep', ...extra });
function routeFixture(original: unknown = multi, getStatus = 200, patchStatus = 200, patchResult?: (saved: Record<string, unknown>) => Response) {
  const calls: { owner: string; path: string; init: RequestInit; context: unknown }[] = [];
  const context = { synthetic: true }; let authCalls = 0;
  class FakeResponse extends Response { static json(value: unknown, init?: ResponseInit) { return new FakeResponse(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json' } }); } }
  class ConnectionError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(new URL('../api/google-calendar/events/route.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, Response, URLSearchParams, require: (name: string) => {
    if (name === 'next/server') return { NextResponse: FakeResponse };
    if (name === '@/lib/google-calendar') return calendar;
    if (name === '@/lib/supabase-server') return { createServerSupabaseClient: async () => { authCalls++; return { ...context, auth: { getUser: async () => ({ data: { user: { id: 'synthetic-owner' } }, error: null }) } }; } };
    if (name === '@/lib/google-calendar-server') return { GoogleCalendarConnectionError: ConnectionError, getGoogleCalendarConfig: () => ({ clientSecret: 'synthetic-unused' }), googleCalendarApiRequest: async (supabase: unknown, owner: string, _secret: string, path: string, init: RequestInit) => {
      calls.push({ owner, path, init, context: supabase });
      if (init.method === 'GET') return FakeResponse.json(original, { status: getStatus });
      const saved = { ...(original as object), ...JSON.parse(String(init.body)), etag: '"v2"' };
      if (patchStatus >= 200 && patchStatus < 300) original = saved;
      return patchResult ? patchResult(saved) : FakeResponse.json(saved, { status: patchStatus });
    } };
    throw Error(`unexpected import ${name}`);
  } });
  return { calls, authCalls: () => authCalls, patch: (body: unknown) => exports.PATCH({ headers: new Headers(), json: async () => body, nextUrl: new URL('http://127.0.0.1/synthetic') }) as Promise<Response> };
}

test('multi-day all-day mapping, explicit inclusive input and duplicate comparison retain duration', () => {
  const mapped = mapGoogleCalendarEvent(multi)!;
  assert.equal(mapped.endDate, '2026-11-23'); assert.equal(mapped.etag, '"v1"'); assert.equal(mapped.editBlockedReason, undefined);
  const parsed = parseGoogleCalendarEventInput({ ...mapped, title: 'new' }); assert.ok(parsed.ok);
  assert.equal(buildGoogleEventResource(parsed.value).end?.date, '2026-11-24');
  assert.equal(isSameGoogleCalendarEvent(multi, { ...parsed.value, title: multi.summary }), true);
  assert.equal(isSameGoogleCalendarEvent(multi, { ...parsed.value, title: multi.summary, endDate: '2026-11-20' }), false);
});

test('inclusive durations support leap day/year end; single-day creation remains compatible', () => {
  for (const [date, endDate, exclusive] of [['2028-02-28','2028-02-29','2028-03-01'],['2026-12-30','2027-01-02','2027-01-03'],['2026-11-20',undefined,'2026-11-21']]) {
    const p = parseGoogleCalendarEventInput({ title: 'synthetic', date, endDate, allDay: true }); assert.ok(p.ok); assert.equal(buildGoogleEventResource(p.value).end?.date, exclusive);
  }
  for (const endDate of ['', '2026-02-29','2026-11-19','9999-12-31',null]) assert.equal(parseGoogleCalendarEventInput(edit({endDate})).ok,false);
});

test('title-only PATCH reads original once and sends only summary with exact If-Match/account context', async () => {
  const f = routeFixture(); const response = await f.patch(edit()); assert.equal(response.status, 200);
  assert.equal(f.authCalls(),1); assert.equal(f.calls.length,2);
  assert.equal(f.calls[0].init.method,'GET'); assert.equal(f.calls[1].init.method,'PATCH');
  assert.equal(f.calls[0].owner,f.calls[1].owner); assert.equal(f.calls[0].context,f.calls[1].context);
  assert.equal(new Headers(f.calls[1].init.headers).get('If-Match'),multi.etag);
  assert.deepEqual(JSON.parse(String(f.calls[1].init.body)), {summary:'제목만 변경'});
  assert.equal(f.calls[0].path, '/calendars/primary/events/synthetic-multi');
});

test('explicit duration change patches start/end and no unrelated remote fields', async () => {
  const f=routeFixture();assert.equal((await f.patch(edit({endDate:'2026-11-25'}))).status,200);
  assert.deepEqual(JSON.parse(String(f.calls[1].init.body)),{summary:'제목만 변경',end:{date:'2026-11-26'}});
});

test('old UI missing ETag/endDate or invalid ETag cannot send any Google request', async () => {
  for(const extra of [{expectedEtag:undefined},{expectedEtag:'*'},{expectedEtag:'"v1"\r\nX:bad'},{endDate:undefined}]) {
    const f=routeFixture();assert.equal((await f.patch(edit(extra))).status,409);assert.equal(f.calls.length,0);
  }
});

test('original read failure, mismatched identity/version or unsupported form sends zero PATCH', async () => {
  for(const [original,status] of [[multi,503],[null,200],[{...multi,id:'other'},200],[{...multi,etag:'"v2"'},200],[{...multi,etag:undefined},200],[{...multi,end:{}},200],[{...multi,status:'cancelled'},200],[{...multi,recurrence:['RRULE:FREQ=DAILY']},200]] as const) {
    const f=routeFixture(original,status); assert.notEqual((await f.patch(edit())).status,200); assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.method,'GET');
  }
});

test('If-Match 412 returns conflict once with no re-read/retry',async()=>{
  const f=routeFixture(multi,200,412);const response=await f.patch(edit());assert.equal(response.status,409);assert.equal(f.calls.length,2);assert.match((await response.json()).error,/초안.*새로고침/);
});

test('same-day timed title edit preserves original seconds/offset/timezone by omission',async()=>{
  const timed={...multi,start:{dateTime:'2026-11-20T00:30:45.123Z',timeZone:'Etc/UTC'},end:{dateTime:'2026-11-20T01:30:59Z',timeZone:'Etc/UTC'}};
  const mapped=mapGoogleCalendarEvent(timed)!;assert.equal(mapped.startTime,'09:30');
  const f=routeFixture(timed);assert.equal((await f.patch(edit({...mapped,title:'new',expectedEtag:mapped.etag}))).status,200);assert.deepEqual(JSON.parse(String(f.calls[1].init.body)),{summary:'new'});
});

test('cross-date, sub-minute, mixed or unspecified timed schedules cannot be edited',async()=>{
  for(const resource of [
    {...multi,start:{dateTime:'2026-11-20T23:30:00+09:00'},end:{dateTime:'2026-11-21T00:30:00+09:00'}},
    {...multi,start:{dateTime:'2026-11-20T09:30:00+09:00'},end:{dateTime:'2026-11-20T09:30:30+09:00'}},
    {...multi,start:{dateTime:'2026-11-20T09:30:00+09:00'},end:{date:'2026-11-21'}},
    {...multi,endTimeUnspecified:true},
  ]) {
    assert.ok(mapGoogleCalendarEvent(resource)?.editBlockedReason);
    const f=routeFixture(resource);assert.equal((await f.patch(edit({allDay:false,startTime:'09:00',endTime:'10:00'}))).status,409);assert.equal(f.calls.length,1);
  }
});

test('memo deletion is explicit; equivalent whitespace and unchanged schedule produce no PATCH',async()=>{
  const f=routeFixture({...multi,description:' keep '});assert.equal((await f.patch(edit({title:multi.summary}))).status,200);assert.equal(f.calls.length,1);
  const g=routeFixture();await g.patch(edit({title:multi.summary,description:''}));assert.deepEqual(JSON.parse(String(g.calls[1].init.body)),{description:''});
});

function panelFixture(status=409) {
  const source=readFileSync(new URL('../components/GoogleCalendarPanel.tsx',import.meta.url),'utf8');
  const a=source.indexOf('  const saveEvent ='), b=source.indexOf('  const deleteEvent =',a);
  const state={forms:[] as unknown[],messages:[] as string[],ids:[] as string[],show:[] as boolean[],loads:0,calls:[] as any[],confirm:false};
  const context:any={editingId:multi.id,expectedEtag:multi.etag,form:edit(),busy:'',saveInFlight:{current:false},showForm:false,monthKey:'2026-11',window:{confirm:()=>state.confirm},setBusy:()=>{},setMessage:(s:string)=>state.messages.push(s),setEditingId:(s:string)=>state.ids.push(s),setExpectedEtag:()=>{},setShowForm:(v:boolean)=>state.show.push(v),setForm:(v:unknown)=>state.forms.push(v),defaultForm:()=>({title:'new'}),loadEvents:async()=>{state.loads++},responseJson:async(r:Response)=>r.json(),authenticatedFetch:async(...args:any[])=>{state.calls.push(args);return Response.json({error:'충돌: 초안을 보관하고 목록을 새로고침',event:{}},{status});}};
  const code=ts.transpileModule(source.slice(a,b),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const actions=vm.runInNewContext(code+';({saveEvent,editEvent})',context) as {saveEvent:(e:unknown)=>Promise<void>;editEvent:(e:unknown)=>void};return{source,state,context,actions};
}

test('actual panel save sends endDate/etag and preserves draft on error, releases single-flight',async()=>{
 const f=panelFixture();await f.actions.saveEvent({preventDefault(){}});assert.equal(f.state.calls.length,1);const body=JSON.parse(f.state.calls[0][1].body);assert.equal(body.endDate,'2026-11-23');assert.equal(body.expectedEtag,'"v1"');assert.equal(f.state.forms.length,0);assert.equal(f.state.ids.length,0);assert.equal(f.state.show.length,0);assert.equal(f.context.saveInFlight.current,false);assert.match(f.state.messages.at(-1)!,/초안/);
 f.context.saveInFlight.current=true;await f.actions.saveEvent({preventDefault(){}});assert.equal(f.state.calls.length,1);
});

test('actual edit callback preserves inclusive end date, blocks unsupported, and asks before replacing draft',()=>{
 const f=panelFixture();const mapped=mapGoogleCalendarEvent(multi)!;f.actions.editEvent(mapped);assert.equal((f.state.forms[0] as any).endDate,'2026-11-23');
 f.actions.editEvent({...mapped,editBlockedReason:'blocked'});assert.equal(f.state.forms.length,1);
 f.context.showForm=true;f.actions.editEvent(mapped);assert.equal(f.state.forms.length,1);
 f.state.confirm=true;f.actions.editEvent(mapped);assert.equal(f.state.forms.length,2);
 assert.match(f.source,/마지막 날짜 \(이 날까지 포함\)/);assert.match(f.source,/목록 새로고침/);assert.match(f.source,/fieldset disabled=\{Boolean\(busy\)\}/);
});

test('editing only one timed endpoint does not normalize the other endpoint',async()=>{
 const timed={...multi,start:{dateTime:'2026-11-20T00:30:45.123Z',timeZone:'Etc/UTC'},end:{dateTime:'2026-11-20T01:30:59Z',timeZone:'Etc/UTC'}};
 for(const [times,expected] of [[{startTime:'09:30',endTime:'11:00'},{end:{dateTime:'2026-11-20T11:00:00+09:00',timeZone:'Asia/Seoul'}}],[{startTime:'08:00',endTime:'10:30'},{start:{dateTime:'2026-11-20T08:00:00+09:00',timeZone:'Asia/Seoul'}}]] as const){
  const f=routeFixture(timed);assert.equal((await f.patch(edit({title:multi.summary,allDay:false,...times}))).status,200);assert.deepEqual(JSON.parse(String(f.calls[1].init.body)),expected);
 }
});


test('2xx malformed or mismatched PATCH response is uncertain, never retried automatically', async () => {
  const cases = [
    () => new Response('not json', { status: 200 }),
    () => Response.json(null),
    (saved: Record<string, unknown>) => Response.json({ ...saved, id: 'other' }),
    (saved: Record<string, unknown>) => Response.json({ ...saved, etag: undefined }),
    (saved: Record<string, unknown>) => Response.json({ ...saved, etag: '*' }),
    (saved: Record<string, unknown>) => Response.json({ ...saved, etag: multi.etag }),
    (saved: Record<string, unknown>) => Response.json({ ...saved, summary: 'unexpected' }),
    (saved: Record<string, unknown>) => Response.json({ ...saved, summary: 123 }),
    (saved: Record<string, unknown>) => Response.json({ ...saved, start: null }),
    (saved: Record<string, unknown>) => Response.json({ ...saved, description: 'unexpected' }),
    (saved: Record<string, unknown>) => Response.json({ ...saved, end: { date: '2026-11-21' } }),
  ];
  for (const makeResponse of cases) {
    const f = routeFixture(multi, 200, 200, makeResponse);
    const response = await f.patch(edit());
    assert.equal(response.status, 502);
    const body = await response.json(); assert.equal(body.saveOutcomeUnknown, true); assert.match(body.error, /이미 저장.*다시 저장하지/);
    assert.equal(f.calls.length, 2); assert.equal(f.calls.filter(c => c.init.method === 'PATCH').length, 1);
    // Simulated provider persisted the write but its response was unusable.
    // Blind manual resubmission with the old UI version only reads, never writes again.
    assert.equal((await f.patch(edit())).status, 409);
    assert.equal(f.calls.length, 3); assert.equal(f.calls.filter(c => c.init.method === 'PATCH').length, 1);
  }
});

test('successful provider normalization to equal UTC/offset instants is accepted', async () => {
  const original = { ...multi, start: { dateTime: '2026-11-20T09:30:45.123+09:00', timeZone: 'Asia/Seoul' }, end: { dateTime: '2026-11-20T10:30:59+09:00', timeZone: 'Asia/Seoul' } };
  const f = routeFixture(original, 200, 200, saved => Response.json({ ...saved, start: { dateTime: '2026-11-20T00:30:45.123Z', timeZone: 'Etc/UTC' }, end: { dateTime: '2026-11-20T01:30:59Z', timeZone: 'Etc/UTC' } }));
  assert.equal((await f.patch(edit({ allDay: false, startTime: '09:30', endTime: '10:30' }))).status, 200);
  assert.equal(f.calls.length, 2);
});

test('timed response with a changed second is uncertain despite matching displayed minute', async () => {
  const original = { ...multi, start: { dateTime: '2026-11-20T09:30:45+09:00' }, end: { dateTime: '2026-11-20T10:30:59+09:00' } };
  const f = routeFixture(original, 200, 200, saved => Response.json({ ...saved, end: { dateTime: '2026-11-20T10:30:00+09:00' } }));
  assert.equal((await f.patch(edit({ allDay: false, startTime: '09:30', endTime: '10:30' }))).status, 502);
  assert.equal(f.calls.length, 2);
});
