import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PreviewMemoryStorage } from '../scripts/japanese-preview/memory-storage.ts';
import { readDailyRecordProbe, seedDailyReviewScenario } from '../scripts/japanese-preview/daily-records.ts';
import { qaLocalStorage, SYNTHETIC_OWNER } from '../scripts/japanese-preview/runtime.ts';

test('history-specific failure leaves unrelated writes alone and is consumed once before retry or rollback', () => {
  const store = new PreviewMemoryStorage();
  store.setItem('dailyLearningHistory', 'old history');
  store.failNextHistoryWrite();
  store.setItem('grammarProgress', 'answer');
  store.setItem('language-storage-transaction-v1', 'journal');
  store.setItem('dailyRoutineProgress', 'new daily');
  assert.throws(() => store.setItem('dailyLearningHistory', 'new history'), /학습 이력 저장 실패/);
  assert.equal(store.getItem('dailyLearningHistory'), 'old history');
  assert.equal(store.getItem('grammarProgress'), 'answer');
  store.setItem('dailyLearningHistory', 'restored or retried');
  assert.equal(store.getItem('dailyLearningHistory'), 'restored or retried');
  store.failNextHistoryWrite(); store.resetFailure();
  assert.doesNotThrow(() => store.setItem('dailyLearningHistory', 'reset failure'));
});

test('ordinary next-write injection remains independent and cannot consume a later fixed-key failure', () => {
  const store = new PreviewMemoryStorage();
  store.failNextHistoryWrite(); store.failNextWrite();
  assert.throws(() => store.setItem('grammarProgress', 'answer'), /가상 저장 실패/);
  assert.equal(store.getItem('grammarProgress'), null);
  assert.throws(() => store.setItem('dailyLearningHistory', 'history'), /학습 이력 저장 실패/);
  assert.doesNotThrow(() => store.setItem('dailyLearningHistory', 'retry'));
});

test('visible probe reads fixed memory keys without writing or parsing away damaged original bytes', () => {
  qaLocalStorage.resetFailure(); qaLocalStorage.clear();
  qaLocalStorage.setItem('dailyRoutineProgress', '{"date":"2026-11-09","completedIds":["grammar"]}');
  qaLocalStorage.setItem('dailyLearningHistory', '{damaged synthetic history');
  qaLocalStorage.setItem('language-storage-transaction-v1', '{synthetic journal');
  qaLocalStorage.setItem('unrelated', 'preserve');
  const before = Array.from({ length: qaLocalStorage.length }, (_, index) => {
    const key = qaLocalStorage.key(index)!; return [key, qaLocalStorage.getItem(key)];
  });
  const snapshot = readDailyRecordProbe();
  assert.deepEqual(snapshot, { routine: before[0][1], history: '{damaged synthetic history', recoveryPending: true });
  assert.equal(qaLocalStorage.length, before.length);
  for (const [key, value] of before) assert.equal(qaLocalStorage.getItem(key!), value);
  qaLocalStorage.removeItem('language-storage-transaction-v1');
  assert.equal(readDailyRecordProbe().recoveryPending, false);
});

test('explicit review seed supplies only three fixed synthetic words and changes the fixture epoch', () => {
  seedDailyReviewScenario();
  const epoch = qaLocalStorage.getItem('language-cloud-sync-epoch');
  assert.equal(qaLocalStorage.getItem('language-cloud-sync-user'), SYNTHETIC_OWNER);
  assert.equal(qaLocalStorage.getItem('fitness-cloud-sync-user'), SYNTHETIC_OWNER);
  assert.deepEqual(JSON.parse(qaLocalStorage.getItem('savedWords')!).map((item: { word: string }) => item.word), ['水', '本', '猫']);
  assert.deepEqual(readDailyRecordProbe(), { routine: null, history: null, recoveryPending: false });
  qaLocalStorage.failNextHistoryWrite();
  seedDailyReviewScenario();
  assert.notEqual(qaLocalStorage.getItem('language-cloud-sync-epoch'), epoch);
  assert.equal(qaLocalStorage.length, 5);
  assert.doesNotThrow(() => qaLocalStorage.setItem('dailyLearningHistory', 'synthetic'));
});

test('daily controls are visibly memory-only, fixed-target and distinguish product/account history from the probe', () => {
  const source = readFileSync(new URL('../scripts/japanese-preview/DailyRecordProbe.tsx', import.meta.url), 'utf8');
  const records = readFileSync(new URL('../scripts/japanese-preview/daily-records.ts', import.meta.url), 'utf8');
  assert.match(source, /실제 홈·캘린더·계정 기록·클라우드 동기화 검증은 아니에요/);
  assert.match(source, /qaLocalStorage\.failNextHistoryWrite\(\)/);
  assert.match(source, /가상 일일 기록 다시 읽기/);
  assert.match(source, /가상 기록 초기화·복습 단어 3개 준비/);
  for (const text of [source, records]) assert.doesNotMatch(text, /\bfetch\(|\blocalStorage\b|\bsessionStorage\b|\.getUser\(|supabase|https?:\/\//);
  assert.deepEqual([...records.matchAll(/qaLocalStorage\.getItem\('([^']+)'\)/g)].map(match => match[1]), ['dailyRoutineProgress', 'dailyLearningHistory', 'language-storage-transaction-v1']);
});
