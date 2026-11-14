import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Execute the real TSX and helper. Only the unrelated network-backed editor is
// replaced; this suite never contacts a service or mounts storage/auth code.
function loadComponent(entry: string, syntheticState?: unknown[]) {
  let stateIndex = 0
  const require = createRequire(import.meta.url)
  function load(path: string): { default?: React.ComponentType<any> } {
    const source = readFileSync(path, 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
    const loadedModule = { exports: {} }
    const localRequire = (name: string) => {
      if (name === 'react' && syntheticState) return { ...require('react'), useState: () => [syntheticState[stateIndex++], () => { throw new Error('SSR must not mutate state') }] }
      if (name === './category-editor') return { default: () => null, __esModule: true }
      if (name === './history-summary') return load(resolve(dirname(path), name + '.tsx'))
      if (name === '../lib/history-summary' || name === '../lib/history-edit') return load(resolve(dirname(path), name + '.ts'))
      return require(name)
    }
    new Function('require', 'module', 'exports', output)(localRequire, loadedModule, loadedModule.exports)
    return loadedModule.exports
  }
  return load(resolve(entry)).default!
}
const Summary = loadComponent('app/budget/components/history-summary.tsx')
const History = loadComponent('app/budget/components/history-screen.tsx')
const formatAmount = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

test('real summary renders three independent totals and complete-result explanation', () => {
  const html = renderToStaticMarkup(createElement(Summary, { income: [{ amount: 9000 }], expense: [{ amount: 1200 }], saving: [{ amount: 3000 }], filterError: '', formatAmount }))
  for (const text of ['검색 결과 합계', '접힌 내역까지 포함', '수입', '지출', '저축', '9,000원', '1,200원', '3,000원']) assert.ok(html.includes(text), text)
  assert.ok(!html.includes('4,200원'))
})

test('filter error suppresses all totals, not a false zero result', () => {
  const html = renderToStaticMarkup(createElement(Summary, { income: [], expense: [], saving: [], filterError: 'invalid range', formatAmount: () => { throw new Error('must not format invalid-filter totals') } }))
  assert.ok(html.includes('검색 조건을 수정'))
  assert.ok(!html.includes('<dl>'))
})

test('invalid or overflowing group remains unavailable while other groups remain exact', () => {
  const html = renderToStaticMarkup(createElement(Summary, { income: [{ amount: null }], expense: [{ amount: 1200 }], saving: [{ amount: Number.MAX_SAFE_INTEGER }, { amount: 1 }], filterError: '', formatAmount }))
  assert.equal(html.split('합계 확인 필요').length - 1, 2)
  assert.ok(html.includes('1,200원'))
  assert.ok(!html.includes('NaN'))
})

test('real HistoryScreen wires full filtered arrays, not its five-row collapsed lists', () => {
  const incomeList = Array.from({ length: 6 }, (_, i) => ({ id: String(i), amount: 1000, name: `합성수입${i}`, date: '2026-11-14' }))
  const noAction = () => { throw new Error('read-only render must not call a handler') }
  const html = renderToStaticMarkup(createElement(History, { userId: 'synthetic-only', incomeList, transactions: [], savings: [], currency: 'KRW', processingRecordKey: '', onChanged: noAction, onDeleteIncome: noAction, onDeleteExpense: noAction, onDeleteSaving: noAction, onNavigateInput: noAction, onNotice: noAction }))
  const section = html.match(/<section class="history-result-summary"[\s\S]*?<\/section>/)?.[0] || ''
  assert.ok(section.includes('₩6,000'))
  assert.ok(section.includes('6건'))
  assert.ok(html.includes('합성수입4'))
  assert.ok(!html.includes('합성수입5'))
  assert.ok(html.includes('더보기 (1건)'))
})

// Supply the exact initial hook values to the real screen, preserving its real
// filtering and rendering code. This is SSR integration, not browser interaction.
function renderFilteredHistory(filters: { search?: string; start?: string; end?: string; type?: string; category?: string; min?: string; max?: string; payment?: string }) {
  const Component = loadComponent('app/budget/components/history-screen.tsx', [false, false, false, filters.search || '', filters.start || '', filters.end || '', filters.type || 'all', filters.category || 'all', filters.min || '', filters.max || '', filters.payment || 'all'])
  const noAction = () => { throw new Error('read-only render must not call handlers') }
  return renderToStaticMarkup(createElement(Component, {
    userId: 'synthetic-only', currency: 'KRW', processingRecordKey: '',
    incomeList: [{ id: 'i1', amount: 8000, name: '합성 검색', date: '2026-11-14' }],
    savings: [{ id: 's1', amount: 2000, goal_name: '합성 검색', date: '2026-11-14' }],
    transactions: [
      { id: 'e1', amount: 1200, place: '합성 검색', category: '식비', payment: '현금', date: '2026-11-14' },
      { id: 'e2', amount: 1500, place: '합성 검색', category: '식비', payment: '현금', date: '2026-11-14' },
      { id: 'e3', amount: 1600, place: '다른 장소', category: '식비', payment: '현금', date: '2026-11-14' },
      { id: 'e4', amount: 1700, place: '합성 검색', category: '식비', payment: '현금', date: '2026-11-13' },
      { id: 'e5', amount: 1800, place: '합성 검색', category: '식비', payment: '현금', date: '2026-11-14' },
      { id: 'e6', amount: 1300, place: '합성 검색', category: '카페', payment: '현금', date: '2026-11-14' },
      { id: 'e7', amount: 1400, place: '합성 검색', category: '식비', payment: '체크카드', date: '2026-11-14' },
    ],
    onChanged: noAction, onDeleteIncome: noAction, onDeleteExpense: noAction, onDeleteSaving: noAction, onNavigateInput: noAction, onNotice: noAction,
  })).match(/<section class="history-result-summary"[\s\S]*?<\/section>/)?.[0] || ''
}

test('real HistoryScreen combines search, type, inclusive amount/date, category and payment filters', () => {
  const html = renderFilteredHistory({ search: '검색', type: 'expense', min: '1200', max: '1500', start: '2026-11-14', end: '2026-11-14', category: '식비', payment: '현금' })
  assert.ok(html.includes('₩2,700'))
  assert.ok(html.includes('2건'))
  assert.equal(html.split('₩0').length - 1, 2)
  const income = renderFilteredHistory({ type: 'income' })
  assert.ok(income.includes('₩8,000'))
  assert.equal(income.split('₩0').length - 1, 2)
})

test('real HistoryScreen invalid amount and reversed date filters never render false zero totals', () => {
  for (const filters of [{ min: '1500', max: '1200' }, { min: 'invalid' }, { start: '2026-11-15', end: '2026-11-14' }]) {
    const html = renderFilteredHistory(filters)
    assert.ok(html.includes('검색 조건을 수정'))
    assert.ok(!html.includes('<dl>'))
    assert.ok(!html.includes('₩0'))
  }
})
