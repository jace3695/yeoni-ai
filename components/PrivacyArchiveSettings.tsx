'use client';
import { useEffect, useState } from 'react';
import BodyAnalysisHistory from '@/app/components/BodyAnalysisHistory';
import ConfirmedConversationArchive from './ConfirmedConversationArchive';
import { useYeoniPreferenceOwner } from './useYeoniPreferences';
import { clearBodyArchiveDraft, readBodyArchiveDraft, type BodyArchiveDraft } from '@/lib/body-archive-draft';
import { LOCAL_BODY_NOTICE } from '@/app/data/localBodyConversation';

export default function PrivacyArchiveSettings() {
  const owner = useYeoniPreferenceOwner();
  return <PrivacyContents key={owner ?? 'signed-out'} owner={owner} />;
}
function PrivacyContents({ owner }: { owner: string | null }) {
  const [draft, setDraft] = useState<BodyArchiveDraft | null>(null);
  const [confirm, setConfirm] = useState(false), [mounted, setMounted] = useState(false);
  const [bodyBusy, setBodyBusy] = useState(false), [dialogueBusy, setDialogueBusy] = useState(false);
  const busy = bodyBusy || dialogueBusy;
  useEffect(() => {
    // Do not read/clear the handoff before the account store has hydrated.
    if (owner && localStorage.getItem('fitness-cloud-sync-user') === owner) setDraft(readBodyArchiveDraft(owner));
    const clear = () => { clearBodyArchiveDraft(); setDraft(null); setConfirm(false); setMounted(false); };
    const storage = (event: StorageEvent) => { if (event.key === null || ['fitness-cloud-sync-user', 'fitness-cloud-sync-epoch'].includes(event.key)) clear(); };
    window.addEventListener('yeoni-cloud-session-changed', clear); window.addEventListener('storage', storage); window.addEventListener('pagehide', clear);
    return () => { window.removeEventListener('yeoni-cloud-session-changed', clear); window.removeEventListener('storage', storage); window.removeEventListener('pagehide', clear); };
  }, [owner]);
  const candidate = draft?.ownerId === owner ? draft : null;
  return <div className="space-y-4">
    <details className="rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer font-bold">저장 위치·처리·동의 안내</summary>
      <p className="mt-3 text-sm leading-6">인바디·체성분·BMI 질문은 브라우저 안에서 처리하며 일반 서버 대화 이력과 음성 읽기에서 제외합니다. 체성분 보관은 자동으로 실행하지 않습니다. 실제 보관할 때 확인한 내용만 별도 동의를 받아 로그인한 계정의 앱 서버에 보냅니다. 외부 AI·음성 서비스에 보내지 않습니다.</p>
      <p className="mt-3 text-sm leading-6">기기 안의 대화와 계정 보관본은 별개입니다. 계정 보관본은 원본 기록·일반 대화 초기화와 별도로 유지되며, 보관함에서 삭제하거나 계정을 삭제할 때 지워집니다. 아래 보관함에서 각 보관 방식의 데이터와 삭제 범위를 확인할 수 있습니다. 이 메뉴를 여는 것은 저장·전송 동의가 아닙니다.</p>
    </details>
    {candidate && <section className="rounded-xl border bg-white p-4">
      <button type="button" className="min-h-11 rounded-lg bg-violet-100 px-4 font-bold" onClick={() => { setMounted(true); setConfirm(true); }}>현재 체성분 답변 보관 준비</button>
      {mounted && <div hidden={!confirm}><p className="my-3 text-sm">아래에서 보낼 대상·내용을 확인하고 원하는 보관 방식에 별도로 동의해 주세요. 보관 버튼을 누르기 전에는 전송하지 않습니다. 이미 보낸 요청은 이 화면을 닫아도 서버에서 처리될 수 있습니다.</p>
        <BodyAnalysisHistory candidate={candidate} active={confirm} onBusyChange={setBodyBusy} />
        {owner && candidate.question && <ConfirmedConversationArchive ownerId={owner} kind="body-dialogue" active={confirm} onBusyChange={setDialogueBusy} candidate={{version:1,kind:'body-dialogue',date:candidate.snapshot.date,question:candidate.question,answer:`${LOCAL_BODY_NOTICE}\n\n${candidate.snapshot.text}`}} />}
        <button type="button" className="min-h-11 px-4" disabled={busy} onClick={() => setConfirm(false)}>보관 준비 닫기</button>
      </div>}
      <button type="button" className="min-h-11 px-4" disabled={busy} onClick={() => { clearBodyArchiveDraft(); setDraft(null); setConfirm(false); setMounted(false); }}>임시 보관 준비 취소</button>
    </section>}
    <details className="rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer font-bold">체성분 보관함</summary>
      <BodyAnalysisHistory candidate={null} />
      {owner && <ConfirmedConversationArchive ownerId={owner} kind="body-dialogue" candidate={null} />}
    </details>
  </div>;
}
