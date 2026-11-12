import { PreviewMemoryStorage } from '../japanese-preview/memory-storage';
export const qaLocalStorage = new PreviewMemoryStorage();
export const qaSessionStorage = new PreviewMemoryStorage();
export const qaIndexedDB = undefined;
let tail: Promise<unknown> = Promise.resolve();
export const qaLocks = { request<T>(_name: string, options: unknown, callback?: () => Promise<T>): Promise<T> {
  const run = (callback ?? options) as () => Promise<T>;
  const next = tail.then(run, run); tail = next.catch(() => undefined); return next;
} };
export function assertOpaquePreviewOrigin(origin: string) {
  if (origin !== 'null') throw new Error('가상 검사 격리 경계를 확인하지 못했어요.');
}
