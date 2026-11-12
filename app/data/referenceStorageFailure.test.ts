import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRoutineCompletionQueue } from "../../utils/routineCompletionQueue.ts";

const words = "app/language/words/page.tsx";
const kana = "app/language/kana/page.tsx";
const word = { word: "水", meaning: "물", example: "水です。", category: "일상" };
const other = { word: "本", meaning: "책", example: "本です。", category: "일상", retainedMetadata: "keep" };
function declaration(path: string, name: string) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = node.initializer.getText(source);
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(expression, name);
  return expression;
}
function fixture(path: string) {
  const records = new Map<string, string>();
  const failed = new Set<string>();
  const writes: string[] = [];
  const changes: Record<string, unknown[]> = {};
  const storage = {
    getItem: (key: string) => { if (failed.has(`read:${key}`)) throw new Error("Synthetic read failure"); return records.get(key) ?? null; },
    setItem: (key: string, value: string) => { writes.push(key); if (failed.has(key)) throw new Error("Synthetic quota failure"); records.set(key, value); },
  };
  const pending = new Map<string, () => boolean>();
  const sandbox: Record<string, unknown> = {
    localStorage: storage, window: { localStorage: storage }, STORAGE_KEY: "savedWords", WRONG_WORDS_KEY: "wrongWords",
    selected: null, confusingSelected: null, writingQuizAnswered: false,
    answeredRef: { current: false }, confusingAnsweredRef: { current: false }, writingAnsweredRef: { current: false },
    scoreRef: { current: { correct: 2, total: 4 } }, savedWordsRef: { current: [] },
    saveToggleLocks: { current: new Set<string>() }, pendingStorageWrites: { current: pending },
    currentWord: word, quizType: "jp-to-kr", tab: "hiragana", quiz: { question: { char: "あ", roman: "a" } },
    confusingQuiz: { question: { char: "シ", roman: "shi" } },
    queueMicrotask: () => {},
  };
  for (const name of ["setSavedWords", "setSavedLoadError", "setStorageFailures", "setSelected", "setScore", "setConfusingSelected", "setConfusingScore", "setWritingQuizAnswered", "setWritingQuizScore", "setWrongKanaChars"]) {
    sandbox[name] = (value: unknown) => { (changes[name] ??= []).push(value); };
  }
  const context = vm.createContext(sandbox);
  const attach = (name: string) => {
    const output = ts.transpileModule(`globalThis.${name} = ${declaration(path, name)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    vm.runInContext(output, context);
  };
  for (const name of ["queueStorageWrite", "retryStorageWrites"]) attach(name);
  let routineError = '';
  const routine = createRoutineCompletionQueue({ capture: date => ({ date, id: path === words ? 'words' : 'kana' }), isCurrent: () => true,
    save: async intent => {
      storage.getItem('dailyRoutineProgress');
      storage.setItem('dailyRoutineProgress', JSON.stringify({ date: intent.date, completedIds: [intent.id] }));
    }, publish: status => { routineError = status.error; } });
  sandbox.routine = { complete: () => routine.complete('2026-11-09'), ensureCurrent: () => true };
  const call = (name: string, ...args: unknown[]) => (sandbox[name] as (...args: unknown[]) => unknown)(...args);
  return { records, failed, writes, changes, sandbox, pending, attach, call, routine, routineError: () => routineError };
}

test("word save/remove failure preserves UI and bytes; retry retains unrelated records and original intent", () => {
  const f = fixture(words);
  for (const name of ["getWordKey", "normalizeSavedWord", "writeSavedWord", "handleSaveToggle"]) f.attach(name);
  f.records.set("savedWords", JSON.stringify([other]));
  f.failed.add("savedWords");
  f.call("handleSaveToggle", word); f.call("handleSaveToggle", word);
  assert.equal(f.writes.length, 1, "same-turn duplicate toggle is ignored");
  assert.equal(Object.hasOwn(f.changes, "setSavedWords"), false);
  assert.equal(f.pending.size, 1);
  assert.deepEqual(JSON.parse(f.records.get("savedWords")!), [other]);
  f.call("retryStorageWrites");
  assert.equal(f.pending.size, 1, "failure remains retryable");
  f.failed.clear(); f.call("retryStorageWrites"); f.call("retryStorageWrites");
  assert.equal(f.pending.size, 0);
  assert.equal(f.changes.setSavedWords.length, 1);
  assert.deepEqual(JSON.parse(f.records.get("savedWords")!), [other, word]);
  f.failed.add("savedWords");
  assert.equal(f.call("writeSavedWord", word, false), false);
  assert.equal(f.changes.setSavedWords.length, 1);
  f.failed.clear(); assert.equal(f.call("writeSavedWord", word, false), true);
  assert.deepEqual(JSON.parse(f.records.get("savedWords")!), [other]);
});

test("unreadable or malformed saved words are never overwritten by a toggle", () => {
  const f = fixture(words);
  for (const name of ["getWordKey", "normalizeSavedWord", "writeSavedWord"]) f.attach(name);
  for (const raw of ["{broken", "{}", "[null]"]) {
    f.records.set("savedWords", raw);
    assert.equal(f.call("writeSavedWord", word, true), false);
    assert.equal(f.records.get("savedWords"), raw);
  }
  f.failed.add("read:savedWords");
  assert.equal(f.call("writeSavedWord", word, true), false);
  assert.equal(f.writes.length, 0);
});

test("word wrong-answer and daily-check retries never regrade or increment the score", async () => {
  const f = fixture(words);
  for (const name of ["getWordKey", "saveWrongWord", "handleAnswer"]) f.attach(name);
  f.failed.add("wrongWords"); f.failed.add("dailyRoutineProgress");
  f.call("handleAnswer", "책"); f.call("handleAnswer", "책");
  assert.equal(f.changes.setSelected.length, 1);
  assert.equal(f.changes.setScore.length, 1);
  assert.equal(typeof f.changes.setScore[0], "object", "no persistence side effect in a state updater");
  assert.deepEqual(JSON.parse(JSON.stringify(f.changes.setScore[0])), { correct: 2, total: 5 });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.routineError());
  assert.equal(f.pending.size, 1);
  f.failed.clear(); f.call("retryStorageWrites"); f.call("retryStorageWrites");
  assert.equal(f.pending.size, 0);
  assert.equal(f.changes.setScore.length, 1);
  assert.equal(JSON.parse(f.records.get("wrongWords")!).length, 1);
  f.routine.retry(); f.routine.retry();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.routineError(), "");
  assert.equal(f.changes.setScore.length, 1);
  assert.deepEqual(JSON.parse(f.records.get("dailyRoutineProgress")!).completedIds, ["words"]);
});

test("kana wrong-answer badge waits for storage and retries do not duplicate answers or checks", async () => {
  const f = fixture(kana);
  for (const name of ["saveWrongKana", "persistWrongKana", "handleChoice"]) f.attach(name);
  f.failed.add("wrongKana"); f.failed.add("read:dailyRoutineProgress");
  f.call("handleChoice", "i"); f.call("handleChoice", "i");
  assert.equal(f.changes.setScore.length, 1);
  assert.equal(Object.hasOwn(f.changes, "setWrongKanaChars"), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.routineError());
  assert.equal(f.pending.size, 1);
  f.call("retryStorageWrites"); assert.equal(f.pending.size, 1);
  f.failed.clear(); f.call("retryStorageWrites"); f.call("retryStorageWrites");
  assert.equal(f.pending.size, 0);
  assert.equal(f.changes.setWrongKanaChars.length, 1);
  assert.equal(f.changes.setScore.length, 1);
  assert.equal(JSON.parse(f.records.get("wrongKana")!).length, 1);
  f.routine.retry(); f.routine.retry();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.routineError(), "");
  assert.equal(f.changes.setScore.length, 1);
  assert.deepEqual(JSON.parse(f.records.get("dailyRoutineProgress")!).completedIds, ["kana"]);
});

test("comparison and self-marked writing guard repeated clicks; malformed wrong lists remain intact", () => {
  const f = fixture(kana);
  for (const name of ["saveWrongKana", "persistWrongKana", "getKanaType", "handleConfusingChoice", "markWritingQuizResult"]) f.attach(name);
  f.records.set("wrongKana", "{broken");
  f.call("handleConfusingChoice", "tsu"); f.call("handleConfusingChoice", "tsu");
  assert.equal(f.changes.setConfusingScore.length, 1);
  assert.equal(f.pending.size, 1);
  assert.equal(f.records.get("wrongKana"), "{broken");
  f.call("markWritingQuizResult", "correct"); f.call("markWritingQuizResult", "wrong");
  assert.equal(f.changes.setWritingQuizScore.length, 1);
  assert.equal(f.changes.setWritingQuizAnswered.length, 1);
});
