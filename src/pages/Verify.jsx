import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/dates'
import { waLink, declarationText, driverClaimMessage, monthName } from '../lib/wa'
import { copyText } from '../lib/clipboard'
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

// A subscription that runs across the month the rider is talking about.
function coversMonth(sub, monthKey) {
  if (!monthKey || !sub.start_date || !sub.end_date) return false
  return sub.start_date.slice(0, 7) <= monthKey && monthKey <= sub.end_date.slice(0, 7)
}

// Old check-ins asked when the payment was made; the short form does not, so
// those rows are matched by the month they are about instead.
function hasRecordFor(member, d, monthKey) {
  const subs = member?.subscriptions || []
  if (d.paid_when && monthKey === d.for_month) {
    return subs.some(
      (s) =>
        daysApart(s.start_date, d.paid_when) <= NEAR_DAYS ||
        daysApart((s.created_at || '').slice(0, 10), d.paid_when) <= NEAR_DAYS ||
        (s.start_date <= d.paid_when && d.paid_when <= s.end_date)
    )
  }
  return subs.some((s) => coversMonth(s, monthKey))
}

// "no" for last month with nothing on record = money still to collect today,
// even from a rider who is straight for this month.
function owesPrev(d, member) {
  return d.paid_prev === 'no' && !hasRecordFor(member, d, d.prev_month)
}

function classify(d, member) {
  // The short form asks who last month's money went to; the old long form
  // asked about the declared month. Either answer means the same thing: the
  // cash stopped at the driver.
  if (d.paid_prev_to === 'driver' || (d.paid === 'yes' && d.paid_to === 'driver')) return 'driver'
  if (d.paid === 'yes' && !hasRecordFor(member, d, d.for_month)) return 'ghost'
  if (d.paid === 'yes') return owesPrev(d, member) ? 'owes_prev' : 'match'
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
    blurb: 'Collect from these on the round.',
    color: 'var(--warn)',
  },
  {
    key: 'owes_prev',
    title: 'Paid this month — last month still open',
    blurb: 'This month is settled, the month before it is not. Collect the old one too.',
    color: 'var(--warn)',
  },
  {
    key: 'match',
    title: 'Matches your records',
    blurb: 'Nothing to do.',
    color: 'var(--ok)',
  },
]

function CopyBtn({ text, label }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        const ok = await copyText(text)
        setCopied(ok ? 'yes' : 'no')
        setTimeout(() => setCopied(false), 2200)
      }}
      className="btn-ghost px-3 py-1.5 text-sm"
    >
      {copied === 'yes' ? '✓ Copied' : copied === 'no' ? 'Copy failed' : label}
    </button>
  )
}

function DriverMessage({ driverName, items }) {
  const [copied, setCopied] = useState(false)
  const total = items.reduce((t, i) => t + Number(i.amount || 0), 0)

  async function copy() {
    const ok = await copyText(driverClaimMessage({ driverName, items }))
    setCopied(ok ? 'yes' : 'no')
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <div className="divide-row flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{driverName || 'Driver not known'}</div>
        <div className="text-sm muted">
          {items.length} rider{items.length === 1 ? '' : 's'} · AED {total.toLocaleString()} claimed
        </div>
      </div>
      <button onClick={copy} className="btn-primary px-3 py-1.5 text-sm shrink-0">
        {copied === 'yes' ? '✓ Copied' : copied === 'no' ? 'Copy failed' : 'Copy Urdu message'}
      </button>
    </div>
  )
}

export default function Verify() {
  const [decls, setDecls] = useState([])
  const [members, setMembers] = useState([])
  const [cars, setCars] = useState([])
  const [showResolved, setShowResolved] = useState(false)
  const [q, setQ] = useState('')
  const [carFilter, setCarFilter] = useState('')
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

  const visible = rows.filter((r) => {
    if (!showResolved && r.d.resolved) return false
    if (carFilter && r.d.car_id !== carFilter) return false
    if (q) {
      const t = `${r.d.name} ${r.d.phone}`.toLowerCase()
      if (!t.includes(q.toLowerCase())) return false
    }
    return true
  })
  const leak = rows
    .filter((r) => r.bucket === 'driver' && !r.d.resolved)
    .reduce((t, r) => t + Number(r.d.amount || 0), 0)

  // One message per driver listing everyone who named him — a list with a
  // total is much harder to shrug off than ten separate messages.
  const byDriver = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (r.bucket !== 'driver' || r.d.resolved) continue
      const key = r.car?.driver_name || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ name: r.d.name, amount: r.d.amount, when: fmt(r.d.paid_when) })
    }
    return [...map.entries()]
  }, [rows])
  const ghost = rows
    .filter((r) => r.bucket === 'ghost' && !r.d.resolved)
    .reduce((t, r) => t + Number(r.d.amount || 0), 0)

  // Sitting with the paper register is easier from a sorted sheet than a phone
  // screen, so the same rows come out as a spreadsheet.
  function exportCsv() {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = [
      'name',
      'phone',
      'gender',
      'car',
      'driver',
      'for_month',
      'paid',
      'prev_month',
      'paid_prev',
      'paid_prev_to',
      'paid_to',
      'paid_when',
      'amount',
      'payments_on_record',
      'last_payment',
      'bucket',
      'checked',
    ]
    const body = visible.map(({ d, member, car }) => {
      const subs = member?.subscriptions || []
      const last = subs.slice().sort((x, y) => (x.end_date < y.end_date ? 1 : -1))[0]
      return [
        d.name,
        d.phone,
        d.gender,
        car?.name,
        car?.driver_name,
        d.for_month,
        d.paid,
        d.prev_month,
        d.paid_prev,
        d.paid_prev_to,
        d.paid_to,
        d.paid_when,
        d.amount,
        subs.length,
        last ? `AED ${last.amount} ${last.start_date} to ${last.end_date}` : '',
        classify(d, member),
        d.resolved ? 'yes' : 'no',
      ].map(cell)
    })
    const csv = [head.map(cell).join(','), ...body.map((r) => r.join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `carlift-checkins-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
        <div className="flex gap-2">
          <button onClick={() => setShowResolved((v) => !v)} className={`pill ${showResolved ? 'pill-on' : ''}`}>
            {showResolved ? 'Showing all' : 'Hiding done'}
          </button>
          {decls.length > 0 && (
            <button onClick={exportCsv} className="pill">
              ⬇ CSV
            </button>
          )}
        </div>
      </div>

      {decls.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <input
            className="input flex-1 min-w-[12rem]"
            placeholder="Search name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="input sm:w-52" value={carFilter} onChange={(e) => setCarFilter(e.target.value)}>
            <option value="">All cars</option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.driver_name}
              </option>
            ))}
          </select>
        </div>
      )}

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
            {/* The short form does not ask the amount, so the rider count is
                the headline and the AED total only appears when it is known. */}
            <div className="card">
              <div className="text-sm muted">Paid a driver</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--bad)' }}>
                {rows.filter((r) => r.bucket === 'driver').length}
              </div>
              <div className="text-xs dim">
                riders{leak > 0 ? ` · AED ${leak.toLocaleString()} named` : ''}
              </div>
            </div>
            <div className="card">
              <div className="text-sm muted">Owe last month</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--warn)' }}>
                {rows.filter((r) => owesPrev(r.d, r.member)).length}
              </div>
              <div className="text-xs dim">said no, nothing on record</div>
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

          {byDriver.length > 0 && (
            <div className="card">
              <div className="font-semibold">Message for the drivers group</div>
              <p className="text-xs dim mb-1">
                Urdu, with Roman Urdu under it. One message per driver, listing every rider who named him and the
                total. Copy it, then paste it in the drivers group.
              </p>
              {byDriver.map(([driverName, items]) => (
                <DriverMessage key={driverName || 'unknown'} driverName={driverName} items={items} />
              ))}
            </div>
          )}

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
                            {owesPrev(d, member) && (
                              <span className="chip chip-warn">owes {monthName(d.prev_month) || 'last month'}</span>
                            )}
                            {!member && <span className="chip chip-info">not on your list</span>}
                            {matchedByName && <span className="chip chip-warn">matched by name, check it</span>}
                            {d.resolved && <span className="chip chip-mute">done</span>}
                          </div>
                          <div className="text-sm muted">
                            {d.phone}
                            {car ? ` · ${car.name}` : ''}
                            {d.gender ? ` · ${d.gender === 'female' ? 'F' : 'M'}` : ''}
                            {monthName(d.for_month) ? ` · about ${monthName(d.for_month)}` : ''}
                          </div>
                        </div>
                        <div className="text-xs dim shrink-0">{fmt((d.created_at || '').slice(0, 10))}</div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div className="sunken p-3">
                          <div className="text-xs dim mb-0.5">Rider says</div>
                          <div>
                            <b>{monthName(d.for_month) || 'This month'}:</b>{' '}
                            {d.paid === 'yes' ? 'paid' : d.paid === 'no' ? 'not paid yet' : 'not sure'}
                          </div>
                          {d.prev_month && (
                            <div>
                              <b>{monthName(d.prev_month)}:</b>{' '}
                              {d.paid_prev === 'yes'
                                ? `paid — to ${
                                    d.paid_prev_to === 'driver'
                                      ? `the driver${car ? ` (${car.driver_name})` : ''}`
                                      : d.paid_prev_to === 'office'
                                        ? 'the office'
                                        : 'not sure who'
                                  }`
                                : d.paid_prev === 'no'
                                  ? 'not paid'
                                  : d.paid_prev === 'na'
                                    ? 'was not riding'
                                    : 'not sure'}
                            </div>
                          )}
                          {/* Older check-ins asked for the detail; the short form does not. */}
                          {d.paid === 'yes' && d.paid_to && (
                            <div className="mt-1">
                              {d.amount ? `AED ${Number(d.amount).toLocaleString()}` : 'Amount not given'} on{' '}
                              {fmt(d.paid_when)} to{' '}
                              <b>
                                {d.paid_to === 'driver'
                                  ? `the driver${car ? ` — ${car.driver_name}` : ''}`
                                  : d.paid_to === 'office'
                                    ? 'the office (cash)'
                                    : d.paid_to === 'transfer'
                                      ? 'bank transfer'
                                      : 'not sure who'}
                              </b>
                            </div>
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
                        {b.key === 'driver' && (
                          <CopyBtn
                            label="Urdu msg for driver"
                            text={driverClaimMessage({
                              driverName: car?.driver_name,
                              items: [{ name: d.name, amount: d.amount, when: fmt(d.paid_when) }],
                            })}
                          />
                        )}
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
