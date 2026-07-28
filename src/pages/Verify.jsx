import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/dates'
import { waLink, declarationText } from '../lib/wa'
import PaymentModal from '../components/PaymentModal'

// What riders said about their own payments (from /checkin), lined up against
// what the office actually has on record. Sorted so the money that never
// arrived is at the top.

const NEAR_DAYS = 12 // a claimed date this close to a recorded payment counts as the same payment

// "Juan  Dela-Cruz" and "juan dela cruz" are the same rider on paper.
function nameKey(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

function daysApart(a, b) {
  if (!a || !b) return Infinity
  return Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000)
}

function classify(d, member) {
  const subs = member?.subscriptions || []
  const matched = subs.some(
    (s) =>
      daysApart(s.start_date, d.paid_when) <= NEAR_DAYS ||
      daysApart((s.created_at || '').slice(0, 10), d.paid_when) <= NEAR_DAYS ||
      (d.paid_when && s.start_date <= d.paid_when && d.paid_when <= s.end_date)
  )
  if (d.paid === 'yes' && d.paid_to === 'driver') return 'driver'
  if (d.paid === 'yes' && !matched) return 'ghost'
  if (d.paid === 'yes') return 'match'
  return 'unpaid'
}

const BUCKETS = [
  {
    key: 'driver',
    title: 'Paid the driver',
    blurb: 'Money left the rider but never reached the office. Check each one with the driver.',
    color: 'var(--bad)',
  },
  {
    key: 'ghost',
    title: 'Says paid — nothing in your records',
    blurb: 'Either your record is missing it, or the payment did not happen. Ask for the screenshot.',
    color: 'var(--bad)',
  },
  {
    key: 'unpaid',
    title: 'Not paid yet',
    blurb: 'Collect from these between 5 and 10 August.',
    color: 'var(--warn)',
  },
  {
    key: 'match',
    title: 'Matches your records',
    blurb: 'Nothing to do.',
    color: 'var(--ok)',
  },
]

export default function Verify() {
  const [decls, setDecls] = useState([])
  const [members, setMembers] = useState([])
  const [cars, setCars] = useState([])
  const [showResolved, setShowResolved] = useState(false)
  const [payFor, setPayFor] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [d, m, c] = await Promise.all([
      supabase.from('declarations').select('*').order('created_at', { ascending: false }),
      supabase.from('members').select('*, subscriptions(*)'),
      supabase.from('cars').select('*').order('name'),
    ])
    setDecls(d.data || [])
    setMembers(m.data || [])
    setCars(c.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleResolved(d) {
    setDecls((rows) => rows.map((r) => (r.id === d.id ? { ...r, resolved: !r.resolved } : r)))
    const { error } = await supabase.from('declarations').update({ resolved: !d.resolved }).eq('id', d.id)
    if (error) load() // put it back if the write failed
  }

  const rows = useMemo(() => {
    const byPhone = new Map(members.map((m) => [m.phone, m]))
    // The old paper register has names, not phone numbers, so a rider seeded
    // from it will not match on phone. Fall back to the name.
    const byName = new Map()
    for (const m of members) {
      const k = nameKey(m.name)
      if (k && !byName.has(k)) byName.set(k, m)
    }
    return decls.map((d) => {
      const byPhoneHit = byPhone.get(d.phone) || null
      const member = byPhoneHit || byName.get(nameKey(d.name)) || null
      return {
        d,
        member,
        matchedByName: Boolean(!byPhoneHit && member),
        car: cars.find((c) => c.id === d.car_id) || null,
        bucket: classify(d, member),
      }
    })
  }, [decls, members, cars])

  const visible = showResolved ? rows : rows.filter((r) => !r.d.resolved)
  const leak = rows
    .filter((r) => r.bucket === 'driver' && !r.d.resolved)
    .reduce((t, r) => t + Number(r.d.amount || 0), 0)
  const ghost = rows
    .filter((r) => r.bucket === 'ghost' && !r.d.resolved)
    .reduce((t, r) => t + Number(r.d.amount || 0), 0)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-7 w-40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h1">Verify</h1>
        <button onClick={() => setShowResolved((v) => !v)} className={`pill ${showResolved ? 'pill-on' : ''}`}>
          {showResolved ? 'Showing all' : 'Hiding done'}
        </button>
      </div>

      {decls.length === 0 ? (
        <div className="card text-center py-10 space-y-1">
          <div className="text-3xl">📥</div>
          <p className="muted">No check-ins yet.</p>
          <p className="text-sm dim">Send the check-in link to the rider groups — answers land here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card">
              <div className="text-sm muted">Check-ins received</div>
              <div className="text-2xl font-bold">{decls.length}</div>
            </div>
            <div className="card">
              <div className="text-sm muted">Claimed paid to drivers</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--bad)' }}>
                AED {leak.toLocaleString()}
              </div>
              <div className="text-xs dim">{rows.filter((r) => r.bucket === 'driver').length} riders</div>
            </div>
            <div className="card">
              <div className="text-sm muted">Claimed paid, no record</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--bad)' }}>
                AED {ghost.toLocaleString()}
              </div>
              <div className="text-xs dim">{rows.filter((r) => r.bucket === 'ghost').length} riders</div>
            </div>
            <div className="card">
              <div className="text-sm muted">Still to collect</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--warn)' }}>
                {rows.filter((r) => r.bucket === 'unpaid').length}
              </div>
              <div className="text-xs dim">riders said not paid</div>
            </div>
          </div>

          {BUCKETS.map((b) => {
            const items = visible.filter((r) => r.bucket === b.key)
            if (items.length === 0) return null
            return (
              <div key={b.key} className="space-y-2">
                <div>
                  <h2 className="h2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: b.color }} />
                    {b.title} <span className="dim font-medium">({items.length})</span>
                  </h2>
                  <p className="text-xs dim">{b.blurb}</p>
                </div>

                {items.map(({ d, member, car, matchedByName }) => {
                  const subs = member?.subscriptions || []
                  const lastSub = subs.slice().sort((x, y) => (x.end_date < y.end_date ? 1 : -1))[0]
                  return (
                    <div key={d.id} className={`card space-y-3 ${d.resolved ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-semibold flex items-center gap-2 flex-wrap">
                            {d.name}
                            {!member && <span className="chip chip-info">not on your list</span>}
                            {matchedByName && <span className="chip chip-warn">matched by name, check it</span>}
                            {d.resolved && <span className="chip chip-mute">done</span>}
                          </div>
                          <div className="text-sm muted">
                            {d.phone}
                            {car ? ` · ${car.name}` : ''}
                            {d.shift ? ` · ${d.shift}` : ''}
                            {d.plan_pref ? ` · ${d.plan_pref}` : ''}
                          </div>
                        </div>
                        <div className="text-xs dim shrink-0">{fmt((d.created_at || '').slice(0, 10))}</div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div className="sunken p-3">
                          <div className="text-xs dim mb-0.5">Rider says</div>
                          {d.paid === 'yes' ? (
                            <>
                              Paid {d.amount ? `AED ${Number(d.amount).toLocaleString()}` : '(amount not given)'} on{' '}
                              {fmt(d.paid_when)}
                              <br />
                              to{' '}
                              <b>
                                {d.paid_to === 'driver'
                                  ? `the driver${car ? ` — ${car.driver_name}` : ''}`
                                  : d.paid_to === 'office'
                                    ? 'the office (cash)'
                                    : d.paid_to === 'transfer'
                                      ? 'bank transfer'
                                      : 'not sure'}
                              </b>
                            </>
                          ) : d.paid === 'no' ? (
                            'Has not paid yet'
                          ) : (
                            'Not sure whether they paid'
                          )}
                        </div>
                        <div className="sunken p-3">
                          <div className="text-xs dim mb-0.5">Your records</div>
                          {!member ? (
                            'No member row — this person was not on your list at all.'
                          ) : subs.length === 0 ? (
                            'No payment ever recorded for this rider.'
                          ) : (
                            <>
                              {subs.length} payment{subs.length === 1 ? '' : 's'} · last{' '}
                              {lastSub ? `AED ${Number(lastSub.amount).toLocaleString()}` : '—'}
                              {lastSub ? `, ${fmt(lastSub.start_date)} → ${fmt(lastSub.end_date)}` : ''}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={waLink(d.phone, declarationText(d, car?.driver_name))}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-primary px-3 py-1.5 text-sm"
                        >
                          Ask on WhatsApp
                        </a>
                        {member && (
                          <button onClick={() => setPayFor(member)} className="btn-ghost px-3 py-1.5 text-sm">
                            + Record payment
                          </button>
                        )}
                        <button onClick={() => toggleResolved(d)} className="btn-ghost px-3 py-1.5 text-sm ml-auto">
                          {d.resolved ? 'Undo' : '✓ Mark done'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {visible.length === 0 && (
            <div className="card text-center py-10 space-y-1">
              <div className="text-3xl">✅</div>
              <p className="muted">Every check-in is handled.</p>
            </div>
          )}
        </>
      )}

      {payFor && <PaymentModal member={payFor} cars={cars} onClose={() => setPayFor(null)} onSaved={load} />}
    </div>
  )
}
