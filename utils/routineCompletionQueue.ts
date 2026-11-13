/** UI retry queue: each achievement keeps its original immutable save intent. */
export function createRoutineCompletionQueue<Intent>(options: {
  capture: (date: string) => Intent;
  save: (intent: Intent) => Promise<void>;
  isCurrent: () => boolean;
  publish: (state: { pending: boolean; error: string; saved: boolean }) => void;
}) {
  type Entry = { date: string; captured?: { intent: Intent }; state: 'waiting' | 'pending' | 'done'; error: string };
  const entries = new Map<string, Entry>();
  const message = (error: unknown) => error instanceof Error ? error.message : '일일 학습 기록을 저장하지 못했어요.';
  const publish = () => {
    if (options.isCurrent()) options.publish({ saved: entries.size > 0 && [...entries.values()].every(entry => entry.state === 'done'), pending: [...entries.values()].some(entry => entry.state === 'pending'), error: [...entries.values()].find(entry => entry.error)?.error || '' });
  };
  const run = async (entry: Entry) => {
    if (!options.isCurrent() || entry.state !== 'waiting') return;
    entry.state = 'pending'; entry.error = ''; publish();
    try {
      // Capture failures retain the original date. The mount-scoped guard must
      // still pass before retry can capture; never adopt a new account/reset.
      entry.captured ??= { intent: options.capture(entry.date) };
      if (!options.isCurrent()) throw new Error('계정이나 기록이 바뀌었어요. 화면을 다시 열어 주세요.');
      await options.save(entry.captured.intent);
      if (options.isCurrent()) entry.state = 'done';
    } catch (error) {
      entry.state = 'waiting'; entry.error = message(error);
    } finally { publish(); }
  };
  return {
    isSaved(date: string) { return entries.get(date)?.state === 'done'; },
    complete(date: string) {
      if (!options.isCurrent()) return;
      let entry = entries.get(date);
      if (!entry) {
        entry = { date, state: 'waiting', error: '' };
        entries.set(date, entry);
      }
      // Subsequent answers do not silently retry a failed achievement.
      if (!entry.error) void run(entry);
    },
    retry() { for (const entry of entries.values()) void run(entry); },
  };
}
