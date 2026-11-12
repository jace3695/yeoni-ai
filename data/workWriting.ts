import type { GrammarWritingPractice } from './grammarWritingPractice';
export type WorkWritingTask = GrammarWritingPractice & { id: string; meaning: string };
export type WorkWritingUnit = { id: string; title: string; prerequisites: string[]; explanation: string; selfCheck: string; tasks: WorkWritingTask[] };
// Original application content; no grammar/history IDs are created or repurposed.
export const WORK_WRITING_UNITS: WorkWritingUnit[] = [
  {
    "id": "work-status-current",
    "title": "아직 할 일과 지금 하는 일",
    "prerequisites": [
      "masu",
      "desu"
    ],
    "explanation": "ます가 언제나 미래라는 뜻은 아니에요. 아직 시작하지 않고 이제 하겠다는 이번 상황에서 確認します를 확인하겠습니다로 읽어요. 새 고정 표현 確認中です는 현재 확인 중이며 완료는 아니라는 뜻이에요. 〜ている 활용 전체를 배우는 수업은 아니에요.",
    "selfCheck": "아직 시작 전과 하는 중에 해당하는 문장을 도움말 없이 구별할 수 있나요?",
    "tasks": [
      {
        "id": "work-status-current-a",
        "context": "가상 자료를 아직 읽지 않았고 이제 확인하려고 해요.",
        "words": "確認(かくにん) = 확인 · 確認します(かくにんします) = 확인합니다",
        "prompt": "確認します로 「확인하겠습니다」를 써요.",
        "answers": [
          "確認します",
          "かくにんします"
        ],
        "result": "確認します。",
        "reading": "かくにんします。",
        "meaning": "확인하겠습니다(이번 상황).",
        "reason": "이번 상황에서 이제 할 행동은 します로 적어요. しました는 이미 확인했다고 보고하므로 상황과 달라요.",
        "before": "",
        "after": "。",
        "sentenceInput": true,
        "questionInput": false,
        "fragmentInput": false
      },
      {
        "id": "work-status-current-b",
        "context": "가상 자료를 읽고 있으며 아직 확인이 끝나지 않았어요.",
        "words": "새 고정 표현: 確認中(かくにんちゅう) = 확인 중 · です = 입니다",
        "prompt": "確認中・です로 「확인 중입니다」를 써요.",
        "answers": [
          "確認中です",
          "かくにんちゅうです"
        ],
        "result": "確認中です。",
        "reading": "かくにんちゅうです。",
        "meaning": "확인 중입니다.",
        "reason": "中은 여기서 ちゅう로 읽으며 현재 진행 상태를 나타내요. 모든 中을 이 읽기로 일반화하지 않아요.",
        "before": "",
        "after": "。",
        "sentenceInput": true,
        "questionInput": false,
        "fragmentInput": false
      }
    ]
  },
  {
    "id": "work-status-completed",
    "title": "끝난 일만 완료라고 쓰기",
    "prerequisites": [
      "mashita",
      "wo"
    ],
    "explanation": "이미 배운 ます → ました를 주어진 형태에 적용해요. 새 단어 送ります(おくります)는 보냅니다, 送りました(おくりました)는 보냈습니다예요. 사전형에서 모든 동사의 활용을 추론하는 연습은 아니에요.",
    "selfCheck": "실제로 끝내지 않은 일에 완료 문장을 쓰면 안 되는 이유를 설명할 수 있나요?",
    "tasks": [
      {
        "id": "work-status-completed-a",
        "context": "가상 상황에서 확인을 방금 끝냈어요.",
        "words": "確認します → 確認しました(かくにんしました) = 확인했습니다",
        "prompt": "確認します의 완료형으로 「확인했습니다」를 써요.",
        "answers": [
          "確認しました",
          "かくにんしました"
        ],
        "result": "確認しました。",
        "reading": "かくにんしました。",
        "meaning": "확인했습니다.",
        "reason": "しました는 이 상황에서 완료된 행동을 보고해요. 아직 확인 중이면 이 완료 문장을 쓰지 않아요.",
        "before": "",
        "after": "。",
        "sentenceInput": true,
        "questionInput": false,
        "fragmentInput": false
      },
      {
        "id": "work-status-completed-b",
        "context": "가상 이야기 속 인물이 자료를 이미 보냈어요. 이 앱은 아무것도 보내지 않았어요.",
        "words": "資料(しりょう) = 자료 · 送りました(おくりました) = 보냈습니다",
        "prompt": "資料・を・送りました 순서로 「자료를 보냈습니다」를 써요.",
        "answers": [
          "資料を送りました",
          "資料をおくりました",
          "しりょうを送りました",
          "しりょうをおくりました"
        ],
        "result": "資料を送りました。",
        "reading": "しりょうをおくりました。",
        "meaning": "자료를 보냈습니다.",
        "reason": "を는 보낸 대상, ました는 이미 일어난 행동을 나타내요. 첨부했습니다나 수신했습니다와 같은 뜻은 아니에요.",
        "before": "",
        "after": "。",
        "sentenceInput": true,
        "questionInput": false,
        "fragmentInput": false
      }
    ]
  },
  {
    "id": "work-meeting-time",
    "title": "회의 시간 알기와 다시 확인하기",
    "prerequisites": [
      "wa",
      "desu",
      "desu-question",
      "time-on-hour"
    ],
    "explanation": "가상 안내에 나온 단일 시간만 읽어요. 会議(かいぎ)는 회의, 9時는 くじ예요. 이 문장만으로 오전·오후나 어느 나라 시간인지는 알 수 없어요. 시간대 변환이나 일정 예약은 하지 않아요.",
    "selfCheck": "시간을 알리는 문장과 확인하는 질문의 차이를 찾을 수 있나요?",
    "tasks": [
      {
        "id": "work-meeting-time-a",
        "context": "가상 시간표에 회의 시간이 9시라고 쓰여 있어요.",
        "words": "会議(かいぎ) = 회의 · 9時(くじ) = 9시",
        "prompt": "会議・は・9時・です로 「회의는 9시입니다」를 써요.",
        "answers": [
          "会議は9時です",
          "会議は九時です",
          "会議はくじです",
          "会議は9じです",
          "会議は九じです",
          "かいぎは9時です",
          "かいぎは九時です",
          "かいぎはくじです",
          "かいぎは9じです",
          "かいぎは九じです"
        ],
        "result": "会議は9時です。",
        "reading": "かいぎはくじです。",
        "meaning": "회의는 9시입니다.",
        "reason": "주제 は는 와로, 9時는 くじ로 읽어요. 문장은 가상 안내의 시각만 알려 줘요.",
        "before": "",
        "after": "。",
        "sentenceInput": true,
        "questionInput": false,
        "fragmentInput": false
      },
      {
        "id": "work-meeting-time-b",
        "context": "가상 안내의 시간이 맞는지 재확인하려 해요.",
        "words": "会議(かいぎ) = 회의 · 9時(くじ) = 9시 · ですか = 입니까",
        "prompt": "会議・は・9時・ですか로 「회의는 9시입니까?」를 써요.",
        "answers": [
          "会議は9時ですか",
          "会議は九時ですか",
          "会議はくじですか",
          "会議は9じですか",
          "会議は九じですか",
          "かいぎは9時ですか",
          "かいぎは九時ですか",
          "かいぎはくじですか",
          "かいぎは9じですか",
          "かいぎは九じですか"
        ],
        "result": "会議は9時ですか。",
        "reading": "かいぎはくじですか。",
        "meaning": "회의는 9시입니까?",
        "reason": "か가 확인 질문을 만들어요. 질문을 썼다고 실제 일정이 확정되거나 변경되지 않아요.",
        "before": "",
        "after": "。",
        "sentenceInput": true,
        "questionInput": true,
        "fragmentInput": false
      }
    ]
  },
  {
    "id": "work-colleague-request",
    "title": "내부 동료에게 짧게 확인 부탁하기",
    "prerequisites": [
      "wo",
      "no-particle"
    ],
    "explanation": "새 고정 표현 お願いします(おねがいします)는 부탁합니다예요. 서로 알고 같은 자료를 이야기하던 내부 동료에게 부담이 크지 않은 확인을 부탁하는 상황이에요. 상사·초면·외부 고객·급한 요구·중요한 계약에 두루 적합한 표현으로 보지 않아요. 물건 요청 名詞をください와 구분해요.",
    "selfCheck": "누구에게 무엇을 부탁하는지 먼저 확인했나요?",
    "tasks": [
      {
        "id": "work-colleague-request-a",
        "context": "무엇을 확인할지는 직전 가상 대화로 정해져 있어요.",
        "words": "確認(かくにん) = 확인 · 새 고정 표현 お願いします(おねがいします) = 부탁합니다",
        "prompt": "確認・を・お願いします로 「확인을 부탁합니다」를 써요.",
        "answers": [
          "確認をお願いします",
          "確認をおねがいします",
          "かくにんをお願いします",
          "かくにんをおねがいします"
        ],
        "result": "確認をお願いします。",
        "reading": "かくにんをおねがいします。",
        "meaning": "확인을 부탁합니다.",
        "reason": "確認이라는 작업을 부탁하는 고정 표현이에요. 이번에는 ご・いただく 등의 경어 확장을 채점하지 않아요.",
        "before": "",
        "after": "。",
        "sentenceInput": true,
        "questionInput": false,
        "fragmentInput": false
      },
      {
        "id": "work-colleague-request-b",
        "context": "부탁할 확인 대상을 자료로 명확히 해요.",
        "words": "資料(しりょう) = 자료 · 確認(かくにん) = 확인 · お願いします(おねがいします) = 부탁합니다",
        "prompt": "資料・の・確認・を・お願いします 순서로 「자료 확인을 부탁합니다」를 써요.",
        "answers": [
          "資料の確認をお願いします",
          "資料の確認をおねがいします",
          "資料のかくにんをお願いします",
          "資料のかくにんをおねがいします",
          "しりょうの確認をお願いします",
          "しりょうの確認をおねがいします",
          "しりょうのかくにんをお願いします",
          "しりょうのかくにんをおねがいします"
        ],
        "result": "資料の確認をお願いします。",
        "reading": "しりょうのかくにんをおねがいします。",
        "meaning": "자료 확인을 부탁합니다.",
        "reason": "の는 두 명사를 이어 어떤 확인인지를 밝혀요. 정중한 끝맺음만으로 상대 부담이나 직장 관례까지 해결되지는 않아요.",
        "before": "",
        "after": "。",
        "sentenceInput": true,
        "questionInput": false,
        "fragmentInput": false
      }
    ]
  },
  {
    "id": "work-subject-reading",
    "title": "짧은 제목과 본문의 역할",
    "prerequisites": [
      "no-particle",
      "mashita"
    ],
    "explanation": "件名(けんめい)은 제목, 本文(ほんぶん)은 본문이에요. 아래는 가상 제목·본문 조각이며 완성된 대외 메일 양식이 아니에요. 제목만으로 확인이나 발송이 끝났다고 판단하지 않아요.",
    "selfCheck": "제목만 보고 발송·확인이 완료됐다고 넘겨짚지 않았나요?",
    "tasks": [
      {
        "id": "work-subject-reading-a",
        "context": "가상 제목: 資料の確認 / 읽기: しりょうのかくにん / 뜻: 자료 확인",
        "words": "資料(しりょう) = 자료 · 確認(かくにん) = 확인",
        "prompt": "제목에서 자료에 해당하는 명사만 일본어로 옮겨요. 문장부호는 붙이지 않아요.",
        "answers": [
          "資料",
          "しりょう"
        ],
        "result": "資料",
        "reading": "しりょう",
        "meaning": "자료",
        "reason": "資料の確認에서 資料가 확인 대상이에요. 확인이 끝났는지는 제목만으로 알 수 없어요.",
        "before": "",
        "after": "",
        "sentenceInput": false,
        "questionInput": false,
        "fragmentInput": true
      },
      {
        "id": "work-subject-reading-b",
        "context": "가상 본문: 会議は9時です。 / 읽기: かいぎはくじです。 / 뜻: 회의는 9시입니다.",
        "words": "会議(かいぎ) = 회의 · 時間(じかん) = 시간",
        "prompt": "会議・の・時間 순서로 「회의 시간」이라는 제목을 써요. 문장부호는 붙이지 않아요.",
        "answers": [
          "会議の時間",
          "会議のじかん",
          "かいぎの時間",
          "かいぎのじかん"
        ],
        "result": "会議の時間",
        "reading": "かいぎのじかん",
        "meaning": "회의 시간",
        "reason": "제목은 용건을 빠르게 알려 줘요. 이번 명사구 제목에는 です를 붙이지 않아요. 다른 제목도 가능하지만 이번 목표는 の 연결이에요.",
        "before": "",
        "after": "",
        "sentenceInput": false,
        "questionInput": false,
        "fragmentInput": true
      }
    ]
  }
];
export const WORK_MESSAGE = {
 id: 'work-message-integration-01',
 subject: '資料の確認', subjectReading: 'しりょうのかくにん',
 body: '資料を送りました。確認をお願いします。', bodyReading: 'しりょうをおくりました。かくにんをおねがいします。',
 meaning: '제목: 자료 확인 / 본문: 자료를 보냈습니다. 확인을 부탁합니다.',
 explanation: '이야기 속 발신자가 자료를 보내는 일은 끝냈어요. 받는 사람에게 확인을 부탁했으므로, 받는 사람이 확인을 끝냈다는 뜻은 아니에요. 앱에서 전송했다는 뜻도 아니에요.',
 selfCheck: '누가 보냈고 누가 확인해야 하나요? 제목만으로 확인 완료를 알 수 있나요? 실제 전송이 일어났나요?',
};
