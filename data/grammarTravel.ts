import type { GrammarGuidedLesson } from './grammarBridge';

// Finite source-authored alternatives; never a pattern applied to arbitrary user input.
export const TRAVEL_TIME_NINE = ['今', 'いま'].flatMap(now => ['', '、', ','].flatMap(comma => ['9時', '九時', 'くじ', '9じ', '九じ'].map(hour => now + comma + hour + 'です')));
export const TRAVEL_PRICE_HUNDRED = ['100円', '百円', 'ひゃくえん', '100えん', '百えん', 'ひゃく円'].map(price => price + 'です');
export const TRAVEL_THREE_ORANGES = ['みかん', 'ミカン', '蜜柑'].flatMap(fruit => ['三つ', '3つ', 'みっつ'].map(count => fruit + 'を' + count + 'ください'));
export const TRAVEL_TWO_APPLES = ['りんご', 'リンゴ', '林檎'].flatMap(fruit => ['二つ', '2つ', 'ふたつ'].map(count => fruit + 'を' + count + 'ください'));

export const GRAMMAR_TRAVEL: GrammarGuidedLesson[] = [
  {
    lesson: {
      id: 'time-on-hour', title: '정각 · 지금 몇 시예요?', level: 'basic', category: '기타', summary: '분이 없는 시간을 읽고 한 줄로 적어요.', pattern: '今、何時ですか / 今、数字時です',
      explanation: '숫자 + 時 + です로 정각을 적어요. 4·7·9시는 よじ·しちじ·くじ로 먼저 익혀요. 이번 쓰기는 4시와 9시예요. 몇 시간이라는 길이와 몇 시라는 시각은 다르며 분·오전/오후는 다음 범위예요.',
      examples: [{ japanese: '今、何時ですか。', reading: 'いま、なんじですか。', meaning: '지금 몇 시입니까?' }, { japanese: '今、4時です。', reading: 'いま、よじです。', meaning: '지금 4시입니다.' }],
      quiz: { question: '4時의 읽는 법은? (소리를 평가하는 문제가 아니에요)', choices: ['よじ', 'よんじ'], answer: 'よじ', explanation: '정각 4時는 よじ로 읽어요. 숫자 4의 다른 읽기를 그대로 붙이지 않아요.' },
    },
    guide: { goal: '정각 시간을 읽고 지금 4시라고 적을 수 있어요.', steps: ['今(いま)는 지금, 何時(なんじ)는 몇 시예요.', '1時いちじ · 2時にじ · 3時さんじ · 4時よじ · 5時ごじ · 6時ろくじ · 7時しちじ · 8時はちじ · 9時くじ · 10時じゅうじ · 11時じゅういちじ · 12時じゅうにじ', '숫자에 時를 붙여 시각을 적어요. 이번에는 분이 없는 4시와 9시를 써 봐요. 시간 길이나 분을 표현하는 문제는 아니에요.'], worked: '4시 → 4時(よじ) → 今、4時です。', hint: '4시는 よじ, 9시는 くじ예요. 시각을 나타내는 時도 함께 적어요.' },
    practice: { context: '가상 시계의 현재 시각은 4:00이에요. 약속 메모 옆에 시각을 적어요.', words: '今(いま) = 지금 · 時(じ) = 시 · 4時(よじ) = 4시', prompt: '「4시」를 적어 지금 4시라는 문장을 완성해요. 시각 단위까지 입력해요.', before: '今、', after: 'です。', answers: ['4時', '四時', 'よじ', '4じ', '四じ'], result: '今、4時です。', reading: 'いま、よじです。', reason: '시각은 時를 붙이며 4時는 よじ로 읽어요. 숫자 표기를 맞혔다고 발음 능력을 평가하지는 않아요.' },
    alternate: { context: '여행 메모에 적을 현재 시각은 9:00이에요.', words: '今(いま) = 지금 · 9時(くじ) = 9시 · です = 입니다', prompt: '今・9時・です로 「지금 9시입니다」 한 문장을 써요. 今 뒤 쉼표는 생략해도 돼요.', before: '', after: '。', sentenceInput: true, answers: TRAVEL_TIME_NINE, result: '今、9時です。', reading: 'いま、くじです。', reason: '9時는 くじ로 읽어요. 시각을 적고 です로 마쳐요. 이번 문장은 질문이 아닌 시각 설명이에요.' },
  },
  {
    lesson: {
      id: 'price-yen', title: '가격 · 100엔과 200엔', level: 'basic', category: '기타', summary: '가격을 묻고 100/200엔 가격표를 읽어요.', pattern: 'これはいくらですか / 金額円です',
      explanation: 'これはいくらですか로 가격을 물어요. 답은 금액 + 円 + です예요. 한국의 원과 일본의 円은 서로 다른 돈 단위예요. 이번에는 환율이나 큰 금액의 읽기 변화를 다루지 않아요.',
      examples: [{ japanese: 'これはいくらですか。', reading: 'これはいくらですか。', meaning: '이것은 얼마입니까?' }, { japanese: '200円です。', reading: 'にひゃくえんです。', meaning: '200엔입니다.' }],
      quiz: { question: '가격표의 円은 어떤 뜻인가요?', choices: ['엔', '시'], answer: '엔', explanation: '円(えん)은 일본 돈의 단위 엔이에요. 시각의 時와 구분해요.' },
    },
    guide: { goal: '가격 질문과 100/200엔 가격표를 읽고 쓸 수 있어요.', steps: ['これ는 이것, いくら는 얼마예요. 값이 궁금하면 これはいくらですか라고 물어요.', '100은 ひゃく, 200은 にひゃく예요. 円을 붙이면 100円ひゃくえん, 200円にひゃくえん이에요.', '100/200엔만 연습해요. 실제 구매나 환율 계산, 300/600/800 등의 읽기 변화는 이번 범위가 아니에요.'], worked: '가상 가격표 100엔 → 100円 → 100円です。', hint: '가격을 묻는 얼마는 いくら, 답에는 돈 단위 円도 적어요.' },
    practice: { context: '가상 가게에서 물건 값을 묻는 메모를 써요.', words: 'これ = 이것 · いくら = 얼마 · 円(えん) = 엔', prompt: '가격 질문의 「얼마」에 해당하는 말을 빈칸에 적어요.', before: 'これは', after: 'ですか。', answers: ['いくら'], result: 'これはいくらですか。', reading: 'これはいくらですか。', reason: '값은 いくら로 물어요. 물건 이름을 묻는 何와 구분해요.' },
    alternate: { context: '가상 가격표에 100엔이라고 적혀 있어요.', words: '100円(ひゃくえん) = 100엔 · です = 입니다', prompt: '100円・です로 「100엔입니다」 한 문장을 써요. 돈 단위를 포함해요.', before: '', after: '。', sentenceInput: true, answers: TRAVEL_PRICE_HUNDRED, result: '100円です。', reading: 'ひゃくえんです。', reason: '금액 뒤에 円을 적고 です로 끝내요. 전각 숫자와 지정된 한자·가나 표기도 같은 금액으로 인정해요.' },
  },
  {
    lesson: {
      id: 'place-arimasu', title: 'あります · 물건이 있는 곳', level: 'basic', category: '조사', summary: '책과 가방이 있는 위치를 적어요.', pattern: '장소 に 물건 が あります',
      explanation: '놓인 물건의 위치는 장소 뒤 に, 있는 물건 뒤 が를 써요. 행동 장소의 で와 구분해요. 모든 あります 문장에 に만 쓴다는 규칙은 아니며 행사 발생 장소 등은 별도예요.',
      examples: [{ japanese: 'ここにかばんがあります。', reading: 'ここにかばんがあります。', meaning: '여기에 가방이 있습니다.' }, { japanese: 'そこに本があります。', reading: 'そこにほんがあります。', meaning: '거기에 책이 있습니다.' }],
      quiz: { question: '여기 놓인 책의 위치를 소개하는 이번 문형은?', choices: [{ text: 'ここに本があります', reading: 'ここにほんがあります' }, { text: 'ここで本があります', reading: 'ここでほんがあります' }], answer: 'ここに本があります', explanation: '책이 있는 위치에는 に를 써요. 여기서 공부하는 행동 장소 で와 구분해요.' },
    },
    guide: { goal: '어디에 어떤 물건이 있는지 메모할 수 있어요.', steps: ['ここ는 여기, そこ는 거기, かばん은 가방, 本(ほん)은 책이에요.', '장소 → に → 물건 → が → あります 순서로 물건이 있음을 소개해요.', '여기서 공부합니다의 ここで와 여기에 책이 있습니다의 ここに를 구별해요. 여기서는 놓인 책·가방의 위치만 다뤄요.'], worked: 'ここ + に + 本 + が + あります → ここに本があります。', hint: '물건이 있는 위치를 나타내는 に를 써요.' },
    practice: { context: '방 안내 메모에 여기에 가방이 있다고 적어요.', words: 'ここ = 여기 · かばん = 가방 · あります = (물건이) 있습니다', prompt: 'あります 문형에서 물건의 위치를 나타내는 조사 하나를 넣어요.', before: 'ここ', after: 'かばんがあります。', answers: ['に'], result: 'ここにかばんがあります。', reading: 'ここにかばんがあります。', reason: '가방이 있는 곳에 に를 써요. 이동 방향의 へ가 아니라 지금 있는 위치를 나타내는 문형이에요.' },
    alternate: { context: '거기에 책이 있다는 방 안내 메모를 써요.', words: 'そこ = 거기 · 本(ほん) = 책 · あります = 있습니다', prompt: 'そこ・に・本・が・あります를 이 순서로 써서 한 문장을 만들어요.', before: '', after: '。', sentenceInput: true, answers: ['そこに本があります', 'そこにほんがあります'], result: 'そこに本があります。', reading: 'そこにほんがあります。', reason: '장소 → に → 물건 → が → あります로 책이 있는 곳을 적었어요.' },
  },
  {
    lesson: {
      id: 'place-imasu', title: 'います · 사람과 동물이 있는 곳', level: 'basic', category: '조사', summary: '점원과 고양이가 있는 위치를 적어요.', pattern: '장소 に 사람/동물 が います',
      explanation: '이번 예문의 사람과 고양이는 います를 써요. 물건의 あります와 구별해요. 살아 있으면 무조건 います라는 규칙은 아니에요. 식물 등에는 보통 あります를 쓰므로 이번에는 사람·동물에 집중해요.',
      examples: [{ japanese: '店に店員がいます。', reading: 'みせにてんいんがいます。', meaning: '가게에 점원이 있습니다.' }, { japanese: 'ここに猫がいます。', reading: 'ここにねこがいます。', meaning: '여기에 고양이가 있습니다.' }],
      quiz: { question: '店員(てんいん, 점원)이 있다고 쓰는 이번 표현은?', choices: [{ text: '店員がいます', reading: 'てんいんがいます' }, { text: '店員があります', reading: 'てんいんがあります' }], answer: '店員がいます', explanation: '사람인 점원이 있다고 표현할 때 います를 써요.' },
    },
    guide: { goal: '사람과 동물의 위치를 います로 적을 수 있어요.', steps: ['店(みせ)는 가게, 店員(てんいん)은 점원, 猫(ねこ)는 고양이예요.', '장소 → に → 사람/동물 → が → います 순서로 위치를 적어요.', '本があります와 猫がいます를 비교해요. 모든 살아 있는 대상에 います를 붙이는 규칙으로 외우지는 않아요.'], worked: 'ここ + に + 猫 + が + います → ここに猫がいます。', hint: '이번에 소개하는 대상이 점원·고양이면 います예요.' },
    practice: { context: '안내 그림에 가게 안의 점원이 보여요.', words: '店(みせ) = 가게 · 店員(てんいん) = 점원 · います = (사람·동물이) 있습니다', prompt: '「있습니다」를 이번 사람 위치 문형으로 적어요.', before: '店に店員が', after: '。', answers: ['います'], result: '店に店員がいます。', reading: 'みせにてんいんがいます。', reason: '사람인 점원의 위치에는 います를 써요.' },
    alternate: { context: '여기에 고양이가 있다는 그림 설명을 적어요.', words: 'ここ = 여기 · 猫(ねこ) = 고양이 · います = 있습니다', prompt: 'ここ・に・猫・が・います 순서로 한 문장을 적어요.', before: '', after: '。', sentenceInput: true, answers: ['ここに猫がいます', 'ここにねこがいます'], result: 'ここに猫がいます。', reading: 'ここにねこがいます。', reason: '고양이는 이번에 배운 동물 위치 표현 います를 써요.' },
  },
  {
    lesson: {
      id: 'noun-kudasai', title: 'をください · 물건 요청', level: 'basic', category: '기타', summary: '가게에서 물건을 요청하는 쪽지를 써요.', pattern: '물건 이름 をください',
      explanation: '물건 이름 뒤에 をください를 붙여요. 행동을 부탁하는 문장을 이 모양으로 만들지는 않아요. 가게 주문 맥락의 간단한 표현이며 상사·고객에게 보내는 업무 요청 전체를 배운 것은 아니에요.',
      examples: [{ japanese: '水をください。', reading: 'みずをください。', meaning: '물을 주세요.' }, { japanese: 'これをください。', reading: 'これをください。', meaning: '이것을 주세요.' }],
      quiz: { question: '本(ほん, 책)을 요청하는 이번 목표 문형은?', choices: [{ text: '本をください', reading: 'ほんをください' }, { text: '本にください', reading: 'ほんにください' }], answer: '本をください', explanation: '요청할 물건 뒤에 をください를 붙여요.' },
    },
    guide: { goal: '가게에서 물건을 요청하는 짧은 문장을 쓸 수 있어요.', steps: ['水(みず)는 물, パン은 빵, これ는 이것이에요.', '물건 이름 + を + ください로 쪽지를 써요. 행동을 부탁하는 て형은 이번에 사용하지 않아요.', '말할 때 を를 빼기도 하지만 이번 글쓰기 목표에는 を를 넣어요. 실제 주문이나 업무 요청을 보내는 기능은 아니에요.'], worked: 'パン + を + ください → パンをください。', hint: '물건을 요청하는 이번 문형은 をください예요.' },
    practice: { context: '가상 가게에서 물을 요청하는 쪽지를 연습해요.', words: '水(みず) = 물 · をください = 을/를 주세요', prompt: '물 뒤에 붙는 이번 목표 조사를 하나 넣어요.', before: '水', after: 'ください。', answers: ['を'], result: '水をください。', reading: 'みずをください。', reason: '요청하는 물건과 ください를 を로 연결해요. 이번에는 を를 포함한 문형을 써요.' },
    alternate: { context: '가상 가게에서 빵을 요청하는 쪽지를 적어요.', words: 'パン = 빵 · をください = 을/를 주세요', prompt: 'パン・を・ください를 모두 사용해 한 문장을 써요.', before: '', after: '。', sentenceInput: true, answers: ['パンをください', 'ぱんをください'], result: 'パンをください。', reading: 'ぱんをください。', reason: '물건 이름 + をください로 요청해요. 전체 문장을 적는 연습이며 보통 빵은 パン으로 표기해요.' },
  },
  {
    lesson: {
      id: 'quantity-hitotsu', title: 'つ · 과일 1–3개 요청', level: 'basic', category: '기타', summary: '사과·귤 1–3개를 요청하는 메모를 써요.', pattern: '과일 を 수량 ください',
      explanation: '이번 과일은 つ 방식으로 세어요. 一つひとつ・二つふたつ・三つみっつ로 읽어요. 이 문형에서는 수량을 を 뒤, ください 앞에 놓아요. 사람·동물·모든 물건에 같은 세는 법을 붙이지는 않아요.',
      examples: [{ japanese: 'りんごを一つください。', reading: 'りんごをひとつください。', meaning: '사과 하나를 주세요.' }, { japanese: 'みかんを三つください。', reading: 'みかんをみっつください。', meaning: '귤 세 개를 주세요.' }],
      quiz: { question: '이번에 배운 三つ의 읽는 법은?', choices: ['みっつ', 'さんつ'], answer: 'みっつ', explanation: '세 개는 작은 っ가 있는 みっつ로 읽어요. 숫자 읽기에 つ를 그대로 붙이지 않아요.' },
    },
    guide: { goal: '사과·귤 1–3개를 요청하는 메모를 쓸 수 있어요.', steps: ['りんご는 사과, みかん은 귤이에요. 一つひとつ・二つふたつ・三つみっつ를 함께 익혀요.', '한국어로 사과 두 개를이라고 해도 이번 목표형은 りんごを二つください예요.', '二個 같은 다른 세는 법도 있지만 이 문제는 つ 연습이에요. 다른 조수사와 4개 이상은 다음 범위예요.'], worked: 'りんご + を + 二つ + ください → りんごを二つください。', hint: '두 개는 ふたつ, 세 개는 작은 っ가 들어간 みっつ예요.' },
    practice: { context: '가상 과일 가게에서 사과 두 개를 요청해요.', words: 'りんご = 사과 · 二つ(ふたつ) = 두 개 · ください = 주세요', prompt: 'つ 방식으로 「두 개」를 빈칸에 적어요.', before: 'りんごを', after: 'ください。', answers: ['二つ', '2つ', 'ふたつ'], result: 'りんごを二つください。', reading: 'りんごをふたつください。', reason: '二つ는 ふたつ예요. 二個도 가능한 세는 법이지만 이번 문제는 つ를 사용하는 연습이에요.' },
    alternate: { context: '가상 과일 가게에서 귤 세 개를 요청해요.', words: 'みかん = 귤 · 三つ(みっつ) = 세 개 · ください = 주세요', prompt: 'みかん・を・三つ・ください 순서로 한 문장을 적어요. 수량은 つ 방식으로 써요.', before: '', after: '。', sentenceInput: true, answers: TRAVEL_THREE_ORANGES, result: 'みかんを三つください。', reading: 'みかんをみっつください。', reason: 'を 다음에 수량을 놓고 ください로 끝내요. 三つ의 읽기에는 작은 っ가 들어가요.' },
  },
];
export const TRAVEL_LESSONS = GRAMMAR_TRAVEL.map(item => item.lesson);
export const TRAVEL_GUIDES = Object.fromEntries(GRAMMAR_TRAVEL.map(item => [item.lesson.id, item.guide]));
export const TRAVEL_WRITING = Object.fromEntries(GRAMMAR_TRAVEL.map(item => [item.lesson.id, item.practice]));
export const TRAVEL_ALTERNATES = Object.fromEntries(GRAMMAR_TRAVEL.map(item => [item.lesson.id, item.alternate]));
