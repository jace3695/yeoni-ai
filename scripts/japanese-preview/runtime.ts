import { IDBFactory } from 'fake-indexeddb';
import { PreviewMemoryStorage } from './memory-storage.ts';

// Only these in-memory instances are injected into the component bundle.
// The sandbox blocks access if a future caller escapes the compile-time aliases.
export const qaLocalStorage = new PreviewMemoryStorage();
export const qaSessionStorage = new PreviewMemoryStorage();
export const qaIndexedDB = new IDBFactory();
export const qaLocks = undefined;
export const SYNTHETIC_OWNER = 'japanese-preview-synthetic-user';
let scenarioGeneration = 0;

export function seedSyntheticOwner() {
  // This counter is deliberately outside the clearable store. A queued old
  // write must never mistake a newly seeded scenario for its previous owner.
  const epoch = String(++scenarioGeneration);
  qaLocalStorage.setItem('language-cloud-sync-user', SYNTHETIC_OWNER);
  qaLocalStorage.setItem('fitness-cloud-sync-user', SYNTHETIC_OWNER);
  qaLocalStorage.setItem('language-cloud-sync-epoch', epoch);
  qaLocalStorage.setItem('fitness-cloud-sync-epoch', epoch);
}

export function assertOpaquePreviewOrigin(origin: string) {
  if (origin !== 'null') throw new Error('격리 경계를 확인하지 못해 검사 화면을 열지 않았어요. 실제 기록에는 접근하지 않았습니다.');
}
