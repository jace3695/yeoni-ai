import { sumHistoryAmounts } from '../lib/history-summary'

type HistorySummaryProps = {
  income: readonly { amount?: unknown }[]
  expense: readonly { amount?: unknown }[]
  saving: readonly { amount?: unknown }[]
  filterError: string
  formatAmount: (amount: number) => string
}

export default function HistorySummary({ income, expense, saving, filterError, formatAmount }: HistorySummaryProps) {
  const groups = [
    { key: 'income', label: '수입', rows: income },
    { key: 'expense', label: '지출', rows: expense },
    { key: 'saving', label: '저축', rows: saving },
  ] as const
  return (
    <section className="history-result-summary" aria-label="검색 결과 합계" aria-live="polite" aria-atomic="true">
      <h3>검색 결과 합계</h3>
      {filterError ? <p>검색 조건을 수정하면 합계를 확인할 수 있어요.</p> : <>
        <p>접힌 내역까지 포함한 합계예요. 저축은 지출과 따로 표시해요.</p>
        <dl>
          {groups.map(({ key, label, rows }) => {
            const total = sumHistoryAmounts(rows)
            return <div key={key} data-summary-kind={key}>
              <dt>{label} <span>{rows.length}건</span></dt>
              <dd>{total === null ? '합계 확인 필요' : formatAmount(total)}
                {total === null && <p>금액이 올바르지 않거나 합산 가능한 범위를 넘었어요.</p>}
              </dd>
            </div>
          })}
        </dl>
      </>}
    </section>
  )
}
