import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { memberState, latestEnd } from '../lib/status'
import { todayISO, addDays, planEnd, daysLeft, fmt } from '../lib/dates'
import { waLink, receiptText } from '../lib/wa'
import StateChip from '../components/StateChip'
import MemberModal from '../components/MemberModal'

// Standing at the pickup point with cash in hand, one rider after another.
// Everything here is built for speed: no modal, no typing unless the amount is
// unusual, and the receipt goes out the moment the payment is saved.

const FALLBACK_AMOUNTS = [200, 300, 400, 500]

function PayRow({ member, cars, presets, onSaved }) {
  const prevEnd = latestEnd(member)
  const stillRunning = prevEnd && daysLeft(prevEnd) >= 0
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState(member.plan_pref === '15d' ? '15d' : '30d')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(null)

  const start = stillRunning ? addDays(prevEnd, 1) : todayISO()
  const end = planEnd(start, plan)
  const carName = cars.find((c) => c.id === member.car_id)?.name

  async function save(value) {
    const amt = Number(value ?? amount)
    if (!amt || amt <= 0) return setErr('Enter the amount')
    if (busy) return
    setBusy(true)
    setErr('')
    const sub = {
      member_id: member.id,
      plan_type: plan,
      amount: amt,
      start_date: start,
      end_date: end,
      paid_via: 'cash',
    }
    const { error } = await supabase.from('subscriptions').insert(sub)
    if (error) {
      setErr(error.message)
      setBusy(false)
      return
    }
    if (member.status !== 'active') await supabase.from('members').update({ status: 'active' }).eq('id', member.id)
    setSaved(sub)
    setBusy(false)
    onSaved(amt)
  }

  if (saved) {
    return (
      <div className="card flex items-center gap-3" style={{ borderColor: 'var(--ok)' }}>
        <span className="text-xl">✅</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{member.name}</div>
          <div className="text-sm muted">
            AED {saved.amount} · {fmt(saved.start_date)} → {fmt(saved.end_date)}
          </div>
        </div>
        {member.phone ? (
          <a
            href={waLink(member.phone, receiptText(member, saved, carName))}
            target="_blank"
            rel="noreferrer"
            className="btn-primary px-3 py-1.5 text-sm shrink-0"
          >
            Send receipt
          </a>
        ) : (
          <span className="chip chip-warn shrink-0">no number — no receipt</span>
        )}
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{member.name}</div>
          <div className="text-sm muted truncate">
            {member.phone || 'no number yet — ask for it'}
            {member.gender ? ` · ${member.gender === 'female' ? 'F' : 'M'}` : ''}
          </div>
        </div>
        <StateChip member={member} />
      </button>

      {open && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {['15d', '30d'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                className="rounded-xl py-2.5 font-semibold transition"
                style={{
                  border: `2px solid ${plan === p ? 'var(--brand)' : 'var(--border-strong)'}`,
                  background: plan === p ? 'var(--brand-soft)' : 'var(--surface)',
                  color: plan === p ? 'var(--brand-soft-fg)' : 'var(--text)',
                }}
              >
                {p === '15d' ? '15 days' : '30 days'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {presets.map((v) => (
              <button key={v} onClick={() => save(v)} disabled={busy} className="btn-primary px-3 py-2 text-sm">
                AED {v}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="number"
              inputMode="decimal"
              min="1"
              placeholder="Other amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button onClick={() => save()} disabled={busy} className="btn-primary px-4">
              {busy ? '…' : 'Save'}
            </button>
          </div>

          <p className="text-xs dim">
            {fmt(start)} → {fmt(end)}
            {stillRunning ? ' · starts after the current plan' : ''}
          </p>
          {err && (
            <p className="text-sm" style={{ color: 'var(--bad)' }}>
              {err}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function Collect() {
  const [members, setMembers] = useState([])
  const [cars, setCars] = useState([])
  const [carFilter, setCarFilter] = useState('')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [session, setSession] = useState({ count: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: ms }, { data: cs }] = await Promise.all([
      supabase.from('members').select('*, subscriptions(*)').neq('status', 'left').order('name'),
      supabase.from('cars').select('*').order('name'),
    ])
    setMembers(ms || [])
    setCars(cs || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Offer the amounts actually being charged, most used first.
  const presets = useMemo(() => {
    const counts = new Map()
    for (const m of members)
      for (const s of m.subscriptions || []) {
        const v = Number(s.amount)
        if (v > 0) counts.set(v, (counts.get(v) || 0) + 1)
      }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v]) => v)
    return top.length ? top.sort((a, b) => a - b) : FALLBACK_AMOUNTS
  }, [members])

  const shown = useMemo(() => {
    const list = members.filter((m) => {
      if (carFilter && m.car_id !== carFilter) return false
      if (q) {
        const t = (m.name + ' ' + m.phone).toLowerCase()
        if (!t.includes(q.toLowerCase())) return false
      }
      return true
    })
    // People who owe money first — that is who the queue is made of.
    const rank = (m) => {
      const k = memberState(m).kind
      return k === 'pending' ? 0 : k === 'expired' ? 1 : 2
    }
    return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }, [members, carFilter, q])

  const owing = shown.filter((m) => memberState(m).kind !== 'active').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h1">Collect</h1>
        <button onClick={() => setAdding(true)} className="btn-primary">
          + New rider
        </button>
      </div>

      <div className="card flex items-center justify-between gap-3">
        <div>
          <div className="text-sm muted">Collected on this screen</div>
          <div className="text-2xl font-bold" style={{ color: 'var(--ok)' }}>
            AED {session.total.toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm muted">Payments</div>
          <div className="text-2xl font-bold">{session.count}</div>
        </div>
      </div>

      <input
        className="input"
        placeholder="Search name or phone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setCarFilter('')} className={`pill ${carFilter === '' ? 'pill-on' : ''}`}>
          All
        </button>
        {cars.map((c) => (
          <button key={c.id} onClick={() => setCarFilter(c.id)} className={`pill ${carFilter === c.id ? 'pill-on' : ''}`}>
            {c.name}
          </button>
        ))}
      </div>

      <p className="text-sm muted">
        {shown.length} rider{shown.length === 1 ? '' : 's'} · <b>{owing}</b> still to pay. Tap a name to take payment.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((m) => (
            <PayRow
              key={m.id}
              member={m}
              cars={cars}
              presets={presets}
              onSaved={(amt) => setSession((s) => ({ count: s.count + 1, total: s.total + amt }))}
            />
          ))}
          {shown.length === 0 && <p className="muted text-center py-8">Nobody matches that.</p>}
        </div>
      )}

      {adding && <MemberModal member={null} cars={cars} onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  )
}
