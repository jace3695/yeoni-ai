import type { UpperLesson } from '@/data/japaneseUpperLessons';
import type { PatternPair, ReadingEvidence } from '@/data/japaneseReadingEnhancements';
import styles from './level-learning.module.css';

export type ReadingStage = 'read' | 'questions' | 'write' | 'done';

/** Informational only: this indicator never selects, locks or records a stage. */
export function ReadingProgress({ stage, reviewOnly, cursor, questionCount, questionIndex }: {
  stage: ReadingStage; reviewOnly: boolean; cursor: number; questionCount: number; questionIndex: number;
}) {
  const questionKind = questionIndex >= 4 ? '새 상황' : '본문 확인';
  if (reviewOnly) return <section className={styles.progress} aria-label="예정 복습 진행">
    <p><strong>예정 복습 · 이번 큐 {questionCount}문제</strong></p>
    <p aria-current="step">현재: {stage === 'done' ? '마침' : stage === 'read' ? '본문 다시 보기' : `예정 복습 ${cursor + 1}/${questionCount} · ${questionKind}`}</p>
    <p className={styles.muted}>이번에 예정된 문제만 확인해요. 단원 전체 진행과는 별개예요.</p>
  </section>;
  const current = stage === 'read' ? 0 : stage === 'write' ? 3 : stage === 'done' ? 4 : questionIndex >= 4 ? 2 : 1;
  const steps = ['읽기', '본문 확인', '새 상황', '표현 비교', '마침'];
  return <section className={styles.progress} aria-label="단원 학습 흐름">
    <ol className={styles.progressSteps}>{steps.map((label, index) => <li key={label} aria-current={index === current ? 'step' : undefined}>{index === current ? '현재: ' : ''}{label}</li>)}</ol>
  </section>;
}

/** The caller must supply a response before any explanation is rendered. */
export function ReadingAnswerEvidence({ lesson, question, responded, evidence }: {
  lesson: UpperLesson; question: UpperLesson['questions'][number]; responded: boolean; evidence?: ReadingEvidence;
}) {
  if (!responded) return null;
  if (lesson.questions.indexOf(question) >= 4) return <section aria-label="새 상황의 근거">
    <h3>근거: 이번 문제의 새 상황</h3>
    <p>원래 본문의 상황이 아니라, 이번 문제에 제시된 문장을 근거로 판단해요.</p>
    <p>{question.prompt}</p>
  </section>;
  if (!evidence || evidence.questionId !== question.id) return null;
  const scope = [...new Set(evidence.paragraphIndexes)];
  return <section aria-label="본문 정답 근거">
    <h3>근거: 본문에서 확인하기</h3>
    <p><strong>확인 범위:</strong> {scope.map(index => `${index + 1}문단`).join(' · ')}</p>
    {evidence.quotes.length ? evidence.quotes.map((quote, index) => {
      const paragraphs = scope.filter(paragraphIndex => lesson.paragraphs[paragraphIndex].japanese.includes(quote));
      return <div key={`${index}:${quote}`}><p className={styles.muted}>원문 인용 · {paragraphs.map(paragraphIndex => `${paragraphIndex + 1}문단`).join(' · ')}</p><blockquote className={styles.evidenceQuote} lang="ja">{quote}</blockquote></div>;
    }) : <p>한 문장만으로 단정하지 않고, 위 범위에 해당 정보가 있는지 함께 확인해요.</p>}
    <p><strong>근거 설명:</strong> {evidence.reason}</p>
    <details><summary>근거 문단 전체 다시 보기</summary>{scope.map(index => <div key={index}><h4>{index + 1}문단</h4><p className={styles.japanese} lang="ja">{lesson.paragraphs[index].japanese}</p></div>)}</details>
  </section>;
}

export function ReadingPatternComparison({ pair }: { pair: PatternPair }) {
  return <details className={styles.patternComparison}>
    <summary>같은 표현, 다른 상황 · 선택해서 열기</summary>
    <h3><span lang="ja">{pair.expression}</span> · {pair.meaning}</h3>
    <p className={styles.muted}>단원 답을 모두 고른 뒤 살펴보는 비교예요. 새 예문은 연이의 가상 학습 자료이며, 점수나 별도 기록을 만들지 않아요.</p>
    <h4>본문 속 문장 · {pair.sourceParagraphIndex + 1}문단</h4>
    <p className={styles.japanese} lang="ja">{pair.sourceSentence}</p>
    <h4>다른 상황의 새 예문</h4>
    <p className={styles.japanese} lang="ja">{pair.parallelSentence}</p>
    <p>{pair.parallelMeaning}</p>
    <p><strong>달라진 내용:</strong> {pair.changedDetail}</p>
    <p><strong>비교할 점:</strong> {pair.caution}</p>
  </details>;
}
