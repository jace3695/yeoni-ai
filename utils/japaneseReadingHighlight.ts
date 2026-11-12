/** Match only literal text already in the passage. No HTML or regex injection. */
export function splitReadingHighlights(text: string, targets: readonly string[]): { text: string; highlighted: boolean }[] {
  const expressions = [...new Set(targets.filter(Boolean))].sort((a, b) => b.length - a.length);
  const parts: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let position = text.length;
    let match = '';
    for (const expression of expressions) {
      const found = text.indexOf(expression, cursor);
      if (found >= 0 && found < position) { position = found; match = expression; }
    }
    if (position > cursor) parts.push({ text: text.slice(cursor, position), highlighted: false });
    if (!match) break;
    parts.push({ text: match, highlighted: true });
    cursor = position + match.length;
  }
  return parts;
}
