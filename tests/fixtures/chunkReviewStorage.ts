import { syntheticIndexedDB } from "./languageIndexedDB.ts";
export function memoryStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  const api = {
    get length() { return entries.size; }, key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
  return { entries, api };
}

export function syntheticLocks() {
  const tails = new Map<string, Promise<unknown>>();
  return { request: <T>(name: string, options: { signal?: AbortSignal }, run: () => T | Promise<T>): Promise<T> => {
    const pending = (tails.get(name) ?? Promise.resolve()).catch(() => {}).then(() => {
      options.signal?.throwIfAborted(); return run();
    });
    tails.set(name, pending); return pending;
  } };
}

export async function withChunkBrowser<T>(run: (fixture: ReturnType<typeof memoryStorage> & { events: string[]; locks: ReturnType<typeof syntheticLocks>; idb: ReturnType<typeof syntheticIndexedDB> }) => T | Promise<T>, initial: Record<string, string> = {}) {
  const globals = ['window', 'navigator', 'indexedDB'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const storage = memoryStorage(initial), events: string[] = [], locks = syntheticLocks(), idb = syntheticIndexedDB();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: idb.factory });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage.api, dispatchEvent: (event: Event) => { events.push(event.type); return true; } } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
  try { return await run({ ...storage, events, locks, idb }); }
  finally {
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}
