import type { ReadingEnhancement } from './japaneseReadingEnhancements.ts';

/** Original, fictional comparisons and after-answer evidence for existing lessons.
 * These add no questions and do not change the source passages or saved progress.
 * Parallel sentences are separate language examples, never real work instructions.
 */
export const JAPANESE_INTERMEDIATE_ENHANCEMENTS: ReadingEnhancement[] = [
  {
    lessonId: 'middle-01',
    pair: {
      expression: 'ので',
      meaning: '이 문장에서는 읽을 책이 그대로라는 이유를 새 책을 준비할 필요가 없다는 내용과 이어요.',
      sourceParagraphIndex: 1,
      sourceSentence: '読む本も変わらないので、新しい本を用意する必要はありません。',
      parallelSentence: '読む記事も変わらないので、新しい記事を用意する必要はありません。',
      parallelMeaning: '읽을 기사도 바뀌지 않으므로 새 기사를 준비할 필요는 없습니다.',
      changedDetail: '읽는 대상을 책에서 기사로 바꾸고, 대상이 그대로여서 새로 준비할 필요가 없다는 연결은 유지했어요.',
      caution: '가상 독서 모임의 두 문장을 비교하는 예시이며, 「ので」 자체가 준비 불필요를 뜻하거나 실제 준비 여부를 지시하는 것은 아니에요.',
    },
    evidence: [
      {
        questionId: 'middle-01-q1',
        paragraphIndexes: [0],
        quotes: ['町の読書会は、今週の土曜日に開く予定でした。しかし、会場の図書室がその日は使えないので、日曜日に変更になりました。'],
        reason: '토요일에 열 예정이었지만 그날 도서실을 사용할 수 없다는 이유 뒤에 일요일로 변경되었다고 나와요.',
      },
      {
        questionId: 'middle-01-q2',
        paragraphIndexes: [0, 1],
        quotes: ['日曜日に変更になりました。', 'ただし、始まる時刻は午後二時のままです。'],
        reason: '첫 문단의 변경된 요일인 일요일과 둘째 문단의 유지된 시작 시각인 오후 2시를 합쳐 읽어요.',
      },
      {
        questionId: 'middle-01-q3',
        paragraphIndexes: [0],
        quotes: ['そのため、参加できなくなった人は、金曜日までに係の人へ連絡することになりました。'],
        reason: '변경으로 참가하지 못하게 된 사람에게 금요일까지 담당자에게 연락하도록 안내해요.',
      },
      {
        questionId: 'middle-01-q4',
        paragraphIndexes: [0, 1],
        quotes: ['参加費は無料のままです。', '読む本も変わらないので、新しい本を用意する必要はありません。案内には「日曜日も同じ図書室に集まってください」とあります。'],
        reason: '첫 문단의 무료 참가비와 둘째 문단의 바뀌지 않은 책 및 같은 도서실을 함께 확인하면 장소·읽을 책·참가비가 모두 유지돼요.',
      },
    ],
  },
  {
    lessonId: 'middle-02',
    pair: {
      expression: 'と話していました',
      meaning: '여기서는 접수 담당자가 전에 말한 내용을 인용해서 전해요.',
      sourceParagraphIndex: 0,
      sourceSentence: '受付の人は「申込みの方法は、来週の月曜日に知らせます」と話していました。',
      parallelSentence: '受付の人は「申込みの方法は、来週の火曜日に知らせます」と話していました。',
      parallelMeaning: '접수 담당자는 “신청 방법은 다음 주 화요일에 알려 드리겠습니다”라고 말했습니다.',
      changedDetail: '신청 방법을 알릴 요일만 다음 주 월요일에서 다음 주 화요일로 바꿨어요.',
      caution: '말한 행위는 과거이고 인용한 내용은 앞으로의 안내이며, 가상 예시의 요일은 실제 신청 시작일이나 일정 확약이 아니에요.',
    },
    evidence: [
      {
        questionId: 'middle-02-q1',
        paragraphIndexes: [0],
        quotes: ['交流室の係の人が昨日、入口に新しい料理教室の案内を貼りました。'],
        reason: '어제 담당자가 입구에 안내를 붙였다는 과거형 문장이 안내 게시의 완료를 나타내요.',
      },
      {
        questionId: 'middle-02-q2',
        paragraphIndexes: [0],
        quotes: ['受付の人は「申込みの方法は、来週の月曜日に知らせます」と話していました。'],
        reason: '접수 담당자의 인용문에서 다음 주 월요일에 알릴 대상을 신청 방법이라고 밝혀요.',
      },
      {
        questionId: 'middle-02-q3',
        paragraphIndexes: [0, 1],
        quotes: ['今日の時点では、申込みはまだ始まっていません。', '友人はその話を聞いて、「もう申し込めると思った」と言いました。'],
        reason: '친구는 벌써 신청할 수 있다고 생각했지만 오늘의 실제 상태는 신청이 아직 시작되지 않았다고 구분해요.',
      },
      {
        questionId: 'middle-02-q4',
        paragraphIndexes: [1],
        quotes: ['申込みの開始日や参加費については、今の案内には書かれていません。'],
        reason: '신청 시작일과 참가비는 현재 안내에 적혀 있지 않다고 명시하므로 이 안내만으로 알 수 없어요.',
      },
    ],
  },
  {
    lessonId: 'middle-03',
    pair: {
      expression: '場合',
      meaning: '여기서는 보낸 뒤 이틀이 지나도 답이 없다는 조건과 그때 할 문의를 연결해요.',
      sourceParagraphIndex: 1,
      sourceSentence: '送信後、二日たっても返事がない場合は、受付に問い合わせてください。',
      parallelSentence: '送信後、三日たっても返事がない場合は、受付に問い合わせてください。',
      parallelMeaning: '보낸 뒤 사흘이 지나도 답이 없는 경우에는 접수처에 문의해 주세요.',
      changedDetail: '답을 기다린 기간만 이틀에서 사흘로 바꾸고, 답이 없을 때 접수처에 문의한다는 조건과 행동은 유지했어요.',
      caution: '가상 안내의 조건 비교일 뿐 실제 문의 지시가 아니며, 기다리는 기간을 신청 마감 연장이나 예약 확정으로 읽지 않아요.',
    },
    evidence: [
      {
        questionId: 'middle-03-q1',
        paragraphIndexes: [0],
        quotes: ['市の見学会に参加したい場合は、五月十日の午後五時までに申込書を送ってください。'],
        reason: '「までに」 앞의 5월 10일 오후 5시가 그 뒤에 나오는 신청서 발송의 마감이에요.',
      },
      {
        questionId: 'middle-03-q2',
        paragraphIndexes: [1],
        quotes: ['申込書を送っただけでは、予約はまだ確定していません。'],
        reason: '신청서를 보낸 것만으로는 예약이 아직 확정되지 않았다고 직접 밝혀요.',
      },
      {
        questionId: 'middle-03-q3',
        paragraphIndexes: [0],
        quotes: ['申込書が届いたら、係の人が人数を確認します。', '定員は二十人で、空きがある場合に、参加できるというメールが届きます。'],
        reason: '신청서 도착 뒤 담당자가 인원을 확인하는 절차와 빈자리가 있을 때 참가 가능 이메일이 온다는 조건을 함께 읽어요.',
      },
      {
        questionId: 'middle-03-q4',
        paragraphIndexes: [1],
        quotes: ['送信後、二日たっても返事がない場合は、受付に問い合わせてください。'],
        reason: '보낸 뒤 이틀이 지나도 답이 없는 경우의 행동으로 접수처에 문의하라고 안내해요.',
      },
    ],
  },
  {
    lessonId: 'middle-04',
    pair: {
      expression: 'とは限りません',
      meaning: '여기서는 파란 표시가 있다는 사실만으로 작가의 글 수정까지 끝났다고 단정할 수 없다는 뜻이에요.',
      sourceParagraphIndex: 1,
      sourceSentence: '青い印が付けられていても、作者が文章を直したとは限りません。',
      parallelSentence: '赤い印が付けられていても、作者が文章を直したとは限りません。',
      parallelMeaning: '빨간 표시가 붙어 있어도 작가가 글을 고쳤다고는 단정할 수 없습니다.',
      changedDetail: '표시의 색만 파란색에서 빨간색으로 바꾸고, 표시만으로 글 수정 완료를 단정하지 않는 관계는 유지했어요.',
      caution: '「とは限りません」은 반드시 그렇지는 않다는 뜻이지 절대 수정하지 않았다는 뜻은 아니며, 가상 표시를 실제 검토 완료나 승인 기준으로 쓰지 않아요.',
    },
    evidence: [
      {
        questionId: 'middle-04-q1',
        paragraphIndexes: [0],
        quotes: ['地域の展示会では、作品の説明カードが受付担当の森さんによって集められます。'],
        reason: '수동형 「集められます」와 함께 쓰인 「によって」 앞의 접수 담당 모리 씨가 카드를 모으는 사람이에요.',
      },
      {
        questionId: 'middle-04-q2',
        paragraphIndexes: [0],
        quotes: ['川田さんは、作品名と展示場所が一覧表と同じかどうかを確認します。'],
        reason: '가와다 씨가 목록과 같은지 대조하는 항목은 작품명과 전시 장소라고 명시해요.',
      },
      {
        questionId: 'middle-04-q3',
        paragraphIndexes: [0],
        quotes: ['文章の内容を直すのは、それぞれの作者です。'],
        reason: '글의 내용을 고치는 사람은 각 작품의 작가라고 직접 밝혀요.',
      },
      {
        questionId: 'middle-04-q4',
        paragraphIndexes: [1],
        quotes: ['確認が終わったカードには、川田さんが青い印を付けます。青い印が付けられていても、作者が文章を直したとは限りません。', '案内の「確認済み」は、作品名と展示場所の確認が終わったという意味です。'],
        reason: '파란 표시는 확인 후에 붙이고 그 확인 범위는 작품명과 전시 장소이며 작가의 글 수정 완료까지 뜻하지 않아요.',
      },
    ],
  },
  {
    lessonId: 'middle-05',
    pair: {
      expression: '一組につき',
      meaning: '여기서는 부품 수량을 조립체 한 세트를 기준으로 나타내요.',
      sourceParagraphIndex: 0,
      sourceSentence: '部品Ｐの員数は、組立Ａでは一組につき十個、組立Ｂでは一組につき十二個と書かれています。',
      parallelSentence: '部品Ｑの員数は、組立Ａでは一組につき十個、組立Ｂでは一組につき十二個と書かれています。',
      parallelMeaning: '부품 Q의 수량은 조립체 A에서는 한 세트당 10개, 조립체 B에서는 한 세트당 12개라고 적혀 있습니다.',
      changedDetail: '수량을 읽는 부품만 P에서 Q로 바꾸고, A와 B의 한 세트당 수량은 그대로 두었어요.',
      caution: 'Q의 수량은 별도 가상 예시에만 해당하고 원문에는 P만 제시되며, 어느 수량도 실제 설계·제작·안전 판단의 근거가 아니에요.',
    },
    evidence: [
      {
        questionId: 'middle-05-q1',
        paragraphIndexes: [0, 1],
        quotes: ['部品Ｐの員数は、組立Ａでは一組につき十個、組立Ｂでは一組につき十二個と書かれています。', 'ＢはＡより一組あたり二個多いですが、部品名はどちらもＰです。'],
        reason: '한 세트 기준으로 A는 10개이고 B는 12개이므로 차이는 2개이며 둘째 문단에도 그 차이가 명시돼요.',
      },
      {
        questionId: 'middle-05-q2',
        paragraphIndexes: [0],
        quotes: ['資料にはそれぞれ二組分が示されているため、部品Ｐの総数はＡが二十個、Ｂが二十四個です。'],
        reason: '자료가 각 두 세트분을 나타낸다는 조건과 B의 부품 P 총수가 24개라는 내용을 같은 문장에서 확인해요.',
      },
      {
        questionId: 'middle-05-q3',
        paragraphIndexes: [1],
        quotes: ['ＢはＡより一組あたり二個多いですが、部品名はどちらもＰです。'],
        reason: '세트당 수량은 다르지만 부품명은 양쪽 모두 P라고 명시해요.',
      },
      {
        questionId: 'middle-05-q4',
        paragraphIndexes: [1],
        quotes: ['この比較は、表にあるＡとＢの各二組分のみに当てはまります。', 'すべて学習用の数で、実際の製品の設計や必要な部品数を決める資料ではありません。'],
        reason: '비교 범위를 표에 있는 A와 B의 각 두 세트분으로 한정하고 실제 제품의 설계나 필요 부품 수를 정하는 자료는 아니라고 밝혀요.',
      },
    ],
  },
  {
    lessonId: 'middle-06',
    pair: {
      expression: 'ことで',
      meaning: '여기서는 날짜별 기록을 찾기 쉽게 만든 방법으로 같은 표에 모으는 일을 제시해요.',
      sourceParagraphIndex: 0,
      sourceSentence: '二日分を同じ表にまとめることで、日付ごとの記録を見つけやすくしました。',
      parallelSentence: '三日分を同じ表にまとめることで、日付ごとの記録を見つけやすくしました。',
      parallelMeaning: '사흘 치를 같은 표에 모음으로써 날짜별 기록을 찾기 쉽게 했습니다.',
      changedDetail: '표에 모은 기록의 범위만 이틀 치에서 사흘 치로 바꾸고, 같은 표에 정리하는 방법은 유지했어요.',
      caution: '가상 문서 정리의 방법을 비교하며 실제 시험 방법이나 결과 변경을 지시하지 않고, 「ことで」만으로 측정하지 않은 시간 단축량을 알 수는 없어요.',
    },
    evidence: [
      {
        questionId: 'middle-06-q1',
        paragraphIndexes: [0],
        quotes: ['記録を探す時間を減らすために、担当者は日付ごとの一覧を作りました。'],
        reason: '「ために」 앞의 기록을 찾는 시간을 줄인다는 내용이 날짜별 목록을 만든 목적이에요.',
      },
      {
        questionId: 'middle-06-q2',
        paragraphIndexes: [0],
        quotes: ['二日分を同じ表にまとめることで、日付ごとの記録を見つけやすくしました。'],
        reason: '「ことで」 앞에 있는 이틀 치 기록을 같은 표에 모으는 일이 문서 정리 방법이에요.',
      },
      {
        questionId: 'middle-06-q3',
        paragraphIndexes: [1],
        quotes: ['一覧には、試験の名前と、元の記録があるページだけが書かれています。'],
        reason: '「だけ」가 목록에 적힌 정보를 시험 이름과 원래 기록이 있는 페이지로 한정해요.',
      },
      {
        questionId: 'middle-06-q4',
        paragraphIndexes: [1],
        quotes: ['また、整理の前と後で、探す時間を測ってはいません。', '目的は時間の短縮ですが、実際に何分短くなったかは、この記録からは分かりません。'],
        reason: '정리 전후에 찾는 시간을 측정하지 않았고 실제 몇 분 줄었는지 알 수 없다고 명시하므로 단축량은 이 기록만으로 판단할 수 없어요.',
      },
    ],
  },
  {
    lessonId: 'middle-07',
    pair: {
      expression: '載っていても',
      meaning: '여기서는 새 표기의 예시가 실렸다는 사실이 있어도 승인 전 사용 제한은 유지된다는 뜻이에요.',
      sourceParagraphIndex: 1,
      sourceSentence: '新しい表記の例が載っていても、承認までは今の表記を使うことになっています。',
      parallelSentence: '新しい資料名の例が載っていても、承認までは今の資料名を使うことになっています。',
      parallelMeaning: '새 자료명의 예시가 실려 있어도 승인까지는 현재 자료명을 사용하기로 되어 있습니다.',
      changedDetail: '비교 대상을 부품명 표기에서 자료명으로 바꾸고, 예시가 있어도 승인 전 제한은 유지된다는 관계는 그대로 두었어요.',
      caution: '별도 가상 자료의 상태를 읽는 예시로 실제 자료명 변경이나 사용을 승인하지 않으며, 예시 게재·검토 예정·승인은 구분해요.',
    },
    evidence: [
      {
        questionId: 'middle-07-q1',
        paragraphIndexes: [0, 1],
        quotes: ['改訂欄の六月三日の行には、部品名の表記を「カバーＡ」から「保護カバーＡ」に直す案が記録されています。', 'この案は部品名の表記だけを扱い、部品そのものを変えるものではありません。'],
        reason: '6월 3일 행의 안은 「カバーＡ」를 「保護カバーＡ」로 고치는 부품명 표기 변경이며 부품 자체의 변경은 아니에요.',
      },
      {
        questionId: 'middle-07-q2',
        paragraphIndexes: [1],
        quotes: ['六月四日の承認状況は「未承認」です。'],
        reason: '6월 4일의 승인 상태가 「未承認」이므로 아직 승인되지 않은 상태예요.',
      },
      {
        questionId: 'middle-07-q3',
        paragraphIndexes: [1],
        quotes: ['新しい表記の例が載っていても、承認までは今の表記を使うことになっています。'],
        reason: '예시가 실려 있어도 승인까지는 현재 표기를 사용한다고 명시해요.',
      },
      {
        questionId: 'middle-07-q4',
        paragraphIndexes: [0, 1],
        quotes: ['担当者はすでに案を受け付けており、六月五日に検討する予定です。', '適用開始日も「未定」と書かれています。この案は部品名の表記だけを扱い、部品そのものを変えるものではありません。'],
        reason: '6월 5일은 표기 수정안을 검토할 예정일이고 적용 시작일은 미정이며 부품 자체의 변경은 이 안의 대상이 아니에요.',
      },
    ],
  },
  {
    lessonId: 'middle-08',
    pair: {
      expression: 'だけ',
      meaning: '여기서는 바뀐 항목을 시작 시각과 장소 두 가지로 한정해요.',
      sourceParagraphIndex: 1,
      sourceSentence: '変わったのは開始時刻と場所だけです。',
      parallelSentence: '変わったのは開始時刻と提出方法だけです。',
      parallelMeaning: '바뀐 것은 시작 시각과 제출 방법뿐입니다.',
      changedDetail: '바뀐 두 항목 중 장소를 제출 방법으로 바꾸고, 시작 시각과 두 항목으로 한정하는 표현은 유지했어요.',
      caution: '새 문장은 별도 가상 공지의 예시이며 원문의 제출 방법이 바뀌었다는 뜻도 실제 일정·업무 변경 지시도 아니에요.',
    },
    evidence: [
      {
        questionId: 'middle-08-q1',
        paragraphIndexes: [0, 1],
        quotes: ['資料の確認会は七月十日の午後二時から、第二会議室で行います。', '開始を一時間遅らせ、場所を第三会議室に変えます。開催日と資料の提出期限は変更しません'],
        reason: '첫 공지의 7월 10일은 유지하고 오후 2시를 한 시간 늦추며 장소를 제3회의실로 바꾸므로 7월 10일 오후 3시 제3회의실이에요.',
      },
      {
        questionId: 'middle-08-q2',
        paragraphIndexes: [0, 1],
        quotes: ['確認用の資料は七月八日の正午までに提出してください', '開催日と資料の提出期限は変更しません'],
        reason: '추가 공지가 자료 제출 기한을 바꾸지 않는다고 하므로 첫 공지의 7월 8일 정오가 그대로 마감이에요.',
      },
      {
        questionId: 'middle-08-q3',
        paragraphIndexes: [1],
        quotes: ['変わったのは開始時刻と場所だけです。'],
        reason: '「だけ」가 바뀐 항목을 시작 시각과 장소로 한정해요.',
      },
      {
        questionId: 'middle-08-q4',
        paragraphIndexes: [0, 1],
        quotes: ['会では説明資料を読む予定で、機械の試験を行う予定はありません。', '確認会は実施前の案を読む場であり、案の採用を決める会議ではありません。'],
        reason: '첫 공지는 설명 자료를 읽고 기계 시험은 하지 않는다고 밝히며 추가 안내는 실시 전 안을 읽는 자리이지 채택 결정 회의가 아니라고 한정해요.',
      },
    ],
  },
];
