import type { ReadingEnhancement } from './japaneseReadingEnhancements.ts';

/** Original fictional course-gap practice, not a complete curriculum or proficiency claim.
 * Stable new IDs only. Existing lessons and progress are not changed here.
 * The legacy writing field is comparison/selection, never free-text input.
 * Listening is fixed Japanese text only; this module generates no audio and uses no microphone.
 */
export const JAPANESE_COURSE_GAP_ENHANCEMENTS: ReadingEnhancement[] = [
  {
    "lessonId": "middle-core-01",
    "pair": {
      "expression": "見られます",
      "meaning": "이 문맥에서는 단말기를 이용해 영상을 볼 수 있다는 환경상의 가능을 나타내요.",
      "sourceParagraphIndex": 1,
      "sourceSentence": "写真家の話を録画した映像は、普段は受付の端末で見られます。",
      "parallelSentence": "写真家の話を録画した映像は、普段は図書室の端末で見られます。",
      "parallelMeaning": "사진가의 이야기를 녹화한 영상은 평소 도서실 단말기에서 볼 수 있습니다.",
      "changedDetail": "볼 수 있는 장소만 접수처에서 도서실로 바꾸었어요.",
      "caution": "별도 가상 예시예요. 볼 수 있다는 안내가 실제 시청 완료나 오늘의 단말기 이용 가능을 보장하지는 않아요."
    },
    "evidence": [
      {
        "questionId": "middle-core-01-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "短い日本語の説明なら辞書を使わずに読めます。"
        ],
        "reason": "사전 없이 가능한 범위를 짧은 설명으로 한정해요."
      },
      {
        "questionId": "middle-core-01-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "知らない漢字が多く、辞書がないと読めません。"
        ],
        "reason": "어려움의 이유가 모르는 한자라고 나와요."
      },
      {
        "questionId": "middle-core-01-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "今日は端末の調整中なので見られません"
        ],
        "reason": "오늘 영상 시청이 불가능한 이유를 단말기 상태에서 찾아요."
      },
      {
        "questionId": "middle-core-01-q4",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "展示室の後ろの席からも、大きな写真は見えます。",
          "細かい説明の文字は近くでないと読めません。"
        ],
        "reason": "큰 사진이 보이는 것과 작은 글자를 읽을 수 있는 조건을 대조해요."
      }
    ]
  },
  {
    "lessonId": "middle-core-02",
    "pair": {
      "expression": "ドアが開いていた",
      "meaning": "관찰한 시점에 문이 열린 상태였음을 나타내요. 여는 행동의 주체는 밝히지 않아요.",
      "sourceParagraphIndex": 0,
      "sourceSentence": "朝の記録には「八時半、ドアが開いていた」とだけ書かれていて、誰が開けたかは分かりません。",
      "parallelSentence": "朝の記録には「九時、ドアが開いていた」とだけ書かれていて、誰が開けたかは分かりません。",
      "parallelMeaning": "아침 기록에는 “9시, 문이 열려 있었다”라고만 적혀 있어 누가 열었는지는 알 수 없습니다.",
      "changedDetail": "관찰 시각만 8시 반에서 9시로 바꾸었어요.",
      "caution": "별도 가상 예시예요. 두 시각 모두 문을 연 정확한 시각이 아니라 열린 상태를 기록한 시각이에요."
    },
    "evidence": [
      {
        "questionId": "middle-core-02-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "朝の記録には「八時半、ドアが開いていた」とだけ書かれていて、誰が開けたかは分かりません。"
        ],
        "reason": "관찰된 상태와 알려지지 않은 행위자를 분리해요."
      },
      {
        "questionId": "middle-core-02-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "ソウタは展示室に入ってから、部屋の空気を入れ替えるために窓を開けました。"
        ],
        "reason": "ソウタ・窓を・開けました에서 사람·대상·행동을 찾아요."
      },
      {
        "questionId": "middle-core-02-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "しばらくすると風が強くなり、その風で窓が閉まりました。受付係が窓を閉めたのではありません。"
        ],
        "reason": "その風で가 바람이라는 원인을 명시하고 접수 담당자가 닫은 것은 아니라고 구분해요."
      },
      {
        "questionId": "middle-core-02-q4",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "ソウタは入口のドアを閉めました。",
          "その写真だけでは、閉めた人までは分かりません。"
        ],
        "reason": "서술문에서 얻는 행위자 정보와 사진만으로 확인 가능한 상태를 구별해요."
      }
    ]
  },
  {
    "lessonId": "middle-core-03",
    "pair": {
      "expression": "教えてくれました",
      "meaning": "선배의 가르침을 화자인 나에게 도움이 된 행동으로 나타내요.",
      "sourceParagraphIndex": 1,
      "sourceSentence": "受付では、先輩が私に名札の並べ方を教えてくれました。",
      "parallelSentence": "受付では、友人が私に名札の並べ方を教えてくれました。",
      "parallelMeaning": "접수처에서는 친구가 저에게 명찰을 늘어놓는 방법을 가르쳐 주었습니다.",
      "changedDetail": "도움을 준 사람만 선배에서 친구로 바꾸었어요. 받은 사람은 계속 私예요.",
      "caution": "별도 가상 예시예요. くれる와 もらう를 비교할 때는 이름만 바꾸지 말고 주제와 に의 역할도 함께 확인해요."
    },
    "evidence": [
      {
        "questionId": "middle-core-03-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "友人のアキが地図を描いてくれました。"
        ],
        "reason": "아키가 화자에게 지도를 그려 준 방향을 읽어요."
      },
      {
        "questionId": "middle-core-03-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "私はアキに会場の入口まで案内してもらいました。"
        ],
        "reason": "나는 수혜자, アキに는 안내한 사람을 나타내요."
      },
      {
        "questionId": "middle-core-03-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "先輩が私に名札の並べ方を教えてくれました。",
          "先輩に教えてもらったので、一人でも並べられました",
          "この二つの言い方は、同じ出来事を、助けた先輩と助けを受けた私の立場から述べたものです。"
        ],
        "reason": "두 문장은 관점만 다르고 가르친 사람과 배운 사람은 같아요."
      },
      {
        "questionId": "middle-core-03-q4",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "帰りには、私はお礼にアキの荷物を運びました。"
        ],
        "reason": "마지막 문장에서 화자가 한 보답을 찾아요."
      }
    ]
  },
  {
    "lessonId": "upper-core-01",
    "pair": {
      "expression": "読ませた",
      "meaning": "진행자가 다른 참가자에게 읽게 했다는 사역이에요. 실제 독자는 に로 표시한 사람이에요.",
      "sourceParagraphIndex": 1,
      "sourceSentence": "次に、森さんはケンに同じ場面を三回読ませた。",
      "parallelSentence": "次に、森さんはケンに同じ場面を二回読ませた。",
      "parallelMeaning": "다음으로 모리는 켄에게 같은 장면을 두 번 읽게 했다.",
      "changedDetail": "반복 횟수만 세 번에서 두 번으로 바꾸었어요. 읽는 사람과 읽게 한 사람은 그대로예요.",
      "caution": "별도 가상 예시예요. 이 한 문장만으로 켄이 싫어했는지 알 수는 없고, 본문에서 부담을 읽을 때는 켄의 희망과 말도 확인해요."
    },
    "evidence": [
      {
        "questionId": "upper-core-01-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "進行役の森さんは、ユイに最初の場面を読ませた。"
        ],
        "reason": "모리의 사역과 유이의 실제 읽기를 분리해요."
      },
      {
        "questionId": "upper-core-01-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "ユイは前からその役を試したいと言っていたので、喜んで読んだ。"
        ],
        "reason": "유이의 기존 희망과 기쁜 반응이 기회를 준 문맥을 보여 줘요."
      },
      {
        "questionId": "upper-core-01-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "ケンは一回で終えたかったが、森さんに求められて三回読んだ。",
          "三回も読ませられて、少し疲れた"
        ],
        "reason": "본래 희망보다 더 반복했다는 사건과 켄의 반응을 합쳐 읽어요."
      },
      {
        "questionId": "upper-core-01-q4",
        "paragraphIndexes": [
          2
        ],
        "quotes": [
          "最後に、ケンが書いた感想文は別の参加者に読まれた。今度はケンが聞く側に回った。"
        ],
        "reason": "감상문의 작성자인 켄과 읽은 다른 참가자를 구별해요."
      }
    ]
  },
  {
    "lessonId": "upper-core-02",
    "pair": {
      "expression": "拝見しました",
      "meaning": "이메일 화자가 상대에게 맡아 둔 자료를 보았다는 일을 겸양으로 말해요.",
      "sourceParagraphIndex": 0,
      "sourceSentence": "昨日お預かりした資料を拝見しました",
      "parallelSentence": "昨日お預かりした写真を拝見しました",
      "parallelMeaning": "어제 맡겨 주신 사진을 보았습니다.",
      "changedDetail": "본 대상만 자료에서 사진으로 바꾸었어요. 본 사람은 계속 발화자 쪽이에요.",
      "caution": "별도 가상 예문이에요. 拝見 자체가 검토 승인이나 내용 동의를 뜻하지 않으며, 누가 말한 것인지 먼저 확인해야 해요."
    },
    "evidence": [
      {
        "questionId": "upper-core-02-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "展示を企画する会社の石川は、来客である佐野に「こちらの見本をご覧ください」と言った。"
        ],
        "reason": "요청한 사람 이시카와와 요청을 받은 사노를 찾은 뒤 경어 방향을 읽어요."
      },
      {
        "questionId": "upper-core-02-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "翌日、石川が佐野に送ったメールには「昨日お預かりした資料を拝見しました」と書かれていた。"
        ],
        "reason": "이메일 화자인 이시카와가 자료를 본 사람이에요."
      },
      {
        "questionId": "upper-core-02-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "佐野様に展示の目的をご説明いただいたため、資料の内容がよく分かりました",
          "目的を説明したのは佐野で、その説明を受けたのは石川である。"
        ],
        "reason": "설명을 받는 관점의 いただく와 실제 설명 행위자를 대조해요."
      },
      {
        "questionId": "upper-core-02-q4",
        "paragraphIndexes": [
          2
        ],
        "quotes": [
          "相手に向けた文面で自社の担当者の行為を述べるため、「ご説明なさいます」ではなく「ご説明いたします」を用いている。"
        ],
        "reason": "외부 상대에게 자기 회사 쪽 행동을 말한다는 내외 관계가 표현 선택의 이유예요."
      }
    ]
  },
  {
    "lessonId": "upper-core-03",
    "pair": {
      "expression": "にすぎない",
      "meaning": "이번에 얻은 정보를 특정 시간대 여섯 명의 감상이라는 범위로 한정해요.",
      "sourceParagraphIndex": 1,
      "sourceSentence": "今回聞いたのは、午前中に来た六人の感想にすぎない。",
      "parallelSentence": "今回聞いたのは、午後に来た六人の感想にすぎない。",
      "parallelMeaning": "이번에 들은 것은 오후에 온 여섯 사람의 감상에 지나지 않는다.",
      "changedDetail": "의견을 들은 사람들의 방문 시간대만 오전에서 오후로 바꾸었어요.",
      "caution": "별도 가상 예시예요. にすぎない는 여기서 근거 범위의 한정이며 여섯 명의 의견에 가치가 없다는 판단을 자동으로 뜻하지 않아요."
    },
    "evidence": [
      {
        "questionId": "upper-core-03-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "写真展で文字を大きくした説明札は、近くで読む人には好評だった。とはいえ、通路の奥からは見えにくいという声もあった。"
        ],
        "reason": "긍정된 위치와 남은 문제의 위치를 비교하면 앞 평가를 취소하지 않는 양보가 드러나요."
      },
      {
        "questionId": "upper-core-03-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "係の人は、文字の大きさと札を置く位置を分けて考えることにした。"
        ],
        "reason": "별도로 검토하는 두 요소를 그대로 찾아요."
      },
      {
        "questionId": "upper-core-03-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "今回聞いたのは、午前中に来た六人の感想にすぎない。",
          "この六人の声は配置を考える手掛かりになるが、来場者全体の評価として扱うことはできない。"
        ],
        "reason": "단서로서의 가치는 인정하지만 전체 평가라는 범위로 확대하지 않아요."
      },
      {
        "questionId": "upper-core-03-q4",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "改善した点があるとはいえ、確認はまだ必要です",
          "評価をすべて取り消すのではなく、確認した範囲を明らかにしたうえで、別の位置からの見え方も調べようという提案である。"
        ],
        "reason": "일부 개선의 인정, 확인 범위의 명시, 다음 확인 제안을 함께 읽어요."
      }
    ]
  }
];
