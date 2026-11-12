import LanguageCompanion from '@/components/language/LanguageCompanion';
import type { Metadata } from "next";
import AuthGate from "../components/AuthGate";
import LanguageShell from "@/components/language/LanguageShell";
import LanguageCloudSync from "@/components/LanguageCloudSync";
import "./language.css";
import DiagnosticIsolation from "../components/DiagnosticIsolation";

export const metadata: Metadata = {
  title: "언어 학습 | AI 연이",
  description: "AI 연이의 일본어 학습 기능",
};

export default function LanguageLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <DiagnosticIsolation diagnostic={children}><AuthGate>
      <LanguageShell>
        <LanguageCloudSync><main className="app-main"><LanguageCompanion />{children}</main></LanguageCloudSync>
      </LanguageShell>
    </AuthGate></DiagnosticIsolation>
  );
}
