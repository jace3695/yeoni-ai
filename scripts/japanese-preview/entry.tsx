import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LevelLearningWorkspace from '../../components/language/LevelLearningWorkspace';
import ChunkReviewWorkspace from '../../components/language/ChunkReviewWorkspace';
import { getLevelReadingLessons } from '../../data/japaneseReadingLessons';
import { JAPANESE_CHUNK_LESSONS } from '../../data/japaneseChunkLessons';
import { LEVEL_JOURNEY_KEY, emptyLevelJourney, rememberUpperAnswer } from '../../utils/japaneseLevelJourney';
import { CHUNK_REVIEW_KEY, emptyChunkReview, rememberChunkAnswer } from '../../utils/japaneseChunkReview';
import { assertOpaquePreviewOrigin, qaLocalStorage, seedSyntheticOwner } from './runtime';
import { readPreviewLocation } from './navigation';
import './preview.css';

function Preview() {
  const [hash, setHash] = useState(location.hash);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const update = () => { setHash(location.hash); setNotice(''); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const route = readPreviewLocation(hash);
  const remount = () => setRevision(value => value + 1);
  const seedReview = () => {
    // Use a fresh in-memory scenario only. No real account, dates or user inputs.
    qaLocalStorage.resetFailure(); qaLocalStorage.clear(); seedSyntheticOwner();
    const date = new Date(Date.now() - 3 * 86_400_000);
    let journey = emptyLevelJourney();
    for (const level of ['intermediate', 'advanced'] as const) {
      const lesson = getLevelReadingLessons(level)[0];
      journey = rememberUpperAnswer(journey, { lessonId: lesson.id, questionId: lesson.questions[0].id,
        attemptId: `synthetic-${lesson.id}`, correct: false, neededHelp: false }, date);
    }
    const lesson = JAPANESE_CHUNK_LESSONS[0];
    const review = rememberChunkAnswer(emptyChunkReview(), { lessonId: lesson.lessonId, questionId: lesson.questions[0].id,
      attemptId: 'synthetic-chunk-wrong', correct: false, neededHelp: false, mode: 'choice' }, date);
    qaLocalStorage.setItem(LEVEL_JOURNEY_KEY, JSON.stringify(journey));
    qaLocalStorage.setItem(CHUNK_REVIEW_KEY, JSON.stringify(review));
    setNotice('초급 선택 + 읽기 오답 2개 + 표현 조각 오답 1개의 가상 예시를 열었어요.'); remount();
  };
  return <>
    <aside className="qa-banner" aria-label="가상 검사 범위">
      <strong>연이 일본어 · 실제 컴포넌트의 가상 화면 검사</strong>
      <p>실제 계정·클라우드·외부 AI·음성을 연결하지 않아요. 기록은 이 화면의 메모리에만 남고 새로고침하면 사라져요. 실제 영속 저장·기기간 동기화 검증은 아니에요.</p>
      <p>단계 선택, 읽기 20단원, 표현 조각과 보충복습을 확인해요. 가나·기존 문법/문장 수업 연결은 이 검사 화면에서 열지 않아요.</p>
      <nav aria-label="가상 검사 이동"><a href="#/language/levels">단계 화면</a><a href="#/language/chunk-review">보충복습</a></nav>
      <div className="qa-actions">
        <button type="button" onClick={seedReview}>가상 오답 예시 열기</button>
        <button type="button" onClick={() => { qaLocalStorage.failNextWrite(); setNotice('다음 가상 저장 1회가 실패하도록 준비했어요. 답이나 단계를 선택한 뒤 오류와 재시도를 확인하세요.'); }}>다음 가상 저장 실패시키기</button>
        <button type="button" onClick={() => { remount(); setNotice('같은 화면의 메모리 기록으로 컴포넌트를 다시 열었어요. 새로고침 후 영속 복구 검증은 아닙니다.'); }}>화면 다시 열어 기록 확인</button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </aside>
    <main key={`${hash}:${revision}`}>
      {route.pathname === '/language/levels' ? <LevelLearningWorkspace requestedLevel={route.query.get('level')} lessonId={route.query.get('lesson')} reviewOnly={route.query.get('review') === '1'} />
        : route.pathname === '/language/chunk-review' ? <ChunkReviewWorkspace />
          : <section className="qa-unsupported"><h1>이 연결은 이번 가상 검사 범위 밖이에요</h1><p>실제 계정 화면으로 이동하지 않았어요. 가상 기록은 그대로예요.</p><a href="#/language/levels">단계 화면으로 돌아가기</a></section>}
    </main>
  </>;
}

const root = document.getElementById('root');
try {
  assertOpaquePreviewOrigin(window.origin);
  seedSyntheticOwner();
  if (!root) throw new Error('Missing fixture root');
  createRoot(root).render(<Preview />);
} catch (error) {
  if (root) root.textContent = error instanceof Error ? error.message : '격리된 검사 화면을 준비하지 못했어요.';
}
