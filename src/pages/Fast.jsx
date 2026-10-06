import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO, addDays, currentMonth, prevMonth } from '../lib/dates'
import { normalizePhone } from '../lib/wa'
import { nameIndex, suggest, knownRider, riderKey } from '../lib/names'
import { cashbox } from '../lib/cashbox'
import { splitByMethod, lapsed, amountPresets, monthOf, unusualAmount } from '../lib/register'
import { findRiders } from '../lib/analysis'
import { fetchAll } from '../lib/fetchAll'
import { readOutbox, writeOutbox, newId } from '../lib/outbox'
import { PageHead, Sheet, Money, Banner, toast, aed } from '../components/ui'
import LineSheet from '../components/LineSheet'
import RiderSheet from '../components/RiderSheet'
import {
  AlertIcon, ChartIcon, ChevronDown, ChevronRight, DocIcon, DownloadIcon, PencilIcon, SearchIcon, WalletIcon,
} from '../components/icons'

// The register. A queue of riders, cash in one hand, phone in the other:
// name, amount, next. Nothing else is asked, because everything else costs
// seconds and there are sixty people waiting — and since the numbers stopped
// being collected, this book is the whole record of who paid.
//
// What keeps a book this plain trustworthy:
//  1. Every line is written on the phone BEFORE it is sent, with an id made
//     here, so a dead network delays the money and never loses it, and a retry
//     cannot enter the same rider twice (lib/outbox.js).
//  2. Names are suggested from the register itself, months back, so one rider
//     is spelled one way in August and in September — the Month page depends
//     on it.
//  3. The slips a queue causes are caught at the moment they happen: a name
//     already paid this month, 3000 typed for 300, a day that is not today,
//     card left on for a cash rider. Any line can be fixed afterwards.
//  4. Cash and card are never one number. What is in his hand and what reached
//     the bank are two questions, answered separately.

const CAR_KEY = 'carlift.fast.car'
// Far enough back that last month's riders — and the month before — are still
// suggested when he types the first two letters on the 5th.
const NAME_MEMORY_DAYS = 150

const METHOD_LABEL = { cash: 'Cash', card: 'Card', transfer: 'Bank' }

const readCar = () => {
  try {
    return localStorage.getItem(CAR_KEY) || ''
  } catch {
    return ''
  }
}

const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// A column this app knows about but the database has not been given yet must
// not strand a rider's money in the outbox. PostgREST names the missing column;
// drop it and send the rest. The line arrives without that one detail, which is
// worth incomparably more than not arriving at all.
async function surviving(send, payload) {
  let body = payload
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await send(body)
    if (res.error?.code !== 'PGRST204') return res
    const col = /'([^']+)' column/.exec(res.error.message)?.[1]
    if (!col || !(col in body)) return res
    const { [col]: _dropped, ...rest } = body
    body = rest
  }
  return await send(body)
}
const insertLine = (row) => surviving((p) => supabase.from('takings').insert(p), row)
const updateLine = (id, changes) => surviving((p) => supabase.from('takings').update(p).eq('id', id), changes)

const strip = ({ _pending, ...row }) => row
const sameLine = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b))

// Nothing here is worth reading in front of a queue except what to do next.
function explain(error) {
  if (!navigator.onLine) return 'No internet — every rider is saved on this phone. Keep going.'
  if (error.code === 'PGRST205' || error.code === '42P01')
    return 'The database is missing the takings table — run supabase/2026-08-04-fast-lane.sql in Supabase. Nothing is lost, it sends itself after that.'
  return `${error.message} — saved on this phone, nothing lost.`
}

export default function Fast() {
  const month = currentMonth()
  const prev = prevMonth()
  const today = todayISO()
  const yesterday = addDays(today, -1)
  const [params, setParams] = useSearchParams()

  const [cars, setCars] = useState([])
  const [book, setBook] = useState([]) // the server's register, months back
  const [outbox, setOutbox] = useState(readOutbox) // written here, not confirmed yet
  const [memberNames, setMemberNames] = useState([])
  const [expenses, setExpenses] = useState([])
  const [onetime, setOnetime] = useState([])
  const [subs, setSubs] = useState([])

  const [day, setDay] = useState(today) // never remembered: a fresh page always writes today
  const [otherDay, setOtherDay] = useState(false)
  const [car, setCar] = useState(readCar)
  const [method, setMethod] = useState('cash')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [owed, setOwed] = useState('')
  const [owedOpen, setOwedOpen] = useState(false)
  const [phoneOpen, setPhoneOpen] = useState(false)

  const [confirm, setConfirm] = useState(null) // an unusual amount waiting for a second tap
  const [editing, setEditing] = useState(null)
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const [showLapsed, setShowLapsed] = useState(false)
  const [err, setErr] = useState('')

  const nameRef = useRef(null)
  const amountRef = useRef(null)
  const syncing = useRef(false)
  const syncAgain = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(CAR_KEY, car)
    } catch {
      /* private window: the vehicle is picked again next time */
    }
  }, [car])

  async function load() {
    const since = addDays(today, -NAME_MEMORY_DAYS)
    const recent = addDays(today, -45)
    const [cs, tk, ms, ex, ot, sb] = await Promise.all([
      supabase.from('cars').select('*').order('name'),
      // Months of register, not days: the man in front of him on the 5th of
      // September paid in August, and that is exactly the spelling wanted.
      fetchAll(() =>
        supabase.from('takings').select('*').gte('taken_on', since).order('taken_on', { ascending: false }).order('id'),
      ),
      // Names only. The members list is a spelling aid here, nothing more.
      supabase.from('members').select('name').neq('status', 'left').order('name').limit(1000),
      supabase.from('expenses').select('*').gte('date', recent),
      supabase.from('onetime_rides').select('*').gte('date', recent),
      supabase.from('subscriptions').select('id, amount, paid_via, created_at').gte('created_at', recent),
    ])
    if (tk.error) setErr(explain(tk.error))
    setCars(cs.data || [])
    setBook(tk.data || [])
    setMemberNames((ms.data || []).map((m) => m.name))
    setExpenses(ex.data || [])
    setOnetime(ot.data || [])
    setSubs(sb.data || [])
    setOutbox(readOutbox())
  }

  useEffect(() => {
    load().then(sync)
    const onOnline = () => sync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // From the Month page: "write this rider in". The name is filled, the amount
  // waits for him — nothing is entered by a link alone.
  useEffect(() => {
    const n = params.get('name')
    if (!n) return
    setName(n)
    setParams({}, { replace: true })
    setTimeout(() => amountRef.current?.focus(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Send whatever is waiting. Safe to call at any time and from anywhere:
  //  - each line is taken off the phone by its own id, re-read from disk, so a
  //    line saved while another was on its way can never be wiped with it;
  //  - a line the server already has (a retry, two tabs) comes back as a
  //    duplicate key, and the phone's version is written over it — which is
  //    also how a line changed while it was on its way gets its change across.
  async function sync() {
    if (syncing.current) {
      syncAgain.current = true
      return
    }
    syncing.current = true
    try {
      do {
        syncAgain.current = false
        for (const row of readOutbox()) {
          const clean = strip(row)
          let res = await insertLine(clean)
          if (res.error?.code === '23505') {
            const { id, ...changes } = clean
            res = await updateLine(id, changes)
          }
          if (res.error) {
            setErr(explain(res.error))
            return
          }
          const now = readOutbox().find((q) => q.id === row.id)
          if (!now) {
            // Deleted on the phone while it was being sent.
            await supabase.from('takings').delete().eq('id', row.id)
            continue
          }
          if (!sameLine(now, row)) {
            // Changed while it was being sent: go round once more with the change.
            syncAgain.current = true
            continue
          }
          writeOutbox(readOutbox().filter((q) => q.id !== row.id))
          setOutbox(readOutbox())
          // The server stamps its own time; this copy only needs to sort where
          // the line already stood, at the top of the day.
          setBook((b) => [{ ...clean, created_at: new Date().toISOString() }, ...b.filter((x) => x.id !== clean.id)])
        }
      } while (syncAgain.current)
      setErr('')
    } finally {
      syncing.current = false
    }
  }

  // ---- what the register knows ------------------------------------------

  // Unsent lines first and newest first: the outbox is kept oldest-first.
  const allLines = useMemo(() => {
    const waiting = new Set(outbox.map((o) => o.id))
    return [
      ...outbox.map((o) => ({ ...o, _pending: true })).reverse(),
      ...book.filter((b) => !waiting.has(b.id)),
    ]
  }, [outbox, book])

  const dayLines = useMemo(
    () =>
      allLines
        .filter((l) => l.taken_on === day)
        .sort(
          (a, b) =>
            (b._pending ? 1 : 0) - (a._pending ? 1 : 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')),
        ),
    [allLines, day],
  )

  const index = useMemo(() => nameIndex(allLines, memberNames), [allLines, memberNames])
  const suggestions = useMemo(() => suggest(index, name), [index, name])
  const known = useMemo(() => knownRider(index, name), [index, name])
  const presets = useMemo(() => amountPresets(book), [book])

  // Who has paid in the month of the day being written — to mark them in the
  // suggestions and to stop the same rider being written twice in a month.
  const dayMonth = monthOf(day)
  const paidThisMonth = useMemo(
    () => new Set(allLines.filter((l) => monthOf(l.taken_on) === dayMonth).map((l) => riderKey(l.name))),
    [allLines, dayMonth],
  )
  const typedKey = riderKey(name)
  const mineThisMonth = useMemo(
    () =>
      typedKey
        ? allLines
            .filter((l) => riderKey(l.name) === typedKey && monthOf(l.taken_on) === dayMonth)
            .sort((a, b) => String(a.taken_on).localeCompare(String(b.taken_on)))
        : [],
    [allLines, typedKey, dayMonth],
  )
  const mineToday = mineThisMonth.filter((l) => l.taken_on === day)

  // The day being written, counted the same way the End of day screen counts
  // it — same function, so the two screens can never disagree.
  const box = useMemo(
    () => cashbox({ day, takings: book, pending: outbox, subs, onetime, expenses }),
    [day, book, outbox, subs, onetime, expenses],
  )
  const dayMoney = useMemo(() => splitByMethod(dayLines), [dayLines])

  // Who paid last month and has not come this month: the round's to-do list.
  const missing = useMemo(() => lapsed(allLines, month.key, prev.key), [allLines, month.key, prev.key])

  const carName = (id) => {
    const c = cars.find((x) => x.id === id)
    return c ? `${c.name} · ${c.driver_name}` : 'No vehicle'
  }

  // ---- writing ------------------------------------------------------------

  function save(value, force = false) {
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
    // 3000 for 300 is one extra zero and a very bad evening. A second tap.
    const odd = unusualAmount(amt, known?.amount, presets)
    if (odd && !force) {
      setErr('')
      setConfirm({ amount: amt, ...odd })
      return
    }
    setConfirm(null)
    const row = {
      id: newId(),
      name: who,
      // Optional, and it stays optional. Waiting for a number at the front of
      // a queue is how the round dies.
      phone: normalizePhone(phone) || null,
      amount: amt,
      // What he still has to come back for. Never part of the cash count, and
      // only sent when there is one — so a full payment can never be held up by
      // a migration that has not been run yet.
      ...(Number(owed) > 0 ? { owed: Number(owed) } : {}),
      car_id: car || null,
      method,
      for_month: monthOf(day),
      taken_on: day,
      member_id: null,
      subscription_id: null,
    }
    const onDisk = writeOutbox([...readOutbox(), row])
    setOutbox(readOutbox())
    setName('')
    setPhone('')
    setAmount('')
    setOwed('')
    setOwedOpen(false)
    setErr(
      onDisk
        ? ''
        : 'This phone will not let the app save — keep this page open until every line says saved, and take a backup.',
    )
    toast(`${who} · ${aed(amt)} ${METHOD_LABEL[method].toLowerCase()}${day === today ? '' : ` · ${dayLabel(day)}`}`)
    nameRef.current?.focus()
    sync()
  }

  // A line fixed afterwards. On the phone it is changed in place and goes up
  // with the change; on the server it is updated by its id.
  async function saveEdit(patch) {
    const line = editing
    const changes = { ...patch, for_month: monthOf(patch.taken_on) }
    if (line._pending) {
      writeOutbox(readOutbox().map((q) => (q.id === line.id ? { ...q, ...changes } : q)))
      setOutbox(readOutbox())
      sync()
    } else {
      const { error } = await updateLine(line.id, changes)
      if (error) return error.message
      setBook((b) => b.map((x) => (x.id === line.id ? { ...x, ...changes } : x)))
    }
    setEditing(null)
    toast(`Changed — ${changes.name} · ${aed(changes.amount)}`)
    return null
  }

  async function removeLine() {
    const line = editing
    if (line._pending) {
      writeOutbox(readOutbox().filter((q) => q.id !== line.id))
      setOutbox(readOutbox())
    } else {
      const { error } = await supabase.from('takings').delete().eq('id', line.id)
      if (error) return error.message
      setBook((b) => b.filter((x) => x.id !== line.id))
    }
    setEditing(null)
    toast(`Deleted — ${line.name} · ${aed(line.amount)}`, 'warn')
    return null
  }

  // A copy of the whole book in his own hands, for the day he stops trusting
  // any of this. Every line ever written, plus the ones not sent yet.
  async function backup() {
    const { data, error } = await fetchAll(() =>
      supabase.from('takings').select('*').order('taken_on', { ascending: false }).order('id'),
    )
    if (error) return setErr(explain(error))
    const waiting = readOutbox()
    const ids = new Set(waiting.map((w) => w.id))
    const all = [...waiting.map((p) => ({ ...p, _pending: true })), ...(data || []).filter((d) => !ids.has(d.id))]
    if (!all.length) return setErr('Nothing in the register to back up yet.')
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['date', 'name', 'number', 'amount', 'still owes', 'method', 'vehicle', 'driver', 'saved'],
      ...all.map((r) => {
        const c = cars.find((x) => x.id === r.car_id)
        return [
          r.taken_on,
          r.name,
          r.phone || '',
          r.amount,
          Number(r.owed) > 0 ? r.owed : '',
          r.method,
          c?.name || '',
          c?.driver_name || '',
          r._pending ? 'NOT SENT YET' : 'saved',
        ]
      }),
    ]
      .map((r) => r.map(cell).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `carlift-register-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(`Backup downloaded — ${all.length} lines`)
  }

  function writeName(n) {
    setName(n)
    setConfirm(null)
    nameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    amountRef.current?.focus()
  }

  const pickDay = (d, other = false) => {
    setDay(d)
    setOtherDay(other)
    setConfirm(null)
  }

  const found = useMemo(() => findRiders(allLines, query), [allLines, query])
  const paidNow = useMemo(
    () => new Set(allLines.filter((l) => monthOf(l.taken_on) === month.key).map((l) => riderKey(l.name))),
    [allLines, month.key],
  )

  const isToday = day === today
  const first = (n) => String(n || '').trim().split(/\s+/)[0]

  return (
    <div className="space-y-4">
      <PageHead
        title="Register"
        subtitle="Name and amount. Nothing else."
        action={
          <div className="flex gap-2">
            <button onClick={() => setFindOpen(true)} className="icon-btn" aria-label="Find a rider" title="Find a rider">
              <SearchIcon className="w-[18px] h-[18px]" />
            </button>
            <button onClick={backup} className="icon-btn" aria-label="Download a backup" title="Backup (CSV)">
              <DownloadIcon className="w-[18px] h-[18px]" />
            </button>
          </div>
        }
      />

      {/* The day's money. The first number is the one he can check against his
          own pocket; card and bank exist somewhere else and say so. */}
      <section className="card rise">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label">{isToday ? 'Cash in your hand now' : `Cash taken on ${dayLabel(day)}`}</p>
            <Money value={box.expected} className="text-[30px]" tone={box.expected < 0 ? 'var(--bad)' : undefined} />
            <p className="text-[11.5px] muted mt-2 leading-snug">
              {aed(box.fast + box.unsentCash)} cash in the register
              {box.payments > 0 ? ` + ${aed(box.payments)} on Collect` : ''}
              {box.rides > 0 ? ` + ${aed(box.rides)} one-time` : ''}
              {box.spent > 0 ? ` − ${aed(box.spent)} paid out` : ''}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[30px] font-extrabold tracking-display leading-none">{dayLines.length}</p>
            <p className="text-[11px] font-bold muted mt-1">
              rider{dayLines.length === 1 ? '' : 's'} {isToday ? 'today' : 'that day'}
            </p>
          </div>
        </div>
        {dayMoney.notCash > 0 && (
          <p className="mt-3 rounded-xl bg-sunk px-3 py-2 text-[12px] leading-snug">
            Card <b className="num">{aed(dayMoney.card)}</b> · Bank <b className="num">{aed(dayMoney.transfer)}</b> — went
            to the account. Not in your bag, not in the number above.
          </p>
        )}
      </section>

      {outbox.length > 0 ? (
        <Banner
          tone="warn"
          action={
            <button onClick={sync} className="btn-ghost px-3 py-1.5 text-[12.5px] shrink-0">
              Retry
            </button>
          }
        >
          <b>{outbox.length} not sent yet</b> — kept on this phone. Keep going; they send themselves when the signal
          comes back. Do not clear the browser until this goes.
        </Banner>
      ) : (
        dayLines.length > 0 && (
          <p className="text-[12.5px] font-bold text-good text-center">✓ All {dayLines.length} saved on the server</p>
        )
      )}

      {/* ---- which day, which vehicle — picked once for the whole queue ---- */}
      <section className="space-y-2.5">
        <div className="seg">
          <button aria-pressed={isToday} onClick={() => pickDay(today)}>
            Today
          </button>
          <button aria-pressed={day === yesterday && !otherDay} onClick={() => pickDay(yesterday)}>
            Yesterday
          </button>
          <button aria-pressed={otherDay && !isToday} onClick={() => pickDay(isToday ? addDays(today, -2) : day, true)}>
            Other day
          </button>
        </div>
        {otherDay && !isToday && (
          <input
            className="input"
            type="date"
            max={today}
            // The pay-outs this screen subtracts are loaded 45 days back.
            min={addDays(today, -45)}
            value={day}
            onChange={(e) => e.target.value && e.target.value <= today && pickDay(e.target.value, true)}
          />
        )}
        {!isToday && (
          <Banner
            tone="warn"
            action={
              <button onClick={() => pickDay(today)} className="btn-ghost px-3 py-1.5 text-[12.5px] shrink-0">
                Today
              </button>
            }
          >
            Writing for <b>{dayLabel(day)}</b> — not today. Every line goes on that day.
          </Banner>
        )}

        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-[18px] px-[18px] lg:mx-0 lg:px-0 pb-0.5">
          {cars.map((c) => (
            <button key={c.id} onClick={() => setCar(c.id)} className={`pill ${car === c.id ? 'pill-on' : ''}`}>
              {c.name}
              <span className={car === c.id ? 'font-semibold opacity-80' : 'font-semibold muted'}>· {c.driver_name}</span>
            </button>
          ))}
          <button onClick={() => setCar('')} className={`pill ${car === '' ? 'pill-on' : ''}`}>
            No vehicle
          </button>
        </div>
        {car === '' && cars.length > 0 && (
          <p className="text-[11.5px] font-bold text-warn px-0.5">
            No vehicle picked — these riders will not count for any driver on the Month page.
          </p>
        )}
      </section>

      {/* ---- the line ---------------------------------------------------------- */}
      <section className="card space-y-3.5 rise">
        {/* The method stays where it was left, which is right for a run of card
            payments and dangerous for the cash rider who follows them. Silence
            is what makes it dangerous, so it does not stay silent. */}
        {method !== 'cash' && (
          <div className="rounded-xl px-3 py-2.5 text-[12.5px] font-bold flex items-center gap-2 bg-warn/12 text-warn">
            <AlertIcon className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              Writing every rider as {method === 'card' ? 'CARD' : 'BANK'} — not cash. This money is not in your bag.
            </span>
            <button onClick={() => setMethod('cash')} className="btn-ghost px-2.5 py-1 text-[12px] shrink-0">
              Back to cash
            </button>
          </div>
        )}

        <div>
          <label className="label" htmlFor="reg-name">
            Name
          </label>
          <input
            id="reg-name"
            ref={nameRef}
            className="input text-lg font-semibold"
            placeholder="Rider's name"
            autoFocus
            autoComplete="off"
            autoCapitalize="words"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setConfirm(null)
              setErr('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && amountRef.current?.focus()}
          />
        </div>

        {mineToday.length > 0 ? (
          <div className="rounded-xl bg-warn/12 text-warn px-3 py-2.5 text-[12.5px] font-bold leading-snug flex gap-2">
            <AlertIcon className="w-4 h-4 shrink-0 mt-px" />
            <span>
              {mineToday[0].name} is already in {isToday ? "today's" : 'this day’s'} register for AED{' '}
              {mineToday.map((l) => aed(l.amount)).join(' + ')}. Write it again only if they really paid twice.
            </span>
          </div>
        ) : (
          mineThisMonth.length > 0 && (
            <div className="rounded-xl bg-warn/12 text-warn px-3 py-2.5 text-[12.5px] font-bold leading-snug flex gap-2">
              <AlertIcon className="w-4 h-4 shrink-0 mt-px" />
              <span>
                Already paid this month:{' '}
                {mineThisMonth.map((l) => `AED ${aed(l.amount)} on ${dayLabel(l.taken_on)}`).join(', ')}
                {mineThisMonth.at(-1).car_id ? ` · ${carName(mineThisMonth.at(-1).car_id)}` : ''}. Write it again
                only if this is a second payment.
              </span>
            </div>
          )
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => {
              const paid = paidThisMonth.has(riderKey(s.name))
              return (
                <button key={s.key} onClick={() => writeName(s.name)} className="pill">
                  {s.name}
                  {s.amount > 0 && <span className="font-semibold muted">· {aed(s.amount)}</span>}
                  {paid && <span className="chip chip-ok ml-0.5">paid</span>}
                </button>
              )
            })}
          </div>
        )}

        <div>
          <p className="label">
            Amount{known ? ` — ${first(known.name)} paid ${aed(known.amount)} last time` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* What this rider paid last time, first and ringed. Nothing is
                entered by tapping the name alone — it is still one deliberate
                press on the amount. */}
            {known && (
              <button
                onClick={() => save(known.amount)}
                className="btn-primary num text-[16px] px-4 py-3 ring-4 ring-blue/25"
              >
                {aed(known.amount)}
                <span className="font-sans text-[12.5px] font-bold opacity-85">usual</span>
              </button>
            )}
            {presets
              .filter((v) => !known || v !== known.amount)
              .map((v) => (
                <button key={v} onClick={() => save(v)} className="btn-primary num text-[16px] px-4 py-3">
                  {aed(v)}
                </button>
              ))}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            ref={amountRef}
            className="input flex-1 text-lg num"
            type="number"
            inputMode="numeric"
            min="1"
            placeholder="Other amount"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setConfirm(null)
              setErr('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button onClick={() => save()} className="btn-primary px-6 text-[15px]">
            Save
          </button>
        </div>

        {confirm && (
          <div className="rounded-xl border border-warn bg-card p-3 space-y-2.5 pop-in">
            <p className="text-[13px] leading-snug">
              <b className="num">AED {aed(confirm.amount)}</b>?{' '}
              {confirm.kind === 'high' ? 'That is far more than' : 'That is far less than'}{' '}
              {known ? `${first(known.name)}'s usual ${aed(confirm.base)}` : `the usual ${aed(confirm.base)}`}.
            </p>
            <div className="flex gap-2">
              <button onClick={() => save(confirm.amount, true)} className="btn-primary px-4 py-2 text-[13px]">
                Yes, write {aed(confirm.amount)}
              </button>
              <button
                onClick={() => {
                  setAmount(String(confirm.amount))
                  setConfirm(null)
                  amountRef.current?.focus()
                }}
                className="btn-ghost px-4 py-2 text-[13px]"
              >
                Fix the amount
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="label">Paid by</p>
          <div className="seg">
            {[
              ['cash', 'Cash'],
              ['card', 'Card'],
              ['transfer', 'Bank transfer'],
            ].map(([m, l]) => (
              <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Kept out of the way: most riders pay in full and give no number, and
            every extra box on this screen is a second per person. */}
        {(owedOpen || owed) && (
          <div>
            <label className="label" htmlFor="reg-owed">
              Still owes — they will bring it later
            </label>
            <input
              id="reg-owed"
              className="input num"
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="e.g. 150"
              value={owed}
              onChange={(e) => setOwed(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <p className="text-[11.5px] muted mt-1">Not counted as cash. It goes on the list to recover.</p>
          </div>
        )}
        {(phoneOpen || phone) && (
          <div>
            <label className="label" htmlFor="reg-phone">
              Phone number — only if they give it
            </label>
            <input
              id="reg-phone"
              className="input"
              type="tel"
              autoComplete="off"
              placeholder="05x xxx xxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        )}
        {!(owedOpen || owed) || !(phoneOpen || phone) ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {!(owedOpen || owed) && (
              <button type="button" onClick={() => setOwedOpen(true)} className="text-[13px] font-extrabold text-blue py-1">
                + Paid only part of it
              </button>
            )}
            {!(phoneOpen || phone) && (
              <button type="button" onClick={() => setPhoneOpen(true)} className="text-[13px] font-extrabold text-blue py-1">
                + Phone number
              </button>
            )}
          </div>
        ) : null}

        {err && <p className="text-[13px] font-bold text-bad">{err}</p>}
      </section>

      {/* ---- the day's lines ---------------------------------------------------- */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2 px-0.5">
          <h2 className="text-[15px] font-extrabold">{isToday ? "Today's register" : dayLabel(day)}</h2>
          <span className="num text-[12px] font-bold muted">
            {dayLines.length} · AED {aed(dayMoney.total)}
          </span>
        </div>
        {dayLines.length > 0 ? (
          <ul className="card p-0 overflow-hidden divide-y divide-hair">
            {dayLines.map((r) => (
              <li key={r.id}>
                <button onClick={() => setEditing(r)} className="w-full text-left flex items-center gap-2.5 px-4 py-3 press">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-bold truncate">{r.name}</span>
                    <span className="block text-[11.5px] muted truncate">
                      {carName(r.car_id)}
                      {r.phone ? ` · ${r.phone}` : ''}
                    </span>
                  </span>
                  {r.method && r.method !== 'cash' && <span className="chip chip-info">{METHOD_LABEL[r.method]}</span>}
                  {Number(r.owed) > 0 && <span className="chip chip-warn">owes {aed(r.owed)}</span>}
                  {r._pending && <span className="chip chip-warn">unsent</span>}
                  <span className="num text-[15px] font-bold shrink-0">{aed(r.amount)}</span>
                  <PencilIcon className="w-4 h-4 text-soft shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card text-center text-[13px] muted py-8">Nothing written {isToday ? 'yet today' : 'on this day'}.</p>
        )}
        {dayLines.length > 0 && (
          <p className="text-[11.5px] muted mt-2 px-0.5">Tap a line to fix the name, the amount, the vehicle or the day.</p>
        )}
      </section>

      {/* ---- the round's to-do list -------------------------------------------- */}
      {missing.length > 0 && (
        <section className="card p-0 overflow-hidden">
          <button
            onClick={() => setShowLapsed((v) => !v)}
            aria-expanded={showLapsed}
            className="w-full flex items-center gap-3 px-4 py-3 text-left press"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-extrabold">Still to come in {month.en}</span>
              <span className="block text-[11.5px] muted leading-snug">
                Paid in {prev.en}, not yet in {month.en}. Tap a name when they pay.
              </span>
            </span>
            <span className="num text-[13px] font-bold rounded-full px-2.5 py-1 bg-warn/12 text-warn">{missing.length}</span>
            <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-300 ${showLapsed ? 'rotate-180' : ''}`} />
          </button>
          {showLapsed && (
            <div className="flex flex-wrap gap-2 px-4 pb-4 fade-in">
              {missing.map((m) => (
                <button key={m.name} onClick={() => writeName(m.name)} className="pill">
                  {m.name}
                  {m.amount > 0 && <span className="font-semibold muted">· {aed(m.amount)}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---- where to go next --------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2">
        {[
          ['/day', WalletIcon, 'End of day', 'Pay-outs, then count the bag'],
          ['/', ChartIcon, 'Month', 'Who stopped paying'],
          [`/sheet?day=${day}`, DocIcon, 'Statement', `PDF for ${isToday ? 'today' : dayLabel(day)}`],
        ].map(([to, Icon, title, hint]) => (
          <Link key={to} to={to} className="card flex items-center gap-2.5 py-3 press">
            <Icon className="w-5 h-5 text-blue shrink-0" />
            <span className="min-w-0">
              <span className="block text-[13px] font-extrabold leading-tight">{title}</span>
              <span className="block text-[11px] muted leading-tight mt-0.5 truncate">{hint}</span>
            </span>
          </Link>
        ))}
        <button onClick={backup} className="card flex items-center gap-2.5 py-3 press text-left">
          <DownloadIcon className="w-5 h-5 text-blue shrink-0" />
          <span className="min-w-0">
            <span className="block text-[13px] font-extrabold leading-tight">Backup</span>
            <span className="block text-[11px] muted leading-tight mt-0.5 truncate">Every line, as a CSV</span>
          </span>
        </button>
      </div>

      {/* ---- sheets ------------------------------------------------------------- */}
      <LineSheet line={editing} cars={cars} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={removeLine} />

      <Sheet open={findOpen} title="Find a rider" onClose={() => setFindOpen(false)}>
        <div className="space-y-3 pb-2">
          <input
            className="input text-lg"
            placeholder="Type a name — first or last"
            autoFocus
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {found.length > 0 && (
            <ul className="card p-0 overflow-hidden divide-y divide-hair">
              {found.map((r) => (
                <li key={r.key}>
                  <button
                    onClick={() => {
                      setFindOpen(false)
                      setOpenKey(r.key)
                    }}
                    className="w-full text-left flex items-center gap-3 px-4 py-3 press"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-bold truncate">{r.name}</span>
                      <span className="block text-[11.5px] muted">
                        last paid {dayLabel(r.last)} · {r.count} payment{r.count === 1 ? '' : 's'}
                      </span>
                    </span>
                    {paidNow.has(r.key) ? (
                      <span className="chip chip-ok">paid {month.en.slice(0, 3)}</span>
                    ) : (
                      <span className="chip chip-warn">not in {month.en.slice(0, 3)}</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-soft shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && found.length === 0 && (
            <p className="text-[13px] muted">Nobody by that name in the last five months of the register.</p>
          )}
          {query.trim().length < 2 && (
            <p className="text-[12px] muted">
              Answers "I paid already": every payment of a rider in the last five months, with the day and the vehicle.
            </p>
          )}
        </div>
      </Sheet>

      <RiderSheet
        open={!!openKey}
        onClose={() => setOpenKey(null)}
        lines={allLines}
        riderKey={openKey}
        cars={cars}
        onWrite={(n) => {
          setOpenKey(null)
          writeName(n)
        }}
      />
    </div>
  )
}
