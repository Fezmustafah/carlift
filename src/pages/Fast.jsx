import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO, addDays, currentMonth, prevMonth } from '../lib/dates'
import { normalizePhone } from '../lib/wa'
import { nameIndex, suggest, knownRider } from '../lib/names'
import { cashbox, cashboxRange } from '../lib/cashbox'
import { splitByMethod, byCar, lapsed, amountPresets, monthOf } from '../lib/register'

// The register. A queue of riders, cash in one hand, phone in the other:
// name, amount, next. Nothing else is asked, because everything else costs
// seconds and there are sixty people waiting.
//
// Three rules make it safe to be this plain:
//  1. Every line is written on the phone BEFORE it is sent, with an id made
//     here, so a dead network delays the money, never loses it, and a retry
//     cannot enter the same rider twice.
//  2. Names are suggested from the register itself, months back, so the same
//     rider is spelled the same way in August and in September.
//  3. Cash and card are never added into one number. What is in his hand and
//     what reached the bank are two different questions and the screen answers
//     both, separately, at all times.

const OUTBOX_KEY = 'carlift.fast.outbox'
const CAR_KEY = 'carlift.fast.car'
// Far enough back that last month's riders — and the month before — are still
// suggested when he types the first two letters on the 5th.
const NAME_MEMORY_DAYS = 150

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

const aed = (n) => Number(n || 0).toLocaleString()

// A small labelled number. Same shape everywhere so the eye finds the one it
// wants without reading the words again.
function Tile({ k, v, sub, color }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
      <div className="text-xs muted truncate">{k}</div>
      <div className="text-xl font-bold" style={color ? { color } : undefined}>
        {v}
      </div>
      {sub && <div className="text-xs dim truncate">{sub}</div>}
    </div>
  )
}

function Line({ label, value, strong, sign }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 divide-row ${strong ? 'font-bold' : 'text-sm'}`}>
      <span className={strong ? '' : 'muted'}>{label}</span>
      <span className="shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {sign === '-' ? '− ' : ''}
        {aed(value)}
      </span>
    </div>
  )
}

export default function Fast() {
  const month = currentMonth()
  const prev = prevMonth()
  const [cars, setCars] = useState([])
  const [history, setHistory] = useState([]) // the register, months back
  const [memberNames, setMemberNames] = useState([])
  const [expenses, setExpenses] = useState([])
  const [onetime, setOnetime] = useState([])
  const [subs, setSubs] = useState([])

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
  const [showLapsed, setShowLapsed] = useState(false)
  const [err, setErr] = useState('')

  const nameRef = useRef(null)
  const amountRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(CAR_KEY, car)
  }, [car])

  async function load() {
    const today = todayISO()
    const monthStart = `${month.key}-01`
    const [{ data: cs }, { data: ts }, { data: past }, { data: ms }, { data: ex }, { data: ot }, { data: sb }] =
      await Promise.all([
        supabase.from('cars').select('*').order('name'),
        supabase.from('takings').select('*').eq('taken_on', today).order('created_at', { ascending: false }),
        // Months of register, not days: the man in front of him on the 5th of
        // September paid in August, and that is exactly the spelling wanted.
        supabase
          .from('takings')
          .select('id, name, amount, method, car_id, taken_on, subscription_id')
          .gte('taken_on', addDays(today, -NAME_MEMORY_DAYS))
          .order('taken_on', { ascending: false })
          .limit(3000),
        // Names only. The members list is a spelling aid here, nothing more —
        // tapping one fills the box and links nothing.
        supabase.from('members').select('name').neq('status', 'left').order('name').limit(1000),
        supabase.from('expenses').select('*').gte('date', monthStart).order('date'),
        supabase.from('onetime_rides').select('*').gte('date', monthStart),
        supabase.from('subscriptions').select('id, amount, paid_via, created_at').gte('created_at', monthStart),
      ])

    setCars(cs || [])
    setHistory(past || [])
    setMemberNames((ms || []).map((m) => m.name))
    setExpenses(ex || [])
    setOnetime(ot || [])
    setSubs(sb || [])

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

  function writeName(n) {
    setName(n)
    nameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    amountRef.current?.focus()
  }

  // ---- what the register knows ------------------------------------------

  // Today's lines and the months behind them, with nothing counted twice.
  const allLines = useMemo(() => {
    const today = new Set(rows.map((r) => r.id))
    return [...rows, ...history.filter((h) => !today.has(h.id))]
  }, [rows, history])

  // Nothing after today: the register only ever writes today's date, and a
  // stray future line would be counted in the month but not in the cash.
  const monthLines = useMemo(
    () => allLines.filter((l) => monthOf(l.taken_on) === month.key && l.taken_on <= todayISO()),
    [allLines, month.key],
  )

  const index = useMemo(() => nameIndex(allLines, memberNames), [allLines, memberNames])
  const suggestions = useMemo(() => suggest(index, name), [index, name])
  const known = useMemo(() => knownRider(index, name), [index, name])
  const presets = useMemo(() => amountPresets(history), [history])

  // Today, counted the same way the End of day screen counts it — same
  // function, so the two screens can never disagree.
  const box = useMemo(
    () =>
      cashbox({
        day: todayISO(),
        takings: rows.filter((r) => !r._pending),
        pending: rows.filter((r) => r._pending),
        subs,
        onetime,
        expenses,
      }),
    [rows, subs, onetime, expenses],
  )
  const today = useMemo(() => splitByMethod(rows), [rows])

  const monthMoney = useMemo(() => splitByMethod(monthLines), [monthLines])
  // Payments taken on the Collect screen are rare since the register took over,
  // but money that was taken and not shown is the one mistake this app exists
  // to prevent. A taking that was put on a rider's record is already counted
  // once as the taking — its subscription is the copy and is left out.
  const monthSubs = useMemo(() => {
    const copies = new Set(allLines.map((l) => l.subscription_id).filter(Boolean))
    return splitByMethod(
      subs
        .filter((s) => !copies.has(s.id) && monthOf(s.created_at) === month.key)
        .map((s) => ({ amount: s.amount, method: s.paid_via })),
    )
  }, [subs, allLines, month.key])
  const monthSpent = useMemo(
    () => expenses.filter((e) => monthOf(e.date) === month.key).reduce((t, e) => t + Number(e.amount), 0),
    [expenses, month.key],
  )
  const monthRides = useMemo(
    () => onetime.filter((o) => monthOf(o.date) === month.key).reduce((t, o) => t + Number(o.amount), 0),
    [onetime, month.key],
  )
  const monthCash = useMemo(
    () =>
      cashboxRange({
        from: `${month.key}-01`,
        to: todayISO(),
        takings: allLines.filter((l) => !l._pending),
        pending: allLines.filter((l) => l._pending),
        subs,
        onetime,
        expenses,
      }).expected,
    [allLines, subs, onetime, expenses, month.key],
  )
  const monthTotal = monthMoney.total + monthRides + monthSubs.total
  const monthNotCash = monthMoney.notCash + monthSubs.notCash
  const monthCars = useMemo(() => byCar(monthLines, cars), [monthLines, cars])
  const people = useMemo(
    () => new Set(monthLines.map((l) => l.name.trim().toLowerCase())).size,
    [monthLines],
  )
  const owedTotal = useMemo(() => allLines.reduce((t, l) => t + Number(l.owed || 0), 0), [allLines])

  // Who paid last month and has not come this month. The list that turns the
  // register into a collection round instead of a receipt book.
  const missing = useMemo(() => lapsed(allLines, month.key, prev.key), [allLines, month.key, prev.key])

  // Written twice in one day is nearly always a slip, not a second payment.
  const alreadyToday = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (!q) return null
    return rows.find((r) => r.name.trim().toLowerCase() === q) || null
  }, [name, rows])

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
          <Link to={`/sheet?day=${todayISO()}`} className="btn-ghost px-3 py-1.5 text-sm" title="Printable statement">
            🖨 PDF
          </Link>
        </div>
      </div>

      {/* Today. The first number is the one he can check against his own
          pocket; everything beside it is money that exists somewhere else. */}
      <div className="card space-y-3">
        <div>
          <div className="text-sm muted">Cash in your hand now</div>
          <div className="text-4xl font-bold" style={{ color: box.expected < 0 ? 'var(--bad)' : 'var(--ok)' }}>
            AED {aed(box.expected)}
          </div>
          <div className="text-xs dim">
            {aed(box.fast + box.unsentCash)} cash from the register
            {box.payments > 0 ? ` + ${aed(box.payments)} on Collect` : ''}
            {box.rides > 0 ? ` + ${aed(box.rides)} one-time` : ''}
            {box.spent > 0 ? ` − ${aed(box.spent)} paid out` : ''}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Tile k="Taken today" v={aed(today.total)} sub={`${rows.length} rider${rows.length === 1 ? '' : 's'}`} />
          <Tile
            k="💳 Card"
            v={aed(today.card)}
            sub={today.card > 0 ? 'in the account' : '—'}
            color={today.card > 0 ? 'var(--info)' : undefined}
          />
          <Tile
            k="🏦 Transfer"
            v={aed(today.transfer)}
            sub={today.transfer > 0 ? 'in the account' : '—'}
            color={today.transfer > 0 ? 'var(--info)' : undefined}
          />
        </div>

        {today.notCash > 0 && (
          <p className="text-xs dim">
            AED {aed(today.notCash)} of today's money went straight to the bank account. It is not in your bag and it
            is not in the number above.
          </p>
        )}
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
            {aed(alreadyToday.amount)}. Write it again only if they really paid twice.
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s.key} onClick={() => writeName(s.name)} className="pill">
                {s.name}
                {s.amount > 0 && <span className="dim"> · {aed(s.amount)}</span>}
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
          {/* What this rider paid last time, first and marked. Nothing is
              entered by tapping the name alone — it is still one deliberate
              press on the amount. */}
          {known && (
            <button
              onClick={() => save(known.amount)}
              className="btn-primary px-4 py-3 text-base font-bold"
              style={{ boxShadow: '0 0 0 3px var(--ring)' }}
            >
              {aed(known.amount)} · usual
            </button>
          )}
          {presets
            .filter((v) => !known || v !== known.amount)
            .map((v) => (
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
            {Number(r.owed) > 0 && <span className="chip chip-warn shrink-0">owes {aed(r.owed)}</span>}
            <span className="font-bold shrink-0">{aed(r.amount)}</span>
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

      {/* ---- the month, under the day's work ------------------------------
          Below the queue on purpose: at six in the morning the only thing on
          the screen should be the name box. This is what he reads afterwards,
          and what the boss asks about. */}
      <div className="card space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="h2">{month.en} so far</h2>
          <div className="text-2xl font-bold">AED {aed(monthTotal)}</div>
        </div>

        <div>
          <Line label="💵 Cash" value={monthMoney.cash + monthRides + monthSubs.cash} />
          <Line label="💳 Card" value={monthMoney.card + monthSubs.card} />
          <Line label="🏦 Bank transfer" value={monthMoney.transfer + monthSubs.transfer} />
          <Line label="Collected this month" value={monthTotal} strong />
          <Line label="Paid out" value={monthSpent} sign="-" />
          <Line label="Cash that should be in hand" value={monthCash} strong />
        </div>

        <p className="text-xs dim">
          {monthLines.length} payment{monthLines.length === 1 ? '' : 's'} from {people} rider
          {people === 1 ? '' : 's'}
          {monthNotCash > 0
            ? ` · AED ${aed(monthNotCash)} of it went to the bank account, not to your hand`
            : ''}
          {owedTotal > 0 ? ` · AED ${aed(owedTotal)} still to recover` : ''}.
        </p>

        {monthCars.length > 0 && (
          <div>
            <div className="text-xs muted uppercase tracking-wide pb-1">By vehicle</div>
            {monthCars.map((c) => (
              <div key={c.car_id || 'none'} className="py-1.5 divide-row">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-medium truncate">{c.name}</span>
                  <span className="shrink-0">
                    {aed(c.total)}
                    <span className="dim text-xs"> · {c.riders}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.round((c.total / (monthMoney.total || 1)) * 100)}%`,
                      background: 'var(--brand)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {missing.length > 0 && (
          <div>
            <button
              onClick={() => setShowLapsed((v) => !v)}
              className="w-full flex items-center justify-between gap-3 py-1.5 text-left"
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--warn)' }}>
                {missing.length} paid in {prev.en} but not yet in {month.en}
              </span>
              <span className="dim">{showLapsed ? '▾' : '▸'}</span>
            </button>
            {showLapsed && (
              <>
                <div className="flex flex-wrap gap-2 pt-1">
                  {missing.map((m) => (
                    <button key={m.name} onClick={() => writeName(m.name)} className="pill">
                      {m.name}
                      {m.amount > 0 && <span className="dim"> · {aed(m.amount)}</span>}
                    </button>
                  ))}
                </div>
                <p className="text-xs dim mt-2">
                  Tap a name to write them into the register when they pay. This is the register's own memory of{' '}
                  {prev.en} — not the members list.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 flex-wrap pt-1">
          <Link to={`/sheet?month=${month.key}`} className="btn-ghost px-3 py-1.5 text-sm">
            🖨 Statement for {month.en}
          </Link>
          <Link
            to={`/sheet?from=${month.key}-05&to=${month.key}-10`}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            Round 5–10
          </Link>
        </div>
      </div>
    </div>
  )
}
