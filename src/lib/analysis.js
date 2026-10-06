// The month, set against the month before it.
//
// The register holds only names and money — no phone numbers, no roster — and
// that is enough to answer the one question the business has after the
// collection round: are the riders who paid last month still paying? A rider
// who stops paying the office and keeps riding is paying the driver, so every
// name that disappears is listed under the vehicle it was last written in.
//
// Riders are matched by riderKey (names.js): case, accents, dots and word order
// are ignored, nothing looser. Names that are only nearly the same are offered
// as "maybe the same person" for him to decide — never merged here, because a
// wrong merge hides exactly the rider this page exists to find.
//
// Pure, so every rule can be checked without a browser or a database.

import { nameWords, riderKey } from './names.js'
import { editDistance } from './dupes.js'

const num = (v) => Number(v || 0)
const clean = (v) => String(v ?? '').trim()
const sum = (rows) => rows.reduce((t, r) => t + num(r.total ?? r.amount), 0)

export const monthOf = (iso) => String(iso || '').slice(0, 7)

// 2026-01 minus one is 2025-12; Date does the carrying.
export function shiftMonth(key, n) {
  const [y, m] = String(key).split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthName(key, withYear = false) {
  const [y, m] = String(key).split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' })
}

function split(lines) {
  let cash = 0
  let card = 0
  let transfer = 0
  for (const l of lines) {
    const v = num(l.amount)
    if (l.method === 'card') card += v
    else if (l.method === 'transfer') transfer += v
    else cash += v
  }
  return { cash, card, transfer, total: cash + card + transfer }
}

// Everyone who paid in one month, one entry each. The newest line decides the
// spelling shown; the newest line that names a vehicle decides the vehicle, so
// a later line written with "No car" does not lose the driver.
export function peopleOf(lines = [], month) {
  const map = new Map()
  for (const l of lines) {
    if (monthOf(l.taken_on) !== month) continue
    const key = riderKey(l.name)
    if (!key) continue
    let p = map.get(key)
    if (!p) {
      p = { key, name: clean(l.name), total: 0, payments: 0, last: '', car_id: null, lines: [], _when: '', _carWhen: '' }
      map.set(key, p)
    }
    const when = `${l.taken_on || ''} ${l.created_at || ''}`
    p.total += num(l.amount)
    p.payments++
    p.lines.push(l)
    if (when >= p._when) {
      p._when = when
      p.last = l.taken_on
      p.name = clean(l.name)
    }
    if (l.car_id && when >= p._carWhen) {
      p._carWhen = when
      p.car_id = l.car_id
    }
  }
  for (const p of map.values()) {
    delete p._when
    delete p._carWhen
  }
  return map
}

// ---------------------------------------------------------------------------
// Nearly the same name, in the two lists that matter: gone since last month,
// and new this month. "Ramil Santo" new in October and "Ramil Santos" gone
// since September is one rider spelled two ways, not one leak and one newcomer.
// ---------------------------------------------------------------------------
export function sameish(a, b) {
  const wa = nameWords(a)
  const wb = nameWords(b)
  if (!wa.length || !wb.length) return null
  const ka = [...wa].sort().join(' ')
  const kb = [...wb].sort().join(' ')
  if (ka === kb) return null // already one rider

  const flatA = wa.join('')
  const flatB = wb.join('')
  if (flatA === flatB) return 'same letters, spaced differently'

  // "Ramil" and "Ramil Santos": every word of the shorter one is in the other.
  const [small, big] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  if (small.length < big.length && small.join('').length >= 4 && small.every((w) => big.includes(w)))
    return 'one name is part of the other'

  // A letter or two apart — only on names long enough for that to mean a typo
  // rather than a different person ("Mark" / "Mary").
  const shortest = Math.min(flatA.length, flatB.length)
  const d = Math.min(editDistance(flatA, flatB), editDistance(ka, kb))
  if ((shortest >= 8 && d <= 2) || (shortest >= 5 && d <= 1)) return 'spelled slightly differently'
  return null
}

export function similarPairs(gone = [], fresh = []) {
  const out = []
  for (const a of gone)
    for (const b of fresh) {
      const why = sameish(a.name, b.name)
      if (why) out.push({ id: `${a.key}|${b.key}`, a, b, why })
    }
  return out.sort((x, y) => x.a.name.localeCompare(y.a.name))
}

// ---------------------------------------------------------------------------
// The whole comparison.
// ---------------------------------------------------------------------------
export function monthAnalysis({ lines = [], cars = [], month, today = '', months = 6 }) {
  const prev = shiftMonth(month, -1)
  const nowP = peopleOf(lines, month)
  const prevP = peopleOf(lines, prev)
  const car = (id) => cars.find((c) => c.id === id)

  // Every month each rider has paid in, up to this one — to tell a newcomer
  // from a rider who skipped a month and came back.
  const paidIn = new Map()
  for (const l of lines) {
    const k = riderKey(l.name)
    const m = monthOf(l.taken_on)
    if (!k || !m || m > month) continue
    if (!paidIn.has(k)) paidIn.set(k, new Set())
    paidIn.get(k).add(m)
  }

  const continuing = []
  const fresh = []
  const missing = []
  for (const [k, p] of nowP) {
    if (prevP.has(k)) {
      continuing.push({ ...p, before: prevP.get(k).total })
      continue
    }
    const earlier = [...(paidIn.get(k) || [])].filter((m) => m < prev).sort()
    fresh.push({ ...p, returning: earlier.length > 0, lastSeen: earlier.at(-1) || null })
  }
  for (const [k, p] of prevP) {
    if (!nowP.has(k)) missing.push({ ...p, months: paidIn.get(k)?.size || 1 })
  }

  const byName = (a, b) => a.name.localeCompare(b.name)
  continuing.sort(byName)
  fresh.sort(byName)
  missing.sort(byName)

  // Per vehicle — that is, per driver. Every vehicle is listed even when it
  // collected nothing, because nothing is the loudest number on the page.
  const ids = new Set(cars.map((c) => c.id))
  for (const p of [...nowP.values(), ...prevP.values()]) ids.add(p.car_id || '')
  const inCar = (people, id) => [...people].filter((p) => (p.car_id || '') === id)
  const byCar = [...ids]
    .map((id) => {
      const c = car(id)
      const n = inCar(nowP.values(), id)
      const b = inCar(prevP.values(), id)
      const gone = inCar(missing, id)
      return {
        car_id: id || null,
        name: c?.name || 'No vehicle written',
        driver: c?.driver_name || '',
        seats: num(c?.seats),
        now: { riders: n.length, total: sum(n) },
        before: { riders: b.length, total: sum(b) },
        missing: gone,
        missingAed: sum(gone),
        fresh: inCar(fresh, id).length,
      }
    })
    .filter((r) => r.car_id || r.now.riders || r.before.riders)
    .sort((a, b) => (!a.car_id) - (!b.car_id) || a.name.localeCompare(b.name))

  const worst = byCar.reduce((w, r) => (r.missing.length > (w?.missing.length || 0) ? r : w), null)

  const trend = []
  for (let i = months - 1; i >= 0; i--) {
    const key = shiftMonth(month, -i)
    const ls = lines.filter((l) => monthOf(l.taken_on) === key)
    trend.push({ key, riders: new Set(ls.map((l) => riderKey(l.name)).filter(Boolean)).size, total: sum(ls) })
  }

  const nowLines = lines.filter((l) => monthOf(l.taken_on) === month)
  const prevLines = lines.filter((l) => monthOf(l.taken_on) === prev)

  return {
    month,
    prev,
    now: { riders: nowP.size, payments: nowLines.length, ...split(nowLines) },
    before: { riders: prevP.size, payments: prevLines.length, ...split(prevLines) },
    continuing,
    fresh,
    returning: fresh.filter((p) => p.returning),
    missing,
    atStake: sum(missing),
    byCar,
    worst: worst && worst.missing.length >= 2 ? worst : null,
    trend,
    similar: similarPairs(missing, fresh),
    // Riders pay from the 5th to the 10th. Until the round is over a missing
    // name may simply not have come yet; after it, it is a question.
    roundOpen: monthOf(today) === month && Number(String(today).slice(8, 10)) <= 10,
  }
}

// One rider, every month the register remembers.
export function riderHistory(lines = [], key) {
  const mine = lines
    .filter((l) => riderKey(l.name) === key)
    .sort((a, b) => `${b.taken_on} ${b.created_at || ''}`.localeCompare(`${a.taken_on} ${a.created_at || ''}`))
  const byMonth = new Map()
  for (const l of mine) {
    const m = monthOf(l.taken_on)
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m).push(l)
  }
  return {
    key,
    name: mine[0] ? clean(mine[0].name) : '',
    spellings: [...new Set(mine.map((l) => clean(l.name)))],
    total: sum(mine),
    lines: mine,
    months: [...byMonth.entries()].map(([m, ls]) => ({ key: m, total: sum(ls), lines: ls })),
  }
}

// Who in a list of lines matches what is being typed — for "find a rider".
export function findRiders(lines = [], query = '', limit = 12) {
  const q = nameWords(query)
  if (!q.length || q.join('').length < 2) return []
  const seen = new Map()
  for (const l of lines) {
    const words = nameWords(l.name)
    if (!q.every((w) => words.some((x) => x.startsWith(w)))) continue
    const key = riderKey(l.name)
    const e = seen.get(key)
    const when = `${l.taken_on} ${l.created_at || ''}`
    if (!e) seen.set(key, { key, name: clean(l.name), last: l.taken_on, when, count: 1, amount: num(l.amount) })
    else {
      e.count++
      if (when > e.when) Object.assign(e, { name: clean(l.name), last: l.taken_on, when, amount: num(l.amount) })
    }
  }
  return [...seen.values()].sort((a, b) => b.when.localeCompare(a.when)).slice(0, limit)
}

// The missing list as a WhatsApp message — to send to a driver, or the boss.
export function missingText(a, { carId, today = '' } = {}) {
  const groups = a.byCar.filter((r) => r.missing.length && (carId === undefined || (r.car_id || null) === carId))
  if (!groups.length) return ''
  const fmt = (n) => num(n).toLocaleString('en-US')
  const head = `*Paid in ${monthName(a.prev)}, not ${a.roundOpen ? 'yet ' : ''}in ${monthName(a.month)}*`
  const parts = [head + (today ? ` (${today})` : '')]
  let riders = 0
  let aed = 0
  for (const g of groups) {
    parts.push('', `*${g.name}${g.driver ? ` — ${g.driver}` : ''}* (${g.missing.length})`)
    g.missing.forEach((p, i) => parts.push(`${i + 1}. ${p.name} — ${fmt(p.total)}`))
    riders += g.missing.length
    aed += g.missingAed
  }
  parts.push('', `Total: ${riders} rider${riders === 1 ? '' : 's'} · AED ${fmt(aed)} paid in ${monthName(a.prev)}`)
  return parts.join('\n')
}
