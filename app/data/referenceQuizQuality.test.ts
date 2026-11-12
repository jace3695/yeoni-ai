import assert from "node:assert/strict";
import test from "node:test";
import { WORDS } from "../../data/words.ts";
import { createWordQuiz, getWordQuizChoices } from "../../utils/wordQuiz.ts";
import { getKanaWritingClue } from "../../data/kanaWritingClues.ts";

test("word quiz excludes synonyms for the same Korean prompt and duplicate displayed meanings", () => {
  const pool = ["改札", "改札口", "入口", "出口"].map(word => WORDS.find(item => item.word === word)!);
  assert.ok(pool.every(Boolean));
  const japanese = getWordQuizChoices(pool[0], pool, "kr-to-jp", () => 0.4);
  assert.ok(japanese.includes("改札"));
  assert.ok(!japanese.includes("改札口"));
  assert.equal(japanese.length, 3);
  const korean = getWordQuizChoices(pool[0], pool, "jp-to-kr", () => 0.4);
  assert.equal(korean.filter(choice => choice === "개찰구").length, 1);
  assert.equal(new Set(korean).size, korean.length);
});

test("word quiz excludes alternate meanings of the same Japanese prompt, including normalized labels", () => {
  const pool = [
    { word: "はし", meaning: "젓가락" }, { word: "はし", meaning: "다리" },
    { word: "本", meaning: "책" }, { word: " 本 ", meaning: " 책 " },
    { word: "水", meaning: "물" },
  ];
  const choices = getWordQuizChoices(pool[0], pool, "jp-to-kr", () => 0.7);
  assert.ok(choices.includes("젓가락"));
  assert.ok(!choices.includes("다리"));
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(item => item.trim())).size, choices.length);
});

test("word quiz uses two or three valid options instead of padding, and reports an unusable pool", () => {
  const water = { word: "水", meaning: "물" };
  const book = { word: "本", meaning: "책" };
  assert.equal(createWordQuiz([water, book], () => 0.3)?.choices.length, 2);
  assert.equal(createWordQuiz([]), null);
  assert.equal(createWordQuiz([water]), null);
  assert.equal(createWordQuiz([water, { ...water }]), null);
  assert.equal(createWordQuiz([{ word: "改札", meaning: "개찰구" }, { word: "改札口", meaning: "개찰구" }]), null);
});

test("every current vocabulary target has unique options and only one valid displayed answer in both directions", () => {
  for (const word of WORDS) {
    for (const type of ["jp-to-kr", "kr-to-jp"] as const) {
      const choices = getWordQuizChoices(word, WORDS, type, () => 0.37);
      const prompt = type === "jp-to-kr" ? "word" : "meaning";
      const answer = type === "jp-to-kr" ? "meaning" : "word";
      const valid = new Set(WORDS.filter(item => item[prompt] === word[prompt]).map(item => item[answer]));
      assert.equal(new Set(choices).size, choices.length, word.word);
      assert.ok(choices.length >= 2 && choices.length <= 4, word.word);
      assert.deepEqual(choices.filter(choice => valid.has(choice)), [word[answer]], `${word.word}: ${type}`);
    }
  }
});

test("all eight homophonic kana writing targets have a distinct base-letter clue", () => {
  const pairs = [["じ", "ぢ", "し", "ち"], ["ず", "づ", "す", "つ"], ["ジ", "ヂ", "シ", "チ"], ["ズ", "ヅ", "ス", "ツ"]];
  for (const [first, second, firstBase, secondBase] of pairs) {
    assert.ok(getKanaWritingClue(first)?.includes(`${firstBase}에 탁점`));
    assert.ok(getKanaWritingClue(second)?.includes(`${secondBase}에 탁점`));
    assert.notEqual(getKanaWritingClue(first), getKanaWritingClue(second));
  }
  assert.equal(getKanaWritingClue("あ"), undefined);
  assert.equal(getKanaWritingClue("きゃ"), undefined);
});
