import type { ReadingSupport } from './japaneseReadingSupport.ts';

/** Original fictional course-gap practice, not a complete curriculum or proficiency claim.
 * Stable new IDs only. Existing lessons and progress are not changed here.
 * The legacy writing field is comparison/selection, never free-text input.
 * Listening is fixed Japanese text only; this module generates no audio and uses no microphone.
 */
export const JAPANESE_COURSE_GAP_SUPPORT: Record<string, ReadingSupport> = {
  "middle-core-01": {
    "purpose": "가능형의 형태와 가능의 이유를 구분해요.",
    "beforeReading": "눈에 보이는 글이라면 언제나 그 내용을 읽을 수 있을까요?",
    "targetExpressions": [
      "読めます",
      "見られます"
    ],
    "evidenceStrategy": "무엇을 할 수 있는지와 그 조건을 표시하고, 능력·환경·실제 실행을 따로 읽으세요."
  },
  "middle-core-02": {
    "purpose": "행동한 사람과 변화·결과 상태를 나누어 읽어요.",
    "beforeReading": "열린 문을 찍은 사진만으로 누가 문을 열었는지 알 수 있을까요?",
    "targetExpressions": [
      "窓を開けました",
      "窓が閉まりました"
    ],
    "evidenceStrategy": "が・を와 동사의 짝을 함께 찾고, 행위자가 본문에 명시됐는지 아니면 상태만 나오는지 확인하세요."
  },
  "middle-core-03": {
    "purpose": "주제가 달라져도 도움의 실제 방향을 유지해 읽어요.",
    "beforeReading": "“친구가 가르쳐 주었다”와 “친구에게 배웠다”에서 가르친 사람이 바뀔까요?",
    "targetExpressions": [
      "教えてくれました",
      "教えてもらった"
    ],
    "evidenceStrategy": "각 문장에서 실제 행동한 사람과 도움받은 사람을 먼저 짝지은 뒤 は・が・に가 누구에게 붙는지 대조하세요."
  },
  "upper-core-01": {
    "purpose": "사역·사역수동·수동에서 실제 행동한 사람을 추적해요.",
    "beforeReading": "“읽게 했다”라는 형태만으로 원치 않는 강요였다고 말할 수 있을까요?",
    "targetExpressions": [
      "読ませた",
      "読ませられて"
    ],
    "evidenceStrategy": "시킨 사람→행동한 사람→행동 대상을 구분한 뒤, 인물의 희망과 반응을 찾아 허용인지 부담인지 판단하세요."
  },
  "upper-core-02": {
    "purpose": "존경어와 겸양어를 행위자·상대·소속 관계로 해석해요.",
    "beforeReading": "“보십니다”와 “읽어 보았습니다”가 모두 정중하더라도 보는 사람은 같을까요?",
    "targetExpressions": [
      "ご覧ください",
      "拝見しました"
    ],
    "evidenceStrategy": "인용문마다 화자와 수신자를 먼저 찾고, 실제 보는 사람·설명하는 사람을 표시한 다음 자기 회사와 외부 상대를 구분하세요."
  },
  "upper-core-03": {
    "purpose": "양보와 한정이 긍정 평가를 어디까지 유지하는지 읽어요.",
    "beforeReading": "일부 사람에게 호평을 받았다면 전체에게 성공했다고 말하거나, 반대로 그 의견을 모두 버려야 할까요?",
    "targetExpressions": [
      "とはいえ",
      "にすぎない"
    ],
    "evidenceStrategy": "인정하는 사실과 남은 제한을 양쪽에 나누고, 의견을 들은 사람·시간·장소의 범위를 찾아 결론이 그 범위를 넘는지 확인하세요."
  }
};
