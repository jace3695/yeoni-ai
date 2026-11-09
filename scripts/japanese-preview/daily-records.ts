import { qaLocalStorage, seedSyntheticOwner } from './runtime.ts';

/** Reads only three fixed keys from the disposable fixture, never browser storage. */
export function readDailyRecordProbe() {
  return {
    routine: qaLocalStorage.getItem('dailyRoutineProgress'),
    history: qaLocalStorage.getItem('dailyLearningHistory'),
    recoveryPending: qaLocalStorage.getItem('language-storage-transaction-v1') !== null,
  };
}

/** A separate explicit scenario; existing curriculum/chunk seeds are unchanged. */
export function seedDailyReviewScenario() {
  qaLocalStorage.resetFailure();
  qaLocalStorage.clear();
  seedSyntheticOwner();
  qaLocalStorage.setItem('savedWords', JSON.stringify([
    { word: '水', meaning: '물', example: '水を飲みます。', category: '일상' },
    { word: '本', meaning: '책', example: '本を読みます。', category: '일상' },
    { word: '猫', meaning: '고양이', example: '猫がいます。', category: '일상' },
  ]));
}
