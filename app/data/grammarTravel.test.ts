import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { GRAMMAR_LESSONS } from '../../data/grammar.ts';

// Exact existing lesson objects from reviewed inspection baseline9851dc8.
test('여행 단계 추가가 기존45개 자료의 ID·목표·퀴즈를 바꾸지 않는다', () => {
  const existing = GRAMMAR_LESSONS.slice(0,45);
  assert.equal(existing.length,45);
  assert.equal(createHash('sha256').update(JSON.stringify(existing)).digest('hex'),'dcfa4df3e97d6598dc75558f96a4a119ac6a79eddbc5a13c9b0a1dbe35d1790f');
});

import { GRAMMAR_TRAVEL, TRAVEL_TIME_NINE, TRAVEL_PRICE_HUNDRED, TRAVEL_THREE_ORANGES, TRAVEL_TWO_APPLES } from '../../data/grammarTravel.ts';
import { TRAVEL_ORDER, GUIDED_GRAMMAR_ORDER } from '../../data/grammarStages.ts';
import { GRAMMAR_WRITING_PRACTICE, GRAMMAR_WRITING_ALTERNATES, normalizeGrammarInput } from '../../data/grammarWritingPractice.ts';
import { TRAVEL_CONSOLIDATION } from '../../data/grammarTravelConsolidation.ts';

test('여행6 목표는 고유 ID와 12개 직접 구성·읽기·예문을 갖추고 요청 뒤에 수량을 배운다', () => {
  assert.equal(GRAMMAR_LESSONS.length,51);
  assert.equal(new Set(GRAMMAR_LESSONS.map(item=>item.id)).size,51);
  assert.equal(GUIDED_GRAMMAR_ORDER.length,25);
  assert.deepEqual(GRAMMAR_TRAVEL.map(item=>item.lesson.id),TRAVEL_ORDER);
  assert.ok(TRAVEL_ORDER.indexOf('noun-kudasai') < TRAVEL_ORDER.indexOf('quantity-hitotsu'));
  for (const {lesson,guide,practice,alternate} of GRAMMAR_TRAVEL) {
    assert.ok(guide.goal && guide.worked && guide.hint && guide.steps.length>=2);
    assert.equal(lesson.examples.length,2);
    for(const example of lesson.examples)assert.ok(example.japanese && example.reading && example.meaning);
    assert.ok(lesson.quiz.choices.some(item=>(typeof item==='string'?item:item.text)===lesson.quiz.answer));
    assert.equal(GRAMMAR_WRITING_PRACTICE[lesson.id],practice);
    assert.equal(GRAMMAR_WRITING_ALTERNATES[lesson.id],alternate);
    assert.notEqual(practice.result,alternate.result);
    for (const task of [practice,alternate]) {
      assert.ok(task.context && task.words && task.prompt && task.reading && task.reason);
      assert.ok(task.answers.some(answer=>task.before+answer+task.after===task.result),lesson.id);
      assert.equal(new Set(task.answers).size,task.answers.length);
      for(const answer of task.answers)assert.equal(normalizeGrammarInput(answer,task.sentenceInput,task.questionInput),answer);
    }
  }
});

test('정각·가격·과일의 유한 답안 조합과 표준 읽기를 검사한다', () => {
  assert.equal(TRAVEL_TIME_NINE.length,30);
  for(const now of ['今','いま'])for(const comma of ['','、',','])for(const hour of ['9時','九時','くじ','9じ','九じ'])assert.ok(TRAVEL_TIME_NINE.includes(now+comma+hour+'です'));
  assert.equal(TRAVEL_PRICE_HUNDRED.length,6);
  for(const price of ['100円','百円','ひゃくえん','100えん','百えん','ひゃく円'])assert.ok(TRAVEL_PRICE_HUNDRED.includes(price+'です'));
  for(const [fruitForms,countForms,answers] of [[['みかん','ミカン','蜜柑'],['三つ','3つ','みっつ'],TRAVEL_THREE_ORANGES],[['りんご','リンゴ','林檎'],['二つ','2つ','ふたつ'],TRAVEL_TWO_APPLES]] as const) {
    assert.equal(answers.length,9);
    for(const fruit of fruitForms)for(const count of countForms)assert.ok(answers.includes(fruit+'を'+count+'ください'));
  }
  assert.equal(GRAMMAR_WRITING_PRACTICE['time-on-hour'].reading,'いま、よじです。');
  assert.equal(GRAMMAR_WRITING_ALTERNATES['time-on-hour'].reading,'いま、くじです。');
  assert.equal(GRAMMAR_WRITING_ALTERNATES['price-yen'].reading,'ひゃくえんです。');
  assert.equal(GRAMMAR_WRITING_ALTERNATES['quantity-hitotsu'].reading,'みかんをみっつください。');
});

test('숫자 폭·쉼표는 제한적으로 허용하고 단위중복·금액변경·작은っ누락·질문전환은 정답이 아니다', () => {
  const answer=(id:string,value:string)=>GRAMMAR_WRITING_ALTERNATES[id].answers.includes(normalizeGrammarInput(value,true));
  assert.ok(GRAMMAR_WRITING_PRACTICE['time-on-hour'].answers.includes(normalizeGrammarInput('４時')));
  assert.ok(answer('time-on-hour','今，９時です。'));
  assert.ok(answer('price-yen','１００円です。'));
  assert.ok(answer('quantity-hitotsu','ミカンを３つください。'));
  for(const value of ['今、9時時です','今、4時です','今、きゅうじです','今、9時です？'])assert.ok(!answer('time-on-hour',value));
  for(const value of ['100です','1000円です','100円です？','<b>100円です</b>'])assert.ok(!answer('price-yen',value));
  for(const value of ['みかんをみつください','みかんを三個ください','みかんを三つください？'])assert.ok(!answer('quantity-hitotsu',value));
  const question=TRAVEL_CONSOLIDATION.shopPrice;
  assert.ok(question.answers.includes(normalizeGrammarInput('これはいくらですか？',question.sentenceInput,question.questionInput)));
  assert.ok(!question.answers.includes(normalizeGrammarInput('これはいくらです？',question.sentenceInput,question.questionInput)));
  assert.equal(Object.keys(TRAVEL_CONSOLIDATION).length,4);
});
