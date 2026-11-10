import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import * as grammar from '../data/grammar.ts';
import * as chunks from '../data/japaneseChunkLessons.ts';
import * as guides from '../data/grammarBeginnerGuide.ts';
import * as stages from '../data/grammarStages.ts';
import * as writing from '../data/grammarWritingPractice.ts';
import * as progress from '../utils/grammarQuizProgress.ts';

type Element = React.ReactElement<Record<string, unknown>>;
function nodes(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...nodes(node.props.children as React.ReactNode)];
}
function label(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(label).join('');
  if (React.isValidElement<Record<string, unknown>>(node)) return label(node.props.children as React.ReactNode);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
// Execute production page event handlers with synthetic hooks/storage/audio.
// This is not a browser, actual speech, or real-account persistence test.
function page(query = '') {
  const require = createRequire(import.meta.url);
  const slots: unknown[] = [];
  let cursor = 0, audioStops = 0, writes = 0;
  const hooks = { ...React,
    useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: unknown) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(compute: () => unknown) { cursor++; return compute(); },
    useEffect(effect: () => void) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effect(); } },
  };
  const Stub = () => null;
  const Practice = () => null;
  const deps: Record<string, unknown> = {
    react: hooks, 'next/link': Stub, 'next/navigation': { useSearchParams: () => new URLSearchParams(query) },
    '@/components/language/JapaneseChunkPractice': Practice,
    '@/data/japaneseChunkLessons': chunks,
    '@/data/grammar': grammar, '@/data/grammarBeginnerGuide': guides,
    '@/data/grammarStages': stages, '@/data/grammarWritingPractice': writing,
    '@/utils/grammarQuizProgress': progress,
    '@/components/language/useLearningAudio': { useLearningAudio: () => ({ playing: false, audioError: '', stop: () => { audioStops++; }, play: async () => undefined }) },
    '@/components/language/useDailyRoutineCompletion': { useDailyRoutineCompletion: () => ({ ensureCurrent: () => true, complete() {}, retry() {}, error: '' }) },
  };
  const exports: { testContent?: (props: { requestedLessonId: string | null }) => Element } = {};
  const source = ts.transpileModule(readFileSync(new URL('../app/language/grammar/page.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source + ";exports.testContent = GrammarPageContent;", { exports, URLSearchParams, Set, Date, window: { location: { search: query } }, localStorage: { getItem: () => null, setItem: () => { writes++; } }, require: (name: string) => deps[name] ?? (name.startsWith('@/components/language/') ? Stub : require(name)) });
  const render = () => { cursor = 0; return exports.testContent!({ requestedLessonId: new URLSearchParams(query).get("lesson") }); };
  render();
  const click = (text: string) => { const button = nodes(render()).find(node => node.type === 'button' && label(node.props.children as React.ReactNode) === text); assert.ok(button, text); (button.props.onClick as () => void)(); };
  const activePractice = () => nodes(render()).find(node => node.type === Practice);
  return { render, click, activePractice, stops: () => audioStops, writes: () => writes };
}

test('all grammar deep links open the matching chunk lesson without changing main scores; close restores reference stage', () => {
  for (const lesson of grammar.GRAMMAR_LESSONS) {
    const p = page(`?lesson=${encodeURIComponent(lesson.id)}`);
    assert.ok(label(p.render()).includes(lesson.title));
    p.click('2. 예문');
    p.click('짧은 표현부터 조각으로 배우기');
    assert.equal(p.activePractice()?.props.lesson, chunks.getChunkLesson(`grammar:${lesson.id}`));
    assert.equal(p.writes(), 0);
    assert.ok(p.stops() >= 2);
    (p.activePractice()!.props.onClose as () => void)();
    assert.equal(p.activePractice(), undefined);
    assert.ok(label(p.render()).includes('이제 직접 풀기'));
    assert.equal(p.writes(), 0);
  }
});

test('an unknown grammar link preserves the safe first lesson and does not invent a chunk', () => {
  const p = page('?lesson=missing');
  p.click('짧은 표현부터 조각으로 배우기');
  assert.equal(p.activePractice()?.props.lesson, chunks.getChunkLesson('grammar:desu'));
  assert.equal(p.writes(), 0);
});
