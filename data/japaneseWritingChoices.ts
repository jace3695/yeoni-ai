export type JapaneseWritingChoice = {
  id: number;
  prompt: string;
  answer: string;
  choices: [string, string, string];
  category: '일상' | '여행' | '업무' | '친구';
};

// Keep the original four prompts, IDs and answers. New selections have exact meaning-based grading.
export const JAPANESE_WRITING_CHOICES: JapaneseWritingChoice[] = [
  { id: 1, prompt: '이거 얼마예요?', answer: 'これはいくらですか？', choices: ['これは何ですか？', 'これはいくらですか？', 'これはどこですか？'], category: '여행' },
  { id: 2, prompt: '다시 한 번 부탁드립니다', answer: 'もう一度お願いします', choices: ['もう一度お願いします', '少々お待ちください', 'ありがとうございます'], category: '일상' },
  { id: 3, prompt: '확인 부탁드립니다', answer: 'ご確認お願いします', choices: ['確認しました', '確認中です', 'ご確認お願いします'], category: '업무' },
  { id: 4, prompt: '지금 뭐 하고 있어?', answer: '今何してる？', choices: ['今どこにいる？', '今何してる？', '明日何する？'], category: '친구' },
];
