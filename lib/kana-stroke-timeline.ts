// A single clock for all written characters, not one clock per spoken mora.
export function kanaStrokeTimeline(strokeCounts: readonly number[]) {
  let cursor = 350;
  const characters = strokeCounts.map(count => {
    if (!Number.isInteger(count) || count < 1) throw new Error('Missing kana strokes');
    const starts = Array.from({ length: count }, () => { const start = cursor; cursor += 900; return start; });
    return { starts, end: starts.at(-1)! + 700 };
  });
  return { characters, duration: 700, cycle: Math.max(3600, cursor + 1300) };
}
