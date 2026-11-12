import type { ReadingEnhancement } from './japaneseReadingEnhancements.ts';

/** Original optional scaffolds for the six preserved advanced passages.
 * Exact source evidence is revealed after an answer; parallel examples are fictional.
 * No passage, question, answer index, stored record or audio request is changed here. */
export const JAPANESE_UPPER_ENHANCEMENTS: ReadingEnhancement[] = [
  {
    "lessonId": "upper-01",
    "pair": {
      "expression": "わけではない",
      "meaning": "가능해진 행동을 다른 조건의 변경으로 확대해서 해석하지 않도록 범위를 제한해요.",
      "sourceParagraphIndex": 1,
      "sourceSentence": "場所を変えるのは利用者の便宜を図るためだが、期限そのものを延ばすわけではない。",
      "parallelSentence": "申込書をオンラインで送れるようになったが、受付期限が延びたわけではない。",
      "parallelMeaning": "신청서를 온라인으로 보낼 수 있게 되었지만 접수 기한이 늘어난 것은 아니다.",
      "changedDetail": "야간 반납과 반납 기한을 온라인 신청과 접수 기한으로 바꾸었어요.",
      "caution": "별도의 가상 신청 안내예요. 원문 도서실에 온라인 신청이 생겼다는 뜻이 아니며, 편의가 개선됐다고 기한까지 바뀐 것으로 읽지 않아요."
    },
    "evidence": [
      {
        "questionId": "upper-01-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "閉室後にも本を返したいという声が寄せられたためだ。"
        ],
        "reason": "「ためだ」 앞의 이용자 의견이 위치 변경의 직접적인 이유예요. 직원 수나 대출 기간의 변화는 이 이유에 포함되지 않아요."
      },
      {
        "questionId": "upper-01-q2",
        "paragraphIndexes": [
          0,
          1
        ],
        "quotes": [
          "返却日として記録されるのは、職員が翌朝、本を確認した日になる。",
          "期限当日の夜に入れた場合、返却が一日遅れた扱いになります"
        ],
        "reason": "기록 기준은 넣은 순간이 아니라 다음 날 아침 확인일이에요. 둘째 문단의 안내가 기한 당일 밤에 넣은 경우의 처리도 직접 밝혀요."
      },
      {
        "questionId": "upper-01-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "期限そのものを延ばすわけではない。"
        ],
        "reason": "「わけではない」가 부정하는 것은 기한 연장이라는 해석이에요. 야간에 반납함을 이용할 수 있다는 앞선 내용을 취소하는 말은 아니에요."
      },
      {
        "questionId": "upper-01-q4",
        "paragraphIndexes": [
          0,
          1
        ],
        "quotes": [],
        "reason": "두 문단에는 반납함 위치·뚜껑·기록일·기한은 나오지만 벌금의 유무나 금액은 없어요. 늦게 처리된다는 사실에서 금액까지 추측하지 않아요."
      }
    ]
  },
  {
    "lessonId": "upper-02",
    "pair": {
      "expression": "て初めて",
      "meaning": "앞 단계만으로는 충분하지 않고 특정 절차를 거쳐야 비로소 완료됨을 나타내요.",
      "sourceParagraphIndex": 0,
      "sourceSentence": "受付で名前を記入しただけでは参加は確定せず、担当者から席の案内を受けて初めて手続きが完了する。",
      "parallelSentence": "担当者の確認を受けて初めて、申込みが完了します。",
      "parallelMeaning": "담당자의 확인을 받아야 비로소 신청이 완료됩니다.",
      "changedDetail": "이름 기입 뒤 자리 안내를 받는 원문 절차를, 담당자 확인 뒤 신청이 완료되는 별도 절차로 바꾸었어요.",
      "caution": "새 예문은 가상의 다른 신청 절차예요. 이를 원문 강좌의 당일 예외나 지각 제한을 없애는 규칙으로 사용하지 않아요."
    },
    "evidence": [
      {
        "questionId": "upper-02-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "当日の朝に空席があれば、予約のない人も参加できる。",
          "担当者から席の案内を受けて初めて手続きが完了する。"
        ],
        "reason": "예약 없는 참가의 빈자리 조건과 참가 절차 완료 조건을 함께 읽어요. 이름을 적는 것만으로 확정된다는 선택지는 두 번째 조건을 빠뜨려요."
      },
      {
        "questionId": "upper-02-q2",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "材料を特別に注文する革の講座に限っては、空席があっても当日の申込みを受け付けない。"
        ],
        "reason": "「革の講座に限っては」가 따로 다루는 대상을 정하고, 「空席があっても」는 빈자리가 있어도 당일 신청 불가 규칙이 유지됨을 나타내요."
      },
      {
        "questionId": "upper-02-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "開始時刻から十五分を過ぎると、安全説明を受けられないため、予約済みでも参加できない。"
        ],
        "reason": "20분 지각은 본문의 15분 초과 제한에 해당해요. 「予約済みでも」는 예약 완료가 이 제한의 예외가 아님을 분명히 해요."
      },
      {
        "questionId": "upper-02-q4",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "受付で名前を記入しただけでは参加は確定せず"
        ],
        "reason": "「だけでは」가 이름 기입만으로는 충분하지 않다고 제한해요. 참가 취소나 안전 설명 면제를 뜻하는 문장은 아니에요."
      }
    ]
  },
  {
    "lessonId": "upper-03",
    "pair": {
      "expression": "とは言い切れない",
      "meaning": "가능성을 없다고 단정하는 대신, 그 설명만으로 확정하기에는 근거가 부족함을 나타내요.",
      "sourceParagraphIndex": 1,
      "sourceSentence": "そのため、席の増設だけが客数増加の原因だとは言い切れない。",
      "parallelSentence": "問い合わせは減ったが、案内板の増設だけが原因だとは言い切れない。",
      "parallelMeaning": "문의는 줄었지만 안내판 증설만이 원인이라고 단정할 수는 없다.",
      "changedDetail": "방문객 증가와 좌석 증설을 문의 감소와 안내판 증설로 바꾸었어요.",
      "caution": "새 예문은 별도의 가상 상황이에요. 「言い切れない」를 안내판이나 좌석이 전혀 영향을 주지 않았다는 확정으로 바꾸지 않아요."
    },
    "evidence": [
      {
        "questionId": "upper-03-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "今月の平日の来店者数が先月より二割増えた。"
        ],
        "reason": "「二割」는 20퍼센트예요. 본문은 이번 달 평일 방문객 수의 증가를 제시하지만 증가 원인을 하나로 확정하지는 않아요."
      },
      {
        "questionId": "upper-03-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "店に入りやすくなったことも影響しているかもしれない"
        ],
        "reason": "「かもしれない」는 영향이 있을 가능성을 말해요. 원인 확정도 아니고 도로 공사가 끝났다는 사실을 부정하는 표현도 아니에요."
      },
      {
        "questionId": "upper-03-q3",
        "paragraphIndexes": [
          0,
          1
        ],
        "quotes": [
          "店は先月末に窓際の席を増やしたが、同じ時期に近くの道路工事も終わっている。",
          "客に来店理由を尋ねる調査はまだ行われていない。"
        ],
        "reason": "좌석 증설 외에 도로 공사 종료도 같은 시기에 있었고 방문 이유 조사도 아직 없어요. 함께 일어난 변화만으로 하나를 유일한 원인으로 정하지 않아요."
      },
      {
        "questionId": "upper-03-q4",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "店では来月、初めて来た客に理由を聞く予定だ。",
          "その回答だけで、以前から通う客の行動まで説明できるわけではない。"
        ],
        "reason": "예정된 조사 대상은 처음 온 손님이에요. 그 답변을 이전부터 다니던 손님의 행동까지 설명하는 자료로 확대하지 않아요."
      }
    ]
  },
  {
    "lessonId": "upper-04",
    "pair": {
      "expression": "だけで",
      "meaning": "주어진 비교 자료 하나만으로 결론을 충분히 뒷받침할 수 있는지 범위를 살펴보게 해요.",
      "sourceParagraphIndex": 1,
      "sourceSentence": "したがって、この比較だけで一覧表の効果を断定することはできない。",
      "parallelSentence": "一日の記録だけで、新しい受付方法の効果を断定することはできない。",
      "parallelMeaning": "하루의 기록만으로 새로운 접수 방법의 효과를 단정할 수는 없다.",
      "changedDetail": "일주일씩 비교한 목록 사례를 하루 기록으로 접수 방법을 평가하는 별도 사례로 바꾸었어요.",
      "caution": "원문 관찰 기간이 하루로 바뀐 것은 아니에요. 자료가 부족하다는 말은 기록된 감소 결과 자체가 거짓이라거나 효과가 없다는 뜻이 아니에요."
    },
    "evidence": [
      {
        "questionId": "upper-04-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "書類の記入漏れを減らすため、提出前に確認する一覧表を配った。"
        ],
        "reason": "「ため」 앞에 목록을 배포한 목적이 나와요. 목적을 읽는 문제이므로 직원 수를 줄이거나 서류 종류를 없앴다는 내용을 덧붙이지 않아요."
      },
      {
        "questionId": "upper-04-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "導入前の一週間には百件中十二件の漏れがあったが、導入後の一週間には百件中五件に減った。"
        ],
        "reason": "각 주의 전체 비교 대상은 100건이고 누락이 12건에서 5건으로 줄었어요. 전체 서류 수가 줄었거나 누락이 0건이 되었다는 뜻은 아니에요."
      },
      {
        "questionId": "upper-04-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "導入後は経験のある職員が多く勤務していた。",
          "この比較だけで一覧表の効果を断定することはできない。"
        ],
        "reason": "목록 도입 뒤에는 경험 있는 직원이 많이 근무했다는 별도 조건이 있어요. 이 점도 누락 감소에 영향을 주었을 수 있어 목록만의 효과로 단정하기 어려워요."
      },
      {
        "questionId": "upper-04-q4",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "今後は職員の経験や書類の種類も記録し、条件の近い週を比べる。"
        ],
        "reason": "「今後は」 뒤의 계획은 직원 경험과 서류 종류를 기록하고 비슷한 조건을 비교하는 것이에요. 기존 자료를 지우거나 건수만 늘리자는 계획이 아니에요."
      }
    ]
  },
  {
    "lessonId": "upper-05",
    "pair": {
      "expression": "お知らせいただけますと幸いです",
      "meaning": "상대가 정보를 알려 주면 감사하겠다는 형태로 정중하게 회신을 요청해요.",
      "sourceParagraphIndex": 0,
      "sourceSentence": "展示用の文章を金曜日に印刷する予定ですので、木曜日の正午までにお知らせいただけますと幸いです。",
      "parallelSentence": "準備に必要なため、参加人数を水曜日までにお知らせいただけますと幸いです。",
      "parallelMeaning": "준비에 필요하므로 수요일까지 참가 인원을 알려 주시면 감사하겠습니다.",
      "changedDetail": "사진 촬영 연도 확인과 목요일 정오 기한을 참가 인원과 수요일 기한으로 바꾸었어요.",
      "caution": "별도 가상 요청의 정보와 기한이에요. 정중한 요청문은 상대가 기한을 이미 받아들였거나 회신을 완료했다는 증명이 아니에요."
    },
    "evidence": [
      {
        "questionId": "upper-05-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "お借りした写真の説明文に撮影年の記載がないため、確認をお願いできますか。"
        ],
        "reason": "빠진 정보는 사진의 촬영 연도예요. 그 정보가 기재되지 않았다는 이유와 확인 요청을 연결해서 읽어요."
      },
      {
        "questionId": "upper-05-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "展示用の文章を金曜日に印刷する予定ですので、木曜日の正午までにお知らせいただけますと幸いです。"
        ],
        "reason": "「金曜日に」는 인쇄 예정일이고 「木曜日の正午までに」는 회신 요청 기한이에요. 서로 다른 행동에 붙은 시점을 섞지 않아요."
      },
      {
        "questionId": "upper-05-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "その時点で確認が難しい場合は、確認できる時期の見込みだけでもお知らせください。"
        ],
        "reason": "기한 내 확인이 어렵다면 확인 가능 시점의 전망을 알려 달라는 대안이에요. 확인되지 않은 연도를 임의로 만들어 달라는 뜻은 아니에요."
      },
      {
        "questionId": "upper-05-q4",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "撮影年を断定しない表現に変更することも検討しております。"
        ],
        "reason": "「検討しております」는 정중하게 검토 중이라는 상태를 나타내요. 표현 변경을 이미 끝냈다거나 상대에게 금지했다는 뜻으로 읽지 않아요."
      }
    ]
  },
  {
    "lessonId": "upper-06",
    "pair": {
      "expression": "てはどうか",
      "meaning": "해 보는 것은 어떠냐고 제안하며, 이미 확정된 결정과는 구별해요.",
      "sourceParagraphIndex": 1,
      "sourceSentence": "そこで、まず一か月間、金曜日に限って一時間延長してはどうか。",
      "parallelSentence": "まず二週間だけ、朝の相談時間を三十分延ばしてはどうか。",
      "parallelMeaning": "우선 2주 동안만 아침 상담 시간을 30분 늘려 보는 것은 어떨까?",
      "changedDetail": "한 달간 금요일 저녁 1시간 연장안을 2주간 아침 상담 30분 연장안으로 바꾸었어요.",
      "caution": "별도의 가상 제안이에요. 원문 시범안의 기간·요일·시간을 새 예문의 값으로 바꾸지 않으며 어느 쪽도 확정 시행으로 읽지 않아요."
    },
    "evidence": [
      {
        "questionId": "upper-06-q1",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "近隣の住民は帰宅時の話し声を心配している。"
        ],
        "reason": "걱정하는 주체는 인근 주민이고 대상은 귀가할 때의 대화 소리예요. 행사 재료나 예약 정보에 대한 걱정은 제시되지 않았어요."
      },
      {
        "questionId": "upper-06-q2",
        "paragraphIndexes": [
          0
        ],
        "quotes": [
          "管理者によると、毎晩の延長には人手が足りないが、金曜日だけなら対応できるという。"
        ],
        "reason": "관리자는 인력 때문에 매일 연장은 어렵지만 금요일은 대응 가능하다고 말해요. 제안은 이 제약을 반영한 것이며 모든 주민의 찬성을 뜻하지 않아요."
      },
      {
        "questionId": "upper-06-q3",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "まず一か月間、金曜日に限って一時間延長してはどうか。"
        ],
        "reason": "기간 한 달·요일 금요일·연장 시간 한 시간이라는 세 범위와 제안 표현을 함께 읽어요. 매일 영구 연장으로 바꾸지 않아요."
      },
      {
        "questionId": "upper-06-q4",
        "paragraphIndexes": [
          1
        ],
        "quotes": [
          "人数と近隣からの意見を記録する。",
          "期間が終わったら、便利さだけでなく管理の負担も確認し、続けるかどうかを話し合いたい。"
        ],
        "reason": "인원과 주민 의견을 남기고 편의와 관리 부담을 모두 확인한 뒤 지속 여부를 논의하는 계획이에요. 인원 하나만으로 자동 영구 전환하는 방식이 아니에요."
      }
    ]
  }
];
