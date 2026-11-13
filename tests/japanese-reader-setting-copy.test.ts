import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Japanese reader setting does not promise the removed typing mode', () => {
  const settings = readFileSync(new URL('../app/language/settings/page.tsx', import.meta.url), 'utf8');
  assert.match(settings, /<option value="reader">글자를 읽어요 · 선택형으로 연습<\/option>/);
  assert.doesNotMatch(settings, /20분 학습에 직접 입력 포함/);
  assert.match(settings, /learnerMode: event.target.value/);
});
