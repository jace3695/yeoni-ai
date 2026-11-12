import { syntheticIndexedDB } from "../../tests/fixtures/languageIndexedDB.ts";
import { syntheticLocks } from "../../tests/fixtures/chunkReviewStorage.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { CURRICULUM } from "../../data/curriculum.ts";
import { CURRICULUM_PROGRESS_KEY, loadCurriculumProgress, saveCurriculumProgress } from "../../utils/curriculumProgress.ts";
import { INTEGRATED_LEARNING_SETTINGS_KEY, loadIntegratedLearningSettings } from "../../utils/integratedLearningSettings.ts";
import { answerSessionQuestion, createLearningSession, normalizeLearningSession, withLearningSessionDraft } from "../../utils/learningSession.ts";
import { readLanguageState, applyLanguageState, prepareLanguageLocalState } from "./languageCloudSync.ts";

class MemoryStorage {
  values = new Map<string, string>();
  failWrites = false;
  events: string[] = [];
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new DOMException("Storage full", "QuotaExceededError"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

async function withStorage(run: (storage: MemoryStorage) => void | Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousIDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: syntheticIndexedDB().factory });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: syntheticLocks() } });
  const localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, dispatchEvent: (event: Event) => { localStorage.events.push(event.type); return true; } } });
  try { await run(localStorage); }
  finally {
    if (previousIDB) Object.defineProperty(globalThis, "indexedDB", previousIDB); else Reflect.deleteProperty(globalThis, "indexedDB"); if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator); else Reflect.deleteProperty(globalThis, "navigator"); if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); }
}

test("기존 학습 기록과 설정을 새 화면에서 읽어도 기록을 초기화하지 않는다", () => withStorage((storage) => {
  storage.setItem(CURRICULUM_PROGRESS_KEY, JSON.stringify({ completedLessonIds: ["f01"], selectedTrack: "work", quizScores: { f01: 75 }, activityDates: ["2026-09-05"], lessonAttempts: { f01: [{ score: 75, completedAt: "2026-09-05T09:00:00Z" }] } }));
  storage.setItem(INTEGRATED_LEARNING_SETTINGS_KEY, JSON.stringify({ dailyMinutes: 20, showMeaning: false, preferredTrack: "work" }));
  const before = storage.getItem(CURRICULUM_PROGRESS_KEY);
  assert.deepEqual(loadCurriculumProgress().completedLessonIds, ["f01"]);
  assert.equal(loadCurriculumProgress().quizScores.f01, 75);
  assert.equal(loadIntegratedLearningSettings().dailyMinutes, 20);
  assert.equal(loadIntegratedLearningSettings().showMeaning, false);
  assert.equal(loadIntegratedLearningSettings().showCompanion, true);
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), before);
}));

test("새로고침에 해당하는 재조회에서 분량·문제·첫 오답·진행 위치가 복원된다", () => withStorage(() => {
  const lesson = CURRICULUM[0];
  let draft = createLearningSession(lesson.id, 5, "starter");
  draft = { ...answerSessionQuestion(draft, 2, false, "오답"), stage: 4, quizCursor: 1 };
  saveCurriculumProgress(withLearningSessionDraft(loadCurriculumProgress(), draft));
  const restored = normalizeLearningSession(loadCurriculumProgress().lessonDrafts?.[lesson.id], lesson);
  assert.deepEqual(restored, draft);
}));

test("저장 공간 오류를 호출자에게 전달하며 기존 성공 기록은 유지한다", () => withStorage((storage) => {
  saveCurriculumProgress({ ...loadCurriculumProgress(), completedLessonIds: ["f01"] });
  const before = storage.getItem(CURRICULUM_PROGRESS_KEY);
  storage.failWrites = true;
  assert.throws(() => saveCurriculumProgress({ ...loadCurriculumProgress(), completedLessonIds: ["f01", "f02"] }), /Storage full/);
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), before);
}));

test("계정 준비 시 이전 계정의 새 수업 초안도 함께 격리한다", () => withStorage(async (storage) => {
  await prepareLanguageLocalState("test-account-a");
  saveCurriculumProgress(withLearningSessionDraft(loadCurriculumProgress(), createLearningSession("f01", 5, "starter")));
  storage.setItem("unrelated-test-key", "preserve");
  await prepareLanguageLocalState("test-account-b");
  assert.equal(loadCurriculumProgress().activeSession, undefined);
  assert.equal(storage.getItem("unrelated-test-key"), "preserve");
}));

 test("문법 수업 내용 확장 후에도 기존 ID 기록과 계정별 동기화 상태를 보존한다", () => withStorage(async (storage) => {
 await prepareLanguageLocalState('bridge-account-a');
 const records = [{lessonId:'desu',correctCount:2,wrongCount:1,lastResult:'correct'}, {lessonId:'masen',correctCount:1,wrongCount:3,lastResult:'wrong'}];
 const serialized = JSON.stringify(records);
 storage.setItem('grammarProgress', serialized);
 const snapshotA = readLanguageState();
 await prepareLanguageLocalState('bridge-account-a');
 assert.equal(storage.getItem('grammarProgress'),serialized);
 await prepareLanguageLocalState('bridge-account-b');
 assert.equal(storage.getItem('grammarProgress'),null);
 storage.setItem('grammarProgress',JSON.stringify([{lessonId:'masen',correctCount:0,wrongCount:1}]));
 const snapshotB=readLanguageState();
 await prepareLanguageLocalState('bridge-account-a');
 await applyLanguageState(snapshotA);
 assert.equal(storage.getItem('grammarProgress'),serialized);
 assert.notEqual(snapshotB.grammarProgress,snapshotA.grammarProgress);
 }));

// Corruption is not a missing record. These are synthetic stores only.
import { CurriculumProgressError, parseCurriculumProgress } from '../../utils/curriculumProgress.ts';
import { mergeLanguageState, mergeLanguageStateFromBase } from './languageCloudSync.ts';
import { mountCurriculumUi, nodeText, initializeCurriculumSync } from '../../tests/fixtures/curriculumUiHarness.ts';

const invalidProgress = [
  '', '{"completedLessonIds":["f01"],"lessonAttempts":', 'null', '[]', '7', '"old"', '{"quizScores":{"f12":1e309}}', '{"future":{"number":1e309}}',
  ...[
    { completedLessonIds: ['f01', 2] }, { quizScores: [] }, { quizScores: { f01: '75' } },
    { selectedTrack: 'unknown' }, { activityDates: [false] }, { kanaCompletedGroups: 'a' },
    { lessonAttempts: { f01: null } }, { lessonAttempts: { f01: [{ score: '75', completedAt: 'old' }] } },
    { activeSession: null }, { lessonDrafts: [] }, { lessonDrafts: { f12: { lessonId: 'f12' } } },
    { activeSession: { ...createLearningSession('f12', 10, 'starter'), answers: { 0: 'yes' } } },
    { activeSession: { ...createLearningSession('f12', 10, 'starter'), observations: { 0: { responseMs: 'slow' } } } },
  ].map(value => JSON.stringify(value)),
];

test('malformed progress stays byte-for-byte intact on reads, direct writes and ordinary cloud paths', () => withStorage(async storage => {
  for (const raw of invalidProgress) {
    storage.values.delete(CURRICULUM_PROGRESS_KEY);
    const clean = loadCurriculumProgress();
    storage.values.set(CURRICULUM_PROGRESS_KEY, raw);
    assert.throws(() => loadCurriculumProgress(), CurriculumProgressError, raw);
    assert.throws(() => saveCurriculumProgress(clean), CurriculumProgressError, raw);
    assert.throws(() => readLanguageState(), CurriculumProgressError, raw);
    const corrupt = { [CURRICULUM_PROGRESS_KEY]: raw }, valid = { [CURRICULUM_PROGRESS_KEY]: '{}' };
    for (const [remote, local] of [[corrupt, valid], [valid, corrupt]]) {
      assert.throws(() => mergeLanguageState(remote, local), CurriculumProgressError);
      assert.throws(() => mergeLanguageStateFromBase({}, remote, local), CurriculumProgressError);
    }
    assert.throws(() => mergeLanguageStateFromBase(corrupt, valid, valid), CurriculumProgressError);
    await assert.rejects(() => applyLanguageState(valid), CurriculumProgressError);
    assert.equal(storage.values.get(CURRICULUM_PROGRESS_KEY), raw);
    storage.values.set(CURRICULUM_PROGRESS_KEY, '{}');
    await assert.rejects(() => applyLanguageState(corrupt), CurriculumProgressError);
    assert.equal(storage.values.get(CURRICULUM_PROGRESS_KEY), '{}');
    assert.deepEqual(storage.events, []);
  }
}));

test('missing and historical partial records retain all histories, retired IDs and extension fields', () => withStorage(storage => {
  const missing = loadCurriculumProgress();
  assert.deepEqual(missing.completedLessonIds, []);
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), null);
  saveCurriculumProgress(withLearningSessionDraft(missing, createLearningSession('f12', 10, 'starter')));
  const lesson = CURRICULUM.find(item => item.id === 'f12')!;
  const draft = { ...createLearningSession(lesson.id, 10, 'starter'), extra: { keep: 'draft' }, responses: { 99: 'r'.repeat(600) }, answers: { 99: true }, firstAnswers: { 99: false }, observations: { 99: { responseMs: 1000, neededHelp: false, modality: 'typing' as const, extra: 'keep' } } };
  const retired = { ...createLearningSession('retired-lesson', 20, 'reader'), extra: 'retired' };
  const history = { completedLessonIds: ['retired-lesson', 'f01'], quizScores: { 'retired-lesson': 77 }, lessonAttempts: { 'retired-lesson': [{ score: 77, completedAt: 'historical-date', extra: 'attempt' }] }, activeSession: retired, lessonDrafts: { 'retired-lesson': retired, f12: draft }, extra: { keep: ['root'] } };
  storage.setItem(CURRICULUM_PROGRESS_KEY, JSON.stringify(history));
  const loaded = loadCurriculumProgress();
  const normalized = normalizeLearningSession(loaded.lessonDrafts?.f12, lesson, true)!;
  assert.deepEqual(normalized, draft);
  const saved = saveCurriculumProgress(withLearningSessionDraft(loaded, normalized));
  assert.deepEqual(saved.completedLessonIds, history.completedLessonIds);
  assert.deepEqual(saved.quizScores, history.quizScores);
  assert.deepEqual(saved.lessonAttempts, history.lessonAttempts);
  assert.deepEqual(saved.lessonDrafts?.['retired-lesson'], retired);
  assert.deepEqual(JSON.parse(storage.getItem(CURRICULUM_PROGRESS_KEY)!).extra, history.extra);
  const legacy = { version: 1, lessonId: 'f12', minutes: 5, mode: 'starter', extra: 'partial' };
  assert.doesNotThrow(() => parseCurriculumProgress(JSON.stringify({ activeSession: legacy })));
  assert.doesNotThrow(() => parseCurriculumProgress('{}'));
}));

test('stale snapshots, owner/reset changes and unreadable storage never produce a successful save', () => withStorage(storage => {
  for (const key of [CURRICULUM_PROGRESS_KEY, 'language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1']) {
    const loaded = loadCurriculumProgress();
    storage.setItem(key, key === CURRICULUM_PROGRESS_KEY ? '{"completedLessonIds":["newer"]}' : 'changed');
    const before = storage.getItem(CURRICULUM_PROGRESS_KEY);
    assert.throws(() => saveCurriculumProgress(loaded), (error: unknown) => error instanceof CurriculumProgressError && error.reason === 'stale');
    assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), before);
  }
  const loaded = loadCurriculumProgress(), originalGet = storage.getItem.bind(storage), before = originalGet(CURRICULUM_PROGRESS_KEY);
  storage.getItem = () => { throw new DOMException('Synthetic read failure', 'SecurityError'); };
  assert.throws(() => loadCurriculumProgress(), (error: unknown) => error instanceof CurriculumProgressError && error.reason === 'read');
  assert.throws(() => saveCurriculumProgress(loaded), CurriculumProgressError);
  assert.equal(storage.values.get(CURRICULUM_PROGRESS_KEY), before);
  storage.getItem = originalGet;
  storage.failWrites = true;
  assert.throws(() => saveCurriculumProgress(loaded), /Storage full/);
  storage.failWrites = false;
  assert.doesNotThrow(() => saveCurriculumProgress(loaded));
  assert.throws(() => saveCurriculumProgress(loaded), CurriculumProgressError);
}));

test('explicit reset generation and account isolation remain distinct from corrupt-record repair', () => withStorage(async storage => {
  const old = { [CURRICULUM_PROGRESS_KEY]: '{broken' };
  const reset = { languageRecordResetV1: '2026-11-11T00:00:00Z|synthetic' };
  storage.setItem(CURRICULUM_PROGRESS_KEY, old[CURRICULUM_PROGRESS_KEY]);
  assert.equal(CURRICULUM_PROGRESS_KEY in mergeLanguageState(reset, old), false);
  assert.equal(CURRICULUM_PROGRESS_KEY in mergeLanguageStateFromBase(old, reset, old), false);
  await applyLanguageState(reset);
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), null);
  await prepareLanguageLocalState('synthetic-a');
  storage.setItem(CURRICULUM_PROGRESS_KEY, '{broken');
  await prepareLanguageLocalState('synthetic-b');
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), null);
}));

const uiFiles = ['components/language/FocusedLesson.tsx', 'components/language/KanaStarter.tsx', 'app/language/learn/page.tsx', 'components/language/LearningWelcome.tsx', 'components/language/LevelLearningWorkspace.tsx', 'app/language/progress/page.tsx'];
const f12 = CURRICULUM.find(item => item.id === 'f12')!;

test('all six real curriculum UI readers catch corrupt/read-failed records without blank-history success or writes', () => {
  for (const file of uiFiles) for (const raw of invalidProgress) {
    const storage = new MemoryStorage(); storage.values.set(CURRICULUM_PROGRESS_KEY, raw);
    const ui = mountCurriculumUi(file, storage, { lesson: f12, studyLevel: 'beginner' });
    assert.ok(ui.nodes().some(node => node.props.role === 'alert'), `${file}: ${raw}`);
    assert.match(ui.text(), /원본을 보존/);
    assert.equal(storage.values.get(CURRICULUM_PROGRESS_KEY), raw);
    assert.equal(storage.values.size, 1);
    assert.doesNotMatch(ui.text(), /오늘의 연습을 저장했어요|한 묶음을 해냈어요|총 학습일/);
  }
  for (const file of uiFiles) {
    const storage = new MemoryStorage(); storage.values.set(CURRICULUM_PROGRESS_KEY, '{"completedLessonIds":["f01"]}');
    const get = storage.getItem.bind(storage); storage.getItem = key => { if (key === CURRICULUM_PROGRESS_KEY) throw Error('Synthetic read failure'); return get(key); };
    const ui = mountCurriculumUi(file, storage, { lesson: f12 });
    assert.match(ui.text(), /기존 학습 기록을 읽지 못했어요/, file);
    assert.equal(storage.values.get(CURRICULUM_PROGRESS_KEY), '{"completedLessonIds":["f01"]}');
    storage.getItem = get;
    if (file !== 'app/language/progress/page.tsx') { ui.click('기록 다시 읽기'); assert.doesNotMatch(ui.text(), /기존 학습 기록을 읽지 못했어요/); }
  }
});

function completeF12(ui: ReturnType<typeof mountCurriculumUi>) {
  ui.click('다음 표현'); ui.click('다음 표현'); ui.click('다음으로'); ui.click('다음으로');
  for (let guard = 0; guard < 10; guard++) {
    const question = ui.nodes().find(node => node.type === 'question-double'); assert.ok(question);
    ui.invoke(question, 'onAnswer', true, 'synthetic-answer');
    if (ui.nodes().some(node => node.type === 'button' && nodeText(node) === '오늘 연습 저장하기')) return;
    ui.click('다음 문제');
  }
  throw Error('Unexpected f12 question count');
}

test('actual f12 finish retains draft on write failure, retries safely and refuses newer/corrupt snapshots', () => {
  for (const failKey of [CURRICULUM_PROGRESS_KEY, 'japaneseCurriculumReviewV1']) {
    const storage = new MemoryStorage(), ui = mountCurriculumUi(uiFiles[0], storage, { lesson: f12, studyLevel: 'beginner' });
    completeF12(ui);
    const before = storage.getItem(CURRICULUM_PROGRESS_KEY), set = storage.setItem.bind(storage);
    storage.setItem = (key, value) => { if (key === failKey) throw Error('Synthetic write failure'); set(key, value); };
    ui.click('오늘 연습 저장하기');
    assert.match(ui.text(), /학습 결과를 저장하지 못했어요/);
    assert.doesNotMatch(ui.text(), /오늘의 연습을 저장했어요/);
    assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), before);
    storage.setItem = set;
    ui.click('오늘 연습 저장하기');
    assert.match(ui.text(), /오늘의 연습을 저장했어요/);
    assert.equal(JSON.parse(storage.getItem(CURRICULUM_PROGRESS_KEY)!).lessonAttempts.f12.length, 1);
  }
  for (const next of ['{broken', '{"completedLessonIds":["newer"],"lessonDrafts":{}}']) {
    const storage = new MemoryStorage(), ui = mountCurriculumUi(uiFiles[0], storage, { lesson: f12 });
    completeF12(ui); storage.values.set(CURRICULUM_PROGRESS_KEY, next);
    const review = storage.getItem('japaneseCurriculumReviewV1');
    for (let repeat = 0; repeat < 2; repeat++) ui.click('오늘 연습 저장하기');
    assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), next);
    assert.equal(storage.getItem('japaneseCurriculumReviewV1'), review);
    assert.doesNotMatch(ui.text(), /오늘의 연습을 저장했어요/);
    assert.ok(ui.nodes().some(node => node.props.role === 'alert'));
  }
});

test('actual autosave, course selection and kana writers preserve corrupt records appearing after initial read', () => {
  const storage = new MemoryStorage(), ui = mountCurriculumUi(uiFiles[0], storage, { lesson: f12 });
  storage.values.set(CURRICULUM_PROGRESS_KEY, '{broken'); ui.click('다음 표현');
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), '{broken'); assert.match(ui.text(), /원본을 보존/);
  const courseStorage = new MemoryStorage(), course = mountCurriculumUi(uiFiles[2], courseStorage);
  courseStorage.values.set(CURRICULUM_PROGRESS_KEY, '{broken');
  const work = course.nodes().find(node => node.type === 'a' && node.props.href === '/language/learn?track=work'); assert.ok(work);
  course.invoke(work, 'onClick'); assert.equal(courseStorage.getItem(CURRICULUM_PROGRESS_KEY), '{broken'); assert.match(course.text(), /원본을 보존/);
  courseStorage.values.set(CURRICULUM_PROGRESS_KEY, '{"completedLessonIds":["retired"]}');
  course.invoke(work, 'onClick');
  assert.equal(JSON.parse(courseStorage.getItem(CURRICULUM_PROGRESS_KEY)!).selectedTrack, 'work');
  assert.deepEqual(JSON.parse(courseStorage.getItem(CURRICULUM_PROGRESS_KEY)!).completedLessonIds, ['retired']);
  const kanaStorage = new MemoryStorage();
  kanaStorage.values.set(CURRICULUM_PROGRESS_KEY, '{"completedLessonIds":["retired"]}');
  const kana = mountCurriculumUi(uiFiles[1], kanaStorage);
  for (let i = 0; i < 4; i++) kana.click('다음 글자'); kana.click('배운 글자 찾아보기');
  for (const [index, char] of [...'あいうえお'].entries()) { kana.click(char); if (index < 4) kana.click('다음 글자'); }
  kanaStorage.values.set(CURRICULUM_PROGRESS_KEY, '{broken'); kana.click('이번 묶음 저장하기');
  assert.equal(kanaStorage.getItem(CURRICULUM_PROGRESS_KEY), '{broken'); assert.match(kana.text(), /원본을 보존/); assert.doesNotMatch(kana.text(), /글자와 친해졌어요/);
  kanaStorage.values.set(CURRICULUM_PROGRESS_KEY, '{"completedLessonIds":["retired"]}');
  kanaStorage.failWrites = true; kana.click('이번 묶음 저장하기');
  assert.doesNotMatch(kana.text(), /글자와 친해졌어요/);
  assert.equal(kanaStorage.getItem(CURRICULUM_PROGRESS_KEY), '{"completedLessonIds":["retired"]}');
  kanaStorage.failWrites = false; kana.click('이번 묶음 저장하기');
  assert.match(kana.text(), /글자와 친해졌어요/);
  assert.deepEqual(JSON.parse(kanaStorage.getItem(CURRICULUM_PROGRESS_KEY)!).completedLessonIds, ['retired']);
  kana.click('다음 글자 묶음');
  for (let index = 0; index < 4; index++) kana.click('다음 글자'); kana.click('배운 글자 찾아보기');
  for (const [index, char] of [...'かきくけこ'].entries()) { kana.click(char); if (index < 4) kana.click('다음 글자'); }
  kana.click('이번 묶음 저장하기');
  assert.match(kana.text(), /글자와 친해졌어요/);
  assert.deepEqual(JSON.parse(kanaStorage.getItem(CURRICULUM_PROGRESS_KEY)!).kanaCompletedGroups, ['a', 'ka']);
});


test('cloud read failures and newer remote records preserve pending local state, with no false change event', () => withStorage(async storage => {
  storage.values.set(CURRICULUM_PROGRESS_KEY, '{"completedLessonIds":["f01"]}');
  const get = storage.getItem.bind(storage);
  storage.getItem = key => { if (key === CURRICULUM_PROGRESS_KEY) throw Error('Synthetic read error'); return get(key); };
  assert.throws(() => readLanguageState(), /Synthetic read error/);
  await assert.rejects(() => applyLanguageState({ [CURRICULUM_PROGRESS_KEY]: '{}' }), /Synthetic read error/);
  assert.equal(storage.values.get(CURRICULUM_PROGRESS_KEY), '{"completedLessonIds":["f01"]}');
  assert.deepEqual(storage.events, []);
  storage.getItem = get;
  const stale = loadCurriculumProgress();
  await applyLanguageState({ [CURRICULUM_PROGRESS_KEY]: '{"completedLessonIds":["f01","remote"]}' });
  assert.throws(() => saveCurriculumProgress(stale), CurriculumProgressError);
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), '{"completedLessonIds":["f01","remote"]}');
  assert.ok(storage.events.length > 0);
}));


test('kana refuses every owner/epoch/reset change during an accepted exercise, including reset deletion', () => {
  for (const field of ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1']) {
    const storage = new MemoryStorage();
    storage.values.set(CURRICULUM_PROGRESS_KEY, '{"completedLessonIds":["sentinel"]}');
    const kana = mountCurriculumUi(uiFiles[1], storage);
    for (let index = 0; index < 4; index++) kana.click('다음 글자');
    kana.click('배운 글자 찾아보기');
    for (const [index, char] of [...'あいうえお'].entries()) { kana.click(char); if (index < 4) kana.click('다음 글자'); }
    storage.setItem(field, field === 'languageRecordResetV1' ? '2026-11-12T00:00:00Z|synthetic' : 'changed');
    if (field === 'languageRecordResetV1') storage.removeItem(CURRICULUM_PROGRESS_KEY);
    const before = storage.getItem(CURRICULUM_PROGRESS_KEY);
    kana.click('이번 묶음 저장하기'); kana.click('이번 묶음 저장하기');
    assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), before, field);
    assert.match(kana.text(), /학습 기록이 다른 화면이나 동기화에서 바뀌었어요/, field);
    assert.doesNotMatch(kana.text(), /글자와 친해졌어요/, field);
  }
});

test('actual f12 migration preserves special own-key historical draft IDs and finite extensions', () => {
  for (const lessonId of ['retired', '__proto__', 'constructor', 'toString']) {
    const storage = new MemoryStorage(), old = { ...createLearningSession(lessonId, 10, 'starter'), extra: 'sentinel' };
    storage.values.set(CURRICULUM_PROGRESS_KEY, JSON.stringify({ activeSession: old, future: { number: 1e308 } }));
    const ui = mountCurriculumUi(uiFiles[0], storage, { lesson: f12 });
    const saved = JSON.parse(storage.getItem(CURRICULUM_PROGRESS_KEY)!);
    assert.ok(Object.hasOwn(saved.lessonDrafts, lessonId), lessonId);
    assert.deepEqual(saved.lessonDrafts[lessonId], old);
    assert.equal(saved.future.number, 1e308);
    assert.doesNotMatch(ui.text(), /원본을 보존/);
  }
});

const newerReset = '2026-11-12T00:00:00Z|synthetic';
test('actual authenticated provider can reach a strictly newer remote reset without uploading corrupt local', () => withStorage(async storage => {
  for (const raw of ['{}', '{broken', '{"future":{"number":1e309}}']) for (const replacement of [undefined, '{"completedLessonIds":["after-reset"]}']) {
    storage.values.clear(); storage.events = [];
    storage.values.set('language-cloud-sync-user', 'synthetic-a');
    storage.values.set(CURRICULUM_PROGRESS_KEY, raw);
    storage.values.set('integratedLearningSettingsV1', '{"dailyMinutes":20}');
    const result = await initializeCurriculumSync({ remote: { languageRecordResetV1: newerReset, ...(replacement ? { [CURRICULUM_PROGRESS_KEY]: replacement } : {}) } });
    assert.equal(result.thrown, undefined);
    assert.ok(result.remoteReads > 0);
    assert.equal(result.reloads, 1);
    assert.ok(result.statuses.includes('synced'));
    assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), replacement ?? null);
    assert.equal(storage.getItem('languageRecordResetV1'), newerReset);
    assert.equal(storage.getItem('integratedLearningSettingsV1'), '{"dailyMinutes":20}');
    for (const write of result.writes) {
      assert.equal(write[CURRICULUM_PROGRESS_KEY], replacement);
      assert.equal(JSON.stringify(write).includes(raw === '{}' ? 'never-a-real-value' : raw), false);
    }
  }
}));

test('actual provider refuses missing/equal/older/invalid resets and invalid replacement progress without publishing corruption', () => withStorage(async storage => {
  const currentReset = '2026-11-11T00:00:00Z|current';
  const remotes: (Record<string, unknown> | null)[] = [null, {}, { languageRecordResetV1: currentReset },
    { languageRecordResetV1: '2026-11-10T00:00:00Z|old' }, { languageRecordResetV1: '2026-11-11T00:00:00Z|zzz' },
    { languageRecordResetV1: 'invalid' }, { languageRecordResetV1: 17 },
    { languageRecordResetV1: newerReset, [CURRICULUM_PROGRESS_KEY]: '{broken-remote' },
    { languageRecordResetV1: newerReset, [CURRICULUM_PROGRESS_KEY]: null }];
  for (const remote of remotes) {
    storage.values.clear(); storage.events = [];
    storage.values.set('language-cloud-sync-user', 'synthetic-a');
    storage.values.set(CURRICULUM_PROGRESS_KEY, '{broken'); storage.values.set('languageRecordResetV1', currentReset);
    const result = await initializeCurriculumSync({ remote });
    assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), '{broken');
    assert.equal(storage.getItem('languageRecordResetV1'), currentReset);
    assert.deepEqual(result.writes, []);
    assert.deepEqual(storage.events, []);
    assert.equal(result.reloads, 0);
    assert.equal(result.statuses.includes('synced'), false);
    assert.ok(result.messages.some(Boolean) || result.thrown);
  }
  storage.values.clear(); storage.events = [];
  storage.values.set('language-cloud-sync-user', 'synthetic-a');
  const valid = '{"completedLessonIds":["sentinel"]}'; storage.values.set(CURRICULUM_PROGRESS_KEY, valid);
  const invalidRemote = await initializeCurriculumSync({ remote: { [CURRICULUM_PROGRESS_KEY]: '{broken-remote' } });
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), valid);
  assert.deepEqual(invalidRemote.writes, []); assert.equal(invalidRemote.statuses.includes('synced'), false);
}));

test('actual provider fences reset recovery by auth, current owner/epochs and latest known baseline', () => withStorage(async storage => {
  const seed = () => { storage.values.clear(); storage.events = []; storage.values.set('language-cloud-sync-user', 'synthetic-a'); storage.values.set(CURRICULUM_PROGRESS_KEY, '{broken'); };
  seed();
  const noAuth = await initializeCurriculumSync({ remote: { languageRecordResetV1: newerReset }, authenticated: false });
  assert.equal(noAuth.remoteReads, 0); assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), '{broken');
  for (const key of ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1']) {
    seed();
    const result = await initializeCurriculumSync({ remote: { languageRecordResetV1: newerReset }, onRemoteRead: () => storage.values.set(key, key === 'languageRecordResetV1' ? '2026-11-13T00:00:00Z|newer-local' : 'changed') });
    assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), '{broken');
    assert.deepEqual(result.writes, []); assert.equal(result.reloads, 0); assert.deepEqual(storage.events, []);
  }
  seed();
  storage.values.set('language-cloud-sync-base:synthetic-a', JSON.stringify({ languageRecordResetV1: '2026-11-13T00:00:00Z|newer-base' }));
  const base = storage.getItem('language-cloud-sync-base:synthetic-a');
  const result = await initializeCurriculumSync({ remote: { languageRecordResetV1: newerReset } });
  assert.equal(storage.getItem(CURRICULUM_PROGRESS_KEY), '{broken');
  assert.equal(storage.getItem('language-cloud-sync-base:synthetic-a'), base);
  assert.deepEqual(result.writes, []); assert.equal(result.reloads, 0); assert.deepEqual(storage.events, []);
  seed();
  const get = storage.getItem.bind(storage);
  storage.getItem = key => { if (key === CURRICULUM_PROGRESS_KEY) throw Error('Synthetic storage read failure'); return get(key); };
  const unreadable = await initializeCurriculumSync({ remote: { languageRecordResetV1: newerReset } });
  assert.equal(unreadable.remoteReads, 0);
  assert.equal(storage.values.get(CURRICULUM_PROGRESS_KEY), '{broken');
  assert.deepEqual(unreadable.writes, []); assert.deepEqual(storage.events, []);
  storage.getItem = get;
}));
