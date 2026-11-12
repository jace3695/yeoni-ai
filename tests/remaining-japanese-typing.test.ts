import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { GRAMMAR_WRITING_PRACTICE, GRAMMAR_WRITING_ALTERNATES, normalizeGrammarInput, type GrammarWritingPractice } from '../data/grammarWritingPractice.ts';
import { CONSOLIDATION_PRACTICES } from '../data/grammarConsolidation.ts';
import { TRAVEL_CONSOLIDATION } from '../data/grammarTravelConsolidation.ts';
import { WORK_WRITING_UNITS } from '../data/workWriting.ts';
import { getGrammarChoicePractice } from '../data/grammarChoicePractice.ts';
import { JAPANESE_WRITING_CHOICES } from '../data/japaneseWritingChoices.ts';

const entries = [
  ...Object.entries(GRAMMAR_WRITING_PRACTICE).map(([id, practice]) => ({ id: `main:${id}`, practice })),
  ...Object.entries(GRAMMAR_WRITING_ALTERNATES).map(([id, practice]) => ({ id: `alternate:${id}`, practice })),
  ...Object.entries(CONSOLIDATION_PRACTICES).map(([id, practice]) => ({ id: `consolidation:${id}`, practice })),
  ...Object.entries(TRAVEL_CONSOLIDATION).map(([id, practice]) => ({ id: `travel:${id}`, practice })),
  ...WORK_WRITING_UNITS.flatMap(unit => unit.tasks.map(practice => ({ id: practice.id, practice }))),
];
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
type Element = React.ReactElement<Record<string, unknown>>;
type Slot = { initialized?: boolean; value?: unknown; deps?: unknown[]; cleanup?: () => void };
type Instance = { slots: Slot[]; cursor: number };

/** Actual component functions/event handlers with synthetic hooks/host refs, not a browser/layout test. */
function fixture(filename = 'components/language/GrammarWritingPractice.tsx') {
  const instances = new Map<string, Instance>();
  let current: Instance | undefined;
  const effects: (() => void)[] = [];
  let visited = new Set<string>();
  let id = 0;
  const storage = new Map([['synthetic-history', JSON.stringify({ answers: { 0: false }, firstAnswers: { 0: false }, responses: { 0: '以前の入力' }, score: 50, completedLessonIds: ['f01'] })]]);
  const originalStorage = JSON.stringify([...storage]);
  const forbidden = () => { throw Error('No storage mutation, network request or audio playback is permitted in this fixture'); };
  const slot = () => {
    assert.ok(current);
    return current.slots[current.cursor++] ||= {};
  };
  const hooks = {
    useState(initial: unknown) {
      const state = slot();
      if (!state.initialized) { state.initialized = true; state.value = typeof initial === 'function' ? (initial as () => unknown)() : initial; }
      return [state.value, (next: unknown) => { state.value = typeof next === 'function' ? (next as (value: unknown) => unknown)(state.value) : next; }];
    },
    useId() { const state = slot(); return state.value ||= `question-${++id}`; },
    useRef(initial: unknown) { const state = slot(); if (!state.initialized) { state.initialized = true; state.value = { current: initial }; } return state.value; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const state = slot();
      if (!state.initialized || !state.deps || deps.some((value, index) => !Object.is(value, state.deps?.[index]))) {
        state.initialized = true; state.deps = deps;
        effects.push(() => { state.cleanup?.(); state.cleanup = effect() || undefined; });
      }
    },
  };
  const drawEvents: string[] = [];
  const ctx = { fillRect: () => drawEvents.push('clear'), beginPath: () => drawEvents.push('begin'), moveTo: () => drawEvents.push('move'), lineTo: () => drawEvents.push('line'), stroke: () => drawEvents.push('stroke') };
  const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 560, height: 200 }) };
  const localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: forbidden, removeItem: forbidden, clear: forbidden };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file); if (cached) return cached.exports;
    const loaded = { exports: {} }; modules.set(file, loaded);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, { module: loaded, exports: loaded.exports, localStorage, window: { localStorage }, fetch: forbidden, require: (name: string) => {
      if (name === 'react') return hooks;
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const candidate = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [candidate, candidate + '.ts', candidate + '.tsx'].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
      assert.ok(resolved, name); return load(resolved);
    } }, { filename: file });
    return loaded.exports;
  }
  const Component = load(path.join(root, filename)).default as React.ComponentType<Record<string, unknown>>;
  function evaluate(tree: React.ReactNode, identity: string): React.ReactNode {
    if (Array.isArray(tree)) return tree.map((child, index) => {
      const value = evaluate(child, `${identity}/${index}`);
      return React.isValidElement(value) && value.key === null ? React.cloneElement(value, { key: `${identity}/${index}` }) : value;
    });
    if (!React.isValidElement(tree)) return tree;
    const element = tree as Element;
    const key = `${identity}/${typeof element.type === 'function' ? element.type.name : String(element.type)}:${element.key ?? ''}`;
    if (element.type === React.Fragment) return evaluate(element.props.children as React.ReactNode, key);
    if (typeof element.type === 'function') {
      visited.add(key);
      const instance = instances.get(key) || { slots: [], cursor: 0 };
      instances.set(key, instance); instance.cursor = 0;
      const previous = current; current = instance;
      const child = (element.type as (props: Record<string, unknown>) => React.ReactNode)(element.props);
      current = previous; return evaluate(child, key);
    }
    if (element.type === 'canvas' && element.props.ref) (element.props.ref as { current: unknown }).current = canvas;
    return React.cloneElement(element, undefined, evaluate(element.props.children as React.ReactNode, key));
  }
  return {
    render(props: Record<string, unknown> = {}) {
      visited = new Set();
      const tree = evaluate(React.createElement(Component, { onListen: forbidden, ...props }), 'root');
      for (const [key, instance] of instances) if (!visited.has(key)) { instance.slots.forEach(state => state.cleanup?.()); instances.delete(key); }
      while (effects.length) effects.shift()!();
      assert.equal(JSON.stringify([...storage]), originalStorage);
      return tree;
    },
    drawEvents,
  };
}
function nodes(tree: React.ReactNode): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement(tree)) return [];
  const element = tree as Element;
  return [element, ...nodes(element.props.children as React.ReactNode)];
}
const markup = (tree: React.ReactNode) => renderToStaticMarkup(tree);
function button(tree: React.ReactNode, text: string) {
  const found = nodes(tree).find(node => node.type === 'button' && markup(node.props.children as React.ReactNode) === text);
  assert.ok(found, `button ${text}`); return found;
}
function click(tree: React.ReactNode, text: string) {
  const found = button(tree, text); assert.ok(!found.props.disabled, `enabled ${text}`);
  (found.props.onClick as () => void)();
}
const statuses = (tree: React.ReactNode) => nodes(tree).filter(node => node.props.role === 'status');
const noTyping = (tree: React.ReactNode) => assert.equal(nodes(tree).filter(node => node.type === 'textarea' || (node.type === 'input' && !['radio', 'checkbox'].includes(String(node.props.type)))).length, 0);

// The pure data check also protects accepted historical spelling/particle variants from becoming distractors.
test('all 67 live grammar applications have three unique options, one accepted answer and a neutral Korean prompt', () => {
  assert.equal(entries.length, 67);
  const snapshot = JSON.stringify(entries);
  const positions = new Set<number>();
  for (const { id, practice } of entries) {
    const question = getGrammarChoicePractice(practice);
    assert.ok(question, id);
    assert.equal(question.choices.length, 3, id);
    assert.equal(new Set(question.choices).size, 3, id);
    assert.equal(question.choices.filter(value => practice.answers.includes(normalizeGrammarInput(value, practice.sentenceInput, practice.questionInput))).length, 1, id);
    assert.equal(question.answer, practice.answers[0], id);
    assert.doesNotMatch(question.prompt, /[\u3040-\u30ff\u4e00-\u9fff]|써|쓰세요|입력/, id);
    assert.deepEqual(getGrammarChoicePractice(practice), question, id);
    positions.add(question.choices.indexOf(question.answer));
    assert.ok(practice.answers.includes(normalizeGrammarInput(question.answer + (practice.sentenceInput ? '。' : ''), practice.sentenceInput, practice.questionInput)), id);
  }
  assert.equal(positions.size, 3);
  assert.equal(JSON.stringify(entries), snapshot);
  for (const practice of [GRAMMAR_WRITING_PRACTICE.ni, GRAMMAR_WRITING_ALTERNATES.ni]) {
    assert.ok(practice.answers.includes('へ'));
    assert.ok(!getGrammarChoicePractice(practice)!.choices.includes('へ'));
  }
});

for (const { id, practice } of entries) test(`${id}: no typing or initial feedback; selection confirms once without touching history`, () => {
  const f = fixture(); const props = { practice };
  let tree = f.render(props); noTyping(tree);
  assert.equal(statuses(tree).length, 0);
  assert.ok(button(tree, '선택한 답 확인').props.disabled);
  assert.ok(!markup(tree).includes(practice.words));
  assert.ok(!markup(tree).includes(practice.reason));
  click(tree, practice.answers[0]); tree = f.render(props);
  assert.equal(statuses(tree).length, 0);
  click(tree, '선택한 답 확인'); tree = f.render(props); noTyping(tree);
  assert.equal(statuses(tree).length, 1);
  assert.match(markup(statuses(tree)), /상황에 맞게 골랐어요/);
  assert.ok(markup(statuses(tree)).includes(practice.result));
  assert.ok(button(tree, '선택한 답 확인').props.disabled);
  assert.ok(button(tree, practice.answers[0]).props.disabled);
});

test('every grammar distractor returns comparison feedback and a same-question retry clears help and choice', () => {
  for (const { id, practice } of entries) {
    for (const wrong of getGrammarChoicePractice(practice)!.choices.filter(value => value !== practice.answers[0])) {
      const f = fixture(); const props = { practice };
      let tree = f.render(props);
      click(tree, '도움말 보기'); tree = f.render(props);
      click(tree, wrong); tree = f.render(props);
      click(tree, '선택한 답 확인'); tree = f.render(props);
      assert.match(markup(statuses(tree)), /예시 답의 뜻을 비교/, id);
      assert.ok(markup(statuses(tree)).includes(practice.result), id);
      click(tree, '도움 없이 다시 고르기'); tree = f.render(props);
      assert.equal(statuses(tree).length, 0, id);
      assert.ok(!markup(tree).includes(practice.words), id);
      assert.equal(nodes(tree).filter(node => node.props['aria-pressed'] === true).length, 0, id);
      assert.ok(button(tree, '선택한 답 확인').props.disabled, id);
    }
  }
});

test('wrong answer, help, retry and alternate/parent replacement do not leak earlier answers or reflection', () => {
  const practice = GRAMMAR_WRITING_PRACTICE.ni;
  const alternate = GRAMMAR_WRITING_ALTERNATES.ni;
  const f = fixture(); const props = { practice, alternate };
  let tree = f.render(props);
  click(tree, '도움말 보기'); tree = f.render(props);
  assert.ok(markup(tree).includes(practice.words));
  click(tree, '도움말 가리기'); tree = f.render(props);
  const wrong = getGrammarChoicePractice(practice)!.choices.find(value => !practice.answers.includes(value))!;
  click(tree, wrong); tree = f.render(props); click(tree, '선택한 답 확인'); tree = f.render(props);
  assert.match(markup(statuses(tree)), /예시 답의 뜻을 비교/);
  assert.match(markup(statuses(tree)), /도움말을 참고한 선택/);
  const reflection = nodes(tree).find(node => node.type === 'input')!;
  (reflection.props.onChange as () => void)(); tree = f.render(props);
  click(tree, '다른 예문으로 다시 고르기'); tree = f.render(props);
  assert.ok(markup(tree).includes(alternate.context));
  assert.equal(statuses(tree).length, 0);
  assert.ok(button(tree, '선택한 답 확인').props.disabled);
  assert.equal(nodes(tree).filter(node => node.props['aria-pressed'] === true).length, 0);
  assert.ok(!markup(tree).includes(alternate.words));
  assert.equal(nodes(tree).filter(node => node.type === 'input').length, 0);
  click(tree, alternate.answers[0]); tree = f.render(props); click(tree, '선택한 답 확인'); tree = f.render(props);
  assert.match(markup(statuses(tree)), /도움말 없이 선택/);
  tree = f.render({ practice: GRAMMAR_WRITING_PRACTICE.de });
  assert.equal(statuses(tree).length, 0);
  assert.equal(nodes(tree).filter(node => node.props['aria-pressed'] === true).length, 0);
});

test('unknown content fails safely instead of returning typing or an invented quiz', () => {
  const practice: GrammarWritingPractice = { ...GRAMMAR_WRITING_PRACTICE.desu, answers: ['未登録'] };
  assert.equal(getGrammarChoicePractice(practice), null);
  const tree = fixture().render({ practice });
  noTyping(tree);
  assert.match(markup(tree), /선택 연습을 준비/);
  assert.equal(nodes(tree).filter(node => node.type === 'button').length, 0);
});

test('four directly accessible writing questions have one exact meaning match, and keep their original IDs and answers', () => {
  assert.deepEqual(JAPANESE_WRITING_CHOICES.map(({ id, answer }) => [id, answer]), [[1, 'これはいくらですか？'], [2, 'もう一度お願いします'], [3, 'ご確認お願いします'], [4, '今何してる？']]);
  for (const question of JAPANESE_WRITING_CHOICES) {
    assert.equal(new Set(question.choices).size, 3);
    assert.equal(question.choices.filter(value => value === question.answer).length, 1);
  }
});

test('direct writing route selects, checks, retries and navigates all four questions without stale answers or storage', () => {
  const f = fixture('app/language/writing/page.tsx');
  let tree = f.render(); noTyping(tree);
  for (const problem of JAPANESE_WRITING_CHOICES) {
    assert.match(markup(tree), new RegExp(problem.prompt.replace(/[?]/g, '\\?')));
    assert.equal(statuses(tree).length, 0);
    assert.ok(button(tree, '선택한 답 확인').props.disabled);
    const wrong = problem.choices.find(value => value !== problem.answer)!;
    click(tree, wrong); tree = f.render(); click(tree, '선택한 답 확인'); tree = f.render();
    assert.match(markup(statuses(tree)), /예시 답의 뜻을 비교/);
    assert.doesNotMatch(markup(statuses(tree)), /거의 맞았어요/);
    assert.ok(button(tree, problem.answer).props.disabled);
    click(tree, '이번 문제 다시 연습'); tree = f.render();
    assert.equal(statuses(tree).length, 0);
    click(tree, problem.answer); tree = f.render(); click(tree, '선택한 답 확인'); tree = f.render();
    assert.match(markup(statuses(tree)), /뜻에 맞는 표현을 골랐어요/);
    click(tree, '다음'); tree = f.render(); noTyping(tree);
  }
  assert.match(markup(tree), /문제 1 \/ 4/);
  assert.equal(statuses(tree).length, 0);
  click(tree, '이전'); tree = f.render();
  assert.match(markup(tree), /문제 4 \/ 4/);
  assert.ok(button(tree, '선택한 답 확인').props.disabled);
});

test('handwriting remains drawable and explicitly ungraded when switching from and back to choices', () => {
  const f = fixture('app/language/writing/page.tsx');
  let tree = f.render();
  click(tree, JAPANESE_WRITING_CHOICES[0].answer); tree = f.render();
  click(tree, '선택한 답 확인'); tree = f.render();
  click(tree, '✏️ 필기로 쓰기'); tree = f.render();
  noTyping(tree); assert.equal(statuses(tree).length, 0);
  const canvas = nodes(tree).find(node => node.type === 'canvas')!; assert.ok(canvas);
  assert.ok(f.drawEvents.includes('clear'));
  const event = { preventDefault() {}, clientX: 10, clientY: 10 };
  (canvas.props.onMouseDown as (event: unknown) => void)(event);
  (canvas.props.onMouseMove as (event: unknown) => void)({ ...event, clientX: 20 });
  (canvas.props.onMouseUp as (event: unknown) => void)(event);
  assert.deepEqual(f.drawEvents.slice(-4), ['begin', 'move', 'line', 'stroke']);
  click(tree, '예시 답과 비교'); tree = f.render();
  assert.match(markup(statuses(tree)), /필기 모드에서는 아직 자동 채점이 지원되지 않습니다/);
  assert.doesNotMatch(markup(statuses(tree)), /뜻에 맞는 표현을 골랐어요|틀렸습니다/);
  click(tree, '이번 문제 다시 연습'); tree = f.render();
  assert.equal(f.drawEvents.at(-1), 'clear');
  click(tree, '표현 고르기'); tree = f.render();
  assert.equal(nodes(tree).filter(node => node.type === 'canvas').length, 0);
  assert.equal(statuses(tree).length, 0);
  assert.ok(button(tree, '선택한 답 확인').props.disabled);
});

test('active sources have no typing, persistence or conversation reactivation; handwriting and retired route remain', () => {
  for (const file of ['components/language/GrammarWritingPractice.tsx', 'app/language/writing/page.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /<textarea\b|<input[^>]*type=["']text|onSubmit=|localStorage|sessionStorage|removeItem|saveSession|fetch\(/);
  }
  const route = fs.readFileSync(path.join(root, 'app/language/practice/page.tsx'), 'utf8');
  assert.match(route, /RetiredPractice/);
  assert.doesNotMatch(route, /PracticeWorkspace|FreeConversationPractice/);
  const page = fs.readFileSync(path.join(root, 'app/language/grammar/page.tsx'), 'utf8');
  assert.match(page, /<GrammarWritingPractice/);
  assert.match(page, /<WorkWritingPractice/);
  assert.match(page, /<GrammarTravelConsolidation/);
});
