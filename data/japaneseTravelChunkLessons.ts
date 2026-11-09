import type { JapaneseChunkLesson } from './japaneseChunkLessons.ts';

/**
 * Original, optional chunk practice for the 20 existing travel lessons.
 * Base sentences match the existing pattern examples; the curriculum is untouched.
 * Variations and listening examples are separate fictional travel situations.
 * Requests are not confirmations, permission questions are not permission,
 * and example prices, times and services are not real travel or medical advice.
 * Listening text is fixed Japanese data. This module never plays or creates audio.
 * This is self-study material, not a claim to reproduce or validate a whole course.
 */
export const JAPANESE_TRAVEL_CHUNK_LESSONS: JapaneseChunkLesson[] = [
  {
    lessonId: 't01',
    expression: 'どこですか',
    sentence: '搭乗口はどこですか。',
    meaning: '탑승구는 어디인가요?',
    chunks: [
      { text: '搭乗口', meaning: '탑승구', role: '위치를 찾는 시설 이름이에요. とうじょうぐち로 읽어요.' },
      { text: 'は', meaning: '는', role: '탑승구를 질문의 화제로 꺼내는 조사예요. 조사일 때는 와로 읽어요.' },
      { text: 'どこ', meaning: '어디', role: '장소를 묻는 말이에요. 시각이나 가격을 묻는 말과 구별해요.' },
      { text: 'です', meaning: '공손한 끝맺음', role: '질문을 정중하게 만드는 서술 표현이에요. 조사는 아니에요.' },
      { text: 'か。', meaning: '질문 표시', role: '문장 끝에서 질문임을 나타내는 조사예요.' },
    ],
    variations: [
      { kind: 'word', label: '찾는 시설 바꾸기', sentence: '出口はどこですか。', meaning: '출구는 어디인가요?', explanation: '搭乗口를 出口(でぐち, 출구)로 바꾸었어요. 위치를 묻는 どこですか는 그대로예요.' },
      { kind: 'tense', label: '관련 문장: 어제의 집합 장소', sentence: '昨日の集合場所はどこでしたか。', meaning: '어제 집합 장소는 어디였나요?', explanation: '지금 찾는 탑승구를 과거로 바꾸는 대신, 별도 가상 일정의 장소를 물어요. 集合場所(しゅうごうばしょ)는 집합 장소예요. どこですか를 どこでしたか로 바꾸어 과거를 물으며 원문의 장소 정보는 바꾸지 않아요.' },
    ],
    questions: [
      { id: 't01-chunk-meaning', kind: 'meaning', prompt: '「搭乗口はどこですか。」에서 묻는 것은 무엇인가요?', choices: ['탑승구의 위치', '항공권의 가격', '비행기의 출발 시각'], answer: 0, explanation: '搭乗口는 탑승구, どこ는 어디예요. 위치를 물을 뿐 실제 탑승구 번호를 알려 주는 문장은 아니에요.' },
      { id: 't01-chunk-blank', kind: 'blank', prompt: '출구의 위치를 물어요. 出口は（　）ですか。', choices: ['何時', 'どこ', 'いくら'], answer: 1, explanation: '어디인지는 どこ로 물어요. 何時는 몇 시, いくら는 얼마예요.' },
      { id: 't01-chunk-listening', kind: 'listening', prompt: '가상 여행 예문을 듣고 뜻을 골라요.', choices: ['출구는 몇 시에 닫나요?', '탑승구는 어디인가요?', '출구는 어디인가요?'], answer: 2, explanation: '出口はどこですか는 출구의 위치를 묻는 질문이에요.', audioText: '出口はどこですか。' },
    ],
  },
  {
    lessonId: 't02',
    expression: 'まで行きますか',
    sentence: 'この電車は東京まで行きますか。',
    meaning: '이 전철은 도쿄까지 가나요?',
    chunks: [
      { text: 'この電車', meaning: '이 전철', role: 'この가 바로 뒤의 명사 電車(でんしゃ)를 꾸며 어떤 전철인지 가리켜요.' },
      { text: 'は', meaning: '은', role: '이 전철을 화제로 삼는 조사예요.' },
      { text: '東京', meaning: '도쿄', role: '도달하는지 확인하려는 목적지예요. とうきょう로 읽어요.' },
      { text: 'まで', meaning: '까지', role: '이동 범위의 끝을 나타내는 조사예요. 행동 장소를 나타내는 で와 달라요.' },
      { text: '行きます', meaning: '갑니다', role: '行く(いく)의 정중한 비과거형이에요. 여기서는 전철이 어디까지 가는지 말해요.' },
      { text: 'か。', meaning: '가나요의 질문 부분', role: '정중한 설명을 질문으로 만드는 끝 조사예요.' },
    ],
    variations: [
      { kind: 'word', label: '목적지 바꾸기', sentence: 'この電車は新宿まで行きますか。', meaning: '이 전철은 신주쿠까지 가나요?', explanation: '東京를 新宿(しんじゅく)로 바꿨어요. 실제 운행을 확인한 안내가 아니라 목적지를 묻는 가상 예문이에요.' },
      { kind: 'tense', label: '어제의 운행 묻기', sentence: '昨日、この電車は東京まで行きましたか。', meaning: '어제 이 전철은 도쿄까지 갔나요?', explanation: '行きますか를 行きましたか로 바꿔 별도 가상 상황의 과거 운행을 물어요. 대답이나 현재 운행 여부가 확정된 것은 아니에요.' },
    ],
    questions: [
      { id: 't02-chunk-meaning', kind: 'meaning', prompt: '「この電車は東京まで行きますか。」의 뜻을 골라요.', choices: ['이 전철은 도쿄에서 출발하나요?', '이 전철은 도쿄까지 가나요?', '이 전철에서 표를 사나요?'], answer: 1, explanation: '東京まで는 도쿄까지라는 도달 범위예요. 도쿄에서 출발한다는 뜻이나 차 안에서 하는 행동이 아니에요.' },
      { id: 't02-chunk-blank', kind: 'blank', prompt: '“역까지 가나요?”가 되도록 골라요. このバスは駅（　）行きますか。', choices: ['から', 'で', 'まで'], answer: 2, explanation: '끝 지점까지 가는지 물으므로 まで예요. から는 출발점, で는 여기서 행동 장소를 나타내요.' },
      { id: 't02-chunk-listening', kind: 'listening', prompt: '가상 교통 질문을 듣고 뜻을 골라요.', choices: ['이 버스는 역까지 가나요?', '이 버스는 역에서 출발하나요?', '이 전철은 공항까지 가나요?'], answer: 0, explanation: 'バス는 버스, 駅まで는 역까지예요. 운행 가능 여부를 묻는 질문이지 확정 안내가 아니에요.', audioText: 'このバスは駅まで行きますか。' },
    ],
  },
  {
    lessonId: 't03',
    expression: 'で予約しています',
    sentence: 'パクで予約しています。',
    meaning: '박이라는 이름으로 예약해 두었습니다.',
    chunks: [
      { text: 'パク', meaning: '박', role: '가상의 예약자 이름이에요. 실제 사용자 이름이나 예약 정보가 아니에요.' },
      { text: 'で', meaning: '이라는 이름으로', role: '예약에 사용한 이름을 나타내는 조사예요. 이 문장에서는 행동 장소가 아니에요.' },
      { text: '予約して', meaning: '예약해', role: '予約する(よやくする)의 て형이에요. 뒤의 います와 이어 예약한 상태를 나타내요.' },
      { text: 'います。', meaning: '두었습니다', role: '여기서 ています는 지금 진행 중인 예약 절차가 아니라 이미 예약해 둔 상태를 말해요.' },
    ],
    variations: [
      { kind: 'word', label: '가상의 예약자 이름 바꾸기', sentence: 'キムで予約しています。', meaning: '김이라는 이름으로 예약해 두었습니다.', explanation: '예약에 쓴 가상의 이름을 パク에서 キム으로 바꿨어요. 새 예약을 해 달라는 요청과는 달라요.' },
      { kind: 'tense', label: '과거의 예약 상태', sentence: 'そのときはパクで予約していました。', meaning: '그때는 박이라는 이름으로 예약해 둔 상태였습니다.', explanation: '予約しています를 予約していました로 바꾸어 별도 가상 상황의 과거 상태를 말해요. 현재도 유효한지 또는 취소됐는지는 이 문장만으로 알 수 없어요.' },
    ],
    questions: [
      { id: 't03-chunk-meaning', kind: 'meaning', prompt: '「パクで予約しています。」의 뜻을 골라요.', choices: ['박이라는 이름으로 예약해 주세요.', '박이라는 이름의 예약을 취소해 주세요.', '박이라는 이름으로 예약해 두었습니다.'], answer: 2, explanation: '予約しています는 예약해 둔 상태를 말해요. 새 예약이나 취소를 요청하는 문장이 아니며 실제 예약 확인 증거도 아니에요.' },
      { id: 't03-chunk-blank', kind: 'blank', prompt: '“김이라는 이름으로 예약해 두었습니다.”가 되도록 골라요. キム（　）予約しています。', choices: ['で', 'を', 'まで'], answer: 0, explanation: '예약에 사용한 이름 뒤에는 이 문형에서 で를 붙여요. キム은 예약의 대상이나 이동 끝 지점이 아니에요.' },
      { id: 't03-chunk-listening', kind: 'listening', prompt: '가상 체크인 예문을 듣고 뜻을 골라요.', choices: ['김이라는 이름으로 예약해 주세요.', '김이라는 이름으로 예약해 두었습니다.', '박이라는 이름으로 예약해 두었습니다.'], answer: 1, explanation: 'キム이라는 이름과 予約しています라는 예약 상태를 함께 들어요.', audioText: 'キムで予約しています。' },
    ],
  },
  {
    lessonId: 't04',
    expression: 'をください',
    sentence: 'これをください。',
    meaning: '이것을 주세요.',
    chunks: [
      { text: 'これ', meaning: '이것', role: '말하는 사람 가까이 있거나 가리키는 물건을 나타내요.' },
      { text: 'を', meaning: '을', role: '달라고 요청하는 대상을 표시하는 조사예요. 오로 읽어요.' },
      { text: 'ください。', meaning: '주세요.', role: '명사와 を 뒤에서 물건을 달라고 정중하게 요청하는 표현이에요. 조사나 과거형이 아니에요.' },
    ],
    variations: [
      { kind: 'word', label: '원하는 것 바꾸기', sentence: '水をください。', meaning: '물을 주세요.', explanation: 'これ 대신 水(みず, 물)를 넣어 원하는 것을 구체적으로 말해요. 주문 접수나 제공 완료를 뜻하지는 않아요.' },
      { kind: 'tense', label: '관련 사실문: 주문한 일 말하기', sentence: '昨日、水を注文しました。', meaning: '어제 물을 주문했습니다.', explanation: 'ください라는 부탁을 과거로 억지 변형하지 않아요. 별도 가상 사실문 水を注文します의 注文します를 注文しました로 바꾸었어요. 원문의 요청이 실제 완료됐다는 뜻은 아니에요.' },
    ],
    questions: [
      { id: 't04-chunk-meaning', kind: 'meaning', prompt: '「これをください。」의 뜻을 골라요.', choices: ['이것을 주세요.', '이것은 얼마인가요?', '이것을 받았습니다.'], answer: 0, explanation: 'これ가 대상이고 ください가 요청이에요. 가격 질문이나 수령 완료가 아니에요.' },
      { id: 't04-chunk-blank', kind: 'blank', prompt: '“물을 주세요.”가 되도록 골라요. 水（　）ください。', choices: ['に', 'を', 'まで'], answer: 1, explanation: '달라고 요청하는 물을 を로 표시해 水をください라고 해요.' },
      { id: 't04-chunk-listening', kind: 'listening', prompt: '가상 식당 예문을 듣고 뜻을 골라요.', choices: ['물을 주문했습니다.', '이것을 주세요.', '물을 주세요.'], answer: 2, explanation: '水をください는 물을 달라는 요청이에요. 요청이 처리됐는지는 말하지 않아요.', audioText: '水をください。' },
    ],
  },
  {
    lessonId: 't05',
    expression: 'てもいいですか',
    sentence: '試着してもいいですか。',
    meaning: '입어 봐도 될까요?',
    chunks: [
      { text: '試着して', meaning: '입어 봐-', role: '試着する(しちゃくする)의 て형이에요. 여기서는 뒤의 もいい와 함께 입어 봐도 된다는 허가 표현을 만들어요.' },
      { text: 'も', meaning: '-도', role: 'て형 뒤에서 てもいい라는 허가 표현을 이루는 조사예요.' },
      { text: 'いい', meaning: '괜찮다', role: '허용해도 괜찮다는 뜻의 형용사예요. 실제 허락을 받은 상태는 아니에요.' },
      { text: 'です', meaning: '공손한 끝맺음', role: '형용사 뒤에서 정중하게 말해요.' },
      { text: 'か。', meaning: '질문 표시', role: '해도 되는지 묻는 질문으로 마무리하는 조사예요.' },
    ],
    variations: [
      { kind: 'word', label: '허락을 구하는 행동 바꾸기', sentence: '写真を撮ってもいいですか。', meaning: '사진을 찍어도 될까요?', explanation: '試着して를 写真を撮って로 바꿨어요. 撮る(とる, 찍다)의 て형은 撮って예요. 허락을 구하는 질문이며 촬영 허가가 나온 것은 아니에요.' },
      { kind: 'tense', label: '관련 사실문: 입어 본 일', sentence: '昨日、この服を試着しました。', meaning: '어제 이 옷을 입어 봤습니다.', explanation: '허가 질문을 완료 사실로 취급하지 않아요. 별도 가상 문장 この服を試着します에서 試着します를 試着しました로 바꾸어 과거 행동을 연습해요.' },
    ],
    questions: [
      { id: 't05-chunk-meaning', kind: 'meaning', prompt: '「試着してもいいですか。」의 뜻을 골라요.', choices: ['입어 봐도 됩니다.', '입어 봐도 될까요?', '입어 보지 마세요.'], answer: 1, explanation: '문장 끝이 か이므로 허락을 구하는 질문이에요. 허가하는 대답이나 금지가 아니에요.' },
      { id: 't05-chunk-blank', kind: 'blank', prompt: '“입어 봐도 될까요?”가 되도록 골라요. 試着して（　）いいですか。', choices: ['を', 'まで', 'も'], answer: 2, explanation: '동사의 て형 + もいいですか가 허가를 묻는 표현이에요. 試着しても라고 이어요.' },
      { id: 't05-chunk-listening', kind: 'listening', prompt: '가상 쇼핑 대화의 금액을 듣고 뜻을 골라요.', choices: ['3천 엔입니다.', '3시입니다.', '3백 엔입니다.'], answer: 0, explanation: '三千円(さんぜんえん)은 3천 엔이에요. 円은 금액 단위이며 時라는 시각 단위가 아니에요. 실제 판매 가격이 아닌 가상 예문이에요.', audioText: '三千円です。' },
    ],
  },
  {
    lessonId: 't06',
    expression: 'へはどう行きますか',
    sentence: '駅へはどう行きますか。',
    meaning: '역에는 어떻게 가나요?',
    chunks: [
      { text: '駅', meaning: '역', role: '가려는 장소예요. えき로 읽어요.' },
      { text: 'へ', meaning: '으로', role: '이동 방향을 나타내는 조사예요. 조사일 때는 에로 읽어요.' },
      { text: 'は', meaning: '는', role: 'へ 뒤에서 역으로 가는 일을 질문의 화제로 삼아요.' },
      { text: 'どう', meaning: '어떻게', role: '여기서는 가는 방법이나 경로를 묻는 말이에요.' },
      { text: '行きます', meaning: '갑니다', role: '行く의 정중한 형태예요. 뒤의 か와 함께 이동 방법을 물어요.' },
      { text: 'か。', meaning: '질문 표시', role: '문장 끝의 질문 조사예요.' },
    ],
    variations: [
      { kind: 'word', label: '가려는 장소 바꾸기', sentence: 'ホテルへはどう行きますか。', meaning: '호텔에는 어떻게 가나요?', explanation: '駅를 ホテル로 바꾸어 호텔로 가는 경로를 물어요. 호텔에서 하는 행동의 장소를 나타내는 で와 달라요.' },
      { kind: 'tense', label: '어제 간 방법 묻기', sentence: '昨日、駅へはどう行きましたか。', meaning: '어제 역에는 어떻게 갔나요?', explanation: '行きますか를 行きましたか로 바꾸어 별도 가상 상황에서 이미 간 방법을 물어요. 현재 길 안내를 요청하는 원문과 구별해요.' },
    ],
    questions: [
      { id: 't06-chunk-meaning', kind: 'meaning', prompt: '「駅へはどう行きますか。」의 뜻을 골라요.', choices: ['역에서 무엇을 사나요?', '역까지 얼마인가요?', '역에는 어떻게 가나요?'], answer: 2, explanation: '駅へ는 이동 방향이고 どう行きますか는 가는 방법이나 길을 묻는 표현이에요.' },
      { id: 't06-chunk-blank', kind: 'blank', prompt: '호텔로 가는 방법을 물어요. ホテルへは（　）行きますか。', choices: ['どう', 'だれ', 'いくら'], answer: 0, explanation: '방법은 どう로 물어요. だれ는 누구, いくら는 얼마라는 말이에요.' },
      { id: 't06-chunk-listening', kind: 'listening', prompt: '가상의 길 안내를 듣고 뜻을 골라요.', choices: ['오른쪽으로 도세요.', '왼쪽으로 도세요.', '역에서 기다리세요.'], answer: 1, explanation: '左(ひだり)는 왼쪽이고 曲がってください는 돌아 달라는 요청이에요. 실제 현재 위치에 대한 안내는 아니에요.', audioText: '左に曲がってください。' },
    ],
  },
  {
    lessonId: 't07',
    expression: 'てしまいました',
    sentence: '財布をなくしてしまいました。',
    meaning: '지갑을 잃어버리고 말았습니다.',
    chunks: [
      { text: '財布', meaning: '지갑', role: '잃어버린 물건이에요. さいふ로 읽어요.' },
      { text: 'を', meaning: '을', role: 'なくす라는 동작의 대상을 나타내는 조사예요.' },
      { text: 'なくして', meaning: '잃어버려-', role: 'なくす(잃어버리다)의 て형이에요. 뒤의 しまいました와 하나의 표현을 만들어요.' },
      { text: 'しまいました。', meaning: '버리고 말았습니다.', role: 'てしまう의 정중한 과거형이에요. 여기서는 원치 않은 분실이 일어난 아쉬움을 담아요.' },
    ],
    variations: [
      { kind: 'word', label: '잃어버린 물건 바꾸기', sentence: '切符をなくしてしまいました。', meaning: '표를 잃어버리고 말았습니다.', explanation: '財布를 切符(きっぷ, 표)로 바꾸었어요. 새 가상 상황이며 원문에 표까지 잃어버렸다는 사실을 더하지 않아요.' },
      { kind: 'tense', label: '별도 예시: 반복되는 일', sentence: '財布をよくなくしてしまいます。', meaning: '지갑을 자주 잃어버리곤 합니다.', explanation: 'しまいました를 비과거형 しまいます로 바꾸고 よく(자주)를 넣어 별도 가상 인물의 반복 습관을 말해요. 원문의 한 번 발생한 일이나 사용자의 습관을 설명하는 것이 아니에요.' },
    ],
    questions: [
      { id: 't07-chunk-meaning', kind: 'meaning', prompt: '「財布をなくしてしまいました。」의 뜻을 골라요.', choices: ['지갑을 잃어버리고 말았습니다.', '지갑을 찾아 주실 수 있나요?', '지갑을 구입했습니다.'], answer: 0, explanation: 'なくしてしまいました는 원치 않게 잃어버린 일을 과거로 말해요. 찾아 달라는 부탁 자체는 포함하지 않아요.' },
      { id: 't07-chunk-blank', kind: 'blank', prompt: '“표를 잃어버리고 말았습니다.”가 되도록 골라요. 切符を（　）しまいました。', choices: ['なくす', 'なくして', 'なくします'], answer: 1, explanation: 'しまいました 앞에는 なくす의 て형인 なくして를 연결해요.' },
      { id: 't07-chunk-listening', kind: 'listening', prompt: '가상 분실 상황을 듣고 뜻을 골라요.', choices: ['지갑을 잃어버리고 말았습니다.', '표를 찾았습니다.', '표를 잃어버리고 말았습니다.'], answer: 2, explanation: '切符는 표이고 なくしてしまいました는 잃어버리고 말았다는 말이에요.', audioText: '切符をなくしてしまいました。' },
    ],
  },
  {
    lessonId: 't08',
    expression: 'が痛いです',
    sentence: '腰が痛いです。',
    meaning: '허리가 아픕니다.',
    chunks: [
      { text: '腰', meaning: '허리', role: '아픈 신체 부위를 나타내는 명사예요. こし로 읽어요.' },
      { text: 'が', meaning: '가', role: '어느 부위가 아픈지 나타내는 조사예요.' },
      { text: '痛い', meaning: '아프다', role: '痛い(いたい)는 통증을 나타내는 い형용사예요.' },
      { text: 'です。', meaning: '공손한 끝맺음', role: '형용사 뒤에서 정중하게 말해요. 통증의 원인이나 치료를 판단하는 말은 아니에요.' },
    ],
    variations: [
      { kind: 'word', label: '아픈 부위 바꾸기', sentence: '頭が痛いです。', meaning: '머리가 아픕니다.', explanation: '腰를 頭(あたま, 머리)로 바꾸었어요. 가상 인물의 증상 표현이며 사용자의 건강 정보나 진단이 아니에요.' },
      { kind: 'tense', label: '어제의 상태 말하기', sentence: '昨日、腰が痛かったです。', meaning: '어제 허리가 아팠습니다.', explanation: 'い형용사 痛い의 끝 い를 かった로 바꾸어 痛かったです라고 해요. 痛いでした로 만들지 않아요. 현재도 아픈지는 말하지 않아요.' },
    ],
    questions: [
      { id: 't08-chunk-meaning', kind: 'meaning', prompt: '「腰が痛いです。」의 뜻을 골라요.', choices: ['머리가 아픕니다.', '허리가 아픕니다.', '허리가 아프지 않습니다.'], answer: 1, explanation: '腰는 허리, 痛いです는 아픕니다예요. 병명이나 복용할 약을 알려 주는 문장은 아니에요.' },
      { id: 't08-chunk-blank', kind: 'blank', prompt: '“어제 머리가 아팠습니다.”가 되도록 골라요. 昨日、頭が（　）。', choices: ['痛いです', '痛くないです', '痛かったです'], answer: 2, explanation: '과거의 통증은 痛かったです예요. 痛いです는 비과거, 痛くないです는 아프지 않다는 부정이에요.' },
      { id: 't08-chunk-listening', kind: 'listening', prompt: '가상 인물의 증상 표현을 듣고 뜻을 골라요.', choices: ['머리가 아픕니다.', '허리가 아픕니다.', '머리가 아프지 않습니다.'], answer: 0, explanation: '頭が痛いです는 머리가 아프다는 증상 표현이에요. 실제 건강 상담이나 진단이 아니에요.', audioText: '頭が痛いです。' },
    ],
  },
  {
    lessonId: 't09',
    expression: 'どこで',
    sentence: 'どこで乗り換えますか。',
    meaning: '어디에서 환승하나요?',
    chunks: [
      { text: 'どこ', meaning: '어디', role: '장소를 묻는 말이에요.' },
      { text: 'で', meaning: '에서', role: '환승이라는 행동이 이루어지는 장소를 나타내는 조사예요. 이동 목적지의 に와 구별해요.' },
      { text: '乗り換えます', meaning: '환승합니다', role: '乗り換える(のりかえる)의 정중한 형태로 다른 교통편으로 갈아타는 행동이에요.' },
      { text: 'か。', meaning: '질문 표시', role: '어디에서 환승하는지 묻는 질문을 만들어요.' },
    ],
    variations: [
      { kind: 'word', label: '장소를 물을 행동 바꾸기', sentence: 'どこで切符を買いますか。', meaning: '어디에서 표를 사나요?', explanation: '환승 대신 표를 사는 행동 切符を買います를 넣었어요. 행동 장소를 묻는 どこで는 그대로예요.' },
      { kind: 'tense', label: '지난 환승 장소 묻기', sentence: '昨日、どこで乗り換えましたか。', meaning: '어제 어디에서 환승했나요?', explanation: '乗り換えますか를 乗り換えましたか로 바꾸었어요. 별도 가상 여행에서 이미 한 행동의 장소를 묻는 과거 질문이에요.' },
    ],
    questions: [
      { id: 't09-chunk-meaning', kind: 'meaning', prompt: '「どこで乗り換えますか。」의 뜻을 골라요.', choices: ['어디까지 가나요?', '몇 시에 출발하나요?', '어디에서 환승하나요?'], answer: 2, explanation: 'どこで가 행동 장소를 묻고 乗り換えます가 환승이라는 행동을 말해요.' },
      { id: 't09-chunk-blank', kind: 'blank', prompt: '다음 역을 환승하는 행동 장소로 나타내요. 次の駅（　）乗り換えます。', choices: ['で', 'まで', 'を'], answer: 0, explanation: '환승하는 장소에는 で를 써요. 次の駅まで는 다음 역까지라는 범위이고, 환승 장소를 표시하는 답이 아니에요.' },
      { id: 't09-chunk-listening', kind: 'listening', prompt: '가상 교통 예문을 듣고 뜻을 골라요.', choices: ['다음 역까지 갑니다.', '다음 역에서 환승합니다.', '다음 역에서 표를 삽니다.'], answer: 1, explanation: '次の駅で는 다음 역에서, 乗り換えます는 환승합니다예요. 실제 노선 안내가 아닌 연습 문장이에요.', audioText: '次の駅で乗り換えます。' },
    ],
  },
  {
    lessonId: 't10',
    expression: 'たいのですが',
    sentence: '予約を変更したいのですが。',
    meaning: '예약을 변경하고 싶은데요.',
    chunks: [
      { text: '予約', meaning: '예약', role: '변경하고 싶은 대상이에요. よやく로 읽어요.' },
      { text: 'を', meaning: '을', role: '변경할 대상을 나타내는 조사예요.' },
      { text: '変更し', meaning: '변경하-', role: '変更する(へんこうする)가 희망 표현 たい 앞에서 바뀐 부분이에요.' },
      { text: 'たい', meaning: '-고 싶다', role: '말하는 사람의 희망을 나타내는 표현이에요. 변경 완료를 뜻하지 않아요.' },
      { text: 'のですが。', meaning: '-는데요.', role: 'のです에 が를 붙여 사정을 부드럽게 꺼내고 상대의 응답을 기다려요. 전체가 하나의 조사는 아니에요.' },
    ],
    variations: [
      { kind: 'word', label: '희망하는 처리 바꾸기', sentence: '予約をキャンセルしたいのですが。', meaning: '예약을 취소하고 싶은데요.', explanation: '変更し를 キャンセルし로 바꿨어요. 취소를 상담하는 희망 표현이지 취소 완료나 환불 조건 안내가 아니에요.' },
      { kind: 'tense', label: '관련 사실문: 변경한 일', sentence: '昨日、予約を変更しました。', meaning: '어제 예약을 변경했습니다.', explanation: '원문의 희망을 완료로 단정하지 않아요. 별도 가상 사실문 予約を変更します의 ます를 ました로 바꾸어 이미 한 일을 말해요. 원문과는 다른 상황이에요.' },
    ],
    questions: [
      { id: 't10-chunk-meaning', kind: 'meaning', prompt: '「予約を変更したいのですが。」의 뜻을 골라요.', choices: ['예약을 변경하고 싶은데요.', '예약 변경이 완료됐습니다.', '예약을 변경하면 안 됩니다.'], answer: 0, explanation: 'たい는 희망이고 のですが는 상담을 부드럽게 꺼내는 표현이에요. 승인이나 처리 완료가 아니에요.' },
      { id: 't10-chunk-blank', kind: 'blank', prompt: '“예약을 변경하고 싶은데요.”가 되도록 골라요. 予約を変更し（　）のですが。', choices: ['ました', 'たい', 'ません'], answer: 1, explanation: '変更し + たい로 변경하고 싶다는 희망을 나타내요. ました나 ません은 이 자리에서 희망을 만들지 않아요.' },
      { id: 't10-chunk-listening', kind: 'listening', prompt: '가상 예약 상담 문장을 듣고 뜻을 골라요.', choices: ['예약이 취소됐습니다.', '예약을 변경하고 싶은데요.', '예약을 취소하고 싶은데요.'], answer: 2, explanation: 'キャンセルしたい는 취소하고 싶다는 뜻이에요. 실제 취소 처리 여부는 말하지 않아요.', audioText: '予約をキャンセルしたいのですが。' },
    ],
  },
  {
    lessonId: 't11',
    expression: 'にしていただけますか',
    sentence: '別々の袋にしていただけますか。',
    meaning: '봉투를 따로 해 주실 수 있나요?',
    chunks: [
      { text: '別々の袋', meaning: '각각 따로인 봉투', role: '別々(べつべつ)에 の를 붙여 袋(ふくろ)를 꾸며요. 봉투를 나누어 달라는 대상 상태예요.' },
      { text: 'に', meaning: '로', role: '어떤 상태나 형태로 해 달라는지 나타내는 조사예요. 이 문장에서는 이동 목적지가 아니에요.' },
      { text: 'して', meaning: '해', role: 'する의 て형으로, 뒤의 いただけますか와 이어 행동을 부탁해요.' },
      { text: 'いただけます', meaning: '-해 주실 수 있-', role: 'いただく의 가능 표현을 정중하게 만든 형태예요. していただけますか 전체로 상대의 행동을 공손하게 부탁해요.' },
      { text: 'か。', meaning: '질문 표시', role: '가능한지 물으며 부탁하는 문장으로 끝맺어요.' },
    ],
    variations: [
      { kind: 'word', label: '원하는 봉투 방식 바꾸기', sentence: '一つの袋にしていただけますか。', meaning: '한 봉투에 담아 주실 수 있나요?', explanation: '別々の袋를 一つの袋(ひとつのふくろ)로 바꾸어 한 봉투로 해 달라고 부탁해요. 가상 요청이며 포장이 완료된 것은 아니에요.' },
      { kind: 'tense', label: '관련 사실문: 봉투를 나눈 일', sentence: '昨日は別々の袋にしました。', meaning: '어제는 봉투를 따로 했습니다.', explanation: '공손한 부탁을 억지로 과거형으로 바꾸지 않아요. 별도 가상 사실문 別々の袋にします에서 します를 しました로 바꾼 예시예요. 원문에서 직원이 요청을 수락했다는 뜻은 아니에요.' },
    ],
    questions: [
      { id: 't11-chunk-meaning', kind: 'meaning', prompt: '「別々の袋にしていただけますか。」의 뜻을 골라요.', choices: ['한 봉투에 담아 주실 수 있나요?', '봉투를 따로 해 주실 수 있나요?', '봉투를 따로 해 드렸습니다.'], answer: 1, explanation: '別々는 따로따로, していただけますか는 공손한 부탁이에요. 완료 보고가 아니에요.' },
      { id: 't11-chunk-blank', kind: 'blank', prompt: '한 봉투로 해 달라고 부탁해요. 一つの袋（　）していただけますか。', choices: ['まで', 'から', 'に'], answer: 2, explanation: '원하는 상태나 형태를 명사 + にする로 나타내므로 袋にして라고 해요.' },
      { id: 't11-chunk-listening', kind: 'listening', prompt: '가상 포장 요청을 듣고 뜻을 골라요.', choices: ['한 봉투에 담아 주실 수 있나요?', '봉투를 따로 해 주실 수 있나요?', '한 봉투에 담았습니다.'], answer: 0, explanation: '一つの袋는 한 봉투예요. していただけますか는 부탁하는 질문이며 완료형이 아니에요.', audioText: '一つの袋にしていただけますか。' },
    ],
  },
  {
    lessonId: 't12',
    expression: 'を呼んでください',
    sentence: '救急車を呼んでください。',
    meaning: '구급차를 불러 주세요.',
    chunks: [
      { text: '救急車', meaning: '구급차', role: '불러 달라고 요청하는 차량이에요. きゅうきゅうしゃ로 읽어요.' },
      { text: 'を', meaning: '를', role: '呼ぶ라는 동작의 대상을 표시하는 조사예요.' },
      { text: '呼んで', meaning: '불러', role: '呼ぶ(よぶ)의 て형이에요. 呼んで가 되며 呼ぶて로 붙이지 않아요.' },
      { text: 'ください。', meaning: '주세요.', role: 'て형 뒤에서 상대에게 행동을 요청해요. 이미 호출했다는 보고는 아니에요.' },
    ],
    variations: [
      { kind: 'word', label: '도움을 요청할 대상 바꾸기', sentence: '係の人を呼んでください。', meaning: '담당자를 불러 주세요.', explanation: '救急車를 係の人(かかりのひと, 담당자)으로 바꿔 같은 요청 문형을 연습해요. 긴급 상황에 어떤 기관을 선택할지 안내하는 예시가 아니에요.' },
      { kind: 'tense', label: '관련 사실문: 호출한 일', sentence: '昨日、救急車を呼びました。', meaning: '어제 구급차를 불렀습니다.', explanation: '요청형 ください를 완료형으로 취급하지 않아요. 별도 가상 사실문 救急車を呼びます의 呼びます를 呼びました로 바꾸었어요. 원문의 호출이 실행됐다는 뜻은 아니에요.' },
    ],
    questions: [
      { id: 't12-chunk-meaning', kind: 'meaning', prompt: '「救急車を呼んでください。」의 뜻을 골라요.', choices: ['구급차를 불렀습니다.', '구급차가 도착했습니다.', '구급차를 불러 주세요.'], answer: 2, explanation: '呼んでください는 불러 달라는 요청이에요. 호출 완료나 도착을 확인하는 문장이 아니에요.' },
      { id: 't12-chunk-blank', kind: 'blank', prompt: '“담당자를 불러 주세요.”가 되도록 골라요. 係の人を（　）ください。', choices: ['呼んで', '呼ぶ', '呼びました'], answer: 0, explanation: '행동을 부탁하는 ください 앞에는 て형 呼んで를 연결해요.' },
      { id: 't12-chunk-listening', kind: 'listening', prompt: '가상 도움 요청 문장을 듣고 뜻을 골라요.', choices: ['담당자를 불렀습니다.', '담당자를 불러 주세요.', '구급차를 불러 주세요.'], answer: 1, explanation: '係の人는 담당자, 呼んでください는 불러 달라는 요청이에요. 이 연습은 실제 연락을 실행하지 않아요.', audioText: '係の人を呼んでください。' },
    ],
  },
  {
    lessonId: 't13',
    expression: 'が見つかりません',
    sentence: '荷物が見つかりません。',
    meaning: '짐을 찾을 수 없습니다.',
    chunks: [
      { text: '荷物', meaning: '짐', role: '찾아지지 않는 물건이에요. にもつ로 읽어요.' },
      { text: 'が', meaning: '짐이의 이', role: '자동사 見つかる의 주어를 나타내는 조사예요. 자연스러운 한국어에서는 짐을 찾을 수 없다고 옮겨요.' },
      { text: '見つかり', meaning: '찾아지-', role: '見つかる(みつかる)가 ません 앞에서 바뀐 부분이에요. 일부러 찾지 않는다는 뜻은 아니에요.' },
      { text: 'ません。', meaning: '-지 않습니다.', role: '동사의 정중한 비과거 부정형을 만들어요. 이 문장에서는 짐이 발견되지 않는 상태를 말해요.' },
    ],
    variations: [
      { kind: 'word', label: '찾지 못한 물건 바꾸기', sentence: '切符が見つかりません。', meaning: '표를 찾을 수 없습니다.', explanation: '荷物를 切符(きっぷ, 표)로 바꿨어요. 표가 찾아지지 않는다는 말이며 누가 훔쳤다는 판단은 아니에요.' },
      { kind: 'tense', label: '오늘 아침의 상황', sentence: '今朝は荷物が見つかりませんでした。', meaning: '오늘 아침에는 짐을 찾을 수 없었습니다.', explanation: 'ません을 ませんでした로 바꾸어 과거의 부정을 나타내요. 今朝(けさ)는 오늘 아침이에요. 지금은 찾았는지 이 문장만으로 알 수 없어요.' },
    ],
    questions: [
      { id: 't13-chunk-meaning', kind: 'meaning', prompt: '「荷物が見つかりません。」의 뜻을 골라요.', choices: ['짐을 찾을 수 없습니다.', '짐을 찾았습니다.', '짐을 보내지 않습니다.'], answer: 0, explanation: '見つかりません은 찾아지지 않는다는 뜻이에요. 찾았다는 완료나 배송을 하지 않겠다는 말이 아니에요.' },
      { id: 't13-chunk-blank', kind: 'blank', prompt: '“오늘 아침에는 표를 찾을 수 없었습니다.”가 되도록 골라요. 今朝は切符が（　）。', choices: ['見つかります', '見つかりませんでした', '見つかりました'], answer: 1, explanation: '과거에 찾아지지 않았다는 부정은 見つかりませんでした예요. 나머지는 찾아진다는 긍정형이에요.' },
      { id: 't13-chunk-listening', kind: 'listening', prompt: '가상 분실 문의 문장을 듣고 뜻을 골라요.', choices: ['표를 찾았습니다.', '짐을 찾을 수 없습니다.', '표를 찾을 수 없습니다.'], answer: 2, explanation: '切符가 표라는 대상이고 見つかりません이 찾아지지 않는다는 상태예요.', audioText: '切符が見つかりません。' },
    ],
  },
  {
    lessonId: 't14',
    expression: 'までに返します',
    sentence: '六時までに返します。',
    meaning: '6시까지 반납하겠습니다.',
    chunks: [
      { text: '六時', meaning: '6시', role: '반납 기한의 시각이에요. ろくじ로 읽어요. 금액이나 기간이 아니에요.' },
      { text: 'までに', meaning: '까지', role: '그 시각이 되기 전이나 그 시각까지 행동을 끝낸다는 기한 표현이에요. 계속하는 범위의 まで와 구별해요.' },
      { text: '返し', meaning: '돌려주-', role: '返す(かえす)가 ます 앞에서 바뀐 부분이에요. 빌린 물건이나 차를 반납하는 행동이에요.' },
      { text: 'ます。', meaning: '-겠습니다.', role: '동사의 정중한 비과거형이에요. 여기서는 앞으로 반납하겠다는 뜻이며 조사가 아니에요.' },
    ],
    variations: [
      { kind: 'word', label: '가상의 반납 시각 바꾸기', sentence: '五時までに返します。', meaning: '5시까지 반납하겠습니다.', explanation: '六時를 五時(ごじ)로 바꾸었어요. 시각만 바꾼 가상 약속이며 실제 대여 계약이나 반납 규정이 아니에요.' },
      { kind: 'tense', label: '이미 반납한 일', sentence: '昨日、六時までに返しました。', meaning: '어제 6시까지 반납했습니다.', explanation: '返します를 返しました로 바꾸어 별도 가상 상황의 완료 사실을 말해요. 원문의 앞으로 하겠다는 약속이 이행됐다고 단정하는 것은 아니에요.' },
    ],
    questions: [
      { id: 't14-chunk-meaning', kind: 'meaning', prompt: '「六時までに返します。」의 뜻을 골라요.', choices: ['6시부터 빌리겠습니다.', '6시까지 반납하겠습니다.', '6시간 동안 사용하겠습니다.'], answer: 1, explanation: '六時는 6시, までに는 완료 기한이에요. 시작 시각이나 6시간의 지속 시간을 말하지 않아요.' },
      { id: 't14-chunk-blank', kind: 'blank', prompt: '“5시까지 반납하겠습니다.”라는 완료 기한을 나타내요. 五時（　）返します。', choices: ['から', 'ごろに', 'までに'], answer: 2, explanation: '기한은 までに예요. から는 시작점, ごろに는 대략 그 무렵으로 기한을 보장하지 않아요.' },
      { id: 't14-chunk-listening', kind: 'listening', prompt: '가상의 반납 약속을 듣고 뜻을 골라요.', choices: ['5시까지 반납하겠습니다.', '5천 엔을 내겠습니다.', '6시까지 반납하겠습니다.'], answer: 0, explanation: '五時(ごじ)는 5시예요. 시각을 나타내며 금액의 五千円이나 6시가 아니에요.', audioText: '五時までに返します。' },
    ],
  },
  {
    lessonId: 't15',
    expression: 'おすすめはありますか',
    sentence: '近くにおすすめはありますか。',
    meaning: '근처에 추천할 곳이 있나요?',
    chunks: [
      { text: '近く', meaning: '근처', role: '가까운 장소를 나타내는 명사예요. ちかく로 읽어요.' },
      { text: 'に', meaning: '에', role: '추천할 곳이 있는 위치를 나타내는 조사예요. 행동 장소를 나타내는 で와 구별해요.' },
      { text: 'おすすめ', meaning: '추천할 곳', role: '추천할 만한 대상을 뜻해요. 관광 안내 문맥에서는 장소를 가리켜요.' },
      { text: 'は', meaning: '은', role: '추천할 대상을 질문의 화제로 꺼내요. 한국어로는 추천할 곳이로 자연스럽게 옮겨요.' },
      { text: 'あります', meaning: '있습니다', role: '사물이나 장소의 존재를 나타내는 정중한 동사예요.' },
      { text: 'か。', meaning: '질문 표시', role: '추천할 곳이 있는지 묻는 질문으로 끝내요.' },
    ],
    variations: [
      { kind: 'word', label: '찾는 범위 바꾸기', sentence: '駅の近くにおすすめはありますか。', meaning: '역 근처에 추천할 곳이 있나요?', explanation: '近く를 駅の近く로 구체화했어요. 역 근처라는 존재 위치를 に로 표시하며 실제 추천 장소를 정한 문장은 아니에요.' },
      { kind: 'tense', label: '관련 사실문: 과거의 가게', sentence: '以前は近くに店がありました。', meaning: '예전에는 근처에 가게가 있었습니다.', explanation: '추천 요청을 억지로 과거로 바꾸지 않아요. 별도 가상 사실문 近くに店があります의 あります를 ありました로 바꾸었어요. 以前(いぜん)은 예전이며 원문의 추천 장소가 확인됐다는 뜻은 아니에요.' },
    ],
    questions: [
      { id: 't15-chunk-meaning', kind: 'meaning', prompt: '관광 안내소에서 「近くにおすすめはありますか。」라고 했어요. 뜻을 골라요.', choices: ['근처에는 추천할 곳이 없습니다.', '이곳에 가 보았습니다.', '근처에 추천할 곳이 있나요?'], answer: 2, explanation: '이 관광 문맥에서 おすすめ는 추천할 곳이고 ありますか는 있는지 묻는 말이에요.' },
      { id: 't15-chunk-blank', kind: 'blank', prompt: '가게가 있는 위치를 나타내요. 駅の近く（　）店があります。', choices: ['に', 'で', 'を'], answer: 0, explanation: 'あります와 함께 존재하는 위치는 に로 표시해요. 店で買います처럼 행동 장소를 나타낼 때는 で를 써요.' },
      { id: 't15-chunk-listening', kind: 'listening', prompt: '가상 관광 문의를 듣고 뜻을 골라요.', choices: ['역 근처에서 표를 샀나요?', '역 근처에 추천할 곳이 있나요?', '역까지 몇 분 걸리나요?'], answer: 1, explanation: '駅の近くに는 역 근처에, おすすめはありますか는 추천할 곳이 있는지 묻는 표현이에요.', audioText: '駅の近くにおすすめはありますか。' },
    ],
  },
  {
    lessonId: 't16',
    expression: '前に',
    sentence: '入る前に体を洗います。',
    meaning: '들어가기 전에 몸을 씻습니다.',
    chunks: [
      { text: '入る', meaning: '들어가다', role: '入る(はいる)의 기본형이 뒤의 前를 꾸며요. 여기서는 탕에 들어가는 행동을 가리켜요.' },
      { text: '前に', meaning: '전에', role: '前(まえ)와 조사 に가 행동보다 앞선 때를 나타내요. 前에 오는 동사는 기본형을 써요.' },
      { text: '体', meaning: '몸', role: '씻는 대상이에요. からだ로 읽어요.' },
      { text: 'を', meaning: '을', role: '洗う라는 동작의 대상을 표시하는 조사예요.' },
      { text: '洗います。', meaning: '씻습니다.', role: '洗う(あらう)의 정중한 비과거형이에요. 들어가는 일보다 씻는 일이 먼저예요.' },
    ],
    variations: [
      { kind: 'word', label: '씻는 대상 바꾸기', sentence: '入る前に手を洗います。', meaning: '들어가기 전에 손을 씻습니다.', explanation: '体를 手(て, 손)로 바꾼 별도 가상 행동 순서예요. 실제 온천의 이용 규칙을 대체하거나 보장하는 문장이 아니에요.' },
      { kind: 'tense', label: '어제의 행동 순서', sentence: '昨日は入る前に体を洗いました。', meaning: '어제는 들어가기 전에 몸을 씻었습니다.', explanation: '주절 洗います를 洗いました로 바꾸어요. 과거를 이야기해도 前に 앞은 入る라는 기본형을 유지해요. 별도 예시이며 원문의 실제 이행 기록은 아니에요.' },
    ],
    questions: [
      { id: 't16-chunk-meaning', kind: 'meaning', prompt: '「入る前に体を洗います。」의 행동 순서로 알맞은 것은?', choices: ['몸을 씻고 나서 들어간다.', '들어간 뒤에 몸을 씻는다.', '들어가는 동안에만 몸을 씻는다.'], answer: 0, explanation: '入る前に는 들어가기 전이에요. 먼저 몸을 씻고 그 뒤에 들어가는 순서를 나타내요.' },
      { id: 't16-chunk-blank', kind: 'blank', prompt: '“들어가기 전에 몸을 씻었습니다.”가 되도록 골라요. （　）前に体を洗いました。', choices: ['入った', '入る', '入って'], answer: 1, explanation: '前に 앞에는 동사 기본형 入る를 써요. 전체가 과거라도 이 자리를 入った로 바꾸지 않아요.' },
      { id: 't16-chunk-listening', kind: 'listening', prompt: '가상의 행동 순서를 듣고 뜻을 골라요.', choices: ['들어간 뒤에 손을 씻습니다.', '들어가기 전에 몸을 씻습니다.', '들어가기 전에 손을 씻습니다.'], answer: 2, explanation: '手는 손이며 入る前に는 들어가기 전이에요. 실제 시설 규칙을 확인한 안내는 아니에요.', audioText: '入る前に手を洗います。' },
    ],
  },
  {
    lessonId: 't17',
    expression: '抜きでお願いします',
    sentence: '卵抜きでお願いします。',
    meaning: '달걀을 빼 주세요.',
    chunks: [
      { text: '卵', meaning: '달걀', role: '빼 달라고 요청하는 재료예요. たまご로 읽어요.' },
      { text: '抜き', meaning: '빼기', role: '명사 뒤에 붙어 그것을 제외한 상태를 나타내요. ぬき로 읽으며 이 부분 자체는 조사가 아니에요.' },
      { text: 'で', meaning: '그 상태로', role: '달걀을 뺀 상태를 요청 조건으로 나타내는 조사예요.' },
      { text: 'お願いします。', meaning: '부탁드립니다.', role: '요청하는 표현이에요. 재료가 실제 제외됐거나 알레르기 안전성이 확인됐다는 뜻은 아니에요.' },
    ],
    variations: [
      { kind: 'word', label: '제외할 재료 바꾸기', sentence: 'ねぎ抜きでお願いします。', meaning: '파를 빼 주세요.', explanation: '卵를 ねぎ(파)로 바꾼 가상 주문 요청이에요. 실제 음식 성분이나 교차 접촉 여부를 확인한 문장은 아니에요.' },
      { kind: 'tense', label: '관련 사실문: 주문한 일', sentence: '昨日は卵抜きで注文しました。', meaning: '어제는 달걀을 빼 달라고 주문했습니다.', explanation: '별도 가상 사실문 卵抜きで注文します를 과거형 注文しました로 바꾸었어요. 주문했다는 말만으로 요청이 이행됐거나 음식이 안전하다고 단정할 수 없으며 원문 사실을 바꾸지 않아요.' },
    ],
    questions: [
      { id: 't17-chunk-meaning', kind: 'meaning', prompt: '「卵抜きでお願いします。」의 뜻을 골라요.', choices: ['달걀이 전혀 없다고 확인했습니다.', '달걀을 빼 주세요.', '달걀을 더 넣어 주세요.'], answer: 1, explanation: '卵抜き는 달걀을 제외한 상태를 뜻해요. お願いします는 요청이며 성분 확인이나 안전 보장이 아니에요.' },
      { id: 't17-chunk-blank', kind: 'blank', prompt: '“파를 빼 주세요.”가 되도록 골라요. ねぎ（　）でお願いします。', choices: ['入り', '多め', '抜き'], answer: 2, explanation: '抜き는 빼고, 入り는 들어 있는 상태, 多め는 좀 많이를 뜻하므로 제외 요청에는 抜き예요.' },
      { id: 't17-chunk-listening', kind: 'listening', prompt: '가상 재료 제외 요청을 듣고 뜻을 골라요.', choices: ['파를 빼 주세요.', '달걀을 빼 주세요.', '파를 더 넣어 주세요.'], answer: 0, explanation: 'ねぎ는 파, 抜きでお願いします는 그 재료를 빼 달라는 요청이에요. 실제 제공 내용은 확인되지 않았어요.', audioText: 'ねぎ抜きでお願いします。' },
    ],
  },
  {
    lessonId: 't18',
    expression: 'まだありますか',
    sentence: '当日券はまだありますか。',
    meaning: '당일권이 아직 있나요?',
    chunks: [
      { text: '当日券', meaning: '당일권', role: '공연 등 이용 당일에 판매하는 표예요. とうじつけん으로 읽어요.' },
      { text: 'は', meaning: '당일권에 관해서는', role: '확인할 표를 화제로 꺼내는 조사예요. 한국어로는 당일권이로 자연스럽게 옮겨요.' },
      { text: 'まだ', meaning: '아직', role: '이 시점에도 남아 있는지 확인하는 부사예요. 조사가 아니에요.' },
      { text: 'あります', meaning: '있습니다', role: '여기서는 표가 남아 있는지를 나타내는 정중한 동사예요.' },
      { text: 'か。', meaning: '질문 표시', role: '당일권의 존재 여부를 묻는 질문으로 끝맺어요.' },
    ],
    variations: [
      { kind: 'word', label: '남아 있는지 물을 대상 바꾸기', sentence: '空席はまだありますか。', meaning: '빈자리가 아직 있나요?', explanation: '当日券를 空席(くうせき, 빈자리)으로 바꿔요. 표나 좌석을 확보한 것이 아니라 남아 있는지 묻는 가상 질문이에요.' },
      { kind: 'tense', label: '어제의 잔여 여부 묻기', sentence: '昨日、当日券はまだありましたか。', meaning: '어제 당일권이 아직 있었나요?', explanation: 'ありますか를 ありましたか로 바꾸어 별도 가상 상황의 과거 잔여 여부를 물어요. 오늘 구매할 수 있는지를 확인한 것은 아니에요.' },
    ],
    questions: [
      { id: 't18-chunk-meaning', kind: 'meaning', prompt: '「当日券はまだありますか。」의 뜻을 골라요.', choices: ['당일권을 이미 샀습니다.', '당일권은 남아 있지 않습니다.', '당일권이 아직 있나요?'], answer: 2, explanation: 'まだありますか는 아직 있는지 묻는 질문이에요. 구매 완료나 매진 확정이 아니에요.' },
      { id: 't18-chunk-blank', kind: 'blank', prompt: '“빈자리가 아직 있나요?”가 되도록 골라요. 空席は（　）ありますか。', choices: ['まだ', 'もう', 'すぐ'], answer: 0, explanation: 'まだ는 아직이라는 뜻이에요. もう는 이미·벌써, すぐ는 곧·바로여서 이 뜻과 다르게 돼요.' },
      { id: 't18-chunk-listening', kind: 'listening', prompt: '가상 공연 안내의 시각을 듣고 뜻을 골라요.', choices: ['공연 시작은 7천 엔입니다.', '공연 시작은 7시입니다.', '공연 시작은 9시입니다.'], answer: 1, explanation: '開演(かいえん)은 공연 시작, 七時(しちじ)는 7시예요. 실제 공연 일정이 아니라 시각과 금액을 구별하는 연습이에요.', audioText: '開演は七時です。' },
    ],
  },
  {
    lessonId: 't19',
    expression: '何日かかりますか',
    sentence: '韓国まで何日かかりますか。',
    meaning: '한국까지 며칠 걸리나요?',
    chunks: [
      { text: '韓国', meaning: '한국', role: '가상의 배송 도착 국가예요. かんこく로 읽어요.' },
      { text: 'まで', meaning: '까지', role: '도달할 끝 지점을 나타내는 조사예요.' },
      { text: '何日', meaning: '며칠', role: 'かかります와 함께 걸리는 일수를 물어요. なんにち로 읽으며 이 문장에서는 달력 날짜가 아니에요.' },
      { text: 'かかります', meaning: '걸립니다', role: 'かかる의 정중한 형태예요. 여기서는 일수 표현과 함께 소요 기간을 나타내요.' },
      { text: 'か。', meaning: '질문 표시', role: '기간을 묻는 질문으로 끝맺는 조사예요.' },
    ],
    variations: [
      { kind: 'word', label: '가상의 배송 목적지 바꾸기', sentence: '大阪まで何日かかりますか。', meaning: '오사카까지 며칠 걸리나요?', explanation: '韓国를 大阪(おおさか)로 바꿔 목적지까지 걸리는 기간을 물어요. 실제 배송 가능 여부나 소요일을 보장하지 않아요.' },
      { kind: 'tense', label: '지난 배송의 소요 기간', sentence: '韓国まで何日かかりましたか。', meaning: '한국까지 며칠 걸렸나요?', explanation: 'かかりますか를 かかりましたか로 바꾸어 이미 끝난 별도 가상 배송의 소요 기간을 물어요. 원문에서 배송이 실제 완료됐다는 뜻은 아니에요.' },
    ],
    questions: [
      { id: 't19-chunk-meaning', kind: 'meaning', prompt: '배송을 문의하며 「韓国まで何日かかりますか。」라고 했어요. 뜻은?', choices: ['한국까지 며칠 걸리나요?', '한국까지 얼마 드나요?', '한국에 몇 시에 도착하나요?'], answer: 0, explanation: '何日かかりますか는 소요 일수를 물어요. 가격은 いくら, 시각은 何時로 물으므로 구별해요.' },
      { id: 't19-chunk-blank', kind: 'blank', prompt: '며칠이 걸리는지 일수를 물어요. 大阪まで（　）かかりますか。', choices: ['いくら', '何日', '何時'], answer: 1, explanation: '일수는 何日이에요. いくらかかりますか는 드는 금액을 묻는 다른 질문이고, 何時는 시각이에요.' },
      { id: 't19-chunk-listening', kind: 'listening', prompt: '가상 배송 기간 질문을 듣고 뜻을 골라요.', choices: ['오사카까지 얼마 드나요?', '한국까지 며칠 걸리나요?', '오사카까지 며칠 걸리나요?'], answer: 2, explanation: '大阪까지라는 목적지와 何日라는 소요 일수를 함께 들어요. 실제 배송 조건 안내가 아니에요.', audioText: '大阪まで何日かかりますか。' },
    ],
  },
  {
    lessonId: 't20',
    expression: 'ので',
    sentence: '道が分からないので、案内をお願いします。',
    meaning: '길을 모르므로 안내 부탁드립니다.',
    chunks: [
      { text: '道が', meaning: '길이', role: '道(みち)는 길이에요. 조사 が는 무엇을 모르는지 나타내며 한국어로는 길을로 자연스럽게 옮겨요.' },
      { text: '分からない', meaning: '모르다', role: '分かる(わかる)의 부정형이에요. 뒤의 ので에 연결할 이유를 말해요.' },
      { text: 'ので、', meaning: '-므로,', role: '앞의 이유를 뒤의 요청으로 연결하는 표현이에요. 가정 조건이나 반대 뜻의 연결이 아니에요.' },
      { text: '案内', meaning: '안내', role: '부탁하는 도움의 내용이에요. あんない로 읽어요.' },
      { text: 'を', meaning: '를', role: '부탁하는 대상을 나타내는 조사예요.' },
      { text: 'お願いします。', meaning: '부탁드립니다.', role: '상대에게 안내를 요청하는 표현이에요. 안내가 실제 제공됐다는 뜻은 아니에요.' },
    ],
    variations: [
      { kind: 'word', label: '모르는 길을 구체적으로 말하기', sentence: '駅への道が分からないので、案内をお願いします。', meaning: '역으로 가는 길을 모르므로 안내 부탁드립니다.', explanation: '道를 駅への道로 구체화했어요. へ는 방향, の는 앞 내용을 명사 道에 이어 주며 이유와 요청의 관계는 같아요.' },
      { kind: 'tense', label: '별도 예시: 과거의 이유와 요청', sentence: '道が分からなかったので、案内をお願いしました。', meaning: '길을 몰랐으므로 안내를 부탁했습니다.', explanation: '分からない를 分からなかった로 바꾸고, お願いします를 お願いしました로 바꾸어 별도 가상 상황에서 요청한 사실을 말해요. 현재 부탁과는 다르며 원문 요청의 완료나 안내를 받은 사실을 보장하지 않아요.' },
    ],
    questions: [
      { id: 't20-chunk-meaning', kind: 'meaning', prompt: '「道が分からないので、案内をお願いします。」의 뜻을 골라요.', choices: ['길을 알기 때문에 안내를 거절합니다.', '길을 모르므로 안내 부탁드립니다.', '길을 몰랐지만 안내를 받았습니다.'], answer: 1, explanation: '길을 모른다는 이유를 ので로 연결해 안내를 요청해요. 이미 안내받았다는 과거 사실은 아니에요.' },
      { id: 't20-chunk-blank', kind: 'blank', prompt: '“역으로 가는 길을 모르므로”라는 이유를 이어요. 駅への道が分からない（　）、案内をお願いします。', choices: ['のに', 'まで', 'ので'], answer: 2, explanation: 'ので가 이유를 이어 줘요. のに는 예상과 어긋나는 연결이고 まで는 이유를 나타내지 않아요.' },
      { id: 't20-chunk-listening', kind: 'listening', prompt: '가상 여행 도움 요청을 듣고 뜻을 골라요.', choices: ['역으로 가는 길을 모르므로 안내 부탁드립니다.', '역으로 가는 길을 알므로 안내는 필요 없습니다.', '호텔로 가는 길을 모르므로 안내 부탁드립니다.'], answer: 0, explanation: '駅への道는 역으로 가는 길이에요. 分からないので가 이유, 案内をお願いします가 도움 요청이에요.', audioText: '駅への道が分からないので、案内をお願いします。' },
    ],
  },
];
