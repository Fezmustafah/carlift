import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayISO, fmt } from '../lib/dates'
import { memberState } from '../lib/status'
import { monthKey, monthRange, monthLabel, lastMonths } from '../lib/month'

// Month-end close: what came in, what went out, and who still owes — per car,
// so each driver's book can be read on its own.

function Money({ label, value, color, sub }) {
  return (
    <div className="card">
      <div className="text-sm muted">{label}</div>
      <div className="text-2xl font-bold" style={color ? { color } : undefined}>
        AED {Number(value).toLocaleString()}
      </div>
      {sub && <div className="text-xs dim mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Report() {
  const [month, setMonth] = useState(monthKey())
  const [members, setMembers] = useState([])
  const [cars, setCars] = useState([])
  const [onetime, setOnetime] = useState([])
  const [expenses, setExpenses] = useState([])
  const [decls, setDecls] = useState([])
  const [takings, setTakings] = useState([])
  const [loading, setLoading] = useState(true)

  const { start, end } = useMemo(() => monthRange(month), [month])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('members').select('*, subscriptions(*)'),
      supabase.from('cars').select('*').order('name'),
      supabase.from('onetime_rides').select('*').gte('date', start).lte('date', end),
      supabase.from('expenses').select('*').gte('date', start).lte('date', end),
      supabase.from('declarations').select('*'),
      supabase.from('takings').select('*').gte('taken_on', start).lte('taken_on', end),
    ]).then(([m, c, o, e, d, t]) => {
      setMembers(m.data || [])
      setCars(c.data || [])
      setOnetime(o.data || [])
      setExpenses(e.data || [])
      setDecls(d.data || [])
      setTakings(t.data || [])
      setLoading(false)
    })
  }, [start, end])

  const stats = useMemo(() => {
    const inMonth = (iso) => iso && iso >= start && iso <= end

    // A payment counts in the month it was taken, not the month it covers.
    const subs = []
    for (const m of members)
      for (const s of m.subscriptions || [])
        if (inMonth((s.created_at || '').slice(0, 10))) subs.push({ ...s, member: m })

    const collectedSubs = subs.reduce((t, s) => t + Number(s.amount), 0)
    const collectedOnetime = onetime.reduce((t, o) => t + Number(o.amount), 0)
    const spent = expenses.reduce((t, e) => t + Number(e.amount), 0)

    // Fast-lane cash. Once a taking has been put on a rider's record it is
    // already inside collectedSubs — only the loose ones are added here, or the
    // same money would be counted twice.
    const openTakings = takings.filter((t) => !t.subscription_id)
    const collectedFast = openTakings.reduce((t, r) => t + Number(r.amount), 0)

    const perCar = cars.map((c) => {
      const carSubs = subs.filter((s) => s.member.car_id === c.id)
      return {
        car: c,
        payments: carSubs.length,
        riders: new Set(carSubs.map((s) => s.member_id)).size,
        amount: carSubs.reduce((t, s) => t + Number(s.amount), 0),
        onetime: onetime.filter((o) => o.car_id === c.id).reduce((t, o) => t + Number(o.amount), 0),
        expenses: expenses.filter((e) => e.car_id === c.id).reduce((t, e) => t + Number(e.amount), 0),
      }
    })
    const noCarSubs = subs.filter((s) => !s.member.car_id)

    // Declarations that were about this month.
    const monthDecls = decls.filter((d) => d.for_month === month)
    const claimedToDriver = monthDecls.filter((d) => d.paid === 'yes' && d.paid_to === 'driver')
    const claimedToDriverTotal = claimedToDriver.reduce((t, d) => t + Number(d.amount || 0), 0)
    const saidNotPaid = monthDecls.filter((d) => d.paid !== 'yes').length

    // Who was never paid up during the month.
    const paidMemberIds = new Set(subs.map((s) => s.member_id))
    const unpaid = members.filter((m) => m.status !== 'left' && !paidMemberIds.has(m.id))

    return {
      subs,
      collectedSubs,
      collectedOnetime,
      openTakings,
      collectedFast,
      collected: collectedSubs + collectedOnetime + collectedFast,
      spent,
      perCar,
      noCarSubs,
      monthDecls,
      claimedToDriver,
      claimedToDriverTotal,
      saidNotPaid,
      unpaid,
    }
  }, [members, cars, onetime, expenses, decls, takings, month, start, end])

  function exportCsv() {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['section', 'name', 'car', 'amount', 'plan', 'start', 'end', 'taken_on'],
      ...stats.subs.map((s) => [
        'payment',
        s.member.name,
        cars.find((c) => c.id === s.member.car_id)?.name || '',
        s.amount,
        s.plan_type,
        s.start_date,
        s.end_date,
        (s.created_at || '').slice(0, 10),
      ]),
      ...onetime.map((o) => [
        'one-time',
        o.note || '',
        cars.find((c) => c.id === o.car_id)?.name || '',
        o.amount,
        '',
        o.date,
        '',
        o.date,
      ]),
      ...expenses.map((e) => [
        'expense',
        e.category + (e.note ? ` — ${e.note}` : ''),
        cars.find((c) => c.id === e.car_id)?.name || '',
        -e.amount,
        '',
        e.date,
        '',
        e.date,
      ]),
      ...stats.openTakings.map((t) => [
        'fast lane',
        t.name,
        cars.find((c) => c.id === t.car_id)?.name || '',
        t.amount,
        t.method,
        t.taken_on,
        '',
        t.taken_on,
      ]),
      ...stats.unpaid.map((m) => [
        'did not pay',
        m.name,
        cars.find((c) => c.id === m.car_id)?.name || '',
        0,
        '',
        '',
        '',
        '',
      ]),
    ]
    const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `carlift-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const net = stats.collected - stats.spent

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h1">Month report</h1>
        <div className="flex gap-2">
          <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
            {lastMonths(12).map((k) => (
              <option key={k} value={k}>
                {monthLabel(k)}
              </option>
            ))}
          </select>
          <button onClick={exportCsv} className="btn-ghost">
            ⬇ CSV
          </button>
          <button onClick={() => window.print()} className="btn-ghost">
            🖨
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold">{monthLabel(month)}</h2>
        <p className="text-sm dim">
          {fmt(start)} → {fmt(end)}
          {month === monthKey() ? ` · still running, ${fmt(todayISO())} so far` : ''}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Money
              label="Collected"
              value={stats.collected}
              color="var(--ok)"
              sub={`${stats.subs.length} payments · ${onetime.length} one-time${
                stats.openTakings.length ? ` · ${stats.openTakings.length} fast lane` : ''
              }`}
            />
            <Money label="Expenses" value={stats.spent} color="var(--bad)" sub={`${expenses.length} entries`} />
            <Money label="Net" value={net} color={net >= 0 ? 'var(--ok)' : 'var(--bad)'} />
            <div className="card">
              <div className="text-sm muted">Riders who paid</div>
              <div className="text-2xl font-bold">{new Set(stats.subs.map((s) => s.member_id)).size}</div>
              <div className="text-xs dim mt-0.5">{stats.unpaid.length} did not pay</div>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="h2">Per car</h2>
            <div className="card">
              <div className="grid grid-cols-4 gap-2 text-xs dim pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <span>Car</span>
                <span className="text-right">Riders</span>
                <span className="text-right">Collected</span>
                <span className="text-right">Expenses</span>
              </div>
              {stats.perCar.map((r) => (
                <div key={r.car.id} className="grid grid-cols-4 gap-2 text-sm py-2 divide-row">
                  <span className="truncate">
                    {r.car.name}
                    <span className="dim"> · {r.car.driver_name}</span>
                  </span>
                  <span className="text-right">{r.riders}</span>
                  <span className="text-right font-semibold" style={{ color: 'var(--ok)' }}>
                    {(r.amount + r.onetime).toLocaleString()}
                  </span>
                  <span className="text-right" style={{ color: 'var(--bad)' }}>
                    {r.expenses.toLocaleString()}
                  </span>
                </div>
              ))}
              {stats.noCarSubs.length > 0 && (
                <div className="grid grid-cols-4 gap-2 text-sm py-2 divide-row">
                  <span className="muted">No car assigned</span>
                  <span className="text-right">{new Set(stats.noCarSubs.map((s) => s.member_id)).size}</span>
                  <span className="text-right font-semibold">
                    {stats.noCarSubs.reduce((t, s) => t + Number(s.amount), 0).toLocaleString()}
                  </span>
                  <span className="text-right">—</span>
                </div>
              )}
            </div>
          </div>

          {stats.openTakings.length > 0 && (
            <div className="card flex items-center gap-3" style={{ borderColor: 'var(--warn)' }}>
              <span className="text-2xl">⚡</span>
              <div className="flex-1 text-sm">
                <b>AED {stats.collectedFast.toLocaleString()}</b> from {stats.openTakings.length} fast-lane
                rider{stats.openTakings.length === 1 ? '' : 's'} is counted in the total but not yet on anybody's
                record — so they still show as unpaid below. Match them on the Fast lane screen.
              </div>
            </div>
          )}

          {stats.monthDecls.length > 0 && (
            <div className="space-y-2">
              <h2 className="h2">What riders said about {monthLabel(month).split(' ')[0]}</h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="card">
                  <div className="text-sm muted">Check-ins</div>
                  <div className="text-2xl font-bold">{stats.monthDecls.length}</div>
                </div>
                <div className="card">
                  <div className="text-sm muted">Claimed paid to a driver</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--bad)' }}>
                    AED {stats.claimedToDriverTotal.toLocaleString()}
                  </div>
                  <div className="text-xs dim mt-0.5">{stats.claimedToDriver.length} riders</div>
                </div>
                <div className="card">
                  <div className="text-sm muted">Said not paid</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--warn)' }}>
                    {stats.saidNotPaid}
                  </div>
                </div>
              </div>
            </div>
          )}

          {stats.unpaid.length > 0 && (
            <div className="space-y-2">
              <h2 className="h2">
                No payment recorded in {monthLabel(month).split(' ')[0]}{' '}
                <span className="dim font-medium">({stats.unpaid.length})</span>
              </h2>
              <div className="card">
                {stats.unpaid.map((m) => (
                  <div key={m.id} className="flex justify-between gap-3 text-sm py-1.5 divide-row">
                    <span className="truncate">
                      {m.name}
                      <span className="dim"> · {cars.find((c) => c.id === m.car_id)?.name || 'no car'}</span>
                    </span>
                    <span className="muted shrink-0">{memberState(m).kind}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
