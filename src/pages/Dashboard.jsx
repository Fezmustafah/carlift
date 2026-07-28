import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { memberState, isActivePaid, ridesShift } from '../lib/status'
import { monthStartISO } from '../lib/dates'

function Tile({ label, value, sub, tone, to }) {
  const body = (
    <div className="card h-full">
      <div className="text-sm muted">{label}</div>
      <div className="text-2xl font-bold mt-0.5" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs dim mt-0.5">{sub}</div>}
    </div>
  )
  return to ? (
    <Link to={to} className="block transition active:scale-[0.99]">
      {body}
    </Link>
  ) : (
    body
  )
}

function Shift({ label, n, seats }) {
  const pct = seats > 0 ? Math.min(100, Math.round((n / seats) * 100)) : 0
  const gap = Math.max(0, seats - n)
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="muted">{label}</span>
        <span>
          <b>{n}</b>
          <span className="muted"> / {seats} paid</span>
        </span>
      </div>
      <div className="bar">
        <div className={`bar-fill ${pct < 50 ? 'bar-fill-warn' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      {gap > 0 && (
        <div className="text-xs" style={{ color: 'var(--warn)' }}>
          {gap} seat{gap === 1 ? '' : 's'} unknown or free
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [members, setMembers] = useState([])
  const [cars, setCars] = useState([])
  const [onetime, setOnetime] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ms = monthStartISO()
    Promise.all([
      supabase.from('members').select('*, subscriptions(*)'),
      supabase.from('cars').select('*').order('name'),
      supabase.from('onetime_rides').select('*').gte('date', ms),
      supabase.from('expenses').select('*').gte('date', ms),
    ]).then(([m, c, o, e]) => {
      setMembers(m.data || [])
      setCars(c.data || [])
      setOnetime(o.data || [])
      setExpenses(e.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-7 w-40" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      </div>
    )
  }

  const ms = monthStartISO()
  const activePaid = members.filter(isActivePaid)
  const pending = members.filter((m) => memberState(m).kind === 'pending')
  const expiringSoon = members.filter((m) => {
    const s = memberState(m)
    return s.kind === 'active' && s.days <= 3
  })
  const expired7 = members.filter((m) => {
    const s = memberState(m)
    return s.kind === 'expired' && s.days >= -7
  })

  const subsThisMonth = members
    .flatMap((m) => m.subscriptions || [])
    .filter((s) => (s.created_at || '').slice(0, 10) >= ms)
  const collected =
    subsThisMonth.reduce((t, s) => t + Number(s.amount), 0) + onetime.reduce((t, o) => t + Number(o.amount), 0)
  const spent = expenses.reduce((t, e) => t + Number(e.amount), 0)
  const needRenew = expiringSoon.length + expired7.length

  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' })

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="h1">Dashboard</h1>
        <span className="text-sm dim">{monthName}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Active paid riders"
          value={activePaid.length}
          sub={`${members.length} on record`}
          to="/members"
        />
        <Tile
          label="Waiting to be set up"
          value={pending.length}
          sub="registered, no payment yet"
          tone={pending.length > 0 ? 'var(--warn)' : undefined}
          to="/members?f=Pending"
        />
        <Tile
          label="Collected this month"
          value={`AED ${collected.toLocaleString()}`}
          sub={`${subsThisMonth.length} payments · ${onetime.length} one-time`}
          tone="var(--ok)"
        />
        <Tile
          label="Needs renewal"
          value={needRenew}
          sub={`${expiringSoon.length} ending ≤3d · ${expired7.length} expired`}
          tone={needRenew > 0 ? 'var(--warn)' : undefined}
          to="/expiring"
        />
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm muted">Expenses this month</div>
          <div className="text-xl font-bold" style={{ color: 'var(--bad)' }}>
            AED {spent.toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm muted">Net</div>
          <div
            className="text-xl font-bold"
            style={{ color: collected - spent >= 0 ? 'var(--ok)' : 'var(--bad)' }}
          >
            AED {(collected - spent).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="h2">Seats paid, per car</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {cars.map((c) => {
            const carMembers = activePaid.filter((m) => m.car_id === c.id)
            const morning = carMembers.filter((m) => ridesShift(m, 'morning')).length
            const night = carMembers.filter((m) => ridesShift(m, 'night')).length
            return (
              <div key={c.id} className="card space-y-3">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs dim">
                    {c.driver_name} · {c.seats} seats
                  </div>
                </div>
                <Shift label="Morning" n={morning} seats={c.seats} />
                <Shift label="Night" n={night} seats={c.seats} />
              </div>
            )
          })}
          {cars.length === 0 && <p className="muted text-sm">No cars in the database yet.</p>}
        </div>
        <p className="text-xs dim">
          Car runs full but the paid count is low? Spot-check it — count heads at pickup, then log it in Logs → Spot
          checks.
        </p>
      </div>
    </div>
  )
}
