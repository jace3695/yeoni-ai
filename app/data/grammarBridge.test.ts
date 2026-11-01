import assert from 'node:assert/strict';
import test from 'node:test';
import { GRAMMAR_LESSONS } from '../../data/grammar.ts';
import { EXPANDED_GRAMMAR_LESSONS } from '../../data/grammarExpansion.ts';
import { GRAMMAR_BRIDGE } from '../../data/grammarBridge.ts';
import { BRIDGE_ORDER } from '../../data/grammarStages.ts';
import { GRAMMAR_WRITING_PRACTICE, GRAMMAR_WRITING_ALTERNATES, normalizeGrammarInput } from '../../data/grammarWritingPractice.ts';
import { CONSOLIDATION_PRACTICES } from '../../data/grammarConsolidation.ts';

test('연결 과정은 기존6 ID를 보강하고 が好き ID만 추가하며 원래 が 자료를 보존한다', () => {
  assert.equal(GRAMMAR_LESSONS.length, 45);
  assert.equal(new Set(GRAMMAR_LESSONS.map(item => item.id)).size, 45);
  assert.deepEqual(GRAMMAR_LESSONS.find(item => item.id === 'ga-particle'), EXPANDED_GRAMMAR_LESSONS.find(item => item.id === 'ga-particle'));
  assert.deepEqual(GRAMMAR_BRIDGE.map(item => item.lesson.id), BRIDGE_ORDER);
  for (const { lesson, guide, practice, alternate } of GRAMMAR_BRIDGE) {
    assert.ok(guide.goal && guide.worked && guide.hint && guide.steps.length >= 2, lesson.id);
    assert.equal(lesson.examples.length, 2);
    for (const example of lesson.examples) assert.ok(example.japanese && example.reading && example.meaning);
    assert.ok(lesson.quiz.choices.some(choice => (typeof choice === 'string' ? choice : choice.text) === lesson.quiz.answer));
    assert.equal(GRAMMAR_WRITING_PRACTICE[lesson.id], practice);
    assert.equal(GRAMMAR_WRITING_ALTERNATES[lesson.id], alternate);
    assert.notEqual(practice.result, alternate.result);
    for (const task of [practice, alternate]) {
      assert.ok(task.words && task.context && task.prompt && task.reason && task.reading);
      assert.ok(task.answers.some(answer => task.before + answer + task.after === task.result), lesson.id);
      assert.equal(new Set(task.answers).size, task.answers.length);
    }
  }
});

test('문장 끝 부호만 지정 범위에서 허용하고 의미 글자·내부 공백은 삭제하지 않는다', () => {
  const sentence = GRAMMAR_WRITING_ALTERNATES.nan;
  for (const answer of ['それは何ですか', 'それは何ですか。', ' それは何ですか？　']) {
    assert.ok(sentence.answers.includes(normalizeGrammarInput(answer, sentence.sentenceInput, sentence.questionInput)));
  }
  for (const answer of ['それは何です', 'それは何ですか。。', 'それ は何ですか', 'それはどこですか']) {
    assert.ok(!sentence.answers.includes(normalizeGrammarInput(answer, sentence.sentenceInput, sentence.questionInput)));
  }
  assert.equal(normalizeGrammarInput('が。'), 'が。');
  assert.equal(normalizeGrammarInput('これも本です？',true),'これも本です?');
  assert.ok(!GRAMMAR_WRITING_ALTERNATES['mo-particle'].answers.includes(normalizeGrammarInput('これも本です？',true)));
  assert.ok(!CONSOLIDATION_PRACTICES.plan.answers.includes(normalizeGrammarInput('今日は会社に行きません？',true)));
  assert.ok(!GRAMMAR_WRITING_PRACTICE['ga-suki'].answers.includes('を'));
  assert.ok(!GRAMMAR_WRITING_PRACTICE.masen.answers.includes('行くません'));
  assert.ok(!GRAMMAR_WRITING_PRACTICE.mashita.answers.includes('行きません'));
});

test('한자·가나 허용 형태와 종합 연습의 목적지 대안을 결과 읽기와 연결한다', () => {
  assert.ok(GRAMMAR_WRITING_ALTERNATES['no-particle'].answers.includes('かいしゃの資料'));
  assert.ok(GRAMMAR_WRITING_ALTERNATES['ga-suki'].answers.includes('にほんごが好きです'));
  for (const task of [CONSOLIDATION_PRACTICES.past, CONSOLIDATION_PRACTICES.plan]) {
    assert.ok(task.answers.some(answer => answer.includes('へ')));
    assert.ok(task.answers.some(answer => answer.includes('に')));
    for (const answer of task.answers) {
      const reading = task.answerReadings?.[answer];
      assert.ok(reading);
      assert.equal(reading.includes('へ'), answer.includes('へ'));
    }
  }
  assert.ok(!CONSOLIDATION_PRACTICES.past.answers.includes('昨日、京都に行きません'));
  assert.ok(!CONSOLIDATION_PRACTICES.plan.answers.includes('今日は会社に行きました'));
});
