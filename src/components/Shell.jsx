import { Component, useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AppMark, Toaster } from './ui'
import {
  BookIcon, CardsIcon, ChartIcon, ClockIcon, DocIcon, GridIcon, ListIcon, LogoutIcon, MenuIcon, MoneyIcon,
  QrIcon, ShieldIcon, TrendIcon, UsersIcon, WalletIcon,
} from './icons'

// The phone's bar holds the screens of a collection month, in the order he
// uses them: how the month stands, the register, the bag at night, the paper
// for the boss. Everything else is one tap further, under More.
export const TABS = [
  { to: '/', label: 'Month', Icon: ChartIcon },
  { to: '/fast', label: 'Register', Icon: BookIcon },
  { to: '/day', label: 'Day', Icon: WalletIcon },
  { to: '/sheet', label: 'Statement', Icon: DocIcon },
  { to: '/more', label: 'More', Icon: MenuIcon },
]

export const MORE = [
  { to: '/collect', label: 'Collect', hint: 'Payments against the members list', Icon: MoneyIcon },
  { to: '/members', label: 'Members', hint: 'The old roster, with phone numbers', Icon: UsersIcon },
  { to: '/verify', label: 'Verify', hint: 'What riders said, checked against the books', Icon: ShieldIcon },
  { to: '/report', label: 'Month report', hint: 'Collected, spent, per car — from the members list', Icon: TrendIcon },
  { to: '/seats', label: 'Seats per car', hint: 'Paid seats against capacity, morning and night', Icon: GridIcon },
  { to: '/expiring', label: 'Expiring', hint: 'Plans ending in the next 3 days', Icon: ClockIcon },
  { to: '/logs', label: 'Logs', hint: 'One-time rides, expenses, spot checks', Icon: ListIcon },
  { to: '/qr', label: 'Show QR', hint: 'Hold up your phone for a rider to scan', Icon: QrIcon },
  { to: '/cards', label: 'QR cards & links', hint: 'Print seat cards, copy group links', Icon: CardsIcon },
]

const OUTBOX_KEY = 'carlift.fast.outbox'

// Lines written on this phone that the server has not heard about yet. Shown on
// the Register tab from every screen, because closing the browser before they
// go is the one way the register can still lose money.
function useUnsent() {
  const read = () => {
    try {
      const rows = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')
      return Array.isArray(rows) ? rows.length : 0
    } catch {
      return 0
    }
  }
  const [n, setN] = useState(read)
  const { pathname } = useLocation()
  useEffect(() => {
    setN(read())
    const on = () => setN(read())
    window.addEventListener('carlift-outbox', on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('carlift-outbox', on)
      window.removeEventListener('storage', on)
    }
  }, [pathname])
  return n
}

function activeTab(pathname) {
  if (pathname === '/') return 0
  const i = TABS.findIndex((t) => t.to !== '/' && pathname.startsWith(t.to))
  if (i >= 0) return i
  return MORE.some((m) => pathname.startsWith(m.to)) ? TABS.length - 1 : -1
}

/* --------------------------------------------------- laptop: side bar --- */
function SideNav({ unsent }) {
  const { pathname } = useLocation()
  const item = ({ to, label, Icon }, count = 0) => {
    const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
    return (
      <Link
        key={to}
        to={to}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
          active ? 'bg-blue/10 text-blue font-extrabold' : 'text-muted font-semibold hover:bg-sunk hover:text-ink'
        }`}
      >
        <Icon className="w-[19px] h-[19px]" />
        <span className="flex-1">{label}</span>
        {count > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-bad text-white text-[10.5px] font-extrabold leading-5 text-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Link>
    )
  }
  return (
    <aside className="no-print hidden lg:flex w-[232px] shrink-0 flex-col border-r border-soft/60 bg-card sticky top-0 h-screen">
      <div className="px-6 pt-7 pb-6">
        <p className="flex items-center gap-2.5 text-[22px] font-extrabold tracking-display leading-none">
          <AppMark className="w-8 h-8" />
          Car Lift
        </p>
        <p className="text-[11px] muted mt-2">Adnan Car Lift · staff transport</p>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 flex flex-col gap-0.5">
        {TABS.filter((t) => t.to !== '/more').map((t) => item(t, t.to === '/fast' ? unsent : 0))}
        <div className="my-3 mx-3 border-t border-hair" />
        {MORE.map((m) => item(m))}
      </nav>
      <div className="p-3 border-t border-hair">
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-extrabold bg-sunk text-ink press"
        >
          <LogoutIcon className="w-[17px] h-[17px]" />
          Log out
        </button>
      </div>
    </aside>
  )
}

/* ------------------------------------------------- phone: bottom bar --- */
function BottomNav({ unsent }) {
  const { pathname } = useLocation()
  const at = activeTab(pathname)
  return (
    <nav className="no-print nav-wrap lg:hidden fixed inset-x-0 bottom-0 z-30 bg-page px-3.5 pt-5 pb-[calc(10px+env(safe-area-inset-bottom))]">
      <div className="nav-bar relative h-[62px] flex items-stretch rounded-2xl px-[17px] max-w-[560px] mx-auto">
        {at >= 0 && (
          <span
            aria-hidden="true"
            className="nav-orb-track pointer-events-none absolute inset-y-0 left-[17px]"
            style={{ width: `calc((100% - 34px) / ${TABS.length})`, transform: `translateX(${at * 100}%)` }}
          >
            <span className="nav-orb" />
          </span>
        )}
        {TABS.map(({ to, label, Icon }, i) => {
          const active = i === at
          const badge = to === '/fast' ? unsent : 0
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              onClick={() => {
                try {
                  navigator.vibrate?.(8)
                } catch {
                  /* iOS has none */
                }
              }}
              className="group relative z-10 flex-1 flex flex-col items-center justify-end pb-[9px] gap-[4px]"
            >
              <span
                className={`nav-icon relative flex items-center justify-center w-[44px] h-[30px] ${
                  active ? 'is-on text-white' : 'text-muted group-active:scale-90'
                }`}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.1 : 1.7} />
                {badge > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[10px] font-extrabold leading-[18px] text-center ring-2 rise ${
                      active ? 'ring-blue' : 'ring-card'
                    }`}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span
                className={`text-[10.5px] leading-none transition-colors duration-300 ${
                  active ? 'text-blue font-extrabold' : 'text-muted font-semibold'
                }`}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// One screen failing must not take the bar and every other screen with it.
// Unsent register lines are on the phone's disk either way; this keeps the
// way back to them one tap away.
class ScreenGuard extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card space-y-3 rise">
        <p className="label">This screen hit a problem</p>
        <p className="text-[13px] leading-relaxed">
          Nothing written in the register is lost — unsent lines stay on this phone. Reload, or use the bar below.
        </p>
        <p className="text-[11.5px] muted break-words">{String(this.state.error?.message || this.state.error)}</p>
        <button onClick={() => window.location.reload()} className="btn-primary w-full py-3 rounded-2xl">
          Reload
        </button>
      </div>
    )
  }
}

export default function Shell() {
  const { pathname } = useLocation()
  const unsent = useUnsent()
  // A new screen starts at its top, not wherever the last one was scrolled to.
  // (Braces matter: newer Chrome returns a Promise from scrollTo, and an effect
  // that returns anything but a function takes the whole screen down.)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <div className="min-h-screen lg:flex">
      <SideNav unsent={unsent} />
      <div className="flex-1 min-w-0">
        <main className="mx-auto w-full max-w-[760px] px-[18px] lg:px-10 pt-[calc(20px+env(safe-area-inset-top))] lg:pt-9 pb-[calc(var(--nav-h)+28px+env(safe-area-inset-bottom))] lg:pb-16">
          <div key={pathname} className="screen-in">
            <ScreenGuard>
              <Outlet />
            </ScreenGuard>
          </div>
        </main>
      </div>
      <BottomNav unsent={unsent} />
      <Toaster />
    </div>
  )
}
