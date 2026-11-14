/** Read-only totals of the complete filtered result, never the collapsed preview. */
export function sumHistoryAmounts(rows: readonly { amount?: unknown }[]): number | null {
  let total = 0
  for (const { amount } of rows) {
    // Stored amounts may be numbers or decimal integer strings. Do not coerce
    // missing values, booleans, exponents, whitespace or fractional money to zero.
    const value = typeof amount === 'number' ? amount
      : typeof amount === 'string' && /^\d+$/.test(amount) ? Number(amount) : NaN
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - total) return null
    total += value
  }
  return total
}
