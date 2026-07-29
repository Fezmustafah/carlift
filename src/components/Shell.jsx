import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Header shows everything; the phone bar shows only the five daily screens,
// with the rest behind More.
const tabs = [
  { to: '/', label: 'Home', icon: '📊', end: true, bar: true },
  { to: '/collect', label: 'Collect', icon: '💵', bar: true },
  { to: '/verify', label: 'Verify', icon: '🔍', bar: true },
  { to: '/members', label: 'Members', icon: '👥', bar: true },
  { to: '/report', label: 'Report', icon: '📈' },
  { to: '/expiring', label: 'Expiring', icon: '⏰' },
  { to: '/logs', label: 'Logs', icon: '📒' },
  { to: '/qr', label: 'Show QR', icon: '📱' },
  { to: '/cards', label: 'Cards', icon: '🔳' },
  { to: '/more', label: 'More', icon: '☰', bar: true, barOnly: true },
]
const barTabs = tabs.filter((t) => t.bar)
const headerTabs = tabs.filter((t) => !t.barOnly)

export default function Shell() {
  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-10 backdrop-blur"
        style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-1">
          <span className="font-extrabold tracking-tight brand-text mr-3 py-3.5 shrink-0">Car Lift</span>

          {/* desktop / tablet tabs */}
          <nav className="hidden sm:flex items-center gap-1 overflow-x-auto">
            {headerTabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className="px-3 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition"
                style={({ isActive }) => ({
                  borderColor: isActive ? 'var(--brand)' : 'transparent',
                  color: isActive ? 'var(--brand)' : 'var(--muted)',
                })}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          <button
            onClick={() => supabase.auth.signOut()}
            className="ml-auto text-sm muted hover:opacity-70 py-3.5 shrink-0"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 pb-28 sm:pb-16">
        <Outlet />
      </main>

      {/* mobile bottom nav — the owner runs this on a phone */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-20 safe-b backdrop-blur"
        style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)', borderTop: '1px solid var(--border)' }}
      >
        <div className="grid grid-cols-5">
          {barTabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition"
              style={({ isActive }) => ({ color: isActive ? 'var(--brand)' : 'var(--muted)' })}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
