import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO, currentMonth } from '../lib/dates'
import { normalizePhone } from '../lib/wa'

// The register. A queue of riders, cash in one hand, phone in the other:
// name, amount, next. Nothing else is asked, because everything else costs
// seconds and there are sixty people waiting.
//
// Two rules make it safe to be this plain:
//  1. Every line is written on the phone BEFORE it is sent, with an id made
//     here, so a dead network delays the money, never loses it, and a retry
//     cannot enter the same rider twice.
//  2. Names are suggested from the register itself, so the same rider is
//     spelled the same way on the 5th and on the 9th.

const OUTBOX_KEY = 'carlift.fast.outbox'
const CAR_KEY = 'carlift.fast.car'
const FALLBACK_AMOUNTS = [200, 300, 400, 500]

const readOutbox = () => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')
  } catch {
    return []
  }
}
const writeOutbox = (rows) => localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows))

const newId = () =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  )

// Nothing here is worth reading in front of a queue except what to do next.
function explain(error) {
  if (!navigator.onLine) return 'No internet — every rider is saved on this phone. Keep going.'
  if (error.code === 'PGRST205' || error.code === 'PGRST204' || error.code === '42P01')
    return 'The database is missing the takings table — run supabase/2026-08-04-fast-lane.sql in Supabase. Nothing is lost, it sends itself after that.'
  return `${error.message} — saved on this phone, nothing lost.`
}

export default function Fast() {
  const month = currentMonth()
  const [cars, setCars] = useState([])
  const [presets, setPresets] = useState(FALLBACK_AMOUNTS)
  const [pastNames, setPastNames] = useState([])

  const [car, setCar] = useState(() => localStorage.getItem(CAR_KEY) || '')
  const [method, setMethod] = useState('cash')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')

  const [rows, setRows] = useState([]) // today's register, newest first
  const [unsent, setUnsent] = useState(readOutbox().length)
  const [err, setErr] = useState('')

  const nameRef = useRef(null)
  const amountRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(CAR_KEY, car)
  }, [car])

  async function load() {
    const [{ data: cs }, { data: ts }, { data: all }] = await Promise.all([
      supabase.from('cars').select('*').order('name'),
      supabase.from('takings').select('*').eq('taken_on', todayISO()).order('created_at', { ascending: false }),
      supabase.from('takings').select('name, amount').order('taken_on', { ascending: false }).limit(400),
    ])
    setCars(cs || [])

    // Amounts actually being charged in this register, most used first.
    const counts = new Map()
    for (const t of all || []) {
      const v = Number(t.amount)
      if (v > 0) counts.set(v, (counts.get(v) || 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v]) => v)
    if (top.length) setPresets(top.sort((a, b) => a - b))

    setPastNames([...new Set((all || []).map((t) => t.name).filter(Boolean))])

    const pending = readOutbox()
    const pendingIds = new Set(pending.map((p) => p.id))
    setRows([
      ...pending.map((p) => ({ ...p, _pending: true })),
      ...(ts || []).filter((t) => !pendingIds.has(t.id)),
    ])
    setUnsent(pending.length)
  }

  useEffect(() => {
    load().then(sync)
    const onOnline = () => sync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Send whatever is waiting. Safe to call at any time: the id is already
  // fixed, so a line that actually arrived comes back as a duplicate key and
  // is treated as sent.
  async function sync() {
    let queue = readOutbox()
    if (!queue.length) return
    for (const row of [...queue]) {
      const { _pending, ...clean } = row
      const { error } = await supabase.from('takings').insert(clean)
      if (error && error.code !== '23505') {
        setErr(explain(error))
        break
      }
      queue = queue.filter((q) => q.id !== row.id)
      writeOutbox(queue)
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, _pending: false } : r)))
    }
    setUnsent(queue.length)
    if (!queue.length) setErr('')
  }

  function save(value) {
    const amt = Number(value ?? amount)
    const who = name.trim()
    if (!who) {
      setErr('Write the name')
      nameRef.current?.focus()
      return
    }
    if (!amt || amt <= 0) {
      setErr('Write the amount')
      amountRef.current?.focus()
      return
    }
    const row = {
      id: newId(),
      name: who,
      // Optional, and it stays optional. Waiting for a number at the front of
      // a queue is how the round dies.
      phone: normalizePhone(phone) || null,
      amount: amt,
      car_id: car || null,
      method,
      for_month: month.key,
      taken_on: todayISO(),
      member_id: null,
      subscription_id: null,
    }
    writeOutbox([...readOutbox(), row])
    setUnsent((n) => n + 1)
    setRows((rs) => [{ ...row, _pending: true }, ...rs])
    setName('')
    setPhone('')
    setAmount('')
    setErr('')
    nameRef.current?.focus()
    sync()
  }

  async function remove(row) {
    const queue = readOutbox().filter((q) => q.id !== row.id)
    writeOutbox(queue)
    setUnsent(queue.length)
    setRows((rs) => rs.filter((r) => r.id !== row.id))
    if (!row._pending) await supabase.from('takings').delete().eq('id', row.id)
  }

  // Spellings from the register itself, so one rider does not become two.
  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (q.length < 2) return []
    return pastNames.filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q).slice(0, 3)
  }, [name, pastNames])

  // Written twice in one day is nearly always a slip, not a second payment.
  const alreadyToday = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (!q) return null
    return rows.find((r) => r.name.trim().toLowerCase() === q) || null
  }, [name, rows])

  const total = rows.reduce((t, r) => t + Number(r.amount), 0)
  const cashTotal = rows.filter((r) => (r.method || 'cash') === 'cash').reduce((t, r) => t + Number(r.amount), 0)
  const carName = (id) => cars.find((c) => c.id === id)?.name

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="h1">Register</h1>
          <p className="text-sm dim">Name and amount. Nothing else.</p>
        </div>
        <span className="text-sm muted">{month.en}</span>
      </div>

      <div className="card flex items-center justify-between gap-3">
        <div>
          <div className="text-sm muted">Taken today</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--ok)' }}>
            AED {total.toLocaleString()}
          </div>
          {total !== cashTotal && <div className="text-xs dim">AED {cashTotal.toLocaleString()} of it in cash</div>}
        </div>
        <div className="text-right">
          <div className="text-sm muted">Riders</div>
          <div className="text-3xl font-bold">{rows.length}</div>
        </div>
      </div>

      {unsent > 0 && (
        <div className="card flex items-center gap-3" style={{ borderColor: 'var(--warn)' }}>
          <span className="text-xl">📶</span>
          <div className="flex-1 text-sm">
            <b>{unsent}</b> not sent yet — saved on this phone. Keep going.
          </div>
          <button onClick={sync} className="btn-ghost px-3 py-1.5 text-sm">
            Retry
          </button>
        </div>
      )}

      {/* the car is picked once for the whole queue */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setCar('')} className={`pill ${car === '' ? 'pill-on' : ''}`}>
          No car
        </button>
        {cars.map((c) => (
          <button key={c.id} onClick={() => setCar(c.id)} className={`pill ${car === c.id ? 'pill-on' : ''}`}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="card space-y-3">
        <input
          ref={nameRef}
          className="input text-lg"
          placeholder="Name"
          autoFocus
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && amountRef.current?.focus()}
        />

        {alreadyToday && (
          <p className="text-xs" style={{ color: 'var(--warn)' }}>
            ⚠ {alreadyToday.name} is already in today's register for AED{' '}
            {Number(alreadyToday.amount).toLocaleString()}. Write it again only if they really paid twice.
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setName(n)
                  amountRef.current?.focus()
                }}
                className="pill"
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <input
          className="input"
          type="tel"
          autoComplete="off"
          placeholder="Number — only if they give it"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          {presets.map((v) => (
            <button key={v} onClick={() => save(v)} className="btn-primary px-4 py-3 text-base font-bold">
              {v}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            ref={amountRef}
            className="input flex-1 text-lg"
            type="number"
            inputMode="numeric"
            min="1"
            placeholder="Other amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button onClick={() => save()} className="btn-primary px-6">
            Save
          </button>
        </div>

        <div className="flex gap-2">
          {['cash', 'card', 'transfer'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`pill ${method === m ? 'pill-on' : ''}`}
            >
              {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : '🏦 Transfer'}
            </button>
          ))}
        </div>

        {err && (
          <p className="text-sm" style={{ color: 'var(--bad)' }}>
            {err}
          </p>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="card flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{r.name}</div>
              <div className="text-xs dim truncate">
                {carName(r.car_id) || 'no car'} · {r.method}
                {r.phone ? ` · ${r.phone}` : ''}
              </div>
            </div>
            <span className="font-bold shrink-0">{Number(r.amount).toLocaleString()}</span>
            {r._pending && <span className="chip chip-warn shrink-0">unsent</span>}
            <button onClick={() => remove(r)} className="dim shrink-0 px-1" title="Remove">
              ✕
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="muted text-center py-8">Nothing written yet today.</p>}
      </div>

      <Link to="/day" className="card flex items-center gap-3">
        <span className="text-2xl">🧮</span>
        <div className="flex-1">
          <div className="font-semibold">End of day</div>
          <div className="text-sm muted">Write what you paid out, then count what is left.</div>
        </div>
        <span className="dim">›</span>
      </Link>
    </div>
  )
}
