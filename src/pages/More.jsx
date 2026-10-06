import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MORE } from '../components/Shell'
import { PageHead } from '../components/ui'
import { ChevronRight, LogoutIcon } from '../components/icons'

// The bottom bar only fits the screens of a collection month. Everything else
// lives here — most of it from the days of the members list.
export default function More() {
  return (
    <div className="space-y-4">
      <PageHead title="More" subtitle="Everything that is not used every day." />
      <ul className="card p-0 overflow-hidden divide-y divide-hair">
        {MORE.map(({ to, label, hint, Icon }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-3 px-4 py-3.5 press">
              <span className="w-10 h-10 rounded-xl bg-sunk grid place-items-center shrink-0">
                <Icon className="w-5 h-5 text-blue" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-extrabold">{label}</span>
                <span className="block text-[12px] muted truncate">{hint}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-soft shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      <button onClick={() => supabase.auth.signOut()} className="btn-ghost w-full py-3.5 rounded-2xl">
        <LogoutIcon className="w-[18px] h-[18px]" />
        Log out
      </button>
      <p className="text-center text-[11px] muted">Car Lift · made by Faiz Mustafa</p>
    </div>
  )
}
