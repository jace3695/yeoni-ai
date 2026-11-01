import type { GrammarLesson } from './grammar';
import type { GrammarWritingPractice } from './grammarWritingPractice';

type Guide = { goal: string; steps: string[]; worked: string; hint: string };
type BridgeLesson = { lesson: GrammarLesson; guide: Guide; practice: GrammarWritingPractice; alternate: GrammarWritingPractice };
// Original Korean bridge material; existing subject/new-information ga-particle is untouched.
export const GRAMMAR_BRIDGE: BridgeLesson[] = [
  {
    lesson: {
      id: 'no-particle', title: 'の · 누구의 것인지 연결하기', level: 'beginner', category: '조사',
      summary: '물건의 주인이나 소속을 짧게 표현해요.', pattern: 'A の B',
      explanation: '명사는 사람·물건·장소 등의 이름이에요. 앞 명사가 뒤 명사를 설명하도록 の로 연결해요. 이번에는 주인·소속의 관계를 연습해요.',
      examples: [
        { japanese: 'これは私のかばんです。', reading: 'これはわたしのかばんです。', meaning: '이것은 제 가방입니다.' },
        { japanese: 'これは会社の資料です。', reading: 'これはかいしゃのしりょうです。', meaning: '이것은 회사 자료입니다.' },
      ],
      quiz: { question: '私와 かばん을 연결한 「내 가방」은?', choices: [{ text: '私のかばん', reading: 'わたしのかばん' }, { text: '私をかばん', reading: 'わたしをかばん' }], answer: '私のかばん', explanation: '주인 私와 물건 かばん을 の로 연결해요.' },
    },
    guide: { goal: '물건의 주인이나 소속을 표현할 수 있어요.', steps: ['私(わたし)는 나, かばん은 가방이에요. 私のかばん은 내 가방이에요.', '会社(かいしゃ)의 資料(しりょう)를 会社の資料로 연결해요. の가 언제나 소유권만 나타내지는 않아요.', '한국어에서는 의를 생략할 때도 있지만, 이 일본어 예문에서는 の를 넣어요.'], worked: '私 + の + かばん → 私のかばん (내 가방)', hint: '누구/어디 + の + 물건 순서예요.' },
    practice: { context: '가방에 누구의 것인지 표시해요.', words: '私(わたし) = 나 · かばん = 가방 · 本(ほん) = 책', prompt: '私와 かばん을 사용해 「내 가방」이라는 명사 덩어리를 써요.', before: 'これは', after: 'です。', answers: ['私のかばん', 'わたしのかばん'], result: 'これは私のかばんです。', reading: 'これはわたしのかばんです。', reason: '私가 가방의 주인을 알려 주고 두 명사를 の로 연결해요.' },
    alternate: { context: '자료가 어느 곳의 자료인지 표시해요.', words: '会社(かいしゃ) = 회사 · 資料(しりょう) = 자료', prompt: '会社와 資料를 사용해 「회사 자료」라는 명사 덩어리를 써요.', before: 'これは', after: 'です。', answers: ['会社の資料', 'かいしゃのしりょう', '会社のしりょう', 'かいしゃの資料'], result: 'これは会社の資料です。', reading: 'これはかいしゃのしりょうです。', reason: '어떤 곳의 자료인지 会社の가 알려 줘요. 두 명사를 단순히 붙이는 대신 の로 연결해요.' },
  },
  {
    lesson: {
      id: 'mo-particle', title: 'も · 나도 그렇다고 덧붙이기', level: 'beginner', category: '조사', summary: '앞의 내용과 같은 점을 ~도로 덧붙여요.', pattern: 'A も B です',
      explanation: '이번 명사문에서는 私は를 私も로 바꿔 같은 점을 덧붙여요. 私はも라고 붙이지 않아요. 다른 조사와 함께 쓰이는 경우도 있으므로 모든 조사를 늘 지운다고 외우지는 않아요.',
      examples: [
        { japanese: '私も会社員です。', reading: 'わたしもかいしゃいんです。', meaning: '(다른 사람도 회사원인 상황) 저도 회사원입니다.' },
        { japanese: 'これも本です。', reading: 'これもほんです。', meaning: '(앞의 물건도 책인 상황) 이것도 책입니다.' },
      ],
      quiz: { question: '다른 사람도 회사원이에요. 「저도 회사원입니다」의 私 뒤에는?', choices: ['も', 'はも', 'を'], answer: 'も', explanation: '이미 나온 내용에 나도 포함되므로 私も라고 써요.' },
    },
    guide: { goal: '앞의 내용과 같은 점을 ~도로 덧붙일 수 있어요.', steps: ['다른 사람도 회사원인 상황에서 나도 그렇다고 하면 私も会社員です예요.', '이번 명사문에서는 は 대신 も를 써요. 私はも처럼 둘을 겹치지 않아요.', '다른 문형에서는 조사와 も가 함께 쓰이기도 해요. 이번 명사문 범위로 익혀요.'], worked: '私(저) + も(도) + 会社員(회사원) + です → 私も会社員です。', hint: '이미 나온 내용에 포함시키는 도를 찾아요.' },
    practice: { context: '다른 사람도 회사원이고 나도 회사원이에요.', words: '私(わたし) = 나 · 会社員(かいしゃいん) = 회사원', prompt: '「저도 회사원입니다」에서 도에 해당하는 조사 하나를 넣어요.', before: '私', after: '会社員です。', answers: ['も'], result: '私も会社員です。', reading: 'わたしもかいしゃいんです。', reason: '앞의 내용에 나도 포함시키므로 も를 써요.' },
    alternate: { context: '앞에서 본 물건도 책이고 이것도 책이에요.', words: 'これ = 이것 · 本(ほん) = 책', prompt: 'これ・も・本・です를 모두 사용해 「이것도 책입니다」 한 문장을 써요.', before: '', after: '。', sentenceInput: true, answers: ['これも本です', 'これもほんです'], result: 'これも本です。', reading: 'これもほんです。', reason: 'これ → も → 本 → です 순서로 같은 점을 덧붙여요.' },
  },
  {
    lesson: {
      id: 'nan', title: '何 · 무엇인지 묻기', level: 'beginner', category: '지시어', summary: '모르는 물건의 이름을 묻는 문장을 써요.', pattern: 'これは何ですか',
      explanation: '何ですか의 何는 なん으로 읽어요. なに로 읽는 다른 문장도 있지만 이번에는 何ですか의 읽기부터 익혀요. 모든 何를 なん으로 읽는 규칙은 아니에요.',
      examples: [{ japanese: 'これは何ですか。', reading: 'これはなんですか。', meaning: '이것은 무엇입니까?' }, { japanese: 'それは何ですか。', reading: 'それはなんですか。', meaning: '그것은 무엇입니까?' }],
      quiz: { question: '何ですか에서 何의 읽는 법은?', choices: ['なん', 'どこ', 'だれ'], answer: 'なん', explanation: '이 문형의 何는 なん으로 읽어요. 장소를 묻는 どこ와 구분해요.' },
    },
    guide: { goal: '모르는 물건의 이름을 묻는 짧은 문장을 만들 수 있어요.', steps: ['これ는 이것, それ는 그것이에요. 질문할 물건부터 정해요.', '何ですか는 무엇입니까예요. 이 자리의 何는 なん으로 읽어요.', '끝의 か가 질문임을 알려 줘요. 물건 이름을 묻는 질문과 위치 질문을 구분해요.'], worked: 'これ + は + 何(なん) + ですか → これは何ですか。', hint: '무엇인지 묻는 何와 공손한 질문 끝 ですか를 연결해요.' },
    practice: { context: '사진 속 물건의 이름이 궁금해 질문을 적어요.', words: 'これ = 이것 · 何(なん) = 무엇 · ですか = 입니까', prompt: '何ですか 문형으로 「이것은 무엇입니까?」를 완성해요.', before: 'これは', after: '。', answers: ['何ですか', 'なんですか'], result: 'これは何ですか。', reading: 'これはなんですか。', reason: '물건 이름을 묻는 何 뒤에 공손한 질문 끝 ですか를 붙여요.' },
    alternate: { context: '상대 쪽의 물건이 무엇인지 질문을 적어요.', words: 'それ = 그것 · 何(なん) = 무엇', prompt: 'それ・は・何・ですか를 모두 사용해 「그것은 무엇입니까?」 한 문장을 써요.', before: '', after: '。', sentenceInput: true, questionInput: true, answers: ['それは何ですか', 'それはなんですか'], result: 'それは何ですか。', reading: 'それはなんですか。', reason: '何ですか 앞에 질문할 대상 それは를 붙여요.' },
  },
  {
    lesson: {
      id: 'doko', title: 'どこ · 장소 묻기', level: 'beginner', category: '지시어', summary: '필요한 장소가 어디인지 묻는 문장을 써요.', pattern: '장소 이름 は どこですか',
      explanation: 'どこ는 장소를 물어요. 何ですか는 무엇인지, どこですか는 위치를 묻는 질문이에요. 다른 공손한 표현도 있지만 이번에는 どこ를 연습해요.',
      examples: [{ japanese: 'トイレはどこですか。', reading: 'といれはどこですか。', meaning: '화장실은 어디입니까?' }, { japanese: '出口はここです。', reading: 'でぐちはここです。', meaning: '출구는 여기입니다.' }],
      quiz: { question: 'トイレ의 위치를 묻는 질문에서 사용할 말은?', choices: ['どこ', '何', 'だれ'], answer: 'どこ', explanation: '이름이 아니라 장소가 어디인지 물으므로 どこ를 써요.' },
    },
    guide: { goal: '필요한 장소가 어디인지 묻는 문장을 만들 수 있어요.', steps: ['トイレ는 화장실, 出口(でぐち)는 출구예요.', '위치를 알고 싶은 장소 이름 뒤에 は どこですか를 붙여요.', 'ここ는 여기라는 답, どこ는 어디라는 질문이에요. 何는 물건 이름을 물을 때 쓰는 말이에요.'], worked: 'トイレ + は + どこ + ですか → トイレはどこですか。', hint: '위치를 묻는 어디와 공손한 질문 끝을 연결해요.' },
    practice: { context: '안내도에 화장실 위치가 없어 질문을 준비해요.', words: 'トイレ = 화장실 · どこ = 어디 · ここ = 여기', prompt: 'どこ 표현으로 「화장실은 어디입니까?」를 완성해요.', before: 'トイレは', after: '。', answers: ['どこですか'], result: 'トイレはどこですか。', reading: 'といれはどこですか。', reason: '장소가 어디인지 묻는 질문은 どこですか로 끝나요.' },
    alternate: { context: '안내도에서 출구의 위치를 확인하려고 해요.', words: '出口(でぐち) = 출구 · どこ = 어디', prompt: '出口・は・どこ・ですか를 모두 사용해 출구의 위치를 묻는 한 문장을 써요.', before: '', after: '。', sentenceInput: true, questionInput: true, answers: ['出口はどこですか', 'でぐちはどこですか'], result: '出口はどこですか。', reading: 'でぐちはどこですか。', reason: '대상 出口를 앞에 놓고 どこですか로 위치를 물어요.' },
  },
  {
    lesson: {
      id: 'masen', title: 'ません · 하지 않는 일', level: 'beginner', category: 'です/ます', summary: '현재 습관이나 앞으로 하지 않을 일을 정중하게 적어요.', pattern: '배운 ます형의 ます → ません',
      explanation: '이미 배운 ます형에서 끝의 ます를 ません으로 바꿔요. 동사 사전형에 아무렇게나 ません을 붙이는 규칙은 아니에요. 문맥에 따라 습관이나 앞으로의 일을 부정하며, 과거 부정은 별도예요.',
      examples: [{ japanese: '今日は会社に行きません。', reading: 'きょうはかいしゃにいきません。', meaning: '오늘은 회사에 가지 않습니다.' }, { japanese: '私はコーヒーを飲みません。', reading: 'わたしはこーひーをのみません。', meaning: '저는 커피를 마시지 않습니다.' }],
      quiz: { question: '주어진 行きます를 ません 형태로 바꾸면?', choices: [{ text: '行きません', reading: 'いきません' }, { text: '行くません', reading: 'いくません' }], answer: '行きません', explanation: '行き는 유지하고 ます를 ません으로 바꿔요.' },
    },
    guide: { goal: '하지 않는 일을 정중한 메모로 적을 수 있어요.', steps: ['이미 배운 行きます(갑니다), 飲みます(마십니다)에서 시작해요.', '끝의 ます만 ません으로 바꿔 行きません, 飲みません으로 만들어요.', '오늘의 계획이나 평소 습관을 부정할 수 있어요. 과거 부정이나 모든 동사 활용을 배웠다는 뜻은 아니에요.'], worked: '行きます → 行きません → 今日は会社に行きません。', hint: '주어진 ます형에서 ます 부분만 바꿔요.' },
    practice: { context: '일정에 오늘 회사에 가지 않을 계획을 표시해요.', words: '今日(きょう) = 오늘 · 会社(かいしゃ) = 회사 · 行きます(いきます) = 갑니다', prompt: '주어진 行きます를 ません 형태로 바꿔 빈칸에 써요.', before: '今日は会社に', after: '。', answers: ['行きません', 'いきません'], result: '今日は会社に行きません。', reading: 'きょうはかいしゃにいきません。', reason: '行き는 유지하고 공손한 끝맺음 ます를 ません으로 바꿔요.' },
    alternate: { context: '커피를 마시지 않는 습관을 짧게 적어요.', words: '私(わたし) = 나 · コーヒー = 커피 · 飲みます(のみます) = 마십니다', prompt: '주어진 飲みます를 ません 형태로 바꿔 빈칸에 써요.', before: '私はコーヒーを', after: '。', answers: ['飲みません', 'のみません'], result: '私はコーヒーを飲みません。', reading: 'わたしはこーひーをのみません。', reason: '飲みます → 飲みません이에요. 飲むません으로 붙이지 않아요.' },
  },
  {
    lesson: {
      id: 'mashita', title: 'ました · 마친 일 적기', level: 'beginner', category: 'です/ます', summary: '이미 한 일을 짧고 정중하게 기록해요.', pattern: '배운 ます형의 ます → ました',
      explanation: '이미 배운 ます형의 ます를 ました로 바꿔 한 일을 정중하게 표현해요. 昨日(きのう)는 언제 했는지를 알려 주고, ました가 반드시 어제만 뜻하지는 않아요. 과거 부정과 다른 활용은 별도예요.',
      examples: [{ japanese: '昨日、京都に行きました。', reading: 'きのう、きょうとにいきました。', meaning: '어제 교토에 갔습니다.' }, { japanese: 'パンを食べました。', reading: 'ぱんをたべました。', meaning: '빵을 먹었습니다.' }],
      quiz: { question: '주어진 食べます를 ました 형태로 바꾸면?', choices: [{ text: '食べました', reading: 'たべました' }, { text: '食べるました', reading: 'たべるました' }], answer: '食べました', explanation: '食べ는 유지하고 ます를 ました로 바꿔요.' },
    },
    guide: { goal: '이미 한 일을 짧은 기록으로 남길 수 있어요.', steps: ['昨日(きのう)는 어제, 京都(きょうと)는 교토예요.', '行きます → 行きました, 食べます → 食べました처럼 배운 ます형의 끝을 바꿔요.', 'ました는 이미 한 일을 나타내요. 昨日 없이도 쓸 수 있고 반드시 어제만을 뜻하지 않아요.'], worked: '行きます → 行きました → 昨日、京都に行きました。', hint: '주어진 ます형의 끝을 이미 마친 일에 맞게 바꿔요.' },
    practice: { context: '여행에서 어제 다녀온 곳을 기록해요.', words: '昨日(きのう) = 어제 · 京都(きょうと) = 교토 · 行きます(いきます) = 갑니다', prompt: '주어진 行きます를 ました 형태로 바꿔 빈칸에 써요.', before: '昨日、京都に', after: '。', answers: ['行きました', 'いきました'], result: '昨日、京都に行きました。', reading: 'きのう、きょうとにいきました。', reason: '이미 마친 일을 적으므로 行きます의 끝을 ました로 바꿔요.' },
    alternate: { context: '여행에서 먹은 것을 한 줄 기록해요.', words: 'パン = 빵 · 食べます(たべます) = 먹습니다', prompt: '주어진 食べます를 ました 형태로 바꿔 빈칸에 써요.', before: 'パンを', after: '。', answers: ['食べました', 'たべました'], result: 'パンを食べました。', reading: 'ぱんをたべました。', reason: '주어진 ます형 食べます에서 食べ는 유지하고 ました를 붙여요.' },
  },
  {
    lesson: {
      id: 'ga-suki', title: 'が好きです · 좋아하는 것', level: 'beginner', category: '조사', summary: '좋아하는 음식이나 관심사를 짧게 소개해요.', pattern: '私は N が好きです',
      explanation: '한국어는 커피를 좋아해요라고 하지만 이 일본어 문형에서는 コーヒーが好きです라고 써요. 을/를을 늘 を로 바꾸지 않아요. 이번에는 が好きです 문형에 한정하며 が의 모든 기능을 다루지는 않아요.',
      examples: [{ japanese: '私はコーヒーが好きです。', reading: 'わたしはこーひーがすきです。', meaning: '저는 커피를 좋아합니다.' }, { japanese: '日本語が好きです。', reading: 'にほんごがすきです。', meaning: '일본어를 좋아합니다.' }],
      quiz: { question: '이번 목표 문형 Nが好きです에서 N 뒤의 조사는?', choices: ['が', 'を', 'に'], answer: 'が', explanation: '이번 好きです 문형은 좋아하는 대상 뒤에 が를 써요. 한국어 을/를을 바로 を로 옮기지 않아요.' },
    },
    guide: { goal: '좋아하는 것을 한 줄로 소개할 수 있어요.', steps: ['好き(すき)는 좋아함을 나타내요. コーヒーが好きです는 커피를 좋아합니다예요.', 'コーヒーを飲みます와 コーヒーが好きです처럼 표현 전체에 맞춰 조사를 골라요.', '문맥에 따라 は로 대비할 수도 있지만 이번에는 Nが好きです를 연습해요. は/が 전체 구별을 마친 것은 아니에요.'], worked: '日本語(일본어) + が + 好き(좋아함) + です → 日本語が好きです。', hint: '이번에 지정한 Nが好きです 문형을 떠올려요.' },
    practice: { context: '자기소개 메모에 좋아하는 음료를 적어요.', words: '私(わたし) = 나 · コーヒー = 커피 · 好き(すき) = 좋아함', prompt: 'Nが好きです 문형으로 「저는 커피를 좋아합니다」를 완성해요.', before: '私はコーヒー', after: '好きです。', answers: ['が'], result: '私はコーヒーが好きです。', reading: 'わたしはこーひーがすきです。', reason: '이번 목표 문형에서 좋아하는 대상에는 が를 붙여요. 다른 문맥의 は까지 틀린 문법이라고 판정하는 문제가 아니에요.' },
    alternate: { context: '자기소개 메모에 관심사를 적어요.', words: '日本語(にほんご) = 일본어 · 好き(すき) = 좋아함', prompt: '日本語・が・好き・です를 모두 사용해 「일본어를 좋아합니다」 한 문장을 써요.', before: '', after: '。', sentenceInput: true, answers: ['日本語が好きです', 'にほんごがすきです', '日本語がすきです', 'にほんごが好きです'], result: '日本語が好きです。', reading: 'にほんごがすきです。', reason: '日本語 → が → 好き → です로 좋아하는 대상을 설명해요.' },
  },
];
export const BRIDGE_LESSONS = GRAMMAR_BRIDGE.map(item => item.lesson);
export const BRIDGE_GUIDES = Object.fromEntries(GRAMMAR_BRIDGE.map(item => [item.lesson.id, item.guide]));
export const BRIDGE_WRITING = Object.fromEntries(GRAMMAR_BRIDGE.map(item => [item.lesson.id, item.practice]));
export const BRIDGE_ALTERNATES = Object.fromEntries(GRAMMAR_BRIDGE.map(item => [item.lesson.id, item.alternate]));
