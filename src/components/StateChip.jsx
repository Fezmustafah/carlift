import { memberState } from '../lib/status'
import { fmt } from '../lib/dates'

export default function StateChip({ member }) {
  const s = memberState(member)
  if (s.kind === 'left') return <span className="chip bg-stone-200 text-stone-500">Left</span>
  if (s.kind === 'pending') return <span className="chip bg-amber-100 text-amber-700">Pending</span>
  if (s.kind === 'active')
    return (
      <span className="chip bg-emerald-100 text-emerald-700">
        Active · till {fmt(s.end)} ({s.days}d)
      </span>
    )
  return (
    <span className="chip bg-red-100 text-red-700">
      Expired {Math.abs(s.days)}d ago
    </span>
  )
}
