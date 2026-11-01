// Original, bounded text exercises. The sequence is informed by Irodori's public
// learning guide; this is not copied course content or a proficiency assessment.
export type GrammarWritingPractice = { context: string; words: string; prompt: string; before: string; after: string; answers: string[]; result: string; reason: string; reading?: string; answerReadings?: Record<string, string>; sentenceInput?: boolean; questionInput?: boolean };
export const GRAMMAR_WRITING_PRACTICE: Record<string, GrammarWritingPractice> = {
 desu: {context:'내 물건에 설명표를 붙여요.',words:'これ = 이것 · 本(ほん) = 책 · です = 입니다',prompt:'「이것은 책입니다」의 끝맺음을 써 보세요.',before:'これは本',after:'。',answers:['です'],result:'これは本です。',reason:'本은 사물 이름인 명사예요. 명사를 설명하는 공손한 문장은 です로 마쳐요.'},
 wa: {context:'가방 속 물건이 무엇인지 설명해요.',words:'これ = 이것 · かばん = 가방 · は = 은/는(조사일 때 와)',prompt:'「이것은 가방입니다」에서 무엇에 대해 설명하는지 표시해요.',before:'これ',after:'かばんです。',answers:['は'],result:'これはかばんです。',reason:'설명할 대상인 これ 뒤에 は를 붙여요. 동작의 대상을 나타내는 を와 달라요.'},
 'kore-sore-are': {context:'내 손에 든 책에 설명을 붙여요.',words:'これ = 내 가까이의 이것 · それ = 상대 가까이의 그것 · あれ = 둘에게서 먼 저것',prompt:'내 손에 있는 책을 「이것은 책입니다」라고 써요.',before:'',after:'は本です。',answers:['これ'],result:'これは本です。',reason:'말하는 사람의 손에 있으므로 これ를 써요. 가까운 사람이 누구인지에 따라 말이 달라져요.'},
 'koko-soko-asoko': {context:'내가 서 있는 장소를 사진 설명에 적어요.',words:'ここ = 여기 · そこ = 거기 · あそこ = 저기 · 学校(がっこう) = 학교',prompt:'내가 있는 이곳을 「여기는 학교입니다」라고 써요.',before:'',after:'は学校です。',answers:['ここ'],result:'ここは学校です。',reason:'장소를 가리키므로 ここ를 써요. これは 사물을 가리켜요.'},
 masu: {context:'오늘 할 행동을 짧은 메모로 적어요.',words:'食べる(たべる) = 먹다 → 食べます(たべます) = 먹습니다',prompt:'「먹습니다」가 되도록 공손한 끝부분을 써요.',before:'食べ',after:'。',answers:['ます'],result:'食べます。',reason:'食べる는 る를 빼고 ます를 붙여요. 이 변화를 모든 동사에 그대로 적용하지는 않아요.'},
 wo: {context:'공부 계획에 오늘 할 일을 적어요.',words:'日本語(にほんご) = 일본어 · 勉強します(べんきょうします) = 공부합니다',prompt:'「일본어를 공부합니다」에서 동작의 대상을 나타내는 조사를 써요.',before:'日本語',after:'勉強します。',answers:['を'],result:'日本語を勉強します。',reason:'공부하는 대상인 日本語 뒤에 を를 붙여요. を는 여기서 오로 읽어요.'},
 ni: {context:'내 이동 계획을 메모해요.',words:'学校(がっこう) = 학교 · 行きます(いきます) = 갑니다',prompt:'「학교에 갑니다」의 목적지를 표시해요.',before:'学校',after:'行きます。',answers:['に','へ'],result:'学校に行きます。',reason:'이번 수업은 목적지를 나타내는 に를 연습해요. 방향을 나타내는 へ(에로 읽음)도 이 문장에 맞아요. 학교에서 공부하는 행동의 장소에는 で를 써요.'},
 de: {context:'어디에서 공부할지 계획해요.',words:'学校(がっこう) = 학교 · 勉強します(べんきょうします) = 공부합니다',prompt:'「학교에서 공부합니다」의 행동 장소를 표시해요.',before:'学校',after:'勉強します。',answers:['で'],result:'学校で勉強します。',reason:'공부하는 행동이 벌어지는 장소에는 で를 써요. 그 장소로 가는 목적지 に와 구분해요.'},
};
export const normalizeGrammarInput = (value: string, sentenceInput = false, questionInput = false) => {
 const normalized = value.normalize('NFKC').trim();
 return sentenceInput ? normalized.replace(questionInput ? /[。?]$/ : /。$/, '').trim() : normalized;
};
export const GRAMMAR_WRITING_ALTERNATES: Record<string, GrammarWritingPractice> = {
 desu: {context:'내 직업을 소개하는 짧은 글을 써요.',words:'私(わたし) = 저 · 会社員(かいしゃいん) = 회사원',prompt:'「저는 회사원입니다」의 끝맺음을 써요.',before:'私は会社員',after:'。',answers:['です'],result:'私は会社員です。',reason:'회사원은 명사이므로 です로 끝내요.'},
 wa: {context:'학교 사진에 설명을 붙여요.',words:'ここ = 여기 · 学校(がっこう) = 학교',prompt:'「여기는 학교입니다」의 화제를 표시해요.',before:'ここ',after:'学校です。',answers:['は'],result:'ここは学校です。',reason:'여기에 대해 설명하므로 ここ 뒤에 は를 써요.'},
 'kore-sore-are': {context:'상대가 손에 들고 있는 가방을 가리켜요.',words:'それ = 상대 가까이의 그것 · かばん = 가방',prompt:'「그것은 가방입니다」를 완성해요.',before:'',after:'はかばんです。',answers:['それ'],result:'それはかばんです。',reason:'상대 가까이에 있는 물건은 それ로 가리켜요.'},
 'koko-soko-asoko': {context:'나와 상대 모두에게서 멀리 있는 역을 가리켜요.',words:'あそこ = 저기 · 駅(えき) = 역',prompt:'「저기는 역입니다」를 완성해요.',before:'',after:'は駅です。',answers:['あそこ'],result:'あそこは駅です。',reason:'두 사람에게서 먼 장소는 あそこ예요.'},
 masu: {context:'내일 이동 계획을 적어요.',words:'行く(いく) = 가다 → 行きます(いきます) = 갑니다',prompt:'「갑니다」의 공손한 끝부분을 써요.',before:'行き',after:'。',answers:['ます'],result:'行きます。',reason:'行く는 行き에 ます를 붙여요. 行くます라고 쓰지 않아요.'},
 wo: {context:'식사 때 할 행동을 메모해요.',words:'水(みず) = 물 · 飲みます(のみます) = 마십니다',prompt:'「물을 마십니다」의 대상을 표시해요.',before:'水',after:'飲みます。',answers:['を'],result:'水を飲みます。',reason:'마시는 대상인 물 뒤에 を를 써요.'},
 ni: {context:'출근할 곳을 계획에 적어요.',words:'会社(かいしゃ) = 회사 · 行きます(いきます) = 갑니다',prompt:'「회사에 갑니다」의 목적지를 표시해요.',before:'会社',after:'行きます。',answers:['に','へ'],result:'会社に行きます。',reason:'이번 수업은 목적지의 に를 연습해요. 방향을 나타내는 へ도 이 문장에 맞아요.'},
 de: {context:'먹을 장소를 정해요.',words:'レストラン = 레스토랑 · 食べます(たべます) = 먹습니다',prompt:'「레스토랑에서 먹습니다」의 장소를 표시해요.',before:'レストラン',after:'食べます。',answers:['で'],result:'レストランで食べます。',reason:'먹는 행동이 일어나는 장소이므로 で를 써요.'},
};
Object.assign(GRAMMAR_WRITING_PRACTICE, {
 'desu-question': {context:'시설 안내를 읽고 확인할 내용을 써요.',words:'ここ = 여기 · 駅(えき) = 역 · ですか = 입니까',prompt:'「여기는 역입니까?」로 묻도록 끝을 완성해요.',before:'ここは駅です',after:'。',answers:['か'],result:'ここは駅ですか。',reason:'です 뒤에 か를 붙여 설명을 질문으로 바꿔요.'},
 'desu-negative': {context:'물건 설명을 바로잡아요.',words:'これ = 이것 · 本(ほん) = 책 · ではありません = 아닙니다',prompt:'「이것은 책이 아닙니다」의 끝부분을 써요.',before:'これは本',after:'。',answers:['ではありません','じゃありません','ではないです','じゃないです'],result:'これは本ではありません。',reason:'이번 수업의 기본형은 ではありません이에요. じゃありません·ではないです·じゃないです도 명사를 부정하는 공손한 표현이에요.'},
 'i-adjective': {context:'음식 사진에 짧은 설명을 붙여요.',words:'おいしい = 맛있다 · パン = 빵',prompt:'배운 い형용사로 「맛있는 빵입니다」의 맛있는을 써요.',before:'',after:'パンです。',answers:['おいしい','美味しい'],result:'おいしいパンです。',reason:'명사 앞에서도 おいしい의 い를 유지해요.'},
 'na-adjective': {context:'숙소 방을 설명하는 메모를 써요.',words:'静か(しずか) = 조용함 · 部屋(へや) = 방',prompt:'「조용한 방입니다」가 되도록 연결해요.',before:'静か',after:'部屋です。',answers:['な'],result:'静かな部屋です。',reason:'静か가 명사를 꾸미는 자리에는 な가 필요해요.'},
} satisfies Record<string, GrammarWritingPractice>);
Object.assign(GRAMMAR_WRITING_ALTERNATES, {
 'desu-question': {context:'물건 이름이 맞는지 글로 확인해요.',words:'これ = 이것 · 本(ほん) = 책',prompt:'「이것은 책입니까?」를 완성해요.',before:'これは本です',after:'。',answers:['か'],result:'これは本ですか。',reason:'설명 문장 끝에 か를 더해 질문으로 바꿔요.'},
 'desu-negative': {context:'장소를 잘못 알고 있어 설명을 바로잡아요.',words:'ここ = 여기 · 学校(がっこう) = 학교',prompt:'「여기는 학교가 아닙니다」를 완성해요.',before:'ここは学校',after:'。',answers:['ではありません','じゃありません','ではないです','じゃないです'],result:'ここは学校ではありません。',reason:'学校를 부정해요. 기본형 ではありません 외에 じゃありません·ではないです·じゃないです도 가능해요.'},
 'i-adjective': {context:'이동할 목적지를 간단히 묘사해요.',words:'大きい(おおきい) = 크다 · 駅(えき) = 역',prompt:'배운 い형용사로 「큰 역입니다」의 큰을 써요.',before:'',after:'駅です。',answers:['大きい','おおきい'],result:'大きい駅です。',reason:'大きい도 い형용사예요. 명사 앞에서 い를 유지해요.'},
 'na-adjective': {context:'회사 위치를 설명하는 짧은 메모를 써요.',words:'静か(しずか) = 조용함 · 場所(ばしょ) = 장소',prompt:'「조용한 장소입니다」를 완성해요.',before:'静か',after:'場所です。',answers:['な'],result:'静かな場所です。',reason:'場所라는 명사를 꾸미므로 静かな로 써요.'},
} satisfies Record<string, GrammarWritingPractice>);

import { BRIDGE_WRITING, BRIDGE_ALTERNATES } from "./grammarBridge.ts";
Object.assign(GRAMMAR_WRITING_PRACTICE, BRIDGE_WRITING);
Object.assign(GRAMMAR_WRITING_ALTERNATES, BRIDGE_ALTERNATES);
