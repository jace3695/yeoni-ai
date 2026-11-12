import type { ReactNode } from 'react';
import AppIdentity from '@/app/components/AppIdentity';
import TopNav from '@/components/TopNav';

/** Shared product presentation only. Authentication and synchronization stay
 * outside this shell, owned by the product layout, never by the preview. */
export default function LanguageShell({ children }: { children: ReactNode }) {
  return <div className="language-app-shell">
    <header className="app-module-header"><div className="app-module-header-inner"><AppIdentity kind="language" title="일본어 학습" /><TopNav /></div></header>
    {children}
  </div>;
}
