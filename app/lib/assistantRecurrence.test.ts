import assert from "node:assert/strict";
import test from "node:test";
import * as recurrence from "./assistantRecurrence.ts";
const { nextRecurringDueAt, parseRecurrence, stripRecurrenceExpressions, recurrenceLabel } = recurrence;

test("한국어 반복 표현을 반복 규칙으로 변환한다", () => {
  assert.equal(parseRecurrence("매일 물 마시기 추가해줘"), "daily");
  assert.equal(parseRecurrence("매주 보고서 작성"), "weekly");
  assert.equal(parseRecurrence("매달 카드값 확인"), "monthly");
  assert.equal(parseRecurrence("오늘 우유 사기"), "none");
  assert.equal(recurrenceLabel("weekly"), "매주");
});

test("반복 완료 시 다음 마감일을 계산한다", () => {
  assert.equal(nextRecurringDueAt("2026-08-26T23:59:00+09:00", "daily", "2026-08-26"), "2026-08-27T23:59:00+09:00");
  assert.equal(nextRecurringDueAt("2026-08-26T23:59:00+09:00", "weekly", "2026-08-26"), "2026-09-02T23:59:00+09:00");
  assert.equal(nextRecurringDueAt("2026-08-31T23:59:00+09:00", "monthly", "2026-08-31"), "2026-09-30T23:59:00+09:00");
  assert.equal(nextRecurringDueAt(null, "none", "2026-08-26"), null);
});

// A title is not a recurrence command just because it contains the same syllables.
for (const title of ['구매일 확인', '구매주기 확인', '매일경제 읽기', '매달리기 연습', '매주기 점검', '재매월 집계', 'A매일', '3매주', '_매달', '매s일', '매s주', '매s월']) {
  test(`ordinary title is preserved without recurrence: ${title}`, () => {
    const text = `할 일 ${title} 추가해줘`;
    assert.equal(parseRecurrence(text), 'none');
    assert.equal(stripRecurrenceExpressions(text), text);
  });
}
for (const [rule, expressions] of [
  ['daily', ['매일', '매 일', '매\t일', '날마다', '매일마다']],
  ['weekly', ['매주', '매 주', '주마다', '매주마다']],
  ['monthly', ['매월', '매 월', '매달', '매 달', '달마다', '매월마다']],
] as const) {
  for (const expression of expressions) {
    test(`whole recurrence expression is recognized and removed together: ${expression}`, () => {
      for (const suffix of ['', '로', '으로', ' 반복', ' 반복으로']) {
        const text = `독서 ${expression}${suffix} 변경해줘`;
        assert.equal(parseRecurrence(text), rule);
        assert.equal(stripRecurrenceExpressions(text), '독서 변경해줘');
      }
    });
  }
}
test('punctuation, multiple occurrences and existing precedence are stable', () => {
  assert.equal(parseRecurrence('(매주) 확인'), 'weekly');
  assert.equal(parseRecurrence('매주 월요일 보고서'), 'weekly');
  assert.equal(parseRecurrence('매달 또는 매일'), 'daily');
  assert.equal(stripRecurrenceExpressions('매일 독서 매일'), ' 독서 ');
  assert.equal(stripRecurrenceExpressions('구매일 확인 매 일'), '구매일 확인 ');
  assert.equal(parseRecurrence('매주'), 'weekly');
  assert.equal(parseRecurrence('매주'), 'weekly'); // no stateful global-regex cursor
});

// Execute the actual POST module with in-memory auth/query results. All provider,
// service and network access is rejected. This is not a hosted Next/Auth test.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

type SyntheticItem = { id: string; title: string; recurrence_rule: string; due_at: string | null; priority: number; project_id: null };
function chatFixture(items: SyntheticItem[] = [], authenticated = true) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const calls = { reads: [] as string[], historyWrites: 0, taskWrites: 0, provider: 0, network: 0 };
  const forbidden = () => { calls.provider++; throw Error('External provider/service access is forbidden'); };
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'synthetic-owner' } : null }, error: null }) },
    from(table: string) {
      assert.ok(['assistant_chat_messages', 'user_app_state', 'assistant_items'].includes(table), table);
      let insert = false;
      const execute = () => {
        if (insert) {
          if (table !== 'assistant_chat_messages') { calls.taskWrites++; throw Error('Task writes are forbidden before confirmation'); }
          calls.historyWrites++;
          return { data: null, error: null };
        }
        calls.reads.push(table);
        return { data: table === 'user_app_state' ? { state: {} } : table === 'assistant_items' ? items : [], error: null };
      };
      const query = {
        select: () => query,
        eq(key: string, value: string) { assert.equal(key, 'user_id'); assert.equal(value, 'synthetic-owner'); return query; },
        not: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => execute(),
        insert() { insert = true; return query; },
        then: (done: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(done),
      };
      return query;
    },
    rpc() { calls.taskWrites++; throw Error('RPC is forbidden before confirmation'); },
  };
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (specifier: string, parent = root): Record<string, unknown> => {
    if (specifier === 'next/server') return { NextRequest: Request, NextResponse: Response };
    if (specifier === '@/lib/supabase-server') return { createServerSupabaseClient: async () => client };
    if (specifier === '@/lib/ai-router') return { generateAiText: forbidden, isAiFeatureAvailable: forbidden };
    if (specifier === '@/lib/ai-budget') return { AiBudgetExceededError: class extends Error {} };
    if (/^@\/lib\/assistant-.*-server$/.test(specifier)) return new Proxy({}, { get: () => forbidden });
    assert.ok(specifier.startsWith('@/') || specifier.startsWith('.'), `Unapproved dependency: ${specifier}`);
    const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(parent, specifier);
    const path = existsSync(base) && /\.ts$/.test(base) ? base : `${base}.ts`;
    assert.ok(path.startsWith(root), 'Module must remain in source root');
    const cached = cache.get(path);
    if (cached) return cached.exports;
    const loadedModule = { exports: {} };
    cache.set(path, loadedModule);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const run = vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
      Request, Response, crypto: webcrypto, process: { env: { NODE_ENV: 'test' } }, console: { error() {}, warn() {} },
      fetch() { calls.network++; throw Error('Network is forbidden'); },
    });
    run((next: string) => load(next, dirname(path)), loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };
  const route = load('@/app/api/assistant/chat/route') as { POST: (request: Request) => Promise<Response> };
  return { calls, async post(message: string) {
    const response = await route.POST(new Request('http://synthetic.invalid/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) }));
    return { status: response.status, body: await response.json() };
  } };
}

test('actual POST preserves ordinary titles and proposes no accidental recurrence or task write', async () => {
  const fixture = chatFixture();
  for (const title of ['구매일 확인', '구매주기 확인', '매일경제 읽기', '매달리기 연습']) {
    const { status, body } = await fixture.post(`할 일 ${title} 추가해줘`);
    assert.equal(status, 200);
    assert.equal(body.proposal.values.title, title);
    assert.equal(body.proposal.values.recurrence_rule, 'none');
    assert.equal(body.proposal.operation, 'create');
    assert.equal(body.changed, false);
    assert.match(body.reply, /확인 버튼을 눌러야 저장/);
  }
  assert.equal(fixture.calls.historyWrites, 4);
  assert.equal(fixture.calls.taskWrites, 0);
  assert.equal(fixture.calls.provider, 0);
  assert.equal(fixture.calls.network, 0);
});

test('actual POST recognizes spaced recurrence and removes exactly the recognized expression from titles', async () => {
  const fixture = chatFixture();
  for (const [expression, rule] of [['매 일', 'daily'], ['매 주', 'weekly'], ['매 월', 'monthly'], ['날마다', 'daily'], ['달마다', 'monthly']]) {
    const { status, body } = await fixture.post(`할 일 ${expression} 구매일 확인 추가해줘`);
    assert.equal(status, 200);
    assert.equal(body.proposal.values.title, '구매일 확인');
    assert.equal(body.proposal.values.recurrence_rule, rule);
    assert.equal(body.changed, false);
  }
  assert.equal(fixture.calls.taskWrites + fixture.calls.provider + fixture.calls.network, 0);
});

test('actual POST updates the correct intact target, retaining or explicitly changing recurrence only in its proposal', async () => {
  const items = ['구매일 확인', '구매주기 확인', '매일경제 읽기', '매달리기 연습'].map((title, i) => ({ id: `synthetic-${i}`, title, recurrence_rule: 'weekly', due_at: null, priority: 3, project_id: null })) satisfies SyntheticItem[];
  const snapshot = JSON.stringify(items);
  const fixture = chatFixture(items);
  for (const item of items) {
    const retained = await fixture.post(`할 일 ${item.title} 내일로 변경해줘`);
    assert.equal(retained.status, 200);
    assert.equal(retained.body.proposal.itemId, item.id);
    assert.equal(retained.body.proposal.values.title, item.title);
    assert.equal(retained.body.proposal.values.recurrence_rule, 'weekly');
    const changed = await fixture.post(`할 일 ${item.title} 매 일 반복으로 변경해줘`);
    assert.equal(changed.status, 200);
    assert.equal(changed.body.proposal.itemId, item.id);
    assert.equal(changed.body.proposal.values.recurrence_rule, 'daily');
    assert.equal(changed.body.changed, false);
  }
  assert.equal(JSON.stringify(items), snapshot);
  assert.equal(fixture.calls.taskWrites + fixture.calls.provider + fixture.calls.network, 0);
});

test('actual POST authentication gate rejects before reading records or generating proposals', async () => {
  const fixture = chatFixture([], false);
  const response = await fixture.post('할 일 매 일 독서 추가해줘');
  assert.equal(response.status, 401);
  assert.equal(response.body.proposal, undefined);
  assert.deepEqual(fixture.calls, { reads: [], historyWrites: 0, taskWrites: 0, provider: 0, network: 0 });
});

test('common repeated daily and attached weekly weekdays retain their existing meaning without inventing a date', async () => {
  const fixture = chatFixture();
  assert.equal(parseRecurrence('매일매일 독서'), 'daily');
  assert.equal(stripRecurrenceExpressions('매일매일 독서'), ' 독서');
  for (const weekday of ['월', '화', '수', '목', '금', '토', '일']) {
    for (const suffix of ['', '에', '은', '는', '도']) {
      const message = `매주${weekday}요일${suffix} 독서`;
      assert.equal(parseRecurrence(message), 'weekly');
      assert.equal(stripRecurrenceExpressions(message), ` ${weekday}요일${suffix} 독서`);
    }
  }
  for (const title of ['매일매일경제', '매주월요일경제', '매주금요일마다미팅표']) {
    assert.equal(parseRecurrence(title), 'none');
    assert.equal(stripRecurrenceExpressions(title), title);
  }
  for (const [expression, title, rule] of [['매일매일 독서', '독서', 'daily'], ['매주월요일 독서', '월요일 독서', 'weekly']]) {
    const { status, body } = await fixture.post(`할 일 ${expression} 추가해줘`);
    assert.equal(status, 200);
    assert.equal(body.proposal.values.title, title);
    assert.equal(body.proposal.values.recurrence_rule, rule);
    assert.equal(body.proposal.values.due_at, null);
  }
  assert.equal(fixture.calls.taskWrites + fixture.calls.provider + fixture.calls.network, 0);
});
