// What the register adds up to.
//
// The question the register has to answer at any moment of the day is not
// "how much did I take" but three separate ones, and mixing them is how an
// honest round starts looking like a short one:
//
//   1. How much cash is in my hand right now.
//   2. How much went to the bank without ever being in my hand (card, transfer).
//   3. How many riders is that, and who has not come yet.
//
// Everything here is pure, so every one of those can be checked without a
// browser or a database.

const CASH = 'cash'
const num = (v) => Number(v || 0)
const clean = (v) => String(v ?? '').trim()

export const monthOf = (iso) => String(iso || '').slice(0, 7)

export function prevMonthKey(key) {
  const [y, m] = String(key).split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Cash, card and bank kept apart. Card and transfer are money taken; only cash
// is money held.
export function splitByMethod(rows = []) {
  let cash = 0
  let card = 0
  let transfer = 0
  for (const r of rows) {
    const v = num(r.amount)
    const m = r.method || CASH
    if (m === 'card') card += v
    else if (m === 'transfer') transfer += v
    else cash += v
  }
  return { cash, card, transfer, notCash: card + transfer, total: cash + card + transfer }
}

// The register's own lines for a period: the server's rows and whatever is
// still waiting on the phone, with nothing counted twice.
export function registerLines({ takings = [], pending = [], from, to } = {}) {
  const within = (d) => (!from || d >= from) && (!to || d <= to)
  const seen = new Set()
  const out = []
  for (const r of [...pending.map((p) => ({ ...p, _pending: true })), ...takings]) {
    if (!within(r.taken_on) || seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out.sort((a, b) => String(a.taken_on).localeCompare(String(b.taken_on)))
}

// One line per car, so a car that is collecting far less than its seats is
// visible without adding anything up by hand.
export function byCar(lines = [], cars = []) {
  const map = new Map()
  for (const l of lines) {
    const id = l.car_id || ''
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(l)
  }
  const rows = [...map.entries()].map(([id, rows]) => ({
    car_id: id || null,
    name: cars.find((c) => c.id === id)?.name || 'No car',
    riders: rows.length,
    ...splitByMethod(rows),
  }))
  return rows.sort((a, b) => b.total - a.total)
}

// Everything the register knows about a period, in one object.
export function registerSummary({ takings = [], pending = [], expenses = [], cars = [], from, to } = {}) {
  const lines = registerLines({ takings, pending, from, to })
  const spent = (expenses || [])
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .reduce((t, e) => t + num(e.amount), 0)
  const money = splitByMethod(lines)
  return {
    lines,
    ...money,
    riders: lines.length,
    people: new Set(lines.map((l) => clean(l.name).toLowerCase())).size,
    unsent: lines.filter((l) => l._pending).length,
    // Promised, not received: deliberately outside every total on this object.
    owed: lines.reduce((t, l) => t + num(l.owed), 0),
    spent,
    byCar: byCar(lines, cars),
  }
}

// Riders who paid last month and have not paid this one. The list he has to
// work through, built out of the register itself rather than a members list he
// deliberately stopped keeping.
export function lapsed(takings = [], month, prev) {
  const paidNow = new Set()
  const last = new Map()
  for (const t of takings) {
    const key = clean(t.name).toLowerCase()
    if (!key) continue
    const m = monthOf(t.taken_on)
    if (m === month) paidNow.add(key)
    else if (m === prev) {
      const seen = last.get(key)
      if (!seen || String(t.taken_on) > String(seen.taken_on)) last.set(key, t)
    }
  }
  return [...last.entries()]
    .filter(([key]) => !paidNow.has(key))
    .map(([, t]) => ({ name: clean(t.name), amount: num(t.amount), car_id: t.car_id || null }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// The amounts actually being charged, most used first — the buttons in front
// of the queue should be the four numbers he presses all morning.
export function amountPresets(takings = [], fallback = [200, 300, 400, 500], take = 4) {
  const counts = new Map()
  for (const t of takings) {
    const v = num(t.amount)
    if (v > 0) counts.set(v, (counts.get(v) || 0) + 1)
  }
  if (!counts.size) return fallback
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, take)
    .map(([v]) => v)
    .sort((a, b) => a - b)
}
