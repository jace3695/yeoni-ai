import assert from 'node:assert/strict';
import test from 'node:test';
import { BEGINNER_ORDER } from '../../data/grammarBeginnerGuide.ts';
import { BRIDGE_ORDER, GUIDED_GRAMMAR_ORDER, GRAMMAR_STAGE_ORDER, isGuidedGrammarStage } from '../../data/grammarStages.ts';

test('다음 단계가 기존 첫걸음 순서나 が 기록 ID를 재해석하지 않는다', () => {
  assert.deepEqual(BEGINNER_ORDER, ['desu', 'wa', 'desu-question', 'desu-negative', 'kore-sore-are', 'koko-soko-asoko', 'i-adjective', 'na-adjective', 'masu', 'wo', 'ni', 'de']);
  assert.deepEqual(BRIDGE_ORDER, ['no-particle', 'mo-particle', 'nan', 'doko', 'masen', 'mashita', 'ga-suki']);
  assert.ok(!BRIDGE_ORDER.includes('ga-particle'));
  assert.equal(new Set(GUIDED_GRAMMAR_ORDER).size, 25);
  assert.deepEqual(GRAMMAR_STAGE_ORDER.foundation, BEGINNER_ORDER);
  assert.deepEqual(GRAMMAR_STAGE_ORDER.bridge, BRIDGE_ORDER);
});

test('단계 레지스트리는 참고 분류와 알 수 없는 키를 안내형 단계로 취급하지 않는다', () => {
  assert.equal(isGuidedGrammarStage('foundation'), true);
  assert.equal(isGuidedGrammarStage('bridge'), true);
  for (const value of ['basic', 'beginner', 'consolidation', '__proto__', 'toString', 'unknown']) assert.equal(isGuidedGrammarStage(value), false);
});
