import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as contextModule from "./free-advice-context.ts";
import { loadFreeAdviceContext } from "./free-advice-records.ts";
import * as provider from "./free-advice.ts";
import * as policy from "./free-gemini-policy.ts";
import * as replyPlan from "./yeoni/reply-plan.ts";

const now = new Date("2026-09-14T02:00:00Z");
const context = contextModule.buildFreeAdviceContext("budget", { expenses: [{ amount: 12000, date: "2026-09-14" }] }, now);
const advice = { summary: "오늘 기록한 지출은 12,000원이에요.", nextSteps: ["오늘 남은 지출을 한 번 적어 보세요."], basis: "최근 28일 지출 기록 1건", limitations: "기록하지 않은 지출은 알 수 없어요." };
const environment = { GEMINI_FREE_TIER_CONFIRMED: "true", GEMINI_FREE_API_KEY: " synthetic-free-only " };
const input = { context, question: "오늘 할 일", acknowledged: true };
const output = (finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(advice) }] } }] });
const metric = (result: contextModule.FreeAdviceContext, id: string) => result.metrics.find(item => item.id === id)?.value;

test("summary uses Seoul dates, excludes future/invalid dates, and preserves observed zero water", () => {
  assert.deepEqual(contextModule.adviceDateRange(new Date("2026-09-14T15:01:00Z")), { startDate: "2026-08-19", endDate: "2026-09-15" });
  const result = contextModule.buildFreeAdviceContext("fitness", { fitnessState: {
    "ai-fitness-workout-completed-days": { "2026-09-14": { workoutStatus: "partial", workoutBackStatus: "pain", memo: "PRIVATE-MEMO" }, "2026-09-07": true, "2026-08-18": { workoutStatus: "stopped", workoutBackStatus: "none" }, "2026-08-17": true, "2026-09-15": true, "2026-08-32": true },
    "ai-fitness-water-intake": { "2026-09-14": 0, "2026-09-13": 600, "2026-09-12": null, "2026-09-11": "" },
  } }, now);
  assert.equal(metric(result, "workout.days"), 2);
  assert.equal(metric(result, "workout.recent7"), 1);
  assert.equal(metric(result, "workout.previous7"), 1);
  assert.equal(metric(result, "workout.stopped"), 1);
  assert.equal(metric(result, "workout.discomfort"), 1);
  assert.equal(metric(result, "workout.unknownBack"), 1);
  assert.equal(metric(result, "water.days"), 2);
  assert.equal(metric(result, "water.average"), 300);
  assert.ok(!JSON.stringify(result).includes("PRIVATE-MEMO"));
});

test("current curriculum and legacy learning days are combined without duplicate dates or private text", () => {
  const result = contextModule.buildFreeAdviceContext("language", { languageState: {
    dailyLearningHistory: JSON.stringify({ "2026-09-14": { completedCount: 1 }, "2026-09-12": { completedCount: 0 } }),
    japaneseCurriculumProgressV1: JSON.stringify({ activityDates: ["2026-09-14", "2026-09-13", "2026-09-13", "2026-09-15", "invalid"], lastLessonId: "PRIVATE-LESSON" }),
    japaneseCurriculumReviewV1: JSON.stringify([{ prompt: "PRIVATE-PROMPT" }]),
  } }, now);
  assert.equal(metric(result, "language.days"), 2);
  assert.equal(metric(result, "language.review"), 1);
  assert.ok(!JSON.stringify(result).includes("PRIVATE-"));
});

test("budget totals cover the complete 28 days, omit names/memos and reject invalid stored money", () => {
  const result = contextModule.buildFreeAdviceContext("budget", { expenses: [
    { date: "2026-09-14", amount: "12000", place: "PRIVATE-MERCHANT", memo: "PRIVATE-MEMO" },
    { date: "2026-09-07", amount: 4000 }, { date: "2026-08-18", amount: 1000 },
    { date: "2026-08-17", amount: 90000 }, { date: "2026-09-15", amount: 90000 },
  ] }, now);
  assert.equal(metric(result, "budget.expense"), 17000);
  assert.equal(metric(result, "budget.expenseRecent7"), 12000);
  assert.equal(metric(result, "budget.expensePrevious7"), 4000);
  assert.ok(result.notes.some(note => note.includes("월 전체가 아닌")));
  assert.ok(!JSON.stringify(result).includes("PRIVATE-"));
  assert.throws(() => contextModule.buildFreeAdviceContext("budget", { expenses: [{ date: "2026-09-14", amount: "corrupt" }] }, now));
  assert.equal(contextModule.buildFreeAdviceContext("assistant", {}, now).recordCount, 0);
});

test("record loader selects only the owner and rejects errors or incomplete financial pages", async () => {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  let truncated = false; let failed = false;
  const client = { from(table: string) {
    const builder = {
      select(...args: unknown[]) { calls.push({ table, method: "select", args }); return builder; },
      eq(...args: unknown[]) { calls.push({ table, method: "eq", args }); return builder; },
      gte(...args: unknown[]) { calls.push({ table, method: "gte", args }); return builder; },
      lte(...args: unknown[]) { calls.push({ table, method: "lte", args }); return builder; },
      order() { return builder; },
      async limit() { return { data: [], error: failed ? { message: "PRIVATE-ERROR" } : null, count: truncated ? 1001 : 0 }; },
      async maybeSingle() { return { data: table === "budget_user_settings" ? { currency: "USD" } : { state: {} }, error: failed ? { message: "PRIVATE-ERROR" } : null }; },
    }; return builder;
  } } as unknown as SupabaseClient;
  const loaded = await loadFreeAdviceContext(client, "owner-fixture", "assistant", now);
  assert.equal(loaded.metrics.find(item => item.id === "budget.expense")?.unit, "USD");
  assert.equal(calls.filter(call => call.method === "eq").length, 6);
  assert.ok(calls.filter(call => call.method === "eq").every(call => JSON.stringify(call.args) === JSON.stringify(["user_id", "owner-fixture"])));
  assert.deepEqual(calls.filter(call => call.table.startsWith("budget_") && call.method === "select").map(call => [call.table, call.args[0]]),
    [["budget_user_settings", "currency"], ["budget_transactions", "amount,date,transaction_type"], ["budget_income", "amount,date"], ["budget_savings", "amount,date"]]);
  assert.equal(calls.filter(call => call.method === "gte" && call.args[1] === "2026-08-18").length, 3);
  truncated = true;
  await assert.rejects(() => loadFreeAdviceContext(client, "owner-fixture", "budget", now), /전체 가계부/);
  truncated = false; failed = true;
  await assert.rejects(() => loadFreeAdviceContext(client, "owner-fixture", "assistant", now), /기록을 불러오지/);
});

test("advice scope identifies omitted records, snapshot reviews and month-boundary window", () => {
  const result = contextModule.buildFreeAdviceContext("assistant", { languageState: { savedSentences: [{ japanese: "PRIVATE" }] } }, new Date("2026-02-28T15:00:00Z"));
  assert.equal(result.startDate, "2026-02-02"); assert.equal(result.endDate, "2026-03-01");
  assert.equal(result.recordCount, 0);
  assert.match(result.notes.join(" "), /체성분/);
  assert.match(result.notes.join(" "), /직접 저장한 회화 예문/);
  assert.match(result.notes.join(" "), /그림·필기·타이핑/);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});

test("advice excludes recharge and keeps configured currency without conversion", () => {
  for (const [currency, unit] of [["KRW", "원"], ["USD", "USD"], ["JPY", "JPY"]]) {
    const result = contextModule.buildFreeAdviceContext("budget", { budgetCurrency: currency, expenses: [
      { date: "2026-09-14", amount: 100, transaction_type: "충전카드 충전" },
      { date: "2026-09-14", amount: 30, transaction_type: "충전카드 사용" },
    ] }, now);
    assert.equal(metric(result, "budget.expense"), 30);
    assert.equal(metric(result, "budget.expenseCount"), 1);
    assert.equal(result.metrics.find(item => item.id === "budget.expense")?.unit, unit);
  }
  assert.throws(() => contextModule.buildFreeAdviceContext("budget", { budgetCurrency: "invalid" }, now));
});

test("provider needs explicit consent and both dedicated free settings; paid keys cannot enable it", async () => {
  let calls = 0; const forbidden: typeof fetch = async () => { calls++; throw new Error("unexpected provider"); };
  await assert.rejects(() => provider.generateFreeAdvice({ ...input, acknowledged: false }, environment, forbidden), { code: "FREE_ADVICE_ACK_REQUIRED" });
  for (const env of [{}, { GEMINI_API_KEY: "old-paid", OPENAI_API_KEY: "old-paid", GEMINI_FREE_TIER_CONFIRMED: "true" }, { GEMINI_FREE_API_KEY: "synthetic", GEMINI_FREE_TIER_CONFIRMED: "false" }]) {
    await assert.rejects(() => provider.generateFreeAdvice(input, env, forbidden), { code: "FREE_ADVICE_NOT_CONFIGURED" });
  }
  assert.equal(calls, 0);
});

test("free advice makes one bounded request with no tools or raw records", async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), `https://generativelanguage.googleapis.com/v1beta/models/${policy.FREE_GEMINI_MODEL}:generateContent`);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "synthetic-free-only");
    assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.equal(body.tools, undefined); assert.equal(body.cachedContent, undefined);
    assert.ok(!String(init?.body).includes("synthetic-free-only"));
    assert.match(body.contents[0].parts[0].text, /기록 누락은 활동 없음이나 건강함으로 해석하지 않는다/);
    return output();
  };
  assert.deepEqual(await provider.generateFreeAdvice(input, environment, request), advice);
  assert.equal(calls, 1);
});

test("quota, network and incomplete output stop without retries, fallback or leaked errors", async () => {
  const cases: [typeof fetch, string][] = [
    [async () => Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: "PRIVATE-PROVIDER" } }, { status: 429 }), "FREE_ADVICE_QUOTA"],
    [async () => { throw new Error("PRIVATE-KEY"); }, "FREE_ADVICE_UNAVAILABLE"],
    [async () => output("MAX_TOKENS"), "FREE_ADVICE_UNREADABLE"],
    [async () => Response.json({ candidates: [] }), "FREE_ADVICE_UNREADABLE"],
  ];
  for (const [response, code] of cases) {
    let calls = 0;
    await assert.rejects(() => provider.generateFreeAdvice(input, environment, async (...args) => { calls++; return response(...args); }), error => {
      assert.equal((error as provider.FreeAdviceError).code, code);
      assert.ok(!String(error).includes("PRIVATE-")); return true;
    });
    assert.equal(calls, 1);
  }
  assert.equal(provider.parseFreeAdvice(JSON.stringify({ ...advice, nextSteps: ["", "x"] })), null);
  assert.equal(provider.parseFreeAdvice(JSON.stringify({ ...advice, summary: "x".repeat(701) })), null);
});

function routeFixture() {
  const state = { authenticated: true, configured: true, recordsFail: false, context, recordCalls: 0, providerCalls: 0 };
  const exports = {};
  const modules: Record<string, unknown> = {
    "node:crypto": { createHash },
    "@/lib/yeoni/reply-plan": replyPlan,
    "@/lib/supabase-server": { createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.authenticated ? { id: "owner-fixture" } : null }, error: null }) } }) },
    "@/lib/free-advice-context": contextModule,
    "@/lib/free-advice-records": { loadFreeAdviceContext: async (_client: unknown, userId: string) => { state.recordCalls++; assert.equal(userId, "owner-fixture"); if (state.recordsFail) throw new Error("PRIVATE-DB"); return state.context; } },
    "@/lib/free-gemini-policy": { ...policy, isFreeGeminiConfigured: () => state.configured },
    "@/lib/free-advice": { FreeAdviceError: provider.FreeAdviceError, generateFreeAdvice: async (args: typeof input) => { state.providerCalls++; assert.equal(args.acknowledged, true); assert.deepEqual(args.context, args.context.recordSource === "example" ? contextModule.buildExampleAdviceContext(args.context.scope) : state.context); return advice; } },
  };
  const code = ts.transpileModule(readFileSync(new URL("../app/api/ai/free-advice/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(exports, require) { ${code}\n})`, { Response, console, crypto })(exports, (name: string) => { assert.ok(name in modules, `unexpected import ${name}`); return modules[name]; });
  const { POST } = exports as { POST: (request: Request) => Promise<Response> };
  return { state, post: (body: unknown) => POST(new Request("https://fixture.local/api/ai/free-advice", { method: "POST", body: JSON.stringify(body) })) };
}

test("route validates authentication, literal actions, body fields and consent before reading records", async () => {
  const { state, post } = routeFixture();
  state.authenticated = false;
  assert.equal((await post({ action: "preview", scope: "budget" })).status, 401);
  state.authenticated = true;
  for (const body of [
    { action: ["preview"], scope: "budget" }, { action: ["analyze"], scope: "budget" },
    { action: "preview", scope: ["budget"] }, { action: "preview", scope: "budget", userId: "victim" },
    { action: "preview", scope: "budget", recordSource: ["example"] }, { action: "preview", scope: "budget", context: { records: "injected" } },
    { action: "analyze", scope: "budget", freeDataUseAcknowledged: "true" },
    { action: "preview", scope: "budget", question: "x".repeat(501) },
  ]) assert.equal((await post(body)).status, 400);
  state.configured = false;
  assert.equal((await post({ action: "analyze", scope: "budget", freeDataUseAcknowledged: true })).status, 503);
  assert.equal(state.recordCalls, 0); assert.equal(state.providerCalls, 0);
});

test("preview does not call AI; analysis requires exactly the reviewed snapshot and real records", async () => {
  const { state, post } = routeFixture();
  const preview = await post({ action: "preview", scope: "budget" });
  assert.equal(preview.status, 200); assert.equal(preview.headers.get("cache-control"), "private, no-store");
  const { fingerprint } = await preview.json();
  assert.equal(state.providerCalls, 0);
  const analyze = { action: "analyze", scope: "budget", fingerprint, freeDataUseAcknowledged: true };
  assert.equal((await post({ ...analyze, fingerprint: "stale" })).status, 409);
  assert.equal(state.providerCalls, 0);
  const result = await post(analyze);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.source, "free-gemini");
  assert.deepEqual(body.advice, advice);
  const spokenText = [advice.summary, ...advice.nextSteps, advice.basis, advice.limitations].join('\n');
  assert.equal(replyPlan.parseReplyEnvelope({ reply: spokenText, performance: body.performance }).reply, spokenText);
  assert.equal(state.providerCalls, 1);
  state.context = contextModule.buildFreeAdviceContext("budget", {}, now);
  const empty = await (await post({ action: "preview", scope: "budget" })).json();
  assert.equal((await post({ ...analyze, fingerprint: empty.fingerprint })).status, 422);
  state.recordsFail = true;
  const failed = await post(analyze); assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("PRIVATE-DB"));
  assert.equal(state.providerCalls, 1);
});

test("fixed example previews and generates without any account-record access, and cannot authorize real-record analysis", async () => {
  const { state, post } = routeFixture();
  state.recordsFail = true;
  const previewResponse = await post({ action: "preview", scope: "budget", recordSource: "example" });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.context.recordSource, "example");
  assert.equal(metric(preview.context, "budget.expense"), 12300);
  assert.match(preview.context.notes[0], /가상의 예시/);
  const analyze = { action: "analyze", scope: "budget", recordSource: "example", fingerprint: preview.fingerprint, freeDataUseAcknowledged: true };
  assert.equal((await post(analyze)).status, 200);
  assert.equal(state.recordCalls, 0); assert.equal(state.providerCalls, 1);
  state.recordsFail = false;
  assert.equal((await post({ ...analyze, recordSource: "user-records" })).status, 409);
  assert.equal(state.providerCalls, 1);
});

test("example provider prompt identifies fictional data and never describes it as the user's real records", async () => {
  const example = contextModule.buildExampleAdviceContext("assistant", now);
  assert.equal(example.recordSource, "example");
  await provider.generateFreeAdvice({ ...input, context: example }, environment, async (_url, init) => {
    assert.match(String(init?.body), /가상의 예시다/);
    assert.match(String(init?.body), /실제 사용자의 지출·건강·실력으로 서술하지 않는다/);
    return output();
  });
});

// OpenAI stays disabled in production; these are synthetic port-only regressions.
import { assertAdviceDisplayPolicy, OPENAI_RECORD_NOTICE, adviceFingerprint, createOpenAiAdviceService, createOpenAiAdviceHandler, OPENAI_ADVICE_DEPLOYMENT, type OpenAiPorts, type ApprovedAdvice, type Reservation, type Identity } from './openai-advice-server.ts';
{
const ID='00000000-0000-4000-8000-000000000001';
const question='가상 기록으로만 작은 행동을 제안해 줘';
const answer={summary:'가상 답변',nextSteps:['가상 행동'],basis:'가상 근거',limitations:'가상 한계'};
const raw=()=>({requestId:ID,feature:'advice' as const,question});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
  const seen:{event:string;data?:unknown}[]=[];let now=100;let live:Identity={ownerId:'fake-A',epoch:1};const used=new Set<string>();
  const grant:ApprovedAdvice={id:'fake-grant',ownerId:'fake-A',epoch:1,requestId:ID,feature:'advice',provider:'openai',organization:'fake-org',project:'fake-project',model:'fake-model',question,summary:'합성 요약',fingerprint:'',consentId:'fake-consent',approvalId:'fake-approval',quoteId:'fake-quote',pricingVersion:'fake-price',expiresAt:200,quoteExpiresAt:200,creditVerifiedUntil:200,currency:'USD',maxCostMicros:100,maxOutputTokens:100};
  const g={...grant,fingerprint:adviceFingerprint(grant)};
  const receipt=(v:ApprovedAdvice):Reservation=>({id:'fake-reservation',grantId:v.id,ownerId:v.ownerId,epoch:v.epoch,requestId:v.requestId,fingerprint:v.fingerprint,organization:v.organization,project:v.project,model:v.model,currency:'USD',reservedMicros:v.maxCostMicros,sendBefore:190});
  const response=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:10,completion_tokens:20}});
  const ports:OpenAiPorts={
    authenticate:async()=>{seen.push({event:'auth'});return {...live};},isCurrent:i=>i.ownerId===live.ownerId&&i.epoch===live.epoch,
    authorize:async()=>{seen.push({event:'authorize'});return g;},
    reserve:async v=>{seen.push({event:'reserve',data:v});if(used.has(v.requestId))return null;used.add(v.requestId);return receipt(v);},
    claimDispatch:async()=>{seen.push({event:'claim'});return true;},credentials:async()=>{seen.push({event:'credentials'});return 'fake-never-real-key';},
    retain:async(r,reason)=>{seen.push({event:'retain',data:{r,reason}});},complete:async(r,u)=>{seen.push({event:'complete',data:{r,u}});},
    request:async(url,init)=>{seen.push({event:'fetch',data:{url,init}});return response();},now:()=>now,
  };
  return {ports,g,seen,receipt,response,scope:(i:Identity)=>{live=i;},time:(n:number)=>{now=n;},run:()=>createOpenAiAdviceService({enabled:true},ports)};
}
const count=(f:ReturnType<typeof fixture>,event:string)=>f.seen.filter(x=>x.event===event).length;
test('deployed endpoint disabled before body/auth/key/budget/fetch, even with supplied ports',async()=>{
 const f=fixture();const h=createOpenAiAdviceHandler(OPENAI_ADVICE_DEPLOYMENT,f.ports);
 assert.equal((await h(new Request('https://fake.invalid',{method:'POST',body:'not json'}))).status,503);assert.deepEqual(f.seen,[]);
 await assert.rejects(createOpenAiAdviceService({enabled:false},f.ports)(raw(),new AbortController().signal),/OPENAI_NOT_ACTIVATED/);assert.deepEqual(f.seen,[]);
});
test('single synthetic provider attempt after committed reservation/claim; no tools/voice/retries',async()=>{
 const f=fixture();assert.deepEqual(await f.run()(raw(),new AbortController().signal),answer);
 assert.deepEqual(f.seen.map(x=>x.event),['auth','authorize','reserve','credentials','claim','fetch','complete']);
 const {url,init}=f.seen.find(x=>x.event==='fetch')!.data as {url:string;init:RequestInit};
 assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(init.redirect,'error');
 const body=JSON.parse(String(init.body));assert.equal(body.store,false);assert.equal(body.stream,false);assert.equal(body.max_completion_tokens,100);assert.equal(body.tools,undefined);assert.equal(body.audio,undefined);assert.equal(body.messages.length,2);
 assert.deepEqual((f.seen.at(-1)!.data as {u:unknown}).u,{promptTokens:10,completionTokens:20});
});
for(const [name,value] of Object.entries({null:null,array:[],voice:{...raw(),feature:'voice'},extra:{...raw(),apiKey:'fake'},empty:{...raw(),question:''}}))test(`invalid request ${name}`,async()=>{const f=fixture();await assert.rejects(f.run()(value,new AbortController().signal),/INVALID_REQUEST/);assert.deepEqual(f.seen,[]);});
const invalidGrant:Record<string,(g:ApprovedAdvice)=>ApprovedAdvice>={
 provider:g=>({...g,provider:'google' as 'openai'}),owner:g=>({...g,ownerId:'fake-B'}),ABA:g=>({...g,epoch:3}),
 question:g=>({...g,question:'changed'}),fingerprint:g=>({...g,fingerprint:'changed'}),expired:g=>({...g,expiresAt:100}),
 quoteExpired:g=>({...g,quoteExpiresAt:100}),creditExpired:g=>({...g,creditVerifiedUntil:100}),noConsent:g=>({...g,consentId:''}),
 noApproval:g=>({...g,approvalId:''}),noQuote:g=>({...g,quoteId:''}),noPrice:g=>({...g,pricingVersion:''}),
 amount:g=>({...g,maxCostMicros:NaN}),zero:g=>({...g,maxCostMicros:0}),fraction:g=>({...g,maxCostMicros:.2}),
 tokens:g=>({...g,maxOutputTokens:3000}),currency:g=>({...g,currency:'KRW' as 'USD'}),
};
for(const [name,change] of Object.entries(invalidGrant))test(`reject grant ${name} before reserve/fetch`,async()=>{const f=fixture();f.ports.authorize=async()=>change(f.g);await assert.rejects(f.run()(raw(),new AbortController().signal),/APPROVAL_OR_QUOTE_REQUIRED/);assert.equal(count(f,'reserve'),0);assert.equal(count(f,'fetch'),0);});
test('nonpositive clock cannot approve a grant',async()=>{const f=fixture();f.time(-1);await assert.rejects(f.run()(raw(),new AbortController().signal),/APPROVAL_OR_QUOTE_REQUIRED/);assert.equal(count(f,'fetch'),0);});
for(const stage of ['authorize','reserve','credentials','claimDispatch'] as const)test(`account switch during ${stage} prevents provider`,async()=>{
 const f=fixture();const original=f.ports[stage];
 // Preserve actual port output; switch in its awaited completion.
 if(stage==='authorize')f.ports.authorize=async(r,i)=>{const v=await (original as OpenAiPorts['authorize'])(r,i);f.scope({ownerId:'fake-B',epoch:2});return v;};
 if(stage==='reserve')f.ports.reserve=async(g)=>{const v=await (original as OpenAiPorts['reserve'])(g);f.scope({ownerId:'fake-B',epoch:2});return v;};
 if(stage==='credentials')f.ports.credentials=async(o,p)=>{const v=await (original as OpenAiPorts['credentials'])(o,p);f.scope({ownerId:'fake-A',epoch:3});return v;};
 if(stage==='claimDispatch')f.ports.claimDispatch=async(r)=>{const v=await (original as OpenAiPorts['claimDispatch'])(r);f.scope({ownerId:'fake-B',epoch:2});return v;};
 await assert.rejects(f.run()(raw(),new AbortController().signal),/STALE_ACCOUNT/);assert.equal(count(f,'fetch'),0);
});
test('same-render duplicate held before authorize completes; no second reserve/transport',async()=>{
 const f=fixture(),d=deferred<ApprovedAdvice>();f.ports.authorize=async()=>d.promise;const run=f.run();const a=run(raw(),new AbortController().signal);await Promise.resolve();
 await assert.rejects(run(raw(),new AbortController().signal),/REQUEST_IN_PROGRESS/);d.resolve(f.g);await a;assert.equal(count(f,'fetch'),1);
});
test('durable request ID reservation denies retry after completion, across service instances',async()=>{const f=fixture();await f.run()(raw(),new AbortController().signal);await assert.rejects(f.run()(raw(),new AbortController().signal),/BUDGET_NOT_RESERVED/);assert.equal(count(f,'fetch'),1);});
for(const [name,change] of Object.entries({owner:(r:Reservation)=>({...r,ownerId:'fake-B'}),project:(r:Reservation)=>({...r,project:'other'}),amount:(r:Reservation)=>({...r,reservedMicros:99}),expired:(r:Reservation)=>({...r,sendBefore:100}),fingerprint:(r:Reservation)=>({...r,fingerprint:'other'})}))test(`reservation mismatch ${name}`,async()=>{const f=fixture();f.ports.reserve=async()=>change(f.receipt(f.g));await assert.rejects(f.run()(raw(),new AbortController().signal),/BUDGET_NOT_RESERVED/);assert.equal(count(f,'fetch'),0);assert.equal(count(f,'retain'),0);assert.equal(count(f,'complete'),0);});
test('expiry during final claim blocks transmission',async()=>{const f=fixture();f.ports.claimDispatch=async()=>{f.time(300);return true;};await assert.rejects(f.run()(raw(),new AbortController().signal),/EXPIRED_AUTHORIZATION/);assert.equal(count(f,'fetch'),0);});
test('abort before authentication settled sends nothing',async()=>{const f=fixture(),a=new AbortController();a.abort();await assert.rejects(f.run()(raw(),a.signal),/STALE_ACCOUNT/);assert.equal(count(f,'fetch'),0);});
for(const mode of ['429','network','invalid-json','refusal','oversize','usage','settle'] as const)test(`failure ${mode} retains reservation; no retry/refund`,async()=>{
 const f=fixture();f.ports.request=async()=>{f.seen.push({event:'fetch'});if(mode==='network')throw Error('fake');if(mode==='429')return new Response('',{status:429});if(mode==='invalid-json')return new Response('bad');if(mode==='oversize')return new Response('x'.repeat(33000));if(mode==='refusal')return Response.json({choices:[{finish_reason:'stop',message:{refusal:'no'}}]});if(mode==='usage')return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]});return f.response();};
 if(mode==='settle')f.ports.complete=async()=>{throw Error('fake-ledger-down');};
 await assert.rejects(f.run()(raw(),new AbortController().signal));assert.equal(count(f,'fetch'),1);assert.equal(count(f,'retain'),1);assert.equal((f.seen.find(x=>x.event==='retain')!.data as {reason:string}).reason,'uncertain');
});
test('late response after account switch is charged to old reservation but never returned',async()=>{const f=fixture();f.ports.request=async()=>{f.seen.push({event:'fetch'});f.scope({ownerId:'fake-B',epoch:2});return f.response();};await assert.rejects(f.run()(raw(),new AbortController().signal),/STALE_ACCOUNT/);assert.equal(count(f,'complete'),1);assert.equal((f.seen.find(x=>x.event==='complete')!.data as {r:Reservation}).r.ownerId,'fake-A');});
test('handler performs same flow using only synthetic body/ports',async()=>{const f=fixture();const res=await createOpenAiAdviceHandler({enabled:true},f.ports)(new Request('https://fake.invalid',{method:'POST',body:JSON.stringify(raw())}));assert.equal(res.status,200);assert.deepEqual((await res.json()).advice,answer);});

for(const claim of ['기록을 저장했어요','가계부를 수정하였습니다','내역 삭제 완료','계획을 반영해 드렸어요','I have saved your record','We deleted the transaction','Saved successfully','記録を保存しました']) test(`known completion claim rejected: ${claim}`,()=>{
 assert.throws(()=>assertAdviceDisplayPolicy({...answer,summary:claim}),/UNVERIFIED_ACTION_CLAIM/);
});
test('suggestion/explicit non-action allowed and immutable action envelope is server-generated',async()=>{
 assert.doesNotThrow(()=>assertAdviceDisplayPolicy({...answer,summary:'필요하면 내용을 확인하고 직접 저장해 주세요.',limitations:'기록을 변경하지 않았어요.'}));
 const f=fixture();const res=await createOpenAiAdviceHandler({enabled:true},f.ports)(new Request('https://fake.invalid',{method:'POST',body:JSON.stringify(raw())}));const body=await res.json();
 assert.equal(body.recordActionsPerformed,false);assert.equal(body.recordNotice,OPENAI_RECORD_NOTICE);
});
test('valid provider usage settled, but known false saved claim never displayed',async()=>{
 const f=fixture();f.ports.request=async()=>{f.seen.push({event:'fetch'});return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...answer,summary:'기록을 저장했어요'})}}],usage:{prompt_tokens:10,completion_tokens:20}});};
 await assert.rejects(f.run()(raw(),new AbortController().signal),/UNVERIFIED_ACTION_CLAIM/);assert.equal(count(f,'fetch'),1);assert.equal(count(f,'complete'),1);assert.equal(count(f,'retain'),0);
});

test('known paraphrase completion also rejected',()=>{assert.throws(()=>assertAdviceDisplayPolicy({...answer,summary:'기록 저장이 끝났어요.'}),/UNVERIFIED_ACTION_CLAIM/);});
}
