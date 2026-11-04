import Link from 'next/link';
import AuthGate from '@/app/components/AuthGate';
import PrivacyArchiveSettings from '@/components/PrivacyArchiveSettings';
export default function Page() {
  return <AuthGate><main className="min-h-dvh bg-yeoni-bg px-4 py-8"><div className="mx-auto max-w-3xl space-y-5">
    <Link href="/settings" className="inline-flex min-h-11 items-center font-bold">← 설정</Link>
    <h1 className="text-2xl font-bold">개인정보·보관</h1>
    <PrivacyArchiveSettings />
  </div></main></AuthGate>;
}
