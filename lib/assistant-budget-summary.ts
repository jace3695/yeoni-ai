import type { SupabaseClient } from '@supabase/supabase-js';

export type BudgetSummaryQuery = {
  startDate: string; endDate: string;
  filter: { field: 'category' | 'place'; value: string } | null;
};
export const BUDGET_SUMMARY_HELP = '조회할 월과 조건을 정확히 말씀해 주세요. 예: ‘지난달 지출 알려줘’, ‘2026년 10월 카페 지출 알려줘’, ‘이번 달 사용처 "합성 카페" 지출 알려줘’. 분류·사용처는 저장된 이름과 정확히 일치하는 기록만 계산해요. 비교·제외 조건이나 미래 지출은 아직 이 대화에서 계산하지 않아요.';

function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

// Deliberately bounded read grammar, not an AI interpretation. Unknown filters
// never silently turn into an all-expense answer. Only a complete read grammar
// takes precedence over other intents; quoted labels are data, not commands.
export function parseBudgetSummaryQuery(message: string, today: string): BudgetSummaryQuery | null {
  if (!calendarDate(today)) throw new Error('기준 날짜를 확인하지 못했어요.');
  const match = message.trim().match(/^(?:가계부\s*)?(이번\s*달|이달|지난\s*달|저번\s*달|\d{4}년\s*\d{1,2}월|\d{4}-\d{2}|\d{1,2}월)\s*(.*?)\s*(?:지출|소비)(?:은|는|이|가|을|를)?\s*(?:합계|총액|금액|내역)?\s*(?:알려\s*줘|알려\s*주세요|알려줘요|보여\s*줘|보여\s*주세요|얼마(?:야|예요|인가요)?|얼마\s*썼(?:어|어요))?[?!.。]*$/);
  if (!match) return null;
  const period = match[1].replace(/\s/g, '');
  let month: string;
  if (period === '이번달' || period === '이달') month = today.slice(0, 7);
  else if (period === '지난달' || period === '저번달') {
    const date = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 1); month = date.toISOString().slice(0, 7);
  } else if (/^\d{4}-\d{2}$/.test(period)) month = period;
  else {
    const numbers = period.match(/\d+/g)!;
    month = `${numbers.length === 2 ? numbers[0] : today.slice(0, 4)}-${numbers.at(-1)!.padStart(2, '0')}`;
  }
  const startDate = `${month}-01`;
  if (!calendarDate(startDate) || month > today.slice(0, 7)) return null;
  const lastDay = new Date(`${startDate}T12:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  const endDate = month === today.slice(0, 7) ? today : `${month}-${lastDay.getUTCDate()}`;
  const condition = match[2].trim();
  let filter: BudgetSummaryQuery['filter'] = null;
  if (condition && condition !== '전체' && condition !== '총') {
    const named = condition.match(/^(분류|사용처)\s*["“‘']([^"”’'\r\n]{1,100})["”’']$/);
    const category = /^(식비|카페|생활용품|쇼핑|교통|구독|통신비|공과금|의료|취미|기타|보험|월세|대출|관리비)$/.test(condition);
    if (named && named[2].trim()) filter = { field: named[1] === '분류' ? 'category' : 'place', value: named[2].trim() };
    else if (category) filter = { field: 'category', value: condition };
    else return null;
  }
  return { startDate, endDate, filter };
}

export function isBudgetSummaryIntent(message: string) {
  const outsideQuotes = message.replace(/"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|‘[^’\n]*’/g, ' ');
  return !/(할\s*일|일정|추가|등록|저장|삭제|수정|변경|기록|완료)/.test(outsideQuotes)
    && /(지출|소비)/.test(message) && /(달|월|가계부|\d{4}-\d{2})/.test(message);
}

type ExpenseRow = { id: string; date: string; amount: unknown; category: unknown; place: unknown; transaction_type: unknown };
const INCOMPLETE = '조회한 가계부 기록이 불완전하거나 올바르지 않아 합계를 확정하지 않았어요. 가계부 상세 내역에서 기간·분류·금액을 확인해 주세요.';

function amountUnits(raw: unknown, decimals: number): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') throw new Error(INCOMPLETE);
  const text = String(raw);
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error(INCOMPLETE);
  const [whole, fraction = ''] = text.split('.');
  if (/[1-9]/.test(fraction.slice(decimals))) throw new Error(INCOMPLETE);
  const value = Number(whole + fraction.slice(0, decimals).padEnd(decimals, '0'));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(INCOMPLETE);
  return value;
}

export function summarizeBudgetExpenses(query: BudgetSummaryQuery, raw: unknown, count: unknown, currency: unknown) {
  if (!calendarDate(query.startDate) || !calendarDate(query.endDate) || query.startDate > query.endDate
    || !Array.isArray(raw) || !Number.isSafeInteger(count) || count !== raw.length
    || typeof currency !== 'string' || !['KRW', 'JPY', 'USD'].includes(currency)) throw new Error(INCOMPLETE);
  const decimals = currency === 'USD' ? 2 : 0;
  const seen = new Set<string>();
  const categories = new Map<string, number>();
  let total = 0, expenses = 0, topups = 0;
  for (const value of raw) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INCOMPLETE);
    const row = value as ExpenseRow;
    if (typeof row.id !== 'string' || !row.id || seen.has(row.id) || typeof row.date !== 'string'
      || !calendarDate(row.date) || row.date < query.startDate || row.date > query.endDate
      || query.filter && row[query.filter.field] !== query.filter.value) throw new Error(INCOMPLETE);
    seen.add(row.id);
    const amount = amountUnits(row.amount, decimals);
    if (row.transaction_type === '충전카드 충전') { topups++; continue; }
    if (row.transaction_type != null && (typeof row.transaction_type !== 'string' || !['', '일반 지출', '휴대폰 소액결제', '충전카드 사용'].includes(row.transaction_type))) throw new Error(INCOMPLETE);
    const category = typeof row.category === 'string' && row.category ? row.category : '기타';
    total += amount;
    if (!Number.isSafeInteger(total)) throw new Error(INCOMPLETE);
    categories.set(category, (categories.get(category) ?? 0) + amount); expenses++;
  }
  const format = (units: number) => {
    // Keep safe integer minor units as decimal text all the way to the screen.
    // Dividing a near-MAX_SAFE_INTEGER cent total by 100 loses the last cent.
    const digits = String(units).padStart(decimals + 1, '0');
    const whole = decimals ? digits.slice(0, -decimals) : digits;
    const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, '') : '';
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}${currency === 'KRW' ? '원' : currency === 'JPY' ? '엔' : '달러'}`;
  };
  const condition = query.filter ? ` · ${query.filter.field === 'category' ? '저장 분류' : '사용처'} ‘${query.filter.value}’ 정확히 일치` : ' · 전체 분류';
  const top = [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko-KR'))[0];
  return `${query.startDate}~${query.endDate}${condition}: 서버에 저장된 지출은 ${format(total)}, ${expenses}건이에요.${top && !query.filter ? ` 가장 큰 분류는 ‘${top[0]}’ ${format(top[1])}이에요.` : ''} 충전카드 충전 ${topups}건은 소비 합계에서 제외했어요. 저장되지 않은 소비는 포함하지 않아요.`;
}

// Read-only, authenticated owner supplied by caller, no provider or mutation.
// Exact count is requested in the same response as the page. An oversized or
// server-truncated result is not patched together into an unverified total.
export async function loadBudgetExpenseSummary(client: SupabaseClient, owner: string, query: BudgetSummaryQuery) {
  if (!owner) throw new Error('로그인이 필요합니다.');
  let rowsQuery = client.from('budget_transactions').select('id,amount,date,category,place,transaction_type', { count: 'exact' })
    .eq('user_id', owner).gte('date', query.startDate).lte('date', query.endDate);
  if (query.filter) rowsQuery = rowsQuery.eq(query.filter.field, query.filter.value);
  const [rows, settings] = await Promise.all([
    rowsQuery.order('date').order('id').limit(1000),
    client.from('budget_user_settings').select('currency').eq('user_id', owner).maybeSingle(),
  ]);
  if (rows.error || settings.error) throw new Error('가계부 기록이나 통화 설정을 불러오지 못해 합계를 확정하지 않았어요.');
  // An absent settings row follows the existing KRW default, not an invalid currency.
  return summarizeBudgetExpenses(query, rows.data, rows.count, settings.data === null ? 'KRW' : settings.data?.currency);
}
