import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { memberState } from '../lib/status'
import { waLink } from '../lib/wa'
import StateChip from '../components/StateChip'
import PaymentModal from '../components/PaymentModal'
import MemberModal from '../components/MemberModal'

const FILTERS = ['All', 'Active', 'Pending', 'Expired', 'Left']

export default function Members() {
  const [members, setMembers] = useState([])
  const [cars, setCars] = useState([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('All')
  const [carFilter, setCarFilter] = useState('')
  const [payFor, setPayFor] = useState(null)
  const [editFor, setEditFor] = useState(null)
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: ms }, { data: cs }] = await Promise.all([
      supabase.from('members').select('*, subscriptions(*)').order('created_at', { ascending: false }),
      supabase.from('cars').select('*').order('name'),
    ])
    setMembers(ms || [])
    setCars(cs || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const shown = useMemo(() => {
    return members.filter((m) => {
      const s = memberState(m).kind
      if (filter !== 'All' && s !== filter.toLowerCase()) return false
      if (carFilter && m.car_id !== carFilter) return false
      if (q) {
        const t = (m.name + ' ' + m.phone + ' ' + (m.pickup_point || '')).toLowerCase()
        if (!t.includes(q.toLowerCase())) return false
      }
      return true
    })
  }, [members, q, filter, carFilter])

  const carName = (id) => cars.find((c) => c.id === id)?.name || 'No car'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Members ({members.length})</h1>
        <button onClick={() => setAdding(true)} className="btn-primary">
          + Member
        </button>
      </div>

      <input className="input" placeholder="Search name / phone / pickup…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip ${filter === f ? 'bg-emerald-600 text-white' : 'bg-white border border-stone-300 text-stone-600'}`}
          >
            {f}
          </button>
        ))}
        <select className="chip bg-white border border-stone-300 text-stone-600" value={carFilter} onChange={(e) => setCarFilter(e.target.value)}>
          <option value="">All cars</option>
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-stone-400 text-center py-8">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-stone-400 text-center py-8">No members yet. Riders appear here after scanning the QR, or add manually.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((m) => (
            <div key={m.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{m.name}</span>
                  <StateChip member={m} />
                  {m.source === 'qr' && <span className="chip bg-sky-100 text-sky-700">QR</span>}
                </div>
                <div className="text-sm text-stone-500">
                  {m.phone} · {carName(m.car_id)} · {m.shift}
                  {m.pickup_point ? ` · ${m.pickup_point}` : ''}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setPayFor(m)} className="btn-primary px-3 py-1.5 text-sm">
                  + Payment
                </button>
                <a href={waLink(m.phone, '')} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-sm">
                  WA
                </a>
                <button onClick={() => setEditFor(m)} className="btn-ghost px-3 py-1.5 text-sm">
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {payFor && <PaymentModal member={payFor} cars={cars} onClose={() => setPayFor(null)} onSaved={load} />}
      {(editFor || adding) && (
        <MemberModal
          member={editFor}
          cars={cars}
          onClose={() => {
            setEditFor(null)
            setAdding(false)
          }}
          onSaved={load}
        />
      )}
    </div>
  )
}
