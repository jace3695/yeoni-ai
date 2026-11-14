export type RecurrenceRule = "none" | "daily" | "weekly" | "monthly";

// Korean has no useful JavaScript \b boundary. Match whole expressions instead
// of fragments in titles such as 구매일, 구매주기, 매일경제, or 매달리기.
// Share these exact expressions with title cleanup so recognition and removal
// cannot disagree. Preserve the existing daily/weekly/monthly precedence.
const recurrenceExpressions = [
  ["daily", String.raw`(?:매일매일|매\s*일(?:마다)?|날마다)`],
  ["weekly", String.raw`(?:매\s*주(?:마다)?|주마다)`],
  ["monthly", String.raw`(?:매\s*월(?:마다)?|매\s*달(?:마다)?|달마다)`],
] as const;

function recurrencePattern(rule: RecurrenceRule, expression: string, global = false) {
  // Retain the previously supported 매주월요일 spelling without consuming the
  // weekday title or inventing a due date. Arbitrary attached words stay literal.
  const end = rule === "weekly"
    ? String.raw`(?:(?![\p{L}\p{M}\p{N}_])|(?=[월화수목금토일]요일(?:에|은|는|도)?(?![\p{L}\p{M}\p{N}_])))`
    : String.raw`(?![\p{L}\p{M}\p{N}_])`;
  return new RegExp(String.raw`\s*(?<![\p{L}\p{M}\p{N}_])${expression}(?:\s*반복)?(?:으로|로)?${end}\s*`, global ? "gu" : "u");
}

export function parseRecurrence(message: string): RecurrenceRule {
  for (const [rule, expression] of recurrenceExpressions) {
    if (recurrencePattern(rule, expression).test(message)) return rule;
  }
  return "none";
}

export function stripRecurrenceExpressions(message: string) {
  return recurrenceExpressions.reduce((text, [rule, expression]) => text.replace(recurrencePattern(rule, expression, true), " "), message);
}

export function recurrenceLabel(rule: RecurrenceRule) {
  return rule === "daily" ? "매일" : rule === "weekly" ? "매주" : rule === "monthly" ? "매월" : "반복 없음";
}

export function nextRecurringDueAt(dueAt: string | null, rule: RecurrenceRule, today: string) {
  if (rule === "none") return null;
  const baseDate = (dueAt?.slice(0, 10) || today).split("-").map(Number);
  const date = new Date(Date.UTC(baseDate[0], baseDate[1] - 1, baseDate[2]));
  if (rule === "daily") date.setUTCDate(date.getUTCDate() + 1);
  if (rule === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  if (rule === "monthly") {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  }
  const next = date.toISOString().slice(0, 10);
  return `${next}T23:59:00+09:00`;
}
