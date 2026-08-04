import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO, addDays, planEnd, daysLeft, fmt, currentMonth } from '../lib/dates'
import { latestEnd } from '../lib/status'
import { normalizePhone } from '../lib/wa'

// The fast lane. A queue of riders, cash in one hand, phone in the other:
// name, amount, next. No number, no plan, no lookup — those cost seconds each
// and there are sixty people waiting.
//
// Two rules make it safe to be this crude:
//  1. Every row is saved on the phone BEFORE it is sent, with an id made here,
//     so a dead network delays the money, never loses it, and a retry cannot
//     enter it twice.
//  2. Nothing is written to the roster. Names typed in a hurry stay in their
//     own book until they are matched to a real rider afterwards (below).

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
  const [members, setMembers] = useState([])
  const [presets, setPresets] = useState(FALLBACK_AMOUNTS)

  const [car, setCar] = useState(() => localStorage.getItem(CAR_KEY) || '')
  const [method, setMethod] = useState('cash')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [linked, setLinked] = useState(null)

  const [rows, setRows] = useState([]) // today's takings, newest first
  const [openRows, setOpenRows] = useState([]) // every taking not yet on a record, any day
  const [unsent, setUnsent] = useState(readOutbox().length)
  const [err, setErr] = useState('')
  const [matchOpen, setMatchOpen] = useState(false)

  const nameRef = useRef(null)
  const amountRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(CAR_KEY, car)
  }, [car])

  async function load() {
    const [{ data: cs }, { data: ms }, { data: subs }, { data: ts }, { data: os }] = await Promise.all([
      supabase.from('cars').select('*').order('name'),
      supabase.from('members').select('id, name, phone, car_id, plan_pref, status, subscriptions(*)').neq('status', 'left'),
      supabase.from('subscriptions').select('amount').limit(500),
      supabase.from('takings').select('*').eq('taken_on', todayISO()).order('created_at', { ascending: false }),
      // Not just today. A rider collected on the 6th and never matched must
      // still be findable on the 9th, or the name is lost to the CSV.
      supabase.from('takings').select('*').is('subscription_id', null).order('taken_on', { ascending: false }),
    ])
    setCars(cs || [])
    setMembers(ms || [])

    // Offer the amounts actually being charged, most used first.
    const counts = new Map()
    for (const s of subs || []) {
      const v = Number(s.amount)
      if (v > 0) counts.set(v, (counts.get(v) || 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v]) => v)
    if (top.length) setPresets(top.sort((a, b) => a - b))

    // Anything still in the outbox belongs at the top of the list, unsent.
    const pending = readOutbox()
    const pendingIds = new Set(pending.map((p) => p.id))
    setRows([
      ...pending.map((p) => ({ ...p, _pending: true })),
      ...(ts || []).filter((t) => !pendingIds.has(t.id)),
    ])
    setOpenRows((os || []).filter((t) => !pendingIds.has(t.id)))
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
  // fixed, so a row that actually arrived comes back as a duplicate key and is
  // treated as sent.
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
      setErr('Type the name')
      nameRef.current?.focus()
      return
    }
    if (!amt || amt <= 0) {
      setErr('Enter the amount')
      amountRef.current?.focus()
      return
    }
    const row = {
      id: newId(),
      name: who,
      // Optional on purpose. Riders hand over a number when they feel like it,
      // and waiting for one at the front of a queue is how the round dies.
      phone: normalizePhone(phone) || linked?.phone || null,
      amount: amt,
      car_id: car || null,
      method,
      for_month: month.key,
      taken_on: todayISO(),
      member_id: linked?.id || null,
      subscription_id: null,
    }
    writeOutbox([...readOutbox(), row])
    setUnsent((n) => n + 1)
    setRows((rs) => [{ ...row, _pending: true }, ...rs])
    setName('')
    setPhone('')
    setAmount('')
    setLinked(null)
    setErr('')
    nameRef.current?.focus()
    sync()
  }

  async function remove(row) {
    const queue = readOutbox().filter((q) => q.id !== row.id)
    writeOutbox(queue)
    setUnsent(queue.length)
    setRows((rs) => rs.filter((r) => r.id !== row.id))
    setOpenRows((os) => os.filter((r) => r.id !== row.id))
    if (!row._pending) await supabase.from('takings').delete().eq('id', row.id)
  }

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (q.length < 2 || linked) return []
    return members
      .filter((m) => m.name.toLowerCase().includes(q))
      .filter((m) => !car || m.car_id === car)
      .slice(0, 3)
  }, [name, members, car, linked])

  const total = rows.reduce((t, r) => t + Number(r.amount), 0)
  const carName = (id) => cars.find((c) => c.id === id)?.name

  // ---- after the queue: turn takings into real payments ----------------
  // Everything still waiting to be put on a record: what the server knows about
  // from earlier days, plus what was taken in this session before the next load.
  const open = useMemo(() => {
    const byId = new Map()
    for (const r of openRows) byId.set(r.id, r)
    for (const r of rows) if (!r._pending && !r.subscription_id) byId.set(r.id, r)
    return [...byId.values()].sort((a, b) => String(b.taken_on).localeCompare(String(a.taken_on)))
  }, [openRows, rows])
  const readyToCount = open.filter((r) => r.member_id)

  async function countIt(row, member) {
    const m = member || members.find((x) => x.id === row.member_id)
    if (!m) return
    const prevEnd = latestEnd(m)
    const start = prevEnd && daysLeft(prevEnd) >= 0 ? addDays(prevEnd, 1) : row.taken_on
    const plan = m.plan_pref === '15d' ? '15d' : '30d'
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        member_id: m.id,
        plan_type: plan,
        amount: Number(row.amount),
        start_date: start,
        end_date: planEnd(start, plan),
        paid_via: row.method,
      })
      .select('id')
      .single()
    if (error) return setErr(error.message)
    await supabase.from('takings').update({ member_id: m.id, subscription_id: data.id }).eq('id', row.id)
    if (m.status !== 'active') await supabase.from('members').update({ status: 'active' }).eq('id', m.id)
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, member_id: m.id, subscription_id: data.id } : r)))
    setOpenRows((os) => os.filter((r) => r.id !== row.id))
  }

  async function countAll() {
    for (const r of readyToCount) await countIt(r)
    load()
  }

  // A taking that came with a number is a whole rider: put them on the roster
  // and count the money in one go. Without a number the database refuses, on
  // purpose — see supabase/2026-08-01-purge-no-phone.sql.
  async function addAsRider(row) {
    const clean = normalizePhone(row.phone || '')
    if (clean.length < 9) return setErr('That number is too short to add a rider — fix it on Members.')
    const { data, error } = await supabase
      .from('members')
      .insert({
        name: row.name,
        phone: clean,
        car_id: row.car_id || null,
        status: 'active',
        source: 'manual',
        notes: `Added from the fast lane, ${row.taken_on}`,
      })
      .select('id, name, phone, car_id, plan_pref, status, subscriptions(*)')
      .single()
    if (error)
      return setErr(
        error.code === '23505'
          ? 'That number is already on the members list — search for the name instead.'
          : error.message,
      )
    setMembers((ms) => [...ms, data])
    await countIt(row, data)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h1">Fast lane</h1>
        <span className="text-sm muted">{month.en}</span>
      </div>

      <div className="card flex items-center justify-between gap-3">
        <div>
          <div className="text-sm muted">Taken today</div>
          <div className="text-3xl font-bold" style={{ color: 'var(--ok)' }}>
            AED {total.toLocaleString()}
          </div>
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

      {/* car is picked once for the whole queue */}
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
          placeholder="Rider name"
          autoFocus
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setLinked(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && amountRef.current?.focus()}
        />

        {linked && (
          <p className="text-xs" style={{ color: 'var(--ok)' }}>
            ✓ on the list — {linked.phone}
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setName(m.name)
                  setLinked(m)
                  amountRef.current?.focus()
                }}
                className="pill"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {/* Never required. If the rider gives a number it is kept, and that
            taking can become a real member later in one tap. */}
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
                {r.subscription_id ? ' · counted' : ''}
              </div>
            </div>
            <span className="font-bold shrink-0">{Number(r.amount).toLocaleString()}</span>
            {r._pending && <span className="chip chip-warn shrink-0">unsent</span>}
            <button onClick={() => remove(r)} className="dim shrink-0 px-1" title="Remove">
              ✕
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="muted text-center py-8">Nothing taken yet today.</p>}
      </div>

      {rows.length > 0 && (
        <Link to="/day" className="card flex items-center gap-3">
          <span className="text-2xl">🧮</span>
          <div className="flex-1">
            <div className="font-semibold">Count the bag</div>
            <div className="text-sm muted">End of the day — check the cash against the books.</div>
          </div>
          <span className="dim">›</span>
        </Link>
      )}

      {open.length > 0 && (
        <div className="space-y-2">
          <button onClick={() => setMatchOpen((v) => !v)} className="card w-full flex items-center gap-3 text-left">
            <span className="text-2xl">🔗</span>
            <div className="flex-1">
              <div className="font-semibold">Put it on their record ({open.length})</div>
              <div className="text-sm muted">
                Every day of the round, not only today. Do it after the queue — the money is already safe.
              </div>
            </div>
            <span className="dim">{matchOpen ? '▾' : '›'}</span>
          </button>

          {matchOpen && (
            <>
              {readyToCount.length > 0 && (
                <button onClick={countAll} className="btn-primary w-full">
                  Count the {readyToCount.length} already matched
                </button>
              )}
              {open.map((r) => (
                <MatchRow key={r.id} row={r} members={members} onCount={countIt} onAdd={addAsRider} />
              ))}
              <p className="text-xs dim">
                No match and no number means they stay in this book until you get a number from them. The money is
                counted either way.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MatchRow({ row, members, onCount, onAdd }) {
  const [q, setQ] = useState('')
  const picked = members.find((m) => m.id === row.member_id)
  const hits = useMemo(() => {
    const t = (q || row.name).trim().toLowerCase()
    if (t.length < 2) return []
    return members.filter((m) => m.name.toLowerCase().includes(t)).slice(0, 4)
  }, [q, row.name, members])

  return (
    <div className="card space-y-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{row.name}</div>
          <div className="text-xs dim">
            AED {Number(row.amount).toLocaleString()} · {fmt(row.taken_on)}
            {row.phone ? ` · ${row.phone}` : ' · no number'}
          </div>
        </div>
        {picked && (
          <button onClick={() => onCount(row, picked)} className="btn-primary px-3 py-1.5 text-sm shrink-0">
            Count it
          </button>
        )}
      </div>
      {!picked && (
        <>
          <input
            className="input"
            placeholder={`Search the list for "${row.name}"…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {hits.map((m) => (
              <button key={m.id} onClick={() => onCount(row, m)} className="pill">
                {m.name} <span className="dim">· {m.phone}</span>
              </button>
            ))}
            {hits.length === 0 && <span className="text-xs dim">Nobody with that name on the list.</span>}
          </div>
          {row.phone && (
            <button onClick={() => onAdd(row)} className="btn-primary w-full py-2 text-sm">
              Not on the list — add {row.name} as a new rider
            </button>
          )}
        </>
      )}
    </div>
  )
}
