import type { GrammarWritingPractice } from './grammarWritingPractice';

/** A presentation adapter only. Keep the original prompts, accepted typed answers and IDs intact. */
type ChoiceSpec = { distractors: [string, string]; prompt?: string };
const specs: Record<string, ChoiceSpec> = {
  'です': { distractors: ['ます', 'ではありません'] },
  'は': { distractors: ['を', 'で'] },
  'これ': { distractors: ['それ', 'あれ'] },
  'ここ': { distractors: ['そこ', 'あそこ'] },
  'ます': { distractors: ['です', 'ません'] },
  'を': { distractors: ['に', 'で'], prompt: '요청하는 물건 뒤에 들어갈 조사를 골라요.' },
  // Do not offer へ as a distractor: it is also accepted for destinations.
  'に': { distractors: ['を', 'で'], prompt: '물건이 있는 위치를 나타내는 조사를 골라요.' },
  'で': { distractors: ['を', 'に'] },
  'か': { distractors: ['を', 'に'] },
  'ではありません': { distractors: ['です', 'でした'] },
  'おいしい': { distractors: ['おいしく', 'おいしいな'] },
  'な': { distractors: ['の', 'い'] },
  '私のかばん': { distractors: ['私をかばん', '私にかばん'] },
  'も': { distractors: ['はも', 'を'] },
  '何ですか': { distractors: ['どこですか', 'だれですか'] },
  'どこですか': { distractors: ['何ですか', 'だれですか'] },
  '行きません': { distractors: ['行きます', '行きました'], prompt: '「가지 않습니다」에 맞는 표현을 골라요.' },
  '行きました': { distractors: ['行きます', '行きません'], prompt: '「갔습니다」에 맞는 표현을 골라요.' },
  'が': { distractors: ['を', 'に'] },
  '4時': { distractors: ['9時', '4円'] },
  'いくら': { distractors: ['どこ', 'だれ'] },
  'います': { distractors: ['あります', 'いません'] },
  '二つ': { distractors: ['一つ', '三つ'] },
  'それ': { distractors: ['これ', 'あれ'] },
  'あそこ': { distractors: ['ここ', 'そこ'] },
  '大きい': { distractors: ['大きく', '大きいな'] },
  '会社の資料': { distractors: ['会社を資料', '会社に資料'] },
  'これも本です': { distractors: ['これを本です', 'これも本ではありません'] },
  'それは何ですか': { distractors: ['それはどこですか', 'それはだれですか'] },
  '出口はどこですか': { distractors: ['出口は何ですか', '出口はここです'], prompt: '「출구는 어디입니까?」에 맞는 문장을 골라요.' },
  '飲みません': { distractors: ['飲みます', '飲みました'], prompt: '「마시지 않습니다」에 맞는 표현을 골라요.' },
  '食べました': { distractors: ['食べます', '食べません'], prompt: '「먹었습니다」에 맞는 표현을 골라요.' },
  '日本語が好きです': { distractors: ['日本語を好きです', '日本語に好きです'] },
  '今9時です': { distractors: ['今4時です', '今9円です'] },
  '100円です': { distractors: ['200円です', '100時です'] },
  'そこに本があります': { distractors: ['そこに本がいます', 'ここに本があります'], prompt: '「거기에 책이 있습니다」에 맞는 문장을 골라요.' },
  'ここに猫がいます': { distractors: ['ここに猫があります', 'そこに猫がいます'], prompt: '「여기에 고양이가 있습니다」에 맞는 문장을 골라요.' },
  'パンをください': { distractors: ['水をください', 'パンを食べました'], prompt: '「빵을 주세요」에 맞는 문장을 골라요.' },
  'みかんを三つください': { distractors: ['みかんを二つください', 'りんごを三つください'], prompt: '「귤 세 개를 주세요」에 맞는 문장을 골라요.' },
  'トイレはどこですか': { distractors: ['トイレは何ですか', '出口はどこですか'], prompt: '「화장실은 어디입니까?」에 맞는 문장을 골라요.' },
  '昨日、京都に行きました': { distractors: ['昨日、京都に行きませんでした', '明日、京都に行きます'], prompt: '「어제 교토에 갔습니다」에 맞는 문장을 골라요.' },
  '今日は会社に行きません': { distractors: ['今日は会社に行きます', '昨日は会社に行きました'], prompt: '「오늘은 회사에 가지 않습니다」에 맞는 문장을 골라요.' },
  'これはいくらですか': { distractors: ['これは何ですか', 'これはだれのですか'] },
  'りんごを二つください': { distractors: ['りんごを三つください', 'みかんを二つください'] },
  'ここに本があります': { distractors: ['ここに本がいます', 'そこに本があります'] },
  '確認します': { distractors: ['確認しました', '確認中です'] },
  '確認中です': { distractors: ['確認しました', '確認しません'] },
  '確認しました': { distractors: ['確認します', '確認中です'] },
  '資料を送りました': { distractors: ['資料を送ります', '資料を受け取りました'] },
  '会議は9時です': { distractors: ['会議は4時です', '会議は9時ですか'] },
  '会議は9時ですか': { distractors: ['会議は9時です', '会議は4時ですか'] },
  '確認をお願いします': { distractors: ['確認しました', '確認中です'] },
  '資料の確認をお願いします': { distractors: ['資料の確認が終わりました', '資料を送りました'] },
  '資料': { distractors: ['確認', '会議'], prompt: '제목에서 「자료」에 해당하는 명사를 골라요.' },
  '会議の時間': { distractors: ['資料の確認', '会議の場所'] },
};

export type GrammarChoicePractice = { prompt: string; choices: string[]; answer: string };
export function getGrammarChoicePractice(practice: GrammarWritingPractice): GrammarChoicePractice | null {
  const answer = practice.answers[0];
  const spec = specs[answer];
  if (!spec) return null; // New content must be reviewed, never fall back to typing or invented options.
  const choices = [answer, ...spec.distractors];
  if (new Set(choices).size !== choices.length || choices.filter(choice => practice.answers.includes(choice)).length !== 1) return null;
  const meaning = practice.prompt.match(/「([^」]+)」/)?.[1];
  // Original prompts sometimes spell out the Japanese answer; show only the requested meaning.
  const prompt = meaning ? `「${meaning}」에 맞는 ${practice.sentenceInput ? '문장' : '표현'}을 골라요.` : spec.prompt;
  if (!prompt) return null;
  const offset = [...practice.before + answer + practice.after].reduce((sum, character) => sum + character.codePointAt(0)!, 0) % choices.length;
  return { prompt, answer, choices: [...choices.slice(offset), ...choices.slice(0, offset)] };
}
