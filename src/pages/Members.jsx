import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { memberState } from '../lib/status'
import { waLink } from '../lib/wa'
import StateChip from '../components/StateChip'
import PaymentModal from '../components/PaymentModal'
import MemberModal from '../components/MemberModal'
import MergeModal from '../components/MergeModal'

const FILTERS = ['All', 'Pending', 'Active', 'Expired', 'Left']

const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

export default function Members() {
  const [params, setParams] = useSearchParams()
  const [members, setMembers] = useState([])
  const [cars, setCars] = useState([])
  const [q, setQ] = useState('')
  const filter = FILTERS.includes(params.get('f')) ? params.get('f') : 'All'
  const [carFilter, setCarFilter] = useState('')
  const [payFor, setPayFor] = useState(null)
  const [editFor, setEditFor] = useState(null)
  const [adding, setAdding] = useState(false)
  const [merging, setMerging] = useState(false)
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

  const counts = useMemo(() => {
    const c = { All: members.length, Pending: 0, Active: 0, Expired: 0, Left: 0 }
    for (const m of members) {
      const k = memberState(m).kind
      const key = k[0].toUpperCase() + k.slice(1)
      if (key in c) c[key] += 1
    }
    return c
  }, [members])

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
  const setFilter = (f) => setParams(f === 'All' ? {} : { f }, { replace: true })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="h1">Members</h1>
        <div className="flex gap-2">
          <button onClick={() => setMerging(true)} className="btn-ghost">
            Duplicates
          </button>
          <button onClick={() => setAdding(true)} className="btn-primary">
            + Member
          </button>
        </div>
      </div>

      <input
        className="input"
        placeholder="Search name, phone or pickup…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`pill ${filter === f ? 'pill-on' : ''}`}>
            {f} <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
        <select
          className="pill"
          value={carFilter}
          onChange={(e) => setCarFilter(e.target.value)}
          style={{ paddingRight: '0.75rem' }}
        >
          <option value="">All cars</option>
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="card text-center py-10 space-y-1">
          <div className="text-3xl">🪑</div>
          <p className="muted">Nobody here.</p>
          <p className="text-sm dim">Riders land here after they scan the QR, or add one manually.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((m) => (
            <div key={m.id} className="card flex flex-wrap items-center gap-x-3 gap-y-3">
              <div className="avatar w-10 h-10 text-sm">{initials(m.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold truncate">{m.name}</span>
                  <StateChip member={m} />
                  {m.source === 'qr' && <span className="chip chip-info">QR</span>}
                </div>
                <div className="text-sm muted truncate">
                  {m.phone || 'no number yet'} · {carName(m.car_id)} · {m.shift}
                  {m.gender ? ` · ${m.gender === 'female' ? 'F' : 'M'}` : ''}
                  {m.pickup_point ? ` · ${m.pickup_point}` : ''}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                <button onClick={() => setPayFor(m)} className="btn-primary px-3 py-1.5 text-sm flex-1 sm:flex-none">
                  + Payment
                </button>
                {m.phone && (
                  <a
                    href={waLink(m.phone, '')}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost px-3 py-1.5 text-sm"
                  >
                    WhatsApp
                  </a>
                )}
                <button onClick={() => setEditFor(m)} className="btn-ghost px-3 py-1.5 text-sm">
                  Edit
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs dim text-center pt-1">
            {shown.length} of {members.length} shown
          </p>
        </div>
      )}

      {merging && <MergeModal members={members} cars={cars} onClose={() => setMerging(false)} onSaved={load} />}
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
