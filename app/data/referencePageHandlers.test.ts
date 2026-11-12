import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const kanaPath = "app/language/kana/page.tsx";
const wordsPath = "app/language/words/page.tsx";
function source(path: string) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function namedHandler(path: string, name: string) {
  const tree = source(path);
  let expression: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(expression, name);
  return expression.getText(tree);
}

function kanaConstant<T>(name: string): T {
  return vm.runInNewContext(`(${namedHandler(kanaPath, name)})`) as T;
}

test("base kana stroke counts agree with the bundled assets and reversed-direction tips stay corrected", () => {
  const bundle = JSON.parse(readFileSync("public/kana-strokes.json", "utf8")) as Record<string, string>;
  type Info = { totalStrokes: number; steps: string[]; tip: string };
  const hiragana = kanaConstant<Record<string, Info>>("hiraganaDetailedStrokeOrderData");
  const katakana = kanaConstant<Record<string, Info>>("katakanaDetailedStrokeOrderData");
  for (const [tab, records] of [["hiragana", hiragana], ["katakana", katakana]] as const) {
    assert.equal(Object.keys(records).length, 46);
    for (const [char, info] of Object.entries(records)) {
      const svg = bundle[`/kana-stroke/${tab}/${encodeURIComponent(char)}.svg`];
      assert.ok(svg, char);
      const count = [...svg.slice(svg.indexOf('data-strokesvg="strokes"')).matchAll(/style="--i:\d+"/g)].length;
      assert.equal(info.totalStrokes, count, char);
      assert.equal(info.steps.length, count, char);
    }
  }
  for (const char of ["シ", "ン"]) assert.match(katakana[char].tip, /왼쪽 아래에서 오른쪽 위로 올려/);
  for (const char of ["ツ", "ソ"]) assert.match(katakana[char].tip, /오른쪽 위에서 왼쪽 아래로 내려/);
  assert.match(hiragana["め"].tip, /작은 고리를 만들지/);
  assert.match(hiragana["れ"].tip, /작은 고리가 없/);
  assert.match(hiragana["に"].tip, /세로획 하나와 오른쪽 가로획 두 개/);
  assert.match(hiragana["ろ"].tip, /한 획/);
  const pairs = kanaConstant<{ a: { char: string }; tip: string }[]>("confusingPairs");
  assert.equal(pairs.length, 6);
  assert.match(pairs.find(pair => pair.a.char === "ソ")!.tip, /ソ의 긴 2획은 오른쪽 위에서 왼쪽 아래로 내려/);
  assert.match(pairs.find(pair => pair.a.char === "わ")!.tip, /작은 고리를 만들지/);
});

// Execute the actual TSX event functions, with setters and audio mocked.
// This checks handler ordering only, not React rendering or browser playback.
function assertStopsFirst(expression: string, argument?: unknown) {
  const calls: string[] = [];
  const fixture = { word: "水", type: "jp-to-kr", choices: ["물", "책"] };
  const sandbox: Record<string, unknown> = {
    stopAudio: () => calls.push("stop"),
    answeredRef: { current: false }, confusingAnsweredRef: { current: false }, writingAnsweredRef: { current: false },
    resetQuizScore: () => calls.push("resetScore"),
    useCallback: (callback: unknown) => callback,
    getQuizEligibleItems: (items: unknown) => items,
    getQuizQuestion: () => fixture, getWritingQuizQuestion: () => fixture,
    createWordQuiz: () => fixture, getConfusingQuizQuestion: () => fixture,
    getRandomWritingIndex: () => 0,
    clearWritingCanvas: () => calls.push("clear"), resetWritingFeedback: () => calls.push("feedback"),
    allData: [fixture], data: [fixture], hiragana: [fixture], katakana: [fixture],
    writingOrderMode: "sequence", allKanaGroupByChar: {}, mode: "quiz", quizPool: [fixture],
    generateQuiz: () => calls.push("generate"),
    router: { push: () => calls.push("navigate") }, getSentenceKeyword: () => "水", w: fixture,
    getWordKey: () => "水", cat: "旅行", level: { value: "basic" }, part: { value: "noun" }, modeBtn: { id: "faint" },
  };
  for (const name of expression.match(/\bset[A-Z]\w*/g) ?? []) sandbox[name] = () => calls.push(name);
  const javascript = ts.transpileModule(`globalThis.handler = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  vm.runInNewContext(javascript, sandbox);
  (sandbox.handler as (argument: unknown) => void)(argument);
  assert.equal(calls[0], "stop", expression);
}

test("kana named content-switch handlers stop audio before changing quiz, tab, group or writing target", () => {
  for (const [name, argument] of [
    ["loadNextQuestion", []], ["toggleKanaGroup", "ga"], ["handleTabChange", "katakana"],
    ["handleModeChange", "confusing"], ["loadNextWritingQuizQuestion", undefined],
    ["goToPrevWritingItem", undefined], ["goToNextWritingItem", undefined],
    ["loadNextConfusingQuestion", undefined], ["handleAuditPractice", { char: "あ" }],
  ] as const) assertStopsFirst(namedHandler(kanaPath, name), argument);
});

test("word generation and writing-pad switches stop audio before changing the target", () => {
  assertStopsFirst(namedHandler(wordsPath, "generateQuiz"), [{ word: "水", meaning: "물" }]);
  assertStopsFirst(namedHandler(wordsPath, "handleWritingPracticeToggle"), { word: "水", meaning: "물" });
});

test("inline mode, filter, guide and comparison switches stop audio before state updates", () => {
  let checked = 0;
  for (const path of [kanaPath, wordsPath]) {
    const tree = source(path);
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && ["onClick", "onChange"].includes(node.name.getText(tree)) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const expression = node.initializer.expression.getText(tree);
        if (/set(?:AuditScope|WritingSubMode|WritingOrderMode|WritingGuideMode|ConfusingView|Mode|PracticeScope|CategoryFilter|LevelFilter|PartOfSpeechFilter)\(/.test(expression)) {
          assertStopsFirst(expression, { target: { value: "all" } });
          checked++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.ok(checked >= 18, `Only ${checked} switch handlers checked`);
});

// Pure event-handler contracts only: no React scheduling or browser observation.
test("kana quiz entry scopes the question atomically without rerolling the active quiz", () => {
  const expression = namedHandler(kanaPath, "handleModeChange");
  const javascript = ts.transpileModule(`globalThis.handler = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  for (const scenario of ["entry", "same-mode", "nonquiz", "fallback"] as const) {
    const item = { char: "あ", roman: "a" }, fallback = { char: "か", roman: "ka" };
    const stale = { question: fallback, choices: ["ka"] };
    let question = stale, selected: unknown = "old", score = 3, draws = 0, nextMode = "";
    const calls: string[] = [];
    const data = scenario === "fallback" ? [] : [item], allData = [fallback];
    const lastQuizResetKeyRef = { current: "previous" }, prevModeRef = { current: "learn" };
    const answeredRef = { current: true };
    const sandbox = {
      mode: scenario === "same-mode" ? "quiz" : "learn", tab: "hiragana", selectedGroupKey: "a",
      data, allData, lastQuizResetKeyRef, prevModeRef, answeredRef,
      stopAudio: () => calls.push("stop"), setMode: (value: string) => { nextMode = value; calls.push("mode"); },
      setSelected: (value: unknown) => { selected = value; }, resetQuizScore: () => { score = 0; },
      getQuizEligibleItems: (items: typeof data) => items,
      getQuizQuestion: (items: typeof data) => { draws++; assert.equal(items, data.length ? data : allData); return { question: items[0], choices: [items[0].roman] }; },
      setQuiz: (value: typeof stale) => { question = value; },
    };
    const context = vm.createContext(sandbox);
    vm.runInContext(javascript, context);
    const target = scenario === "nonquiz" ? "learn" : "quiz";
    (context.handler as (mode: string) => void)(target);
    assert.equal(calls[0], "stop"); assert.equal(nextMode, target);
    if (scenario === "nonquiz") {
      assert.equal(question, stale); assert.equal(draws, 0); assert.equal(selected, "old"); assert.equal(score, 3); assert.equal(answeredRef.current, true);
    } else {
      assert.equal(selected, null); assert.equal(score, 0); assert.equal(answeredRef.current, false);
      if (scenario === "same-mode") { assert.equal(question, stale); assert.equal(draws, 0); }
      else { assert.equal(question.question, scenario === "fallback" ? fallback : item); assert.equal(draws, 1); }
    }
    if (scenario === "entry" || scenario === "fallback") {
      assert.equal(lastQuizResetKeyRef.current, "hiragana|a"); assert.equal(prevModeRef.current, "quiz");
    } else { assert.equal(lastQuizResetKeyRef.current, "previous"); assert.equal(prevModeRef.current, "learn"); }
  }
});
