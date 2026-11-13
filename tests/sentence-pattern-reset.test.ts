import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

function classifier() {
  const source = readFileSync('data/sentences.ts', 'utf8');
  const fn = source.slice(source.indexOf('const normalizeSentencePattern'), source.indexOf('const KANJI_REGEX'));
  return vm.runInNewContext(ts.transpile(fn) + '\nnormalizeSentencePattern;');
}

test('polite です never supplies the particle で; real particles and explicit metadata remain', () => {
  const classify = classifier();
  for (const japanese of ['大きいです', '小さいです', '高いです', '安いです', '暑いです', '寒いです', '安いですね。']) {
    assert.equal(classify({ japanese, category: '일상' }), 'desu', japanese);
  }
  for (const [japanese, expected] of [['店内で食べます', 'particle-de'], ['家で食事です', 'particle-de'], ['私は学生です', 'particle-wa'], ['水を飲みたいです', 'particle-wo'], ['ここに行きたいです', 'particle-ni'], ['高いですか？', 'question']]) {
    assert.equal(classify({ japanese, category: '일상' }), expected, japanese);
  }
  assert.equal(classify({ japanese: '高いです', category: '일상', pattern: 'particle_wo' }), 'particle-wo');
});

test('both show-all buttons clear in-memory filters immediately without touching saved records', () => {
  const page = readFileSync('app/language/sentences/page.tsx', 'utf8');
  assert.equal((page.match(/onClick=\{handleShowAllSentences\}/g) ?? []).length, 2);
  const handler = page.slice(page.indexOf('  const handleShowAllSentences'), page.indexOf('  const handlePatternFilterChange'));
  const state: Record<string, string> = { word: '水', pattern: 'particle-de', category: '여행', level: 'beginner', scope: 'core', url: '?word=水&pattern=particle-de' };
  const context: Record<string, unknown> = { router: { replace: (url: string) => { state.url = url; } } };
  for (const [setter, key] of [['WordFilter', 'word'], ['PatternFilter', 'pattern'], ['Category', 'category'], ['LevelFilter', 'level'], ['PracticeScope', 'scope']]) {
    context['set' + setter] = (value: string) => { state[key] = value; };
  }
  vm.runInNewContext(ts.transpile(handler) + '\nhandleShowAllSentences();', context);
  assert.deepEqual(state, { word: '', pattern: 'all', category: '전체', level: 'all', scope: 'all', url: '/language/sentences' });
  assert.doesNotMatch(handler, /localStorage|fetch\(|\.delete\(/);
});
