import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// The bottom bar only fits the five screens used every day. Everything else
// lives here.
const items = [
  { to: '/day', icon: '🧮', label: 'End of day', hint: 'What you paid out, and what is left to count' },
  { to: '/verify', icon: '🔍', label: 'Verify', hint: 'What riders said, checked against your records' },
  { to: '/report', icon: '📈', label: 'Month report', hint: 'Collected, spent, per car, who did not pay' },
  { to: '/expiring', icon: '⏰', label: 'Expiring', hint: 'Renewals due in the next 3 days' },
  { to: '/logs', icon: '📒', label: 'Logs', hint: 'One-time rides, expenses, spot checks' },
  { to: '/qr', icon: '📱', label: 'Show QR', hint: 'Hold up your phone for a rider to scan' },
  { to: '/cards', icon: '🔳', label: 'QR cards & links', hint: 'Print seat cards, copy group links' },
]

export default function More() {
  return (
    <div className="space-y-4">
      <h1 className="h1">More</h1>
      <div className="space-y-2">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="card flex items-center gap-3 transition active:scale-[0.99]">
            <span className="text-2xl">{i.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{i.label}</div>
              <div className="text-sm muted truncate">{i.hint}</div>
            </div>
            <span className="dim">›</span>
          </Link>
        ))}
      </div>
      <button onClick={() => supabase.auth.signOut()} className="btn-ghost w-full">
        Logout
      </button>
    </div>
  )
}
