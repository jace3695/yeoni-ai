/** UI-only clock. No record writes, audio or network access. */
export function watchJapaneseReviewClock(deadlines: number[], refresh: () => void, environment = {
  now: () => Date.now(),
  hidden: () => document.hidden,
  schedule: (callback: () => void, delay: number) => window.setTimeout(callback, delay),
  cancel: (timer: number) => window.clearTimeout(timer),
  listen: (callback: () => void) => {
    document.addEventListener('visibilitychange', callback);
    return () => document.removeEventListener('visibilitychange', callback);
  },
}) {
  const valid = deadlines.filter(Number.isFinite);
  if (!valid.length) return () => {};
  let disposed = false;
  let timer: number | undefined;
  let generation = 0;
  const clear = () => { generation++; if (timer !== undefined) environment.cancel(timer); timer = undefined; };
  const schedule = () => {
    clear();
    if (disposed || environment.hidden()) return;
    const now = environment.now();
    // Recheck at most once a minute even after all dates are due: this also
    // handles a system-clock correction without a long or overflowing timer.
    const next = valid.filter(date => date > now).reduce((delay, date) => Math.min(delay, date - now), 60_000);
    const expected = generation;
    timer = environment.schedule(() => {
      if (disposed || expected !== generation) return;
      timer = undefined;
      if (disposed || environment.hidden()) return;
      refresh(); schedule();
    }, Math.max(1, next));
  };
  const visibility = () => {
    if (disposed) return;
    clear();
    if (!environment.hidden()) { refresh(); schedule(); }
  };
  const unlisten = environment.listen(visibility);
  schedule();
  return () => { disposed = true; clear(); unlisten(); };
}
