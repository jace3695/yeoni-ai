export type WordQuizType = "jp-to-kr" | "kr-to-jp";
type QuizWord = { word: string; meaning: string };

const labelKey = (text: string) => text.normalize("NFKC").trim();
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Never use another answer to the displayed question as a distractor. */
export function getWordQuizChoices<T extends QuizWord>(correct: T, pool: readonly T[], type: WordQuizType, random = Math.random): string[] {
  const prompt = type === "jp-to-kr" ? "word" : "meaning";
  const answer = type === "jp-to-kr" ? "meaning" : "word";
  const validAnswers = new Set([correct, ...pool]
    .filter(item => labelKey(item[prompt]) === labelKey(correct[prompt]))
    .map(item => labelKey(item[answer])));
  const distractors = new Map<string, string>();
  for (const item of pool) {
    const key = labelKey(item[answer]);
    if (key && !validAnswers.has(key) && !distractors.has(key)) distractors.set(key, item[answer]);
  }
  return shuffle([correct[answer], ...shuffle([...distractors.values()], random).slice(0, 3)], random);
}

export function createWordQuiz<T extends QuizWord>(pool: readonly T[], random = Math.random): { word: T; type: WordQuizType; choices: string[] } | null {
  for (const word of shuffle(pool, random)) {
    const types: WordQuizType[] = random() < 0.5 ? ["jp-to-kr", "kr-to-jp"] : ["kr-to-jp", "jp-to-kr"];
    for (const type of types) {
      const choices = getWordQuizChoices(word, pool, type, random);
      // Two or three sound options are better than four misleading ones.
      if (choices.length >= 2) return { word, type, choices };
    }
  }
  return null;
}
