import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { memberState, isActivePaid, ridesShift } from '../lib/status'
import { monthStartISO } from '../lib/dates'

function Stat({ label, value, sub, tone = 'text-stone-900' }) {
  return (
    <div className="card">
      <div className="text-sm text-stone-500">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-0.5">{sub}</div>}
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

  if (loading) return <p className="text-stone-400 text-center py-8">Loading…</p>

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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Active paid members" value={activePaid.length} sub={`${pending.length} pending registration`} />
        <Stat label="Collected this month" value={`AED ${collected.toLocaleString()}`} sub={`${subsThisMonth.length} payments + ${onetime.length} one-time`} tone="text-emerald-700" />
        <Stat label="Expenses this month" value={`AED ${spent.toLocaleString()}`} tone="text-red-600" />
        <Link to="/expiring" className="block">
          <Stat
            label="Needs renewal"
            value={expiringSoon.length + expired7.length}
            sub={`${expiringSoon.length} expiring ≤3d · ${expired7.length} expired`}
            tone={expiringSoon.length + expired7.length > 0 ? 'text-amber-600' : 'text-stone-900'}
          />
        </Link>
      </div>

      <div className="space-y-2">
        <h2 className="font-bold">Cars — paid seats per shift</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {cars.map((c) => {
            const carMembers = activePaid.filter((m) => m.car_id === c.id)
            const morning = carMembers.filter((m) => ridesShift(m, 'morning')).length
            const night = carMembers.filter((m) => ridesShift(m, 'night')).length
            const Shift = ({ label, n }) => {
              const gap = c.seats - n
              return (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-500">{label}</span>
                  <span>
                    <b>{n}</b> / {c.seats} paid
                    {gap > 0 && <span className="text-amber-600"> · {gap} seat{gap === 1 ? '' : 's'} unknown/free</span>}
                  </span>
                </div>
              )
            }
            return (
              <div key={c.id} className="card space-y-2">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-stone-400 -mt-1">Driver: {c.driver_name}</div>
                <Shift label="Morning" n={morning} />
                <Shift label="Night" n={night} />
              </div>
            )
          })}
        </div>
        <p className="text-xs text-stone-400">
          If a car runs full but paid count is low → spot-check that car (count heads at pickup, log it in Logs → Spot checks).
        </p>
      </div>
    </div>
  )
}
