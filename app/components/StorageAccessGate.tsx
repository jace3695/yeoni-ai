'use client';

import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { beginStorageAccess, getStorageAccessStatus, subscribeStorageAccess } from '../data/storageOwnership';

const serverSnapshot = () => 'waiting' as const;

/** No record/auth consumers mount until this document exclusively owns storage. */
export default function StorageAccessGate({ children }: { children: ReactNode }) {
  const status = useSyncExternalStore(subscribeStorageAccess, getStorageAccessStatus, serverSnapshot);
  useEffect(() => {
    // The document owns the lease, not a React effect. StrictMode cleanup must
    // not release it while a callback from this document could still execute.
    beginStorageAccess();
  }, []);

  if (status === 'ready') return children;

  const waiting = status === 'waiting';
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-violet-200 bg-white p-6 shadow-sm" role={waiting ? 'status' : 'alert'} aria-live="polite">
        <h1 className="mb-3 text-xl font-semibold text-slate-900">
          {waiting ? '기록을 안전하게 열고 있어요' : '기록 보호를 위해 앱을 멈췄어요'}
        </h1>
        <p className="text-sm leading-7 text-slate-700">
          {waiting
            ? '다른 탭이나 앱 창에서 연이를 사용 중이면 먼저 그 창을 닫아주세요. 한 창에서만 기록을 열어 동시에 저장되는 일을 막고 있어요.'
            : status === 'revoked'
              ? '이전 화면의 기록 잠금이 종료됐어요. 저장공간을 지우지 말고 다시 열어 최신 기록을 확인해주세요.'
            : status === 'unsupported'
              ? '이 브라우저에서는 안전한 기록 잠금을 사용할 수 없어요. 지원되는 최신 브라우저에서 다시 열어주세요. 저장공간을 지우지 마세요.'
              : '기록 잠금 또는 이전 저장의 복구를 확인하지 못했어요. 기존 기록은 지우지 말고, 다른 연이 창을 닫은 뒤 다시 열어주세요. 문제가 계속되면 복구 점검이 필요해요.'}
        </p>
        <p className="mt-3 text-xs leading-6 text-slate-600">
          업데이트 전에 열어 둔 연이 탭과 설치된 앱 창도 모두 닫아주세요. 이 화면에서는 기록과 로그인을 진행하지 않습니다.
        </p>
        {!waiting && (
          <button type="button" className="mt-5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white" onClick={() => window.location.reload()}>
            다시 열기
          </button>
        )}
      </section>
    </main>
  );
}
