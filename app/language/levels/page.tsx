"use client";
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import LevelLearningWorkspace from '@/components/language/LevelLearningWorkspace';
function LevelRoute() {
  const params = useSearchParams();
  return <LevelLearningWorkspace requestedLevel={params.get('level')} lessonId={params.get('lesson')} reviewOnly={params.get('review') === '1'} />;
}
export default function Page() {
  return <Suspense fallback={<p role="status">단계별 학습을 준비하고 있어요.</p>}><LevelRoute /></Suspense>;
}
