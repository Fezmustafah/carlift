import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const tabs = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/members', label: 'Members' },
  { to: '/expiring', label: 'Expiring' },
  { to: '/logs', label: 'Logs' },
]

export default function Shell() {
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-1 overflow-x-auto">
          <span className="font-bold text-emerald-700 mr-3 py-3 shrink-0">Carlift</span>
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
          <button
            onClick={() => supabase.auth.signOut()}
            className="ml-auto text-sm text-stone-400 hover:text-red-600 py-3 shrink-0"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 pb-16">
        <Outlet />
      </main>
    </div>
  )
}
