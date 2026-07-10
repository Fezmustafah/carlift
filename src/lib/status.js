import { daysLeft } from './dates'

export function latestEnd(member) {
  const subs = member.subscriptions || []
  if (!subs.length) return null
  return subs.map((s) => s.end_date).sort().at(-1)
}

// left | pending (registered, never/not currently paid) | active | expired
export function memberState(member) {
  if (member.status === 'left') return { kind: 'left', end: null, days: null }
  const end = latestEnd(member)
  if (!end) return { kind: 'pending', end: null, days: null }
  const days = daysLeft(end)
  return { kind: days >= 0 ? 'active' : 'expired', end, days }
}

export function isActivePaid(member) {
  return memberState(member).kind === 'active'
}

export function ridesShift(member, shift) {
  return member.shift === shift || member.shift === 'both'
}
