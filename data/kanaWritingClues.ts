// Modern standard pronunciation alone cannot distinguish these spellings.
const clues: Record<string, string> = {
  じ: "같은 ji 소리라도 이번에는 さ행의 し에 탁점(゛)을 붙인 글자를 써요.",
  ぢ: "같은 ji 소리라도 이번에는 た행의 ち에 탁점(゛)을 붙인 글자를 써요.",
  ず: "같은 zu 소리라도 이번에는 さ행의 す에 탁점(゛)을 붙인 글자를 써요.",
  づ: "같은 zu 소리라도 이번에는 た행의 つ에 탁점(゛)을 붙인 글자를 써요.",
  ジ: "같은 ji 소리라도 이번에는 サ행의 シ에 탁점(゛)을 붙인 글자를 써요.",
  ヂ: "같은 ji 소리라도 이번에는 タ행의 チ에 탁점(゛)을 붙인 글자를 써요.",
  ズ: "같은 zu 소리라도 이번에는 サ행의 ス에 탁점(゛)을 붙인 글자를 써요.",
  ヅ: "같은 zu 소리라도 이번에는 タ행의 ツ에 탁점(゛)을 붙인 글자를 써요.",
};

export function getKanaWritingClue(char: string): string | undefined {
  return clues[char];
}
