'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Native disclosure keeps child state/effects mounted. New errors, confirmations
 * and save notices reveal themselves; an acknowledged notice may be folded again. */
export default function DietDetails({ title, description, children }: {
  title: string; description: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let previous = '';
    const revealNotice = () => {
      const signature = [...element.querySelectorAll('[role="alert"], [role="status"], [role="region"]')]
        .map(node => node.textContent?.trim()).filter(Boolean).join('\n');
      if (signature && signature !== previous) element.open = true;
      previous = signature;
    };
    revealNotice();
    const observer = new MutationObserver(revealNotice);
    observer.observe(element, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['role'] });
    return () => observer.disconnect();
  }, []);
  return <details ref={ref} data-diet-disclosure className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <summary className="min-h-11 cursor-pointer text-sm font-bold text-gray-900">
      {title}<span className="mt-1 block text-xs font-normal leading-5 text-gray-500">{description}</span>
    </summary>
    <div className="mt-3 space-y-4">{children}</div>
  </details>;
}
