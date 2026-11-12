import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRICULUM } from '../data/curriculum.ts';
import { getQuestionChoices } from '../utils/learningSession.ts';

test('every curriculum question offers three distinct choices and one answer in both modes', () => {
  for (const lesson of CURRICULUM) for (const [index, quiz] of lesson.quiz.entries()) {
    for (const mode of ['starter', 'reader'] as const) {
      const choices = getQuestionChoices(lesson, index, mode);
      const context = `${lesson.id}:${index}:${mode}`;
      assert.equal(choices.length, 3, context);
      assert.equal(new Set(choices.map(choice => choice.label.normalize('NFKC').trim())).size, 3, context);
      assert.equal(choices.filter(choice => choice.correct).length, 1, context);
      assert.equal(choices.find(choice => choice.correct)?.label, quiz.choices[quiz.answer], context);
    }
  }
});

test('t19 listening distinguishes duration from price without changing its spoken answer or saved index', () => {
  const lesson = CURRICULUM.find(lesson => lesson.id === 't19')!;
  const quiz = lesson.quiz[0];
  assert.equal(quiz.kind, 'listening');
  assert.equal(quiz.answer, 0);
  assert.equal(quiz.choices[quiz.answer], '韓国まで何日かかりますか。');
  assert.equal(lesson.pattern.example, quiz.choices[quiz.answer]);
  assert.equal(lesson.speak, quiz.choices[quiz.answer]);
  assert.equal(quiz.choices[1], '韓国までいくらかかりますか。');
  assert.equal(quiz.explanation, '한국까지 며칠 걸리나요?');
  for (const mode of ['starter', 'reader'] as const) {
    const choices = getQuestionChoices(lesson, 0, mode);
    assert.equal(choices.find(choice => choice.label.includes('何日'))?.correct, true);
    assert.equal(choices.find(choice => choice.label.includes('いくら'))?.correct, false);
  }
});

test('w12 asks for an explicit burden acknowledgment rather than marking a polite request as impolite', () => {
  const quiz = CURRICULUM.find(lesson => lesson.id === 'w12')!.quiz[0];
  assert.match(quiz.prompt, /상대의 수고를 배려하는 말을 덧붙여/);
  assert.equal(quiz.answer, 1);
  assert.deepEqual(quiz.choices, ['確認してください。', 'お手数ですが、ご確認をお願いいたします。', '確認しません。']);
  assert.match(quiz.explanation, /確認してください도 공손한 확인 요청/);
  assert.match(quiz.explanation, /お手数ですが/);
});
