// Server-rendered markup regression only. This cannot replace browser interaction QA.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from '../browser-qa/node_modules/esbuild/lib/main.js';
import { JAPANESE_READING_LESSONS, getReadingLessonLevel } from '../../data/japaneseReadingLessons.ts';
const root = process.cwd();
const output = resolve(process.env.READING_STATIC_OUTPUT || '../evidence/reading-static');
mkdirSync(output, { recursive: true });
const result = await build({
  stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import Reading from './components/language/UpperReadingLesson'; import Workspace from './components/language/LevelLearningWorkspace'; export const renderReading=(props)=>renderToStaticMarkup(React.createElement(Reading,props)); export const renderWorkspace=(props)=>renderToStaticMarkup(React.createElement(Workspace,props));`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, outfile: resolve(output, 'render-bundle.cjs'), platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty', '.module.css': 'empty' },
  plugins: [{ name: 'static-fixture-boundaries', setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'static-fixture' }));
    builder.onResolve({ filter: /\/useLearningAudio$|^\.\/useLearningAudio$/ }, () => ({ path: 'audio', namespace: 'static-fixture' }));
    builder.onResolve({ filter: /\/useLevelJourney$|^\.\/useLevelJourney$/ }, () => ({ path: 'journey', namespace: 'static-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'static-fixture' }, args => ({ contents: args.path === 'link' ? 'export default function Link({children,...props}) {return <a {...props}>{children}</a>}' : args.path === 'audio' ? 'export const useLearningAudio=()=>({playing:false,audioError:"",stop(){},play(){}});' : 'export const useLevelJourney=()=>({state:{owner:"synthetic",value:{version:1,selectedLevel:"beginner",answers:{},practicedUnits:{}}},update(){},reload(){}});', loader: 'jsx', resolveDir: root }));
  } }],
});
const bundle = resolve(output, 'render-bundle.cjs'); writeFileSync(bundle, result.outputFiles[0].text);
const { renderReading, renderWorkspace } = createRequire(import.meta.url)(bundle);
const base = { version: 1, selectedLevel: 'beginner', answers: {}, practicedUnits: {} };
for (const lesson of JAPANESE_READING_LESSONS) {
  const props = { lesson, level: getReadingLessonLevel(lesson.id), journey: base, update() {}, reviewOnly: false };
  const reading = renderReading(props);
  assert.ok(reading.includes('읽기 목적과 준비'));
  assert.match(reading, /aria-current="step">현재: 읽기/);
  assert.doesNotMatch(reading, /본문 정답 근거|같은 표현, 다른 상황 · 선택해서 열기/);
  assert.ok(reading.includes(`/language/levels?level=${props.level}`));
  assert.doesNotMatch(reading, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.doesNotMatch(reading, /<mark\b|<textarea\b|type="text"/);
  for (const index of [0, 4]) {
    const question = lesson.questions[index];
    const journey = { ...base, answers: { [question.id]: { lessonId: lesson.id, questionId: question.id, correct: false, nextReviewAt: '2020-01-01T00:00:00Z' } } };
    const questionMarkup = renderReading({ ...props, journey, reviewOnly: true });
    assert.ok(questionMarkup.includes(index === 0 ? '본문 확인' : '새 상황 적용'));
    assert.ok(questionMarkup.includes(index === 0 ? '현재: 예정 복습 1/1 · 본문 확인' : '현재: 예정 복습 1/1 · 새 상황'));
    assert.doesNotMatch(questionMarkup, /본문 정답 근거|근거: 이번 문제의 새 상황|같은 표현, 다른 상황 · 선택해서 열기|단원 학습 흐름/);
    assert.doesNotMatch(questionMarkup, /정답:|이 답을 복습 기록에 저장했어요/);
    assert.ok(!questionMarkup.includes(question.explanation), question.id);
    assert.match(questionMarkup, /<h2 tabindex="-1">/);
  }
  const empty = renderReading({ ...props, reviewOnly: true });
  assert.ok(empty.includes('지금 예정된 복습은 없어요'));
  assert.ok(empty.includes(`/language/levels?level=${props.level}`));
}
for (const [level, count] of [['intermediate', 8], ['advanced', 12]]) {
  const workspace = renderWorkspace({ requestedLevel: level });
  assert.equal((workspace.match(/href="\/language\/levels\?lesson=/g) || []).length, count);
  assert.ok(workspace.includes('내가 선택한 단계: <strong>초급</strong>'));
  assert.ok(workspace.includes('전체 단계 예정 복습'));
}
writeFileSync(resolve(output, 'result.json'), JSON.stringify({ passed: true, units: 20, beforeAnswerScreens: 40, levelLists: 2, scope: 'Real React components rendered to static HTML with synthetic journey/audio boundaries. No browser interaction, focus movement, layout, storage, cloud or speech validation.' }, null, 2));
console.log('Static React markup: 20 reading/empty screens, 40 before-answer screens and 2 level lists passed. Not browser QA.');
