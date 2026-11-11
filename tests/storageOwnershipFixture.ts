import assert from 'node:assert/strict';
import { beginStorageAccess, getStorageAccessStatus } from '../app/data/storageOwnership.ts';

/** A synthetic browser grants the actual manager's lock; production has no bypass. */
export function grantSyntheticStorageOwnership() {
  if (getStorageAccessStatus() === 'ready') return;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const window = Object.assign(new EventTarget(), {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { reload: () => {} },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: { request: async (_name: string, _options: unknown, run: () => Promise<void>) => run() },
  } });
  try {
    beginStorageAccess();
    assert.equal(getStorageAccessStatus(), 'ready', 'Synthetic fixture failed to acquire the real ownership manager');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
}
