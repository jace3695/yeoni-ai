"use client";

import LocalRecordGuidance from "@/components/yeoni/LocalRecordGuidance";
import CommonCharacterGuide from '@/components/yeoni/CommonCharacterGuide';
import AppCompanion from "@/components/AppCompanion";
import AuthGate from "../components/AuthGate";
import DietView from "../components/DietView";
import AppIdentity from "../components/AppIdentity";
import Link from "next/link";

function DietApp() {
  return (
    <main className="min-h-dvh bg-yeoni-bg">
      <header className="app-module-header">
        <div className="app-module-header-inner"><AppIdentity kind="diet" title="나의 식단" subtitle="운동 기록과 연동되는 독립 식단 앱" /><Link href="/diet/settings" className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-bold">설정</Link></div>
      </header>
      <div className="yeoni-page-content"><CommonCharacterGuide><AppCompanion embedded home><LocalRecordGuidance app="diet" /></AppCompanion></CommonCharacterGuide><DietView /></div>
    </main>
  );
}

export default function Page() { return <AuthGate><DietApp /></AuthGate>; }
