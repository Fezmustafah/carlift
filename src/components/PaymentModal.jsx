import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayISO, addDays, planEnd, daysLeft, fmt } from '../lib/dates'
import { latestEnd } from '../lib/status'
import { waLink, receiptText } from '../lib/wa'

export default function PaymentModal({ member, cars, onClose, onSaved }) {
  const prevEnd = latestEnd(member)
  const stillRunning = prevEnd && daysLeft(prevEnd) >= 0
  const defaultStart = stillRunning ? addDays(prevEnd, 1) : todayISO()

  const [plan, setPlan] = useState(member.plan_pref === '15d' ? '15d' : '30d')
  const [amount, setAmount] = useState('')
  const [start, setStart] = useState(defaultStart)
  const [paidVia, setPaidVia] = useState('cash')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(null)

  const end = planEnd(start, plan)
  const carName = cars.find((c) => c.id === member.car_id)?.name

  async function save(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    const sub = {
      member_id: member.id,
      plan_type: plan,
      amount: Number(amount),
      start_date: start,
      end_date: end,
      paid_via: paidVia,
    }
    const { error } = await supabase.from('subscriptions').insert(sub)
    if (error) {
      setErr(error.message)
      setBusy(false)
      return
    }
    if (member.status !== 'active') {
      await supabase.from('members').update({ status: 'active' }).eq('id', member.id)
    }
    setSaved(sub)
    setBusy(false)
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/50 grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-md p-5 space-y-4 pop-in my-8" onClick={(e) => e.stopPropagation()}>
        {saved ? (
          <div className="text-center space-y-4 py-2">
            <div className="text-4xl">✅</div>
            <div>
              <p className="font-semibold">Payment saved — {member.name}</p>
              <p className="text-sm muted">
                AED {saved.amount} · {fmt(saved.start_date)} → {fmt(saved.end_date)}
              </p>
            </div>
            <a
              href={waLink(member.phone, receiptText(member, saved, carName))}
              target="_blank"
              rel="noreferrer"
              className="btn-primary block"
            >
              Send receipt on WhatsApp
            </a>
            <button onClick={onClose} className="btn-ghost w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Payment — {member.name}</h2>
              {stillRunning && (
                <p className="text-xs muted mt-0.5">
                  Current plan runs to {fmt(prevEnd)} — the new one starts the day after.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['15d', '30d'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(p)}
                  className="rounded-xl py-3 font-semibold transition"
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

            <div>
              <label className="label">Amount (AED)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start</label>
                <input
                  className="input"
                  type="date"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Ends</label>
                <div className="input sunken">{fmt(end)}</div>
              </div>
            </div>

            <div>
              <label className="label">Paid via</label>
              <select className="input" value={paidVia} onChange={(e) => setPaidVia(e.target.value)}>
                <option value="cash">Cash to office</option>
                <option value="card">Card</option>
                <option value="transfer">Bank transfer</option>
                <option value="link">Payment link</option>
              </select>
            </div>

            {err && (
              <p className="text-sm" style={{ color: 'var(--bad)' }}>
                {err}
              </p>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-ghost flex-1">
                Cancel
              </button>
              <button disabled={busy} className="btn-primary flex-1">
                {busy ? 'Saving…' : 'Save payment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
