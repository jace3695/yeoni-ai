import '../../app/globals.css';
import '../../app/language/language.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LevelLearningWorkspace from '../../components/language/LevelLearningWorkspace';
import LanguageShell from '../../components/language/LanguageShell';
import HubBottomNav from '../../app/components/HubBottomNav';
import LanguagePage from '../../app/language/page';
import LearnPage from '../../app/language/learn/page';
import ProgressPage from '../../app/language/progress/page';
import StartPage from '../../app/language/start/page';
import CalendarPage from '../../app/language/calendar/page';
import JapaneseChunkPractice from '../../components/language/JapaneseChunkPractice';
import PreviewCatalog from './PreviewCatalog';
import KanaPage from '../../app/language/kana/page';
import WordsPage from '../../app/language/words/page';
import GrammarPage from '../../app/language/grammar/page';
import SentencesPage from '../../app/language/sentences/page';
import ReviewPage from '../../app/language/review/page';
import DailyRecordProbe from './DailyRecordProbe';
import SessionOptions from './SessionOptions';
import LocalAudioProbe from './LocalAudioProbe';
import { PREVIEW_CURRICULUM_CATALOG, PREVIEW_READING_CATALOG, PREVIEW_CHUNK_CATALOG } from './catalog';
import ChunkReviewWorkspace from '../../components/language/ChunkReviewWorkspace';
import { getLevelReadingLessons } from '../../data/japaneseReadingLessons';
import { ALL_JAPANESE_CHUNK_LESSONS as JAPANESE_CHUNK_LESSONS } from '../../data/japaneseChunkLessons';
import { LEVEL_JOURNEY_KEY, emptyLevelJourney, rememberUpperAnswer } from '../../utils/japaneseLevelJourney';
import { CHUNK_REVIEW_KEY, emptyChunkReview, rememberChunkAnswer } from '../../utils/japaneseChunkReview';
import { assertOpaquePreviewOrigin, qaLocalStorage, seedSyntheticOwner } from './runtime';
import { previewHash, readPreviewLocation } from './navigation';
import './preview.css';

function Preview() {
  const [hash, setHash] = useState(location.hash);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  useEffect(() => {
    const update = () => { setHash(location.hash); setNotice(''); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const route = readPreviewLocation(hash);
  const chunk = JAPANESE_CHUNK_LESSONS.find(item => item.lessonId === route.query.get('lesson'));
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
    <p className="qa-preview-notice" role="note">가상자료 시험판 · 실제 계정은 연결하지 않아요. 기록은 새로고침하면 사라져요.</p>
    <LanguageShell>
    <details className="qa-tools" onToggle={event => { if (!event.currentTarget.open) setAudioPanelOpen(false); }}>
    <summary>가상 검사 도구 · 범위와 제한</summary>
    <aside className="qa-banner" aria-label="가상 검사 범위">
      <strong>연이 일본어 · 실제 컴포넌트의 가상 화면 검사</strong>
      <p>실제 계정·클라우드·외부 AI는 연결하지 않아요. 일반 수업 음성은 차단하며, 아래 별도 검사에서만 명시 선택한 로컬 일본어 음성을 요청할 수 있어요. 기록은 이 화면의 메모리에만 남고 새로고침하면 사라져요. 실제 영속 저장·기기간 동기화 검증은 아니에요.</p>
      <p>기존 본수업 {PREVIEW_CURRICULUM_CATALOG.length}개, 읽기 {PREVIEW_READING_CATALOG.length}개, 표현 조각 {PREVIEW_CHUNK_CATALOG.length}개를 실제 학습 화면으로 열어요. 가나·단어·문법·문장 자료실과 자료실 복습, 손글씨 캔버스·포함된 획순 자료도 확인해요. AI 필기 평가·타자·녹음·발음평가·음성대화·그림 생성은 연결하지 않아요. 장식 이미지는 요청하지 않아요.</p>
      <nav aria-label="가상 검사 이동"><a href="#/language/qa-catalog">전체 단원 목차</a><a href="#/language/levels">단계 화면</a><a href="#/language/chunk-review">보충복습</a><a href="#/language/kana">가나 자료실</a><a href="#/language/words">단어 자료실</a><a href="#/language/grammar">문법 자료실</a><a href="#/language/sentences">문장 자료실</a><a href="#/language/review">자료실 복습</a></nav>
      <div className="qa-actions">
        <button type="button" onClick={seedReview}>가상 오답 예시 열기</button>
        <button type="button" onClick={() => { qaLocalStorage.failNextWrite(); setNotice('다음 가상 저장 1회가 실패하도록 준비했어요. 수업·문법 답이나 단계를 선택한 뒤 오류와 같은 선택 재시도를 확인하세요.'); }}>다음 가상 저장 실패시키기</button>
        <button type="button" onClick={() => { remount(); setNotice('같은 화면의 메모리 기록으로 컴포넌트를 다시 열었어요. 새로고침 후 영속 복구 검증은 아닙니다.'); }}>화면 다시 열어 기록 확인</button>
      </div>
      <SessionOptions key={revision} />
      <DailyRecordProbe onReset={remount} />
      {notice && <p role="status">{notice}</p>}
    </aside>
    <details className="qa-audio-probe" open={audioPanelOpen} onToggle={event => setAudioPanelOpen(event.currentTarget.open)}><summary>기기 내 일본어 음성 검사 · 접으면 검사 취소</summary><LocalAudioProbe isOpen={audioPanelOpen} /></details>
    </details>
    <main className="app-main" key={`${hash}:${revision}`}>
      {route.pathname === '/language' ? <LanguagePage />
        : route.pathname === '/language/learn' ? <LearnPage />
        : route.pathname === '/language/progress' ? <ProgressPage />
        : route.pathname === '/language/start' ? <StartPage />
        : route.pathname === '/language/calendar' ? <CalendarPage />
        : route.pathname === '/language/kana' ? <KanaPage />
        : route.pathname === '/language/words' ? <WordsPage />
          : route.pathname === '/language/grammar' ? <GrammarPage />
            : route.pathname === '/language/sentences' ? <SentencesPage />
              : route.pathname === '/language/review' ? <ReviewPage />
            : route.pathname === '/language/levels' ? <LevelLearningWorkspace requestedLevel={route.query.get('level')} lessonId={route.query.get('lesson')} reviewOnly={route.query.get('review') === '1'} />
        : route.pathname === '/language/chunk-review' ? <ChunkReviewWorkspace />
          : route.pathname === '/language/qa-catalog' ? <PreviewCatalog track={route.query.get('track')} />
              : route.pathname === '/language/qa-chunks' && chunk ? <JapaneseChunkPractice lesson={chunk} closeLabel="닫고 전체 단원 목차로" onClose={() => { location.hash = previewHash('/language/qa-catalog'); }} />
          : route.pathname === '/language/settings' ? <section className="qa-unsupported"><h1>설정 · 가상자료 시험판</h1><p>학습 분량·모드만 이 화면의 메모리에서 바꿀 수 있어요. 계정·기기 설정, 실제 기록 초기화와 캐릭터·음성 서비스는 연결하지 않았어요.</p><SessionOptions /></section>
          : <section className="qa-unsupported"><h1>이 연결은 이번 가상 검사 범위 밖이거나 단원 ID가 없어요</h1><p>실제 계정 화면으로 이동하지 않았어요. 가상 기록은 그대로예요.</p><a href="#/language/levels">단계 화면으로 돌아가기</a></section>}
    </main>
    </LanguageShell>
    <HubBottomNav />
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
