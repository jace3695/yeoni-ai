import { useSyncExternalStore } from 'react';
import { readPreviewLocation } from './navigation';

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
const getSnapshot = () => location.hash;
const getServerSnapshot = () => '';

/** Only the read-only pathname hook is needed by the real appearance settings.
 * No Next router, network prefetch, history rewriting or external navigation. */
export function usePathname() {
  return readPreviewLocation(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)).pathname;
}
