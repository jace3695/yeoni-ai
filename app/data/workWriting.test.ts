import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { GRAMMAR_LESSONS } from '../../data/grammar.ts';
import { GUIDED_GRAMMAR_ORDER } from '../../data/grammarStages.ts';

test('업무 응용 연습은 기존51개 문법 자료·25개 안내형의 의미와 기록 키를 보존한다', () => {
  assert.equal(GRAMMAR_LESSONS.length, 51);
  assert.equal(GUIDED_GRAMMAR_ORDER.length, 25);
  assert.equal(createHash('sha256').update(JSON.stringify(GRAMMAR_LESSONS)).digest('hex'), '05d510e421734a7f3f6e27abf8ae5a36f54faf26f71eb707b2ed334f7312aa9a');
});

import { WORK_WRITING_UNITS, WORK_MESSAGE } from '../../data/workWriting.ts';
import { normalizeGrammarInput } from '../../data/grammarWritingPractice.ts';
const tasks = WORK_WRITING_UNITS.flatMap(unit => unit.tasks);
const accepted = (id: string, text: string) => {
  const task = tasks.find(item => item.id === id)!;
  return task.answers.includes(normalizeGrammarInput(text, task.sentenceInput, task.questionInput));
};
test('업무 응용은5개10입력과 별도 통합읽기1개이며 유한48표기를 사용한다', () => {
  assert.deepEqual(WORK_WRITING_UNITS.map(unit => unit.id), ['work-status-current','work-status-completed','work-meeting-time','work-colleague-request','work-subject-reading']);
  assert.equal(tasks.length,10); assert.equal(new Set(tasks.map(task=>task.id)).size,10);
  assert.equal(tasks.reduce((count,task)=>count+task.answers.length,0),48);
  assert.equal(WORK_MESSAGE.id,'work-message-integration-01');
  for (const unit of WORK_WRITING_UNITS) {
    assert.equal(unit.tasks.length,2); assert.ok(unit.explanation && unit.selfCheck);
    for (const id of unit.prerequisites) assert.ok(GUIDED_GRAMMAR_ORDER.includes(id));
    for (const task of unit.tasks) {
      assert.ok(task.context && task.words && task.prompt && task.reading && task.meaning && task.reason);
      assert.equal(new Set(task.answers).size,task.answers.length);
      assert.ok(task.answers.some(answer=>task.before+answer+task.after===task.result));
      for (const answer of task.answers) {
        assert.equal(normalizeGrammarInput(answer,task.sentenceInput,task.questionInput),answer);
        assert.ok(accepted(task.id,answer));
        assert.ok(accepted(task.id,answer.normalize('NFKC')));
      }
    }
  }
});
test('문장·질문·명사구의 문장부호 규칙을 구분하고 내부공백·임의입력을 제거하지 않는다', () => {
  for (const task of tasks) {
    const answer=task.answers[0];
    assert.ok(accepted(task.id,' '+answer+' '));
    assert.equal(accepted(task.id,answer+'。'),Boolean(task.sentenceInput));
    for(const mark of ['?','？']) assert.equal(accepted(task.id,answer+mark),Boolean(task.questionInput));
    for(const value of [answer+'。。',answer+'!?','<b>'+answer+'</b>',answer.slice(0,1)+' '+answer.slice(1),'arbitrary']) assert.ok(!accepted(task.id,value));
  }
  assert.ok(!accepted('work-meeting-time-b','会議は9時です？'));
});
test('확인 예정·진행·완료는 구별하고9시 표기와読み를 한정한다', () => {
  assert.ok(!accepted('work-status-current-a','確認しました'));
  assert.ok(!accepted('work-status-current-b','確認しました'));
  assert.ok(!accepted('work-status-completed-a','確認中です'));
  for(const meeting of ['会議','かいぎ'])for(const hour of ['9時','九時','くじ','9じ','九じ','９時','９じ'])assert.ok(accepted('work-meeting-time-a',meeting+'は'+hour+'です'));
  for(const value of ['会議はく時です','会議はきゅうじです','会議は4時です','会議は9時時です'])assert.ok(!accepted('work-meeting-time-a',value));
  assert.equal(tasks.find(task=>task.id==='work-meeting-time-a')!.reading,'かいぎはくじです。');
  assert.ok(!accepted('work-colleague-request-a','確認をください'));
  assert.ok(!accepted('work-subject-reading-b','会議の時間です'));
});
