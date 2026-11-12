import { recoverStorageTransaction } from './storageTransaction.ts';

export type StorageAccessStatus = 'waiting' | 'ready' | 'unsupported' | 'error' | 'revoked';
export const STORAGE_OWNERSHIP_LOCK = 'yeoni-app-storage-owner-v1';

let status: StorageAccessStatus = 'waiting';
let started = false;
let held = false;
let recovering = false;
const listeners = new Set<() => void>();

function publish(next: StorageAccessStatus) {
  status = next;
  for (const listener of listeners) {
    // A UI observer failure must never reject the Web Lock callback and hand
    // storage to another document while old asynchronous work is still alive.
    try { listener(); } catch { /* Ownership is independent of React observers. */ }
  }
}

export function getStorageAccessStatus(): StorageAccessStatus { return status; }
export function subscribeStorageAccess(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** No timer/lease can prove that a suspended foreign localStorage writer died. */
export function assertStorageOwnership() {
  if (!held || (!recovering && status !== 'ready')) {
    throw new Error('다른 창의 저장이 끝났는지 확인할 수 없어 기록 접근을 멈췄습니다. 이 창을 새로 열어주세요.');
  }
}

// Ownership is granted at most once per document and is never re-enabled after
// pagehide/revocation. A new document has no surviving callbacks from this one.
export function getStorageOwnershipToken(): number | null {
  return held && (recovering || status === 'ready') ? 1 : null;
}

/**
 * One exclusive Web Lock for the entire document, including direct legacy
 * storage consumers under the root gate. React unmount/StrictMode must not
 * release it: asynchronous handlers can outlive a component's cleanup.
 * The browser releases it when the document is destroyed. Older app versions
 * that do not participate in this lock must be closed before using this version.
 */
export function beginStorageAccess() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks || typeof locks.request !== 'function') {
    publish('unsupported');
    return;
  }
  const revoke = () => {
    if (status === 'revoked') return;
    recovering = false;
    publish('revoked');
    // Abort root sync before any later callback can apply a response. Do not
    // resolve the lock callback on pagehide, blur, visibility change or unmount.
    window.dispatchEvent(new Event('yeoni-cloud-session-changed'));
  };
  window.addEventListener('pagehide', revoke);
  window.addEventListener('pageshow', event => {
    // Held locks normally prevent BFCache eligibility. If a browser restores
    // the document anyway, never trust a retained in-memory ownership flag.
    if ((event as PageTransitionEvent).persisted) {
      revoke();
      window.location.reload();
    }
  });
  try {
    void locks.request(STORAGE_OWNERSHIP_LOCK, { mode: 'exclusive' }, async () => {
      held = true;
      if (status !== 'revoked') {
        try {
          recovering = true;
          recoverStorageTransaction(window.localStorage);
          recovering = false;
          if (getStorageAccessStatus() !== 'revoked') publish('ready');
        } catch {
          recovering = false;
          if (getStorageAccessStatus() !== 'revoked') publish('error');
        }
      }
      // Deliberately never resolve. Even a recovery error or gate unmount must
      // not let another tab race direct callbacks retained by this document.
      await new Promise<void>(() => {});
    }).catch(() => {
      held = false;
      recovering = false;
      if (status !== 'revoked') publish('error');
    });
  } catch {
    held = false;
    recovering = false;
    publish('error');
  }
}
