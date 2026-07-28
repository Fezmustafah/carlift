import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { memberState } from '../lib/status'
import { fmt } from '../lib/dates'
import { waLink, reminderText } from '../lib/wa'
import PaymentModal from '../components/PaymentModal'

function Row({ m, s, onRenew }) {
  const when =
    s.days < 0 ? `${Math.abs(s.days)} days ago` : s.days === 0 ? 'today' : s.days === 1 ? 'tomorrow' : `in ${s.days} days`
  return (
    <div className="card flex flex-wrap items-center gap-x-3 gap-y-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{m.name}</div>
        <div className="text-sm muted">
          {m.phone} · ends {fmt(s.end)} ·{' '}
          <span style={{ color: s.days < 0 ? 'var(--bad)' : s.days <= 1 ? 'var(--warn)' : 'inherit' }}>{when}</span>
        </div>
      </div>
      <div className="flex gap-2 shrink-0 w-full sm:w-auto">
        <a
          href={waLink(m.phone, reminderText(m, s.end, s.days))}
          target="_blank"
          rel="noreferrer"
          className="btn-primary px-3 py-1.5 text-sm flex-1 sm:flex-none text-center"
        >
          Remind on WhatsApp
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

  const Section = ({ title, color, items }) =>
    items.length > 0 && (
      <div className="space-y-2">
        <h2 className="h2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          {title} <span className="dim font-medium">({items.length})</span>
        </h2>
        {items.map(({ m, s }) => (
          <Row key={m.id} m={m} s={s} onRenew={setPayFor} />
        ))}
      </div>
    )

  const empty = !loading && expired.length + urgent.length + soon.length === 0

  return (
    <div className="space-y-6">
      <h1 className="h1">Expiring</h1>
      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      )}
      {empty && (
        <div className="card text-center py-10 space-y-1">
          <div className="text-3xl">🎉</div>
          <p className="muted">Nothing expiring. All clean.</p>
        </div>
      )}
      <Section title="Already expired (last 7 days)" color="var(--bad)" items={expired} />
      <Section title="Today or tomorrow" color="var(--warn)" items={urgent} />
      <Section title="In 2–3 days" color="var(--muted)" items={soon} />
      {payFor && <PaymentModal member={payFor} cars={cars} onClose={() => setPayFor(null)} onSaved={load} />}
    </div>
  )
}
