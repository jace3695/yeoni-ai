import type { GrammarWritingPractice } from './grammarWritingPractice';

const travelPast = ['昨日、', '昨日', 'きのう、', 'きのう'].flatMap(day =>
  ['京都', 'きょうと'].flatMap(place => ['に', 'へ'].flatMap(particle =>
    ['行きました', 'いきました'].map(verb => day + place + particle + verb))));
const travelPlan = ['今日は', 'きょうは'].flatMap(day => ['会社', 'かいしゃ'].flatMap(place =>
  ['に', 'へ'].flatMap(particle => ['行きません', 'いきません'].map(verb => day + place + particle + verb))));

// Consolidation is practice, not new grammar lessons or a persisted mastery score.
export const CONSOLIDATION_PRACTICES: Record<string, GrammarWritingPractice> = {
  map: {
    context: '가상 안내도에 「出口はここです。」와 화장실 표지만 있어요. 출구는 여기라고 알 수 있지만 화장실 위치는 표시되지 않았어요.',
    words: '出口(でぐち) = 출구 · ここ = 여기 · トイレ = 화장실 · どこ = 어디',
    prompt: 'トイレ・は・どこ・ですか를 모두 사용해 화장실 위치를 묻는 한 문장을 써요.',
    before: '', after: '。', sentenceInput: true, questionInput: true,
    answers: ['トイレはどこですか', 'といれはどこですか'], result: 'トイレはどこですか。', reading: 'といれはどこですか。',
    reason: '화장실이 무엇인지는 알고 위치를 모르므로 何가 아니라 どこ로 물어요.',
  },
  past: {
    context: '어제 교토에 다녀온 일을 여행 기록 첫 줄에 적어요.',
    words: '昨日(きのう) = 어제 · 京都(きょうと) = 교토 · 行きました(いきました) = 갔습니다',
    prompt: '昨日・京都・に・行きました로 어제의 일을 한 문장으로 써요. 목적지의 へ도 허용해요.',
    before: '', after: '。', sentenceInput: true, answers: travelPast,
    result: '昨日、京都に行きました。', reading: 'きのう、きょうとにいきました。',
    answerReadings: Object.fromEntries(travelPast.map(answer => [answer, `きのう、きょうと${answer.includes('へ') ? 'へ' : 'に'}いきました。`])),
    reason: '이미 한 일이므로 ました로 마쳐요. に와 방향의 へ는 모두 이 문장에 맞아요. へ는 조사일 때 에로 읽어요.',
  },
  plan: {
    context: '오늘 회사에 가지 않을 계획을 여행 기록 둘째 줄에 적어요.',
    words: '今日(きょう) = 오늘 · 会社(かいしゃ) = 회사 · 行きません(いきません) = 가지 않습니다',
    prompt: '今日・は・会社・に・行きません으로 오늘의 계획을 한 문장으로 써요. 목적지의 へ도 허용해요.',
    before: '', after: '。', sentenceInput: true, answers: travelPlan,
    result: '今日は会社に行きません。', reading: 'きょうはかいしゃにいきません。',
    answerReadings: Object.fromEntries(travelPlan.map(answer => [answer, `きょうはかいしゃ${answer.includes('へ') ? 'へ' : 'に'}いきません。`])),
    reason: '오늘 하지 않을 계획이므로 ません으로 마쳐요. 어제 이미 한 일의 ました와 구분해요. 방향의 へ도 가능하며 에로 읽어요.',
  },
};
