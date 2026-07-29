// Month boundaries for the month-end report. Kept out of the page so the
// edge cases (February, December rolling into January) can be tested.

export function monthKey(d = new Date()) {
  return d.toLocaleDateString('en-CA').slice(0, 7)
}

export function monthRange(key) {
  const [y, m] = key.split('-').map(Number)
  const start = `${key}-01`
  // Day 0 of the next month is the last day of this one — handles leap years.
  const end = new Date(y, m, 0).toLocaleDateString('en-CA')
  return { start, end }
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function lastMonths(n, from = new Date()) {
  const out = []
  for (let i = 0; i < n; i++) out.push(monthKey(new Date(from.getFullYear(), from.getMonth() - i, 1)))
  return out
}
