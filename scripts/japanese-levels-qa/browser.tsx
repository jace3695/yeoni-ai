import React from 'react';
import { createRoot } from 'react-dom/client';
import LevelLearningWorkspace from '../../components/language/LevelLearningWorkspace';
import LanguageHome from '../../app/language/page';
import LearnPage from '../../app/language/learn/page';
import RetiredPractice from '../../components/RetiredPractice';
import { applyLanguageState, prepareLanguageLocalState, readLanguageState } from '../../app/data/languageCloudSync';
const query = new URLSearchParams(location.search);
Object.assign(window, { levelFixture: { applyLanguageState, prepareLanguageLocalState, readLanguageState } });
const content = location.pathname === '/language/levels' ? <LevelLearningWorkspace requestedLevel={query.get('level')} lessonId={query.get('lesson')} reviewOnly={query.get('review') === '1'} />
  : location.pathname === '/language/learn' ? <LearnPage /> : location.pathname === '/language' ? <LanguageHome /> : <RetiredPractice language />;
createRoot(document.getElementById('root')!).render(<><p style={{ padding: 12, background: '#fff3cc', fontSize: 12 }}>실제 컴포넌트 + 가상 계정·음성 검사 · 운영 로그인/DB/물리 기기 검증 아님</p>{content}</>);
