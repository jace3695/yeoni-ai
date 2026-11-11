import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { JAPANESE_READING_LESSONS, getReadingLessonLevel } from '../data/japaneseReadingLessons.ts';
import { JAPANESE_READING_EXPANSION } from '../data/japaneseContentExpansion.ts';
import * as enhancements from '../data/japaneseReadingEnhancements.ts';
import * as chunkData from '../data/japaneseChunkLessons.ts';
import * as supports from '../data/japaneseReadingSupport.ts';
import * as levels from '../data/japaneseLevels.ts';
import * as highlights from '../utils/japaneseReadingHighlight.ts';
import * as journeys from '../utils/japaneseLevelJourney.ts';
import type { UpperLesson } from '../data/japaneseUpperLessons.ts';

const require = createRequire(import.meta.url);

test('26 optional comparisons and 104 scoped evidence entries preserve the lesson question contract', () => {
  assert.equal(enhancements.JAPANESE_READING_ENHANCEMENTS.length, 26);
  assert.deepEqual(enhancements.JAPANESE_READING_ENHANCEMENTS.map(item => item.lessonId).sort(), JAPANESE_READING_LESSONS.map(item => item.id).sort());
  const newExamples: string[] = [];
  for (const lesson of JAPANESE_READING_LESSONS) {
    const value = enhancements.getReadingEnhancement(lesson)!;
    assert.deepEqual(value.evidence.map(item => item.questionId), lesson.questions.slice(0, 4).map(item => item.id));
    for (const entry of value.evidence) {
      assert.ok(entry.paragraphIndexes.length > 0);
      assert.ok(entry.paragraphIndexes.every(index => Number.isInteger(index) && index >= 0 && index < lesson.paragraphs.length));
      for (const quote of entry.quotes) {
        assert.ok(quote.length > 1);
        assert.ok(entry.paragraphIndexes.some(index => lesson.paragraphs[index].japanese.includes(quote)), `${entry.questionId}: ${quote}`);
      }
      assert.match(entry.reason, /[가-힣]/);
      assert.ok(entry.reason.length > 15);
    }
    const pair = value.pair;
    assert.ok(lesson.paragraphs[pair.sourceParagraphIndex].japanese.includes(pair.sourceSentence));
    assert.ok(pair.sourceSentence.includes(pair.expression));
    assert.ok(pair.parallelSentence.includes(pair.expression));
    assert.notEqual(pair.sourceSentence, pair.parallelSentence);
    assert.ok(!JAPANESE_READING_LESSONS.some(item => item.paragraphs.some(paragraph => paragraph.japanese.includes(pair.parallelSentence))));
    for (const text of [pair.meaning, pair.parallelMeaning, pair.changedDetail, pair.caution]) assert.match(text, /[가-힣]/);
    newExamples.push(pair.parallelSentence);
    assert.doesNotMatch(JSON.stringify(value), /TODO|TBD|녹음하세요|입력하세요|작성하세요|JLPT|합격 보장/);
  }
  assert.equal(new Set(newExamples).size, 26);
  for (const id of ['', '__proto__', 'missing', 'upper-99']) assert.equal(enhancements.getReadingEnhancement({ id }), undefined);
});

type Element = React.ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => Element;
const css = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : String(name) });
function compile(file: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, Component> = {};
  vm.runInNewContext(code, { exports, AbortController, crypto, require: (name: string) => name.endsWith('.module.css') ? css : dependencies[name] ?? require(name) });
  return exports;
}
const extraComponents = compile('../components/language/ReadingLessonEnhancements.tsx', {});
const markup = (component: string, props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(extraComponents[component], props));

test('real React markup distinguishes normal progress from the frozen due queue', () => {
  for (const [stage, questionIndex, label] of [['read', 0, '읽기'], ['questions', 0, '본문 확인'], ['questions', 4, '새 상황'], ['write', 5, '표현 비교'], ['done', 5, '마침']]) {
    const html = markup('ReadingProgress', { stage, questionIndex, reviewOnly: false, cursor: 0, questionCount: 6 });
    assert.match(html, new RegExp(`aria-current="step">현재: ${label}`));
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /button|input|disabled/);
  }
  const review = markup('ReadingProgress', { stage: 'questions', questionIndex: 4, reviewOnly: true, cursor: 0, questionCount: 1 });
  assert.match(review, /예정 복습 1\/1 · 새 상황/);
  assert.doesNotMatch(review, /<ol|표현 비교/);
  assert.match(markup('ReadingProgress', { stage: 'read', reviewOnly: true, cursor: 0, questionCount: 1, questionIndex: 4 }), /현재: 본문 다시 보기/);
});

test('real React evidence markup cannot reveal answers before a response, or confuse transfer with source text', () => {
  for (const lesson of JAPANESE_READING_LESSONS) {
    const value = enhancements.getReadingEnhancement(lesson)!;
    for (const [index, question] of lesson.questions.entries()) {
      const evidence = value.evidence[index];
      assert.equal(markup('ReadingAnswerEvidence', { lesson, question, evidence, responded: false }), '');
      const html = markup('ReadingAnswerEvidence', { lesson, question, evidence, responded: true });
      if (index < 4) {
        assert.match(html, /본문 정답 근거/);
        assert.ok(html.includes(evidence.reason));
        for (const quote of evidence.quotes) assert.ok(html.includes(quote));
        for (const paragraph of evidence.paragraphIndexes) assert.ok(html.includes(`${paragraph + 1}문단`));
        assert.doesNotMatch(html, /<details[^>]*\bopen/);
      } else {
        assert.match(html, /근거: 이번 문제의 새 상황/);
        assert.ok(html.includes(question.prompt));
        assert.doesNotMatch(html, /본문 정답 근거|원문 인용|근거 문단 전체 다시 보기/);
      }
    }
    const comparison = markup('ReadingPatternComparison', { pair: value.pair });
    assert.match(comparison, /같은 표현, 다른 상황 · 선택해서 열기/);
    assert.doesNotMatch(comparison, /<details[^>]*\bopen|<input|<textarea|<audio|<button/);
    assert.ok(comparison.includes(value.pair.parallelSentence));
  }
});

/** Synthetic hook state lets the actual component render each stage without
 * pretending to validate a browser, focus, storage adapter, layout or speech. */
function harness(lesson: UpperLesson, reviewOnly = false, initialJourney = journeys.emptyLevelJourney()) {
  const states: unknown[] = [];
  let hook = 0, journey = initialJourney;
  const hooks = {
    ...React, useEffect(run: () => void, deps: unknown[]) {
      const index = hook++; const previous = states[index] as unknown[] | undefined;
      if (!previous || deps.some((value, i) => value !== previous[i])) { states[index] = deps; run(); }
    }, useRef(initial: unknown) { const index = hook++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
    useState(initial: unknown) {
      const index = hook++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
  };
  const Reading = compile('../components/language/UpperReadingLesson.tsx', {
    react: hooks,
    'next/link': ({ children, ...props }: { children: React.ReactNode }) => React.createElement('a', props, children),
    '@/data/japaneseLevels': levels, '@/data/japaneseReadingSupport': supports,
    '@/data/japaneseReadingEnhancements': enhancements, '@/utils/japaneseReadingHighlight': highlights,
    '@/data/japaneseChunkLessons': chunkData, './JapaneseChunkPractice': () => null,
    '@/utils/japaneseLevelJourney': journeys, './ReadingLessonEnhancements': extraComponents,
    './useLearningAudio': { useLearningAudio: () => ({ playing: false, audioError: '', stop() {}, play() {} }) },
  }).default;
  const render = () => {
    hook = 0;
    return Reading({ lesson, level: getReadingLessonLevel(lesson.id), journey, reviewOnly, update: async (change: (state: journeys.LevelJourney) => journeys.LevelJourney) => { journey = change(journey); return journey; } });
  };
  const elements = (node: React.ReactNode): Element[] => {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  };
  const click = (label: string) => {
    const element = elements(render()).find(node => node.type === 'button' && node.props.children === label);
    assert.ok(element, `Button missing: ${label}`);
    assert.ok(!element.props.disabled, `Button disabled: ${label}`);
    return (element.props.onClick as () => void | Promise<void>)();
  };
  return { html: () => renderToStaticMarkup(render()), click, journey: () => journey };
}

test('actual lesson React markup gates evidence and optional comparison until answers; preserves saved schema and replay', async () => {
  for (const lesson of JAPANESE_READING_LESSONS) {
    const flow = harness(lesson);
    const value = enhancements.getReadingEnhancement(lesson)!;
    assert.doesNotMatch(flow.html(), /본문 정답 근거|같은 표현, 다른 상황 · 선택해서 열기/);
    await flow.click('확인 문제 시작');
    for (const [index, question] of lesson.questions.entries()) {
      const before = flow.html();
      assert.doesNotMatch(before, /본문 정답 근거|근거: 이번 문제의 새 상황|내 선택:|정답:|같은 표현, 다른 상황 · 선택해서 열기/);
      assert.ok(!before.includes(question.explanation));
      await flow.click(question.choices[index === 0 ? (question.answer + 1) % 3 : question.answer]);
      const after = flow.html();
      assert.match(after, /내 선택:.*정답:/);
      assert.ok(after.includes(question.explanation));
      assert.match(after, index < 4 ? /본문 정답 근거/ : /근거: 이번 문제의 새 상황/);
      await flow.click(index === 5 ? '표현을 비교하며 자기점검' : '다음 문제');
    }
    const comparison = flow.html();
    assert.ok(comparison.includes(value.pair.parallelSentence));
    assert.doesNotMatch(comparison, /<details[^>]*\bopen|<input[^>]*type="text"|<textarea/);
    assert.equal(flow.journey().selectedLevel, 'beginner');
    assert.equal(Object.keys(flow.journey().answers).length, 6);
    assert.deepEqual(Object.keys(flow.journey()).sort(), ['answers', 'practicedUnits', 'selectedLevel', 'version']);
    await flow.click('설명부터 다시 보기');
    assert.doesNotMatch(flow.html(), /같은 표현, 다른 상황 · 선택해서 열기/);
  }
});

test('actual due queue shows its own count and finishes without comparison or changing selected level', async () => {
  const lesson = JAPANESE_READING_EXPANSION[0], question = lesson.questions[4];
  const state = journeys.rememberUpperAnswer(journeys.emptyLevelJourney(), {
    lessonId: lesson.id, questionId: question.id, attemptId: 'synthetic-old', correct: false, neededHelp: false,
  }, new Date('2020-01-01T00:00:00Z'));
  const flow = harness(lesson, true, state);
  assert.match(flow.html(), /예정 복습 1\/1 · 새 상황/);
  await flow.click(question.choices[question.answer]);
  assert.match(flow.html(), /예정 복습 1\/1 · 새 상황/);
  await flow.click('복습 마치기');
  assert.match(flow.html(), /현재: 마침/);
  assert.doesNotMatch(flow.html(), /같은 표현, 다른 상황 · 선택해서 열기/);
  assert.equal(flow.journey().selectedLevel, 'beginner');
  await flow.click('같은 문제 더 반복하기');
  assert.doesNotMatch(flow.html(), /내 선택:|근거: 이번 문제의 새 상황/);
});
