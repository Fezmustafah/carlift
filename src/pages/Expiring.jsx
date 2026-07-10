import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { memberState } from '../lib/status'
import { fmt } from '../lib/dates'
import { waLink, reminderText } from '../lib/wa'
import PaymentModal from '../components/PaymentModal'

function Row({ m, s, cars, onRenew }) {
  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{m.name}</div>
        <div className="text-sm text-stone-500">
          {m.phone} · ends {fmt(s.end)}{' '}
          {s.days < 0 ? `(${Math.abs(s.days)}d ago)` : s.days === 0 ? '(today)' : `(in ${s.days}d)`}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <a
          href={waLink(m.phone, reminderText(m, s.end, s.days))}
          target="_blank"
          rel="noreferrer"
          className="btn-primary px-3 py-1.5 text-sm"
        >
          Remind
        </a>
        <button onClick={() => onRenew(m)} className="btn-ghost px-3 py-1.5 text-sm">
          Renew
        </button>
      </div>
    </div>
  )
}

export default function Expiring() {
  const [members, setMembers] = useState([])
  const [cars, setCars] = useState([])
  const [payFor, setPayFor] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: ms }, { data: cs }] = await Promise.all([
      supabase.from('members').select('*, subscriptions(*)').neq('status', 'left'),
      supabase.from('cars').select('*'),
    ])
    setMembers(ms || [])
    setCars(cs || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const withState = members.map((m) => ({ m, s: memberState(m) }))
  const expired = withState.filter(({ s }) => s.kind === 'expired' && s.days >= -7)
  const urgent = withState.filter(({ s }) => s.kind === 'active' && s.days <= 1)
  const soon = withState.filter(({ s }) => s.kind === 'active' && s.days >= 2 && s.days <= 3)

  const Section = ({ title, tone, items }) =>
    items.length > 0 && (
      <div className="space-y-2">
        <h2 className={`font-bold ${tone}`}>
          {title} ({items.length})
        </h2>
        {items.map(({ m, s }) => (
          <Row key={m.id} m={m} s={s} cars={cars} onRenew={setPayFor} />
        ))}
      </div>
    )

  const empty = !loading && expired.length + urgent.length + soon.length === 0

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Expiring</h1>
      {loading && <p className="text-stone-400 text-center py-8">Loading…</p>}
      {empty && <p className="text-stone-400 text-center py-8">Nothing expiring. All clean. 🎉</p>}
      <Section title="Expired (last 7 days)" tone="text-red-600" items={expired} />
      <Section title="Today / tomorrow" tone="text-amber-600" items={urgent} />
      <Section title="In 2–3 days" tone="text-stone-600" items={soon} />
      {payFor && <PaymentModal member={payFor} cars={cars} onClose={() => setPayFor(null)} onSaved={load} />}
    </div>
  )
}
