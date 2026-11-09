import { useSyncExternalStore } from 'react';
import { previewHash, readPreviewLocation } from './navigation';

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
const getSnapshot = () => location.hash;
const getServerSnapshot = () => '';

/** No Next router, network prefetch or external navigation. */
export function usePathname() {
  return readPreviewLocation(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)).pathname;
}

/** Words reference links can only change this opaque document’s hash. */
export function useRouter() {
  return { push(href: string) { location.hash = previewHash(href); } };
}
