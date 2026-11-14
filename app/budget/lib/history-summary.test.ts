import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sumHistoryAmounts } from './history-summary.ts'

test('sums every filtered row including beyond the five-row preview without mutation', () => {
  const rows = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze({ amount: (i + 1) * 100 })))
  assert.equal(sumHistoryAmounts(rows), 3600)
  assert.equal(sumHistoryAmounts(rows.slice(0, 5)), 1500)
  assert.equal(sumHistoryAmounts(rows.filter(row => row.amount >= 600)), 2100)
  assert.equal(sumHistoryAmounts([]), 0)
  assert.equal(sumHistoryAmounts([{ amount: '1200' }, { amount: 0 }]), 1200)
})

test('rejects corrupt and unsafe money instead of skipping or coercing it', () => {
  for (const amount of [null, undefined, '', ' ', true, false, {}, [], '1e3', '1,000', '1.5', 1.5, -1, '-1', NaN, Infinity, '9007199254740992', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(sumHistoryAmounts([{ amount: 100 }, { amount }]), null, String(amount))
  }
})

test('allows exact safe boundary and rejects cumulative overflow', () => {
  assert.equal(sumHistoryAmounts([{ amount: Number.MAX_SAFE_INTEGER - 1 }, { amount: 1 }]), Number.MAX_SAFE_INTEGER)
  assert.equal(sumHistoryAmounts([{ amount: Number.MAX_SAFE_INTEGER }, { amount: 1 }]), null)
})
