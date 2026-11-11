import type { JapaneseChunkLesson } from './japaneseChunkLessons.ts';

/** Original fictional course-gap practice, not a complete curriculum or proficiency claim.
 * Stable new IDs only. Existing lessons and progress are not changed here.
 * The legacy writing field is comparison/selection, never free-text input.
 * Listening is fixed Japanese text only; this module generates no audio and uses no microphone.
 */
export const JAPANESE_COURSE_GAP_CHUNKS: JapaneseChunkLesson[] = [
  {
    "lessonId": "middle-core-01",
    "expression": "読めます",
    "sentence": "ミナは短い説明を読めます。",
    "meaning": "미나는 짧은 설명을 읽을 수 있습니다.",
    "chunks": [
      {
        "text": "ミナは",
        "meaning": "미나는",
        "role": "가능한 행동의 주체인 미나를 화제로 삼아요."
      },
      {
        "text": "短い説明を",
        "meaning": "짧은 설명을",
        "role": "읽을 수 있는 대상이에요. 가능 표현에서도 이처럼 を를 쓸 수 있어요."
      },
      {
        "text": "読めます。",
        "meaning": "읽을 수 있습니다",
        "role": "読む의 가능형 読める를 정중하게 만든 말이에요. 読みます(읽습니다)와 구별해요."
      }
    ],
    "variations": [
      {
        "kind": "word",
        "label": "대상 바꾸기: 説明 → 手紙",
        "sentence": "ミナは短い手紙を読めます。",
        "meaning": "미나는 짧은 편지를 읽을 수 있습니다.",
        "explanation": "별도 가상 예시에서 읽는 대상만 설명에서 편지로 바꿨어요."
      },
      {
        "kind": "tense",
        "label": "가능한 시점 바꾸기: 読めます → 読めました",
        "sentence": "ミナは去年も短い説明を読めました。",
        "meaning": "미나는 작년에도 짧은 설명을 읽을 수 있었습니다.",
        "explanation": "과거의 능력을 나타내요. 어떤 설명을 실제로 읽었는지까지는 말하지 않아요."
      }
    ],
    "questions": [
      {
        "id": "middle-core-01-chunk-meaning",
        "kind": "meaning",
        "prompt": "「ミナは短い説明を読めます。」의 뜻은?",
        "choices": [
          "미나는 짧은 설명을 읽을 수 있다",
          "미나는 설명을 읽지 말아야 한다",
          "미나는 모든 설명을 이미 다 읽었다"
        ],
        "answer": 0,
        "explanation": "読めます는 가능형이고, 대상은 短い説明이에요."
      },
      {
        "id": "middle-core-01-chunk-blank",
        "kind": "blank",
        "prompt": "読む의 가능형으로 “읽을 수 있습니다”를 골라요. ミナは短い説明を（　）。",
        "choices": [
          "読みました",
          "読めます",
          "読ませます"
        ],
        "answer": 1,
        "explanation": "読む→読める→読めます예요. 読みました는 읽었다, 読ませます는 읽게 한다는 말이에요."
      },
      {
        "id": "middle-core-01-chunk-listening",
        "kind": "listening",
        "prompt": "별도 가상 예문을 듣고 뜻을 골라요.",
        "choices": [
          "미나는 긴 기사를 읽을 수 없다",
          "미나는 짧은 편지를 이미 보냈다",
          "미나는 짧은 편지를 읽을 수 있다"
        ],
        "answer": 2,
        "explanation": "「短い手紙を読めます」는 짧은 편지를 읽을 수 있다는 말이에요. 보냈다는 뜻은 없어요.",
        "audioText": "ミナは短い手紙を読めます。"
      }
    ]
  },
  {
    "lessonId": "middle-core-02",
    "expression": "ドアが閉まる / ドアを閉める",
    "sentence": "ソウタは入口のドアを閉めました。",
    "meaning": "소타는 입구 문을 닫았습니다.",
    "chunks": [
      {
        "text": "ソウタは",
        "meaning": "소타는",
        "role": "문을 닫은 사람을 화제로 제시해요."
      },
      {
        "text": "入口のドアを",
        "meaning": "입구 문을",
        "role": "타동사 閉める의 대상을 を로 표시해요. 入口の가 어떤 문인지 꾸며요."
      },
      {
        "text": "閉めました。",
        "meaning": "닫았습니다",
        "role": "閉める의 정중한 과거형이에요. ドアが閉まりました(문이 닫혔습니다)와 초점이 달라요."
      }
    ],
    "variations": [
      {
        "kind": "word",
        "label": "대상 바꾸기: 入口のドア → 窓",
        "sentence": "ソウタは窓を閉めました。",
        "meaning": "소타는 창문을 닫았습니다.",
        "explanation": "별도 가상 예문에서 닫는 대상을 입구 문에서 창문으로 바꾸었어요. 본문에서 바람 때문에 닫힌 창문의 사실을 바꾼 것은 아니에요."
      },
      {
        "kind": "tense",
        "label": "시제 바꾸기: 閉めました → 閉めます",
        "sentence": "ソウタはこれから入口のドアを閉めます。",
        "meaning": "소타는 이제 입구 문을 닫습니다.",
        "explanation": "앞으로 할 일을 말하는 별도 예문이에요. 과거에 닫았다는 본문 사실과 구분해요."
      }
    ],
    "questions": [
      {
        "id": "middle-core-02-chunk-meaning",
        "kind": "meaning",
        "prompt": "「ソウタは入口のドアを閉めました。」에서 직접 문을 닫은 사람은?",
        "choices": [
          "입구 문",
          "소타",
          "문장에 행위자가 없다"
        ],
        "answer": 1,
        "explanation": "ソウタは가 행위자를, 入口のドアを가 닫는 대상을 나타내요."
      },
      {
        "id": "middle-core-02-chunk-blank",
        "kind": "blank",
        "prompt": "“소타는 입구 문을 닫았습니다”가 되도록 골라요. ソウタは入口のドアを（　）。",
        "choices": [
          "閉まりました",
          "開きました",
          "閉めました"
        ],
        "answer": 2,
        "explanation": "타동사 閉める가 を로 표시한 문에 한 행동을 말해요. 閉まる는 자동사예요."
      },
      {
        "id": "middle-core-02-chunk-listening",
        "kind": "listening",
        "prompt": "별도 가상 예문을 듣고 뜻을 골라요.",
        "choices": [
          "소타는 창문을 닫았다",
          "문이 저절로 열렸다",
          "소타는 입구 문을 열었다"
        ],
        "answer": 0,
        "explanation": "별도 가상 예문의 「窓を閉めました」는 창문을 닫았다는 뜻이에요. 본문의 입구 문과 대상을 구별해요.",
        "audioText": "ソウタは窓を閉めました。"
      }
    ]
  },
  {
    "lessonId": "middle-core-03",
    "expression": "～に教えてもらう",
    "sentence": "私は先輩に教えてもらいました。",
    "meaning": "저는 선배에게 배웠습니다.",
    "chunks": [
      {
        "text": "私は",
        "meaning": "저는",
        "role": "도움을 받은 사람을 화제로 제시해요."
      },
      {
        "text": "先輩に",
        "meaning": "선배에게",
        "role": "실제로 가르친 사람을 に로 표시해요."
      },
      {
        "text": "教えて",
        "meaning": "가르쳐",
        "role": "教える의 て형으로 도움의 내용을 나타내요."
      },
      {
        "text": "もらいました。",
        "meaning": "받았습니다",
        "role": "남의 행동으로 도움을 받은 관점이에요. 전체는 선배에게 배웠다는 뜻이에요."
      }
    ],
    "variations": [
      {
        "kind": "word",
        "label": "가르쳐 준 사람 바꾸기: 先輩 → 友人",
        "sentence": "私は友人に教えてもらいました。",
        "meaning": "저는 친구에게 배웠습니다.",
        "explanation": "별도 가상 예문에서 가르친 사람만 친구로 바꾸었어요. 도움받은 私는 그대로예요."
      },
      {
        "kind": "tense",
        "label": "시제 바꾸기: もらいました → もらいます",
        "sentence": "私は明日、先輩に教えてもらいます。",
        "meaning": "저는 내일 선배에게 배웁니다.",
        "explanation": "앞으로 받을 도움에 대한 별도 예문이에요. 완료된 도움을 보고한 본문과 구분해요."
      }
    ],
    "questions": [
      {
        "id": "middle-core-03-chunk-meaning",
        "kind": "meaning",
        "prompt": "「私は先輩に教えてもらいました。」의 실제 가르친 사람은?",
        "choices": [
          "화자",
          "화자와 선배 모두",
          "선배"
        ],
        "answer": 2,
        "explanation": "てもらう의 수혜자는 私, 가르친 사람은 先輩に의 선배예요."
      },
      {
        "id": "middle-core-03-chunk-blank",
        "kind": "blank",
        "prompt": "“나는 선배에게 배웠다”가 되도록 골라요. 私は先輩に教えて（　）。",
        "choices": [
          "もらいました",
          "あげました",
          "いました"
        ],
        "answer": 0,
        "explanation": "もらいました는 가르침을 받은 관점이에요. あげました는 내가 선배에게 가르쳐 준 반대 방향이에요."
      },
      {
        "id": "middle-core-03-chunk-listening",
        "kind": "listening",
        "prompt": "별도 가상 예문을 듣고 도움의 방향을 골라요.",
        "choices": [
          "내가 친구를 가르쳤다",
          "친구가 가르쳐 주어 내가 배웠다",
          "친구가 선배에게 배웠다"
        ],
        "answer": 1,
        "explanation": "「私は友人に教えてもらいました」에서 도움받은 사람은 私, 가르친 사람은 友人이에요.",
        "audioText": "私は友人に教えてもらいました。"
      }
    ]
  },
  {
    "lessonId": "upper-core-01",
    "expression": "読ませられる",
    "sentence": "ケンは森さんに三回読ませられました。",
    "meaning": "켄은 모리가 시켜 세 번 읽게 되었습니다.",
    "chunks": [
      {
        "text": "ケンは",
        "meaning": "켄은",
        "role": "실제로 읽게 된 당사자를 화제로 삼아요."
      },
      {
        "text": "森さんに",
        "meaning": "모리가 시켜",
        "role": "사역수동에서 읽게 한 사람을 표시해요."
      },
      {
        "text": "三回",
        "meaning": "세 번",
        "role": "읽은 횟수예요."
      },
      {
        "text": "読ませられました。",
        "meaning": "읽게 되었습니다",
        "role": "読む→読ませる→読ませられる의 정중한 과거형이에요. 이 단원에서는 원치 않던 반복이라는 문맥이 있어요."
      }
    ],
    "variations": [
      {
        "kind": "word",
        "label": "횟수 바꾸기: 三回 → 二回",
        "sentence": "ケンは森さんに二回読ませられました。",
        "meaning": "켄은 모리가 시켜 두 번 읽게 되었습니다.",
        "explanation": "별도 가상 예시에서 횟수만 바꿨어요. 본문의 세 번이라는 사실을 수정한 것은 아니에요."
      },
      {
        "kind": "tense",
        "label": "과거 한 번에서 현재의 반복으로 비교하기",
        "sentence": "練習のたびに、ケンは森さんに三回読ませられます。",
        "meaning": "연습할 때마다 켄은 모리가 시켜 세 번 읽게 됩니다.",
        "explanation": "별도 가상 예문에서 読ませられました를 読ませられます로 바꾸고 練習のたびに로 반복되는 일을 나타내요. 본문 사건이 매번 반복된다는 새 사실을 추가한 것은 아니에요."
      }
    ],
    "questions": [
      {
        "id": "upper-core-01-chunk-meaning",
        "kind": "meaning",
        "prompt": "청크 문장에서 실제로 읽은 사람은?",
        "choices": [
          "모리",
          "켄",
          "감상문"
        ],
        "answer": 1,
        "explanation": "사역수동에서는 ケン이 읽는 당사자이고 森さんに가 읽게 한 사람을 나타내요."
      },
      {
        "id": "upper-core-01-chunk-blank",
        "kind": "blank",
        "prompt": "“모리가 시켜 켄이 읽게 되었다”가 되도록 골라요. ケンは森さんに三回（　）。",
        "choices": [
          "読ませました",
          "読みました",
          "読ませられました"
        ],
        "answer": 2,
        "explanation": "読ませられました가 사역수동이에요. 読ませました는 켄이 모리에게 읽게 하는 반대 방향이에요."
      },
      {
        "id": "upper-core-01-chunk-listening",
        "kind": "listening",
        "prompt": "별도 가상 예문을 듣고 역할과 횟수를 골라요.",
        "choices": [
          "모리가 시켜 켄이 두 번 읽었다",
          "켄이 시켜 모리가 두 번 읽었다",
          "모리가 시켜 켄이 세 번 읽었다"
        ],
        "answer": 0,
        "explanation": "二回는 두 번이고, ケンは森さんに読ませられました에서 실제 독자는 켄이에요.",
        "audioText": "ケンは森さんに二回読ませられました。"
      }
    ]
  },
  {
    "lessonId": "upper-core-02",
    "expression": "資料を拝見しました",
    "sentence": "お預かりした資料を拝見しました。",
    "meaning": "맡겨 주신 자료를 읽어 보았습니다.",
    "chunks": [
      {
        "text": "お預かりした",
        "meaning": "맡아 두었던",
        "role": "預かる의 자기 쪽 행위를 낮춘 お預かりする를 과거로 만들어 뒤의 자료를 꾸며요."
      },
      {
        "text": "資料を",
        "meaning": "자료를",
        "role": "화자가 본 대상이에요."
      },
      {
        "text": "拝見しました。",
        "meaning": "읽어 보았습니다",
        "role": "見る의 겸양 표현이에요. 이 문맥에서는 자료를 읽은 사람이 화자예요."
      }
    ],
    "variations": [
      {
        "kind": "word",
        "label": "대상 바꾸기: 資料 → 写真",
        "sentence": "お預かりした写真を拝見しました。",
        "meaning": "맡겨 주신 사진을 보았습니다.",
        "explanation": "별도 가상 예시에서 보는 대상만 자료에서 사진으로 바꾸었어요. 사진에서는 보다라고 번역해요."
      },
      {
        "kind": "tense",
        "label": "완료에서 앞으로의 행동으로: ました → ます",
        "sentence": "お預かりした資料は、明日拝見します。",
        "meaning": "맡겨 주신 자료는 내일 읽어 보겠습니다.",
        "explanation": "별도 가상 예문의 明日가 앞으로 볼 시점을 정해요. 이미 보았다는 본문의 완료와 구분하며 실제 업무 약속이 아니에요."
      }
    ],
    "questions": [
      {
        "id": "upper-core-02-chunk-meaning",
        "kind": "meaning",
        "prompt": "화자가 말한 「お預かりした資料を拝見しました」의 의미는?",
        "choices": [
          "상대가 화자의 자료를 보았다",
          "상대에게 자료를 보지 말라고 했다",
          "화자가 맡아 둔 상대의 자료를 보았다"
        ],
        "answer": 2,
        "explanation": "拝見しました는 자기 쪽이 본 일을 겸양으로 말해요. 이 문장에서는 화자가 보는 사람인 문맥이에요."
      },
      {
        "id": "upper-core-02-chunk-blank",
        "kind": "blank",
        "prompt": "화자가 “제가 맡겨 주신 자료를 읽어 보았습니다”라고 말해요. お預かりした資料を（　）。",
        "choices": [
          "拝見しました",
          "ご覧になりました",
          "ご覧ください"
        ],
        "answer": 0,
        "explanation": "자신이 본 일이므로 겸양어 拝見しました예요. ご覧になる는 보는 상대를 높이고 ご覧ください는 상대에게 보라는 요청이에요."
      },
      {
        "id": "upper-core-02-chunk-listening",
        "kind": "listening",
        "prompt": "별도 가상 예문을 듣고 본 대상과 행위자를 골라요.",
        "choices": [
          "상대가 화자의 자료를 보았다",
          "화자가 맡겨 받은 사진을 보았다",
          "화자는 자료를 아직 보지 않았다"
        ],
        "answer": 1,
        "explanation": "写真은 사진이고 拝見しました는 이 문맥에서 화자가 보았다는 완료예요.",
        "audioText": "お預かりした写真を拝見しました。"
      }
    ]
  },
  {
    "lessonId": "upper-core-03",
    "expression": "～とはいえ",
    "sentence": "改善した点があるとはいえ、確認はまだ必要です。",
    "meaning": "개선된 점이 있다고는 해도 확인은 아직 필요합니다.",
    "chunks": [
      {
        "text": "改善した点がある",
        "meaning": "개선된 점이 있다",
        "role": "앞에서 인정하는 긍정적인 사실이에요. 点은 이 문맥에서 측면을 뜻해요."
      },
      {
        "text": "とはいえ、",
        "meaning": "그렇다고는 해도",
        "role": "앞 사실을 취소하지 않고 남은 제한으로 이어 주는 양보 표현이에요."
      },
      {
        "text": "確認は",
        "meaning": "확인은",
        "role": "계속 필요한 행동을 화제로 삼아요."
      },
      {
        "text": "まだ必要です。",
        "meaning": "아직 필요합니다",
        "role": "개선된 부분이 있어도 확인의 필요가 남아 있음을 나타내요."
      }
    ],
    "variations": [
      {
        "kind": "word",
        "label": "남은 행동 바꾸기: 確認 → 比較",
        "sentence": "改善した点があるとはいえ、比較はまだ必要です。",
        "meaning": "개선된 점이 있다고는 해도 비교는 아직 필요합니다.",
        "explanation": "별도 가상 예시에서 남은 행동만 확인에서 비교로 바꾸었어요. 앞 사실을 인정하는 양보는 그대로예요."
      },
      {
        "kind": "tense",
        "label": "시점 바꾸기: 必要です → 必要でした",
        "sentence": "その時点では、改善した点があるとはいえ、確認はまだ必要でした。",
        "meaning": "그 시점에는 개선된 점이 있다고는 해도 확인은 아직 필요했습니다.",
        "explanation": "과거의 특정 시점에서 필요 여부를 돌아보는 별도 예문이에요. 현재 확인이 끝났다는 정보까지 담지는 않아요."
      }
    ],
    "questions": [
      {
        "id": "upper-core-03-chunk-meaning",
        "kind": "meaning",
        "prompt": "「改善した点があるとはいえ、確認はまだ必要です」의 의미는?",
        "choices": [
          "일부 개선을 인정하지만 확인은 여전히 필요하다",
          "개선된 점이 전혀 없다고 취소한다",
          "개선된 점이 있으므로 모든 확인을 끝냈다"
        ],
        "answer": 0,
        "explanation": "とはいえ는 앞 사실을 인정한 채 충분하지 않은 점을 덧붙여요."
      },
      {
        "id": "upper-core-03-chunk-blank",
        "kind": "blank",
        "prompt": "앞 사실을 인정하면서 제한을 덧붙이는 “~라고는 해도”를 골라요. 改善した点がある（　）、確認はまだ必要です。",
        "choices": [
          "ので",
          "とはいえ",
          "までに"
        ],
        "answer": 1,
        "explanation": "とはいえ가 목표인 양보예요. ので도 문법적으로 이어지지만 앞 내용을 원인·이유로 제시하므로 “그렇다고는 해도”라는 목표 뜻과 달라요. までに는 이 자리에 맞지 않아요."
      },
      {
        "id": "upper-core-03-chunk-listening",
        "kind": "listening",
        "prompt": "별도 가상 예문을 듣고 아직 필요한 일을 골라요.",
        "choices": [
          "모든 평가의 취소",
          "행사의 확정",
          "비교"
        ],
        "answer": 2,
        "explanation": "들은 문장의 「比較はまだ必要です」에서 比較는 비교예요. 確認과 대상을 구별해요.",
        "audioText": "改善した点があるとはいえ、比較はまだ必要です。"
      }
    ]
  }
];
