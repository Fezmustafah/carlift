import { memberState } from '../lib/status'
import { fmt } from '../lib/dates'

export default function StateChip({ member }) {
  const s = memberState(member)
  if (s.kind === 'left') return <span className="chip chip-mute">Left</span>
  if (s.kind === 'pending') return <span className="chip chip-warn">Not paid yet</span>
  if (s.kind === 'active')
    return (
      <span className="chip chip-ok">
        Paid · till {fmt(s.end)} ({s.days}d)
      </span>
    )
  return <span className="chip chip-bad">Expired {Math.abs(s.days)}d ago</span>
}
