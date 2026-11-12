// Real React static rendering with synthetic props. This is NOT browser QA.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from '../browser-qa/node_modules/esbuild/lib/main.js';
import { CURRICULUM } from '../../data/curriculum.ts';
import { getQuestionChoices } from '../../utils/learningSession.ts';

const output = resolve(process.env.TYPING_STATIC_OUTPUT || '../evidence/typing-static');
mkdirSync(output, { recursive: true });
const bundle = resolve(output, 'render-bundle.cjs');
const result = await build({
  stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import Question from './components/language/LearningQuestion'; export const renderQuestion=(props)=>renderToStaticMarkup(React.createElement(Question,props));`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, outfile: bundle, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty', '.module.css': 'empty' },
});
writeFileSync(bundle, result.outputFiles[0].text);
const { renderQuestion } = createRequire(import.meta.url)(bundle);
const escape = (value) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[character]));
const base = { onAnswer() {}, onRetry() {}, onHint() {}, play() {}, playing: false, showCompanion: false };
let totalScreens = 0;
let inputScreens = 0;
let legacyAnswerScreens = 0;

for (const lesson of CURRICULUM) for (const [index, quiz] of lesson.quiz.entries()) for (const mode of ['starter', 'reader']) {
  const choices = getQuestionChoices(lesson, index, mode);
  const correct = choices.find(choice => choice.correct).label;
  const wrong = choices.find(choice => !choice.correct).label;
  for (const [state, answer, response] of [['unanswered', undefined, undefined], ['wrong', false, wrong], ['correct', true, correct]]) {
    const html = renderQuestion({ ...base, lesson, index, mode, answer, response });
    totalScreens += 1;
    assert.doesNotMatch(html, /<form\b|<input\b|<textarea\b|contenteditable=|type="submit"/);
    assert.doesNotMatch(html, /입력하세요|입력해도|써 보세요|타자|키보드/);
    const buttons = [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)];
    const answerButtons = buttons.filter(([, , label]) => choices.some(choice => label.replace(/^(?:✓ |↻ )/, '') === escape(choice.label)));
    assert.equal(answerButtons.length, choices.length, `${lesson.id}:${index}:${mode}:${state}`);
    assert.ok(answerButtons.every(([ , attributes]) => attributes.includes('type="button"')));
    if (answer === undefined) {
      assert.ok(answerButtons.every(([, attributes]) => !attributes.includes('disabled')));
      assert.ok(html.includes('힌트 볼래요'));
      assert.ok(!html.includes(escape(quiz.explanation)), 'Explanations stay hidden before answering.');
      assert.doesNotMatch(html, /role="status"|data-result=/);
    } else {
      assert.ok(answerButtons.every(([, attributes]) => attributes.includes('disabled')));
      assert.equal(answerButtons.filter(([, attributes]) => attributes.includes(`data-result="${answer ? 'correct' : 'wrong'}"`)).length, 1);
      assert.ok(html.includes(`내 답: ${escape(response)}`));
      assert.ok(html.includes(escape(quiz.explanation)));
      assert.match(html, /role="status"/);
      assert.equal(html.includes('다시 풀어볼래요'), !answer);
    }
    if (quiz.kind === 'input') {
      inputScreens += 1;
      assert.match(html, /에 맞는 일본어를 골라요\./);
      assert.equal(answerButtons.length, 3);
      if (lesson.id === 'f02' && index === 5 && mode === 'reader') writeFileSync(resolve(output, `reader-name-${state}.html`), html);
    }
  }
  if (quiz.kind === 'input' && mode === 'reader') {
    // A previously typed spelling may not equal any selectable label. It must
    // still be shown verbatim with its saved correctness, without being regraded.
    const response = ` 이전 답안 ${quiz.choices[quiz.answer]}。`;
    for (const answer of [true, false]) {
      const html = renderQuestion({ ...base, lesson, index, mode, answer, response });
      assert.ok(html.includes(`내 답: ${escape(response)}`));
      assert.ok(html.includes(`data-correct="${answer}"`));
      assert.doesNotMatch(html, /<form\b|<input\b|<textarea\b|data-result=/);
      assert.equal(html.includes('다시 풀어볼래요'), !answer);
      legacyAnswerScreens += 1;
    }
  }
}

const report = {
  passed: true, lessons: CURRICULUM.length, inputQuestions: inputScreens / 6,
  allQuestionScreens: totalScreens, inputQuestionScreens: inputScreens, historicalTypedAnswerScreens: legacyAnswerScreens,
  states: ['unanswered', 'wrong', 'correct'], modes: ['starter', 'reader'],
  scope: 'Actual LearningQuestion rendered by React DOM Server with all curriculum questions and synthetic answers. Styles are omitted. No browser clicks, keyboard/focus/scroll behavior, small-screen layout, browser persistence, authentication, cloud or audio validation.',
};
writeFileSync(resolve(output, 'result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
