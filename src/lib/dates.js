export function todayISO() {
  return new Date().toLocaleDateString('en-CA')
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

// 15-day and 30-day plans are inclusive of the start day.
export function planEnd(startISO, planType) {
  return addDays(startISO, planType === '15d' ? 14 : 29)
}

export function daysLeft(endISO) {
  const end = new Date(endISO + 'T00:00:00')
  const today = new Date(todayISO() + 'T00:00:00')
  return Math.round((end - today) / 86400000)
}

export function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const TL_MONTHS = [
  'Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo',
  'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre',
]

function describeMonth(d) {
  return {
    key: d.toLocaleDateString('en-CA').slice(0, 7),                  // 2026-07
    en: d.toLocaleDateString('en-GB', { month: 'long' }),            // July
    tl: TL_MONTHS[d.getMonth()],                                     // Hulyo
  }
}

// Riders were answering "have you paid?" about whichever month they had in mind.
// Naming the running month removes the guess.
export function currentMonth() {
  return describeMonth(new Date())
}

// The collection round on the 5th asks about last month too, so a rider who
// slipped through the previous round is caught on this one.
export function prevMonth() {
  const d = new Date()
  d.setDate(1)                 // before rolling back, so 31 Mar → 1 Feb never happens
  d.setMonth(d.getMonth() - 1)
  return describeMonth(d)
}

export function monthStartISO() {
  return todayISO().slice(0, 8) + '01'
}
