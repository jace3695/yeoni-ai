import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('retired typing route leaves stored drafts untouched and mounts only the exit notice', () => {
  const source = readFileSync(new URL('../app/growth/typing/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /RetiredPractice/);
  assert.doesNotMatch(source, /localStorage|removeItem|useGrowthData|DrawingCanvas|Typing/);
});
