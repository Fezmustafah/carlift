import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO, currentMonth } from '../lib/dates'
import { normalizePhone } from '../lib/wa'
import { mergeNames, matchNames } from '../lib/names'

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

// If the phone refuses to write to storage — private window, storage full — the
// queue lives in memory instead. Worse than the disk, far better than dropping
// a rider who has already handed over the money.
let memQueue = null

const readOutbox = () => {
  if (memQueue) return memQueue
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeOutbox = (rows) => {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows))
    memQueue = null
    return true
  } catch {
    memQueue = rows
    return false
  }
}

const newId = () =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  )

// A column this app knows about but the database has not been given yet must
// not strand a rider's money in the outbox. PostgREST names the missing column;
// drop it and send the rest. The line arrives without that one detail, which is
// worth incomparably more than not arriving at all.
async function insertSurvivingMissingColumns(row) {
  let payload = row
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await supabase.from('takings').insert(payload)
    if (res.error?.code !== 'PGRST204') return res
    const col = /'([^']+)' column/.exec(res.error.message)?.[1]
    if (!col || !(col in payload)) return res
    const { [col]: _dropped, ...rest } = payload
    payload = rest
  }
  return await supabase.from('takings').insert(payload)
}

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
  const [owed, setOwed] = useState('')

  const [rows, setRows] = useState([]) // today's register, newest first
  const [unsent, setUnsent] = useState(readOutbox().length)
  const [confirmId, setConfirmId] = useState(null)
  const [owedOpen, setOwedOpen] = useState(false)
  const [err, setErr] = useState('')

  const nameRef = useRef(null)
  const amountRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(CAR_KEY, car)
  }, [car])

  async function load() {
    const [{ data: cs }, { data: ts }, { data: all }, { data: ms }] = await Promise.all([
      supabase.from('cars').select('*').order('name'),
      supabase.from('takings').select('*').eq('taken_on', todayISO()).order('created_at', { ascending: false }),
      supabase.from('takings').select('name, amount').order('taken_on', { ascending: false }).limit(400),
      // Names only. The members list is a spelling aid here, nothing more —
      // tapping one fills the box and links nothing.
      supabase.from('members').select('name').neq('status', 'left').order('name').limit(1000),
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

    setPastNames(mergeNames((all || []).map((t) => t.name), (ms || []).map((m) => m.name)))

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
      const { error } = await insertSurvivingMissingColumns(clean)
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
      // What he still has to come back for. Never part of the cash count, and
      // only sent when there is one — a full payment then cannot be held up by
      // a migration that has not been run yet.
      ...(Number(owed) > 0 ? { owed: Number(owed) } : {}),
      car_id: car || null,
      method,
      for_month: month.key,
      taken_on: todayISO(),
      member_id: null,
      subscription_id: null,
    }
    const onDisk = writeOutbox([...readOutbox(), row])
    setUnsent((n) => n + 1)
    setRows((rs) => [{ ...row, _pending: true }, ...rs])
    setName('')
    setPhone('')
    setAmount('')
    setOwed('')
    setErr(
      onDisk
        ? ''
        : 'This phone will not let the app save — keep this page open until every line says saved, and take a backup.',
    )
    nameRef.current?.focus()
    sync()
  }

  // Two taps to delete. One mis-tap on a phone should not erase a rider who
  // paid, and the money is the whole point of the book.
  async function remove(row) {
    if (confirmId !== row.id) {
      setConfirmId(row.id)
      return
    }
    setConfirmId(null)
    const queue = readOutbox().filter((q) => q.id !== row.id)
    writeOutbox(queue)
    setUnsent(queue.length)
    setRows((rs) => rs.filter((r) => r.id !== row.id))
    if (!row._pending) await supabase.from('takings').delete().eq('id', row.id)
  }

  // A copy of the whole book in his own hands, for the day he stops trusting
  // any of this. Includes the lines that have not reached the server yet.
  async function backup() {
    const { data, error } = await supabase.from('takings').select('*').order('taken_on', { ascending: false })
    if (error) return setErr(explain(error))
    const all = [...readOutbox().map((p) => ({ ...p, _pending: true })), ...(data || [])]
    if (!all.length) return setErr('Nothing in the register to back up yet.')
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['date', 'name', 'number', 'amount', 'still owes', 'method', 'car', 'saved'],
      ...all.map((r) => [
        r.taken_on,
        r.name,
        r.phone || '',
        r.amount,
        Number(r.owed) > 0 ? r.owed : '',
        r.method,
        carName(r.car_id) || '',
        r._pending ? 'NOT SENT YET' : 'saved',
      ]),
    ]
      .map((r) => r.map(cell).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `carlift-register-${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Spellings from the register and the members list, so one rider does not
  // become two.
  const suggestions = useMemo(() => matchNames(pastNames, name), [name, pastNames])

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
        <div className="flex items-center gap-2">
          <span className="text-sm muted">{month.en}</span>
          <button onClick={backup} className="btn-ghost px-3 py-1.5 text-sm" title="Download the whole register">
            ⬇ Backup
          </button>
          <Link to={`/sheet?day=${todayISO()}`} className="btn-ghost px-3 py-1.5 text-sm" title="Printable sheet">
            🖨 PDF
          </Link>
        </div>
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

      {unsent > 0 ? (
        <div className="card flex items-center gap-3" style={{ borderColor: 'var(--warn)' }}>
          <span className="text-xl">📶</span>
          <div className="flex-1 text-sm">
            <b>{unsent}</b> not sent yet — held on this phone. Keep going; they go up by themselves when the signal
            comes back. Do not clear the browser until this is gone.
          </div>
          <button onClick={sync} className="btn-ghost px-3 py-1.5 text-sm">
            Retry
          </button>
        </div>
      ) : (
        rows.length > 0 && (
          <p className="text-sm text-center" style={{ color: 'var(--ok)' }}>
            ✓ All {rows.length} saved on the server
          </p>
        )
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
        {/* The method stays where it was left, which is right for a run of card
            payments and dangerous for the cash rider who follows them. Silence
            is what makes it dangerous, so it does not stay silent. */}
        {method !== 'cash' && (
          <div
            className="rounded-xl p-2.5 text-sm font-semibold flex items-center gap-2"
            style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
          >
            <span>{method === 'card' ? '💳' : '🏦'}</span>
            <span className="flex-1">
              Writing every rider as {method.toUpperCase()} — not cash. This money is not in your bag.
            </span>
            <button onClick={() => setMethod('cash')} className="btn-ghost px-2 py-1 text-xs shrink-0">
              Back to cash
            </button>
          </div>
        )}

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

        {/* Kept out of the way: most riders pay in full, and every extra box on
            this screen is a second per person. */}
        {owedOpen || owed ? (
          <div>
            <label className="label">Still owes — they will bring it later</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="e.g. 150"
              value={owed}
              onChange={(e) => setOwed(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <p className="text-xs dim mt-1">
              This is not counted as cash. It goes on the list to recover.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOwedOpen(true)}
            className="text-sm font-medium"
            style={{ color: 'var(--brand)' }}
          >
            + Paid only part of it
          </button>
        )}

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
            {Number(r.owed) > 0 && (
              <span className="chip chip-warn shrink-0">owes {Number(r.owed).toLocaleString()}</span>
            )}
            <span className="font-bold shrink-0">{Number(r.amount).toLocaleString()}</span>
            {r._pending && <span className="chip chip-warn shrink-0">unsent</span>}
            {confirmId === r.id ? (
              <>
                <button
                  onClick={() => remove(r)}
                  className="btn-danger shrink-0 px-2 py-1 text-xs"
                  title="Delete this line"
                >
                  Delete
                </button>
                <button onClick={() => setConfirmId(null)} className="dim shrink-0 px-1 text-xs">
                  Keep
                </button>
              </>
            ) : (
              <button onClick={() => remove(r)} className="dim shrink-0 px-1" title="Remove">
                ✕
              </button>
            )}
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
