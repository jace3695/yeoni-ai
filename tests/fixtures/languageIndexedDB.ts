/** Event/transaction scheduling model, NOT a browser IndexedDB implementation.
 * Shared instances model connections to one origin; no real user data is used. */
export function syntheticIndexedDB() {
  type Handler = (() => void) | null;
  const trace: string[] = [];
  let created = false, paused = false, active = false, next = 0;
  const queue: Array<() => void> = [];
  const connections: Array<{ close: () => void; onversionchange: Handler; onclose: Handler }> = [];
  const controls = {
    openError: false, blocked: false, hang: false, transactionError: false,
    requestError: false, abortAfterCallback: false, closeAfterCallback: false,
  };
  const late: Array<() => void> = [];
  const pump = () => {
    if (active || paused) return;
    const work = queue.shift();
    if (work) { active = true; setImmediate(work); }
  };
  const factory = { open: (name: string, version: number) => {
    trace.push(`open:${name}:${version}`);
    let closed = false;
    const db = {
      onversionchange: null as Handler, onclose: null as Handler,
      close: () => { closed = true; trace.push('close'); },
      createObjectStore: (store: string) => { trace.push(`create:${store}`); created = true; },
      transaction: (store: string, mode: string) => {
        if (closed || controls.transactionError) throw new Error('InvalidStateError');
        if (mode !== 'readwrite') throw new Error('The model requires a shared readwrite gate');
        const id = ++next;
        trace.push(`queue:${id}:${store}:${mode}`);
        let aborted = false, ended = false;
        const req = { onsuccess: null as Handler, onerror: null as Handler };
        const tx = {
          oncomplete: null as Handler, onabort: null as Handler,
          abort: () => { if (ended) throw new Error('TransactionInactiveError'); aborted = true; },
          objectStore: (key: string) => ({ get: () => {
            if (key !== store) throw new Error('NotFoundError');
            return req;
          } }),
        };
        queue.push(() => {
          trace.push(`grant:${id}`);
          if (!aborted && !controls.requestError) req.onsuccess?.();
          if (controls.abortAfterCallback || controls.requestError) aborted = true;
          if (controls.closeAfterCallback) { aborted = true; db.onclose?.(); }
          // Complete in a later task, so acquiring at construction or returning
          // from the request instead of the transaction is observable in tests.
          setImmediate(() => {
            ended = true;
            trace.push(`${aborted ? 'abort' : 'complete'}:${id}`);
            if (aborted) tx.onabort?.(); else tx.oncomplete?.();
            active = false; pump();
          });
        });
        pump();
        return tx;
      },
    };
    connections.push(db);
    let upgradeAborted = false;
    const request = {
      result: db, transaction: { abort: () => { upgradeAborted = true; } },
      onblocked: null as Handler, onerror: null as Handler,
      onupgradeneeded: null as Handler, onsuccess: null as Handler,
    };
    const succeed = () => {
      if (!created) request.onupgradeneeded?.();
      if (upgradeAborted) request.onerror?.(); else request.onsuccess?.();
    };
    setImmediate(() => {
      if (controls.openError) request.onerror?.();
      else if (controls.blocked || controls.hang) { late.push(succeed); if (controls.blocked) request.onblocked?.(); }
      else succeed();
    });
    return request;
  } };
  return {
    factory: factory as unknown as IDBFactory, trace, controls,
    pause: () => { paused = true; }, resume: () => { paused = false; pump(); },
    releaseOpen: () => { late.splice(0).forEach(run => run()); },
    versionChange: () => connections.forEach(db => db.onversionchange?.()),
    closeConnections: () => connections.forEach(db => db.onclose?.()),
  };
}
