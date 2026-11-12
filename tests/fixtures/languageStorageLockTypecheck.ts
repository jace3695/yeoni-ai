import { withLanguageRecordLock } from '../../app/data/languageStorageLock.ts';
/** Compile-only contract. Never execute these intentional misuse calls. */
export function checkSynchronousLanguageContract() {
  void withLanguageRecordLock(() => 1);
  void withLanguageRecordLock(() => undefined);
  // @ts-expect-error Async storage callbacks can outlive the IDB transaction.
  void withLanguageRecordLock(async () => 1);
  // @ts-expect-error Non-async functions returning a Promise are also forbidden.
  void withLanguageRecordLock(() => Promise.resolve(1));
  const thenable: PromiseLike<number> = Promise.resolve(1);
  // @ts-expect-error Arbitrary PromiseLike returns are not synchronous work.
  void withLanguageRecordLock(() => thenable);
}
