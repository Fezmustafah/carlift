// What should be in the bag at the end of a collection day.
//
// The number a phone shows and the number in a hand are not the same number,
// and mixing them up makes an honest day look like a theft. Three rules:
//
//  1. Card and bank transfer are money taken, not money held. They are counted
//     for the month and kept out of the bag.
//  2. A taking that has been put on a rider's record now exists twice — once as
//     the taking, once as the subscription it created. The subscription is the
//     copy and is dropped, or matching riders in the evening would double the
//     day's total.
//  3. Rows still stuck in the phone's outbox are real cash in the bag. They are
//     added, and counted separately so the reason for a mismatch is visible.
//
// Kept out of the page so every case can be checked without a browser.

const CASH = 'cash'
const num = (v) => Number(v || 0)
const dayOf = (ts) => String(ts || '').slice(0, 10)
const isCash = (method) => (method || CASH) === CASH
const sum = (rows) => rows.reduce((t, r) => t + num(r.amount), 0)

export function cashbox({ day, takings = [], subs = [], onetime = [], expenses = [], pending = [] }) {
  const copies = new Set(takings.map((t) => t.subscription_id).filter(Boolean))

  const dayTakings = takings.filter((t) => t.taken_on === day)
  const dayPending = pending.filter((p) => p.taken_on === day)
  const daySubs = subs.filter((s) => dayOf(s.created_at) === day && !copies.has(s.id))
  const dayOnetime = onetime.filter((o) => o.date === day)
  const dayExpenses = expenses.filter((e) => e.date === day)

  const fast = sum(dayTakings.filter((t) => isCash(t.method)))
  const unsentCash = sum(dayPending.filter((t) => isCash(t.method)))
  const payments = sum(daySubs.filter((s) => isCash(s.paid_via)))
  const rides = sum(dayOnetime) // one-time riders always pay cash on the bus
  const spent = sum(dayExpenses) // fuel, salik and fines come out of the same bag

  const notInHand =
    sum(dayTakings.filter((t) => !isCash(t.method))) +
    sum(dayPending.filter((t) => !isCash(t.method))) +
    sum(daySubs.filter((s) => !isCash(s.paid_via)))

  return {
    fast,
    unsentCash,
    payments,
    rides,
    spent,
    expected: fast + unsentCash + payments + rides - spent,
    notInHand,
    riders: dayTakings.length + dayPending.length + daySubs.length,
    unsent: dayPending.length,
  }
}

// null while the box is empty — an uncounted day is not a day that balances.
export function difference(expected, counted) {
  if (counted === '' || counted === null || counted === undefined) return null
  const n = Number(counted)
  return Number.isFinite(n) ? n - Number(expected) : null
}

// Every day of a month up to and including today, newest first.
export function daysOfMonth(monthKey, today) {
  const [y, m] = monthKey.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const out = []
  for (let d = 1; d <= last; d++) {
    const iso = `${monthKey}-${String(d).padStart(2, '0')}`
    if (today && iso > today) break
    out.push(iso)
  }
  return out.reverse()
}
