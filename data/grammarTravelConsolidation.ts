import type { GrammarWritingPractice } from './grammarWritingPractice';
import { TRAVEL_TWO_APPLES } from './grammarTravel.ts';

export const TRAVEL_CONSOLIDATION: Record<string, GrammarWritingPractice> = {
  shopPrice: { context: '가상 가게의 메모 첫 줄에 물건의 가격을 물어요.', words: 'これ = 이것 · いくら = 얼마 · ですか = 입니까', prompt: 'これ・は・いくら・ですか로 「이것은 얼마입니까?」 한 문장을 써요.', before: '', after: '。', sentenceInput: true, questionInput: true, answers: ['これはいくらですか'], result: 'これはいくらですか。', reading: 'これはいくらですか。', reason: '값을 묻는 いくら와 질문 끝 ですか를 연결해요.' },
  shopQuantity: { context: '가상 가게 메모 둘째 줄에 사과 두 개를 요청해요.', words: 'りんご = 사과 · 二つ(ふたつ) = 두 개 · ください = 주세요', prompt: 'りんご・を・二つ・ください 순서로 「사과 두 개를 주세요」 한 문장을 써요. つ 방식의 수량을 사용해요.', before: '', after: '。', sentenceInput: true, answers: TRAVEL_TWO_APPLES, result: 'りんごを二つください。', reading: 'りんごをふたつください。', reason: '요청하는 과일 뒤에 を, 그 뒤에 수량을 두어요. 가격 질문과 수량 요청은 다른 목적의 문장이에요.' },
  roomObject: { context: '방 안내 메모 첫 줄에 여기에 놓인 책을 소개해요.', words: 'ここ = 여기 · 本(ほん) = 책 · あります = (물건이) 있습니다', prompt: 'ここ・に・本・が・あります 순서로 「여기에 책이 있습니다」 한 문장을 써요.', before: '', after: '。', sentenceInput: true, answers: ['ここに本があります', 'ここにほんがあります'], result: 'ここに本があります。', reading: 'ここにほんがあります。', reason: '놓인 책의 위치는 に로, 존재는 あります로 표현해요.' },
  roomAnimal: { context: '방 안내 메모 둘째 줄에 여기 있는 고양이를 소개해요.', words: 'ここ = 여기 · 猫(ねこ) = 고양이 · います = (사람·동물이) 있습니다', prompt: 'ここ・に・猫・が・います 순서로 「여기에 고양이가 있습니다」 한 문장을 써요.', before: '', after: '。', sentenceInput: true, answers: ['ここに猫がいます', 'ここにねこがいます'], result: 'ここに猫がいます。', reading: 'ここにねこがいます。', reason: '고양이의 위치에는 います를 써요. 앞줄의 놓인 책에 쓴 あります와 비교해요.' },
};
