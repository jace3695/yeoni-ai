import type { UpperLesson } from './japaneseUpperLessons.ts';

/** Original learning scaffolds, not copied exercises or an official syllabus.
 * These do not alter lesson IDs, question text, answer positions or saved data.
 */
export type ReadingSupport = {
  purpose: string;
  beforeReading: string;
  targetExpressions: readonly [string, string];
  evidenceStrategy: string;
};

export const JAPANESE_READING_SUPPORT: Record<string, ReadingSupport> = {
  "upper-01": {
    "purpose": "안내의 편의 개선과 그대로인 이용 조건을 구분해요.",
    "beforeReading": "이용 방법이 편해졌다면 기한과 처리 기준도 반드시 함께 바뀔까요?",
    "targetExpressions": [
      "ためだ",
      "わけではない"
    ],
    "evidenceStrategy": "변경 이유와 이용 규칙을 나누어 찾고, 명시된 내용과 본문에 없는 정보를 구분하세요."
  },
  "upper-02": {
    "purpose": "일반 원칙·예외·예외의 추가 제한을 차례로 적용해요.",
    "beforeReading": "참가 조건 하나를 만족한 뒤에도 확인해야 할 절차나 제한이 있을까요?",
    "targetExpressions": [
      "て初めて",
      "ても"
    ],
    "evidenceStrategy": "원칙과 예외의 대상을 먼저 찾고, 절차 완료 조건과 시간 제한까지 함께 대조하세요."
  },
  "upper-03": {
    "purpose": "관찰된 변화와 그 원인에 대한 추측, 조사 대상의 범위를 나누어 읽어요.",
    "beforeReading": "두 일이 같은 시기에 일어났다면 하나가 다른 하나의 유일한 원인이라고 할 수 있을까요?",
    "targetExpressions": [
      "かもしれない",
      "とは言い切れない"
    ],
    "evidenceStrategy": "수치 진술과 추측 표현을 구별하고, 이미 확인한 사실과 앞으로 조사할 대상을 나누어 보세요."
  },
  "upper-04": {
    "purpose": "비교한 수치의 분모와 누락 건수, 조건 차이를 함께 살펴봐요.",
    "beforeReading": "개선 전후의 숫자를 비교할 때 숫자 말고 같아야 할 조건에는 무엇이 있을까요?",
    "targetExpressions": [
      "だけで",
      "条件の近い"
    ],
    "evidenceStrategy": "전체 대상과 그중 해당 건수를 구분하고, 결과를 설명하는 다른 조건 및 다음 비교 계획을 찾아보세요."
  },
  "upper-05": {
    "purpose": "정중한 요청에서 필요한 정보·이유·회신 기한·대안을 찾아요.",
    "beforeReading": "기한까지 확답하기 어렵다면 상대에게 무엇을 대신 알려 줄 수 있을까요?",
    "targetExpressions": [
      "お知らせいただけますと幸いです",
      "場合は"
    ],
    "evidenceStrategy": "누가 누구에게 무엇을 요청하는지 찾고, 각 날짜가 가리키는 행동과 검토·완료 상태를 구분하세요."
  },
  "upper-06": {
    "purpose": "서로 다른 의견과 제약을 반영한 시범안의 범위를 읽어요.",
    "beforeReading": "일부 사람의 편의가 나아지는 제안을 검토할 때 다른 사람의 어떤 부담도 살펴봐야 할까요?",
    "targetExpressions": [
      "てはどうか",
      "だけでなく"
    ],
    "evidenceStrategy": "각 주체의 의견·가능한 대응 범위·제안의 기간과 대상을 구분하고, 시범 뒤 무엇을 확인할지 찾아보세요."
  },
  'middle-01': {
    purpose: '변경 안내를 읽고 참석할 때 확인할 정보를 골라요.',
    beforeReading: '모임 일정이 바뀌었다면 날짜 외에 어떤 정보도 확인해야 할까요?',
    targetExpressions: ['ので', 'そのため'],
    evidenceStrategy: '이유를 잇는 말의 앞뒤를 찾고, 바뀐 정보와 그대로인 정보를 나누어 보세요.',
  },
  'middle-02': {
    purpose: '안내와 전해 들은 말을 비교해 지금 할 수 있는 일을 판단해요.',
    beforeReading: '안내가 게시된 날과 신청할 수 있는 날은 어떻게 구분할 수 있을까요?',
    targetExpressions: ['と話していました', '予定です'],
    evidenceStrategy: '누구의 말인지 먼저 찾고, 완료·현재 상태·앞으로의 일을 나타내는 표현을 함께 읽으세요.',
  },
  'middle-03': {
    purpose: '참가 안내에서 신청 기한과 다음 절차를 찾아요.',
    beforeReading: '신청서를 보내기 전과 보낸 뒤에는 각각 무엇을 확인해야 할까요?',
    targetExpressions: ['場合', 'までに'],
    evidenceStrategy: '조건절과 그 뒤의 행동을 짝지어 읽고, 기한이 어떤 행동에 붙었는지 확인하세요.',
  },
  'middle-04': {
    purpose: '처리 안내를 읽고 담당자와 확인 범위를 구분해요.',
    beforeReading: '자료에 확인 표시가 있다면 누가 무엇을 확인했는지도 알아야 할까요?',
    targetExpressions: ['によって', 'とは限りません'],
    evidenceStrategy: '각 동작을 하는 사람을 찾고, 처리 상태의 표현이 어디까지를 뜻하는지 살펴보세요.',
  },
  'middle-05': {
    purpose: '가상 부품표의 수량을 비교할 때 기준과 적용 범위를 찾아요.',
    beforeReading: '두 수량을 비교하기 전에 어떤 단위와 대상인지 확인해야 할까요?',
    targetExpressions: ['一組につき', 'より'],
    evidenceStrategy: '한 묶음의 수량과 전체 수량을 구분하고, 비교 대상과 범위를 제한하는 말을 찾으세요.',
  },
  'middle-06': {
    purpose: '가상 기록 정리 설명에서 목적·방법·확인된 결과를 구분해요.',
    beforeReading: '무언가를 개선하려는 목적과 실제 효과를 확인한 결과는 어떻게 다를까요?',
    targetExpressions: ['ために', 'ことで'],
    evidenceStrategy: '목적과 방법을 잇는 표현을 나누어 읽고, 결과를 확인한 근거가 있는지 본문에서 찾아보세요.',
  },
  'middle-07': {
    purpose: '가상 도면 안내에서 제안·검토·승인 상태를 읽어요.',
    beforeReading: '새 안이 기록되어 있다면 사용 전에 어떤 상태와 날짜를 확인해야 할까요?',
    targetExpressions: ['載っていても', '予定です'],
    evidenceStrategy: '기록된 일과 예정된 일을 나누고, 상태 표시와 날짜가 각각 무엇을 가리키는지 살펴보세요.',
  },
  'middle-08': {
    purpose: '두 공지의 정보를 함께 읽어 최신 일정을 확인해요.',
    beforeReading: '추가 공지를 받으면 첫 공지의 모든 정보가 바뀌었다고 보아도 될까요?',
    targetExpressions: ['だけ', '変更しません'],
    evidenceStrategy: '공지 날짜를 따라 읽으며 변경 대상과 유지 대상을 나누고, 첫 공지의 정보와 대조하세요.',
  },
  'upper-mech-01': {
    purpose: '가상 개정 이력에서 이번 대상에 적용할 수 있는 범위를 확인해요.',
    beforeReading: '가장 최근 판본이라는 사실 외에 적용 전에 어떤 조건을 확인해야 할까요?',
    targetExpressions: ['場合に限る', '検討中'],
    evidenceStrategy: '대상·조건·예외를 각각 찾고, 기록 날짜와 적용 시점을 같은 뜻으로 읽지 않았는지 점검하세요.',
  },
  'upper-mech-02': {
    purpose: '가상 변경 요청에서 주장·확인 상태·후속 기한을 구분해요.',
    beforeReading: '변경 요청을 받았다는 기록만으로 무엇까지 확정할 수 있을까요?',
    targetExpressions: ['を意味しない', '予定だ'],
    evidenceStrategy: '누가 주장한 내용인지와 확인된 근거를 나누고, 각 기한이 요청하는 행동을 찾아보세요.',
  },
  'upper-mech-03': {
    purpose: '가상 관찰 기록에서 결과가 뒷받침하는 주장 범위를 살펴봐요.',
    beforeReading: '두 집단의 결과가 다르면 원인을 판단하기 위해 어떤 정보가 더 필요할까요?',
    targetExpressions: ['可能性', 'にとどめ'],
    evidenceStrategy: '관찰된 사실·해석·미실시 계획을 나누고, 비교 조건과 표본의 범위가 같은지 확인하세요.',
  },
  'upper-mech-04': {
    purpose: '가상 대안 비교에서 비용·일정의 전제와 미확정 사항을 찾아요.',
    beforeReading: '두 제안의 금액과 일정만 보고 비교하려면 어떤 조건을 먼저 맞춰야 할까요?',
    targetExpressions: ['低いものの', '場合に限り'],
    evidenceStrategy: '각 비교 항목에 포함된 범위와 조건을 대조하고, 전망과 확약을 구분하는 말을 찾으세요.',
  },
  'upper-mech-05': {
    purpose: '가상 검토 기록에서 의견의 대상과 공식 상태를 구분해요.',
    beforeReading: '검토 중의 긍정적인 말은 어떤 대상과 조건에 관한 말인지 확인할 필요가 있을까요?',
    targetExpressions: ['確認できれば', 'わけではない'],
    evidenceStrategy: '인용문의 조건과 대상을 먼저 찾고, 별도의 상태 기록과 일치하는지 대조하세요.',
  },
  'upper-mech-06': {
    purpose: '가상 확인 요청에서 관찰 사실·미확인 원인·회신 조건을 찾아요.',
    beforeReading: '두 자료의 내용이 다르면 단정하기 전에 무엇을 물어볼 수 있을까요?',
    targetExpressions: ['のに対し', '難しい場合は'],
    evidenceStrategy: '서로 다른 기재와 그 원인에 관한 추측을 나누고, 회신 기한 및 대체 행동을 찾아보세요.',
  },
};

export function getReadingSupport(lesson: UpperLesson): ReadingSupport | undefined {
  return JAPANESE_READING_SUPPORT[lesson.id];
}

/** Before-answer support deliberately has no dependency on answer/explanation. */
export function readingEvidenceStrategy(lesson: UpperLesson, questionIndex: number): string {
  if (questionIndex >= 4) return '새 상황에 적힌 문장만 근거로 읽으세요. 누가 무엇을 했는지, 조건과 시점, 확정 여부를 구분하고 본문의 상황을 그대로 옮기지 마세요.';
  return getReadingSupport(lesson)?.evidenceStrategy ?? '질문의 핵심어가 있는 문장과 그 앞뒤를 다시 읽으세요. 사실·조건·예외를 나누고, 본문에 없는 내용을 덧붙이지 않았는지 확인하세요.';
}
