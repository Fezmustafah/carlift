import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO } from '../lib/dates'
import { monthKey, monthRange } from '../lib/month'
import { monthAnalysis, monthName, monthOf, shiftMonth, missingText } from '../lib/analysis'
import { riderKey } from '../lib/names'
import { splitByMethod } from '../lib/register'
import { cashboxRange } from '../lib/cashbox'
import { fetchAll } from '../lib/fetchAll'
import { readOutbox, writeOutbox } from '../lib/outbox'
import { copyText } from '../lib/clipboard'
import { PageHead, Money, Delta, Note, Banner, Spinner, toast, aed } from '../components/ui'
import RiderSheet from '../components/RiderSheet'
import {
  BookIcon, ChevronDown, ChevronLeft, ChevronRight, CopyIcon, DocIcon, VanIcon, WhatsAppIcon,
} from '../components/icons'

// The month, against the month before it.
//
// He no longer keeps numbers or a roster: the register is name and amount, and
// that is enough to see a leak. Riders who paid last month and have not paid
// this month are listed under the vehicle they rode — if they are still riding,
// someone is taking their money, and the vehicle says who to ask.

const TREND_MONTHS = 6
const NOT_SAME_KEY = 'carlift.notSame'

const shortDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''
const shortMonth = (key) => monthName(key).slice(0, 3)

const readNotSame = () => {
  try {
    return JSON.parse(localStorage.getItem(NOT_SAME_KEY) || '[]')
  } catch {
    return []
  }
}

/* --------------------------------------------------------------- pieces --- */

function Section({ label, title, children, className = '' }) {
  return (
    <section className={`card rise ${className}`}>
      {(label || title) && (
        <div className="mb-3">
          {label && <p className="label">{label}</p>}
          {title && <h2 className="text-[17px] font-extrabold tracking-display leading-snug">{title}</h2>}
        </div>
      )}
      {children}
    </section>
  )
}

function Row({ label, value, strong, sign, note }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 divide-row ${strong ? 'font-extrabold' : ''}`}>
      <span className={strong ? 'text-[13.5px]' : 'text-[13px] muted'}>
        {label}
        {note && <span className="block text-[11px] font-semibold muted">{note}</span>}
      </span>
      <span className={`num shrink-0 ${strong ? 'text-[15px]' : 'text-[13.5px]'}`}>
        {sign === '-' ? '− ' : ''}
        {aed(value)}
      </span>
    </div>
  )
}

// A list that stays shut until asked — the page leads with the leak, not with
// everyone who is fine.
function Fold({ title, count, tone, hint, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!count) return null
  return (
    <div className="border-t border-hair first:border-t-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left press"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-extrabold">{title}</span>
          {hint && <span className="block text-[11.5px] muted leading-snug mt-0.5">{hint}</span>}
        </span>
        <span
          className={`num text-[13px] font-bold rounded-full px-2.5 py-1 ${
            tone === 'warn' ? 'bg-warn/12 text-warn' : tone === 'good' ? 'bg-good/12 text-good' : 'bg-sunk muted'
          }`}
        >
          {count}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-2 fade-in">{children}</div>}
    </div>
  )
}

function PersonRow({ p, sub, onOpen }) {
  return (
    <li>
      <button onClick={() => onOpen(p.key)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 press">
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-bold truncate">{p.name}</span>
          {sub && <span className="block text-[11.5px] muted truncate">{sub}</span>}
        </span>
        <span className="num text-[13px] font-bold shrink-0">{aed(p.total)}</span>
        <ChevronRight className="w-4 h-4 text-soft shrink-0" />
      </button>
    </li>
  )
}

// Riders per month, one series in one colour: this month in full blue, the
// months before it quieter. Tapping a bar reads it out — and the same numbers
// sit in the table under the switch, so nothing hides behind a tap.
function Trend({ trend, month }) {
  const [pick, setPick] = useState(month)
  const [table, setTable] = useState(false)
  useEffect(() => {
    setPick(month)
  }, [month])
  const max = Math.max(1, ...trend.map((t) => t.riders))
  const shown = trend.find((t) => t.key === pick) || trend.at(-1)
  return (
    <Section label={`Last ${trend.length} months`} title="Riders who paid, month by month">
      <p className="text-[12.5px] mb-3">
        <b>{monthName(shown.key, true)}</b>
        <span className="muted">
          {' '}
          · {shown.riders} rider{shown.riders === 1 ? '' : 's'} · AED {aed(shown.total)}
        </span>
      </p>
      {table ? (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="label">
              <th className="text-left font-extrabold pb-1.5">Month</th>
              <th className="text-right font-extrabold pb-1.5">Riders</th>
              <th className="text-right font-extrabold pb-1.5">AED</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((t) => (
              <tr key={t.key} className="border-t border-hair">
                <td className="py-2">{monthName(t.key, true)}</td>
                <td className="py-2 text-right num">{t.riders}</td>
                <td className="py-2 text-right num">{aed(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${trend.length}, 1fr)` }}>
          {trend.map((t) => {
            const on = t.key === pick
            const now = t.key === month
            return (
              <button
                key={t.key}
                onClick={() => setPick(t.key)}
                onMouseEnter={() => setPick(t.key)}
                onFocus={() => setPick(t.key)}
                aria-label={`${monthName(t.key, true)}: ${t.riders} riders, AED ${aed(t.total)}`}
                aria-pressed={on}
                className="group flex flex-col items-center"
              >
                <span className="h-[18px] text-[11px] font-bold num">{now || on ? t.riders : ''}</span>
                <span className="h-[96px] w-full flex items-end justify-center">
                  <span
                    className={`w-full max-w-[24px] rounded-t-[4px] transition-all duration-300 ${
                      now ? 'bg-blue' : on ? 'bg-blue/55' : 'bg-blue/25 group-hover:bg-blue/40'
                    }`}
                    style={{ height: `${Math.max(t.riders ? 4 : 0, (t.riders / max) * 100)}%` }}
                  />
                </span>
                <span className="w-full h-px bg-hair" />
                <span className={`mt-1.5 text-[11px] ${now ? 'font-extrabold' : 'font-semibold muted'}`}>
                  {shortMonth(t.key)}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <button onClick={() => setTable((v) => !v)} className="mt-3 text-[12px] font-extrabold text-blue">
        {table ? 'Show as bars' : 'Show as a table'}
      </button>
    </Section>
  )
}

/* ----------------------------------------------------------------- page --- */

export default function Month() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const current = monthKey()
  const month = /^\d{4}-\d{2}$/.test(params.get('m') || '') && params.get('m') <= current ? params.get('m') : current

  const [cars, setCars] = useState([])
  const [lines, setLines] = useState(null) // null while loading
  const [expenses, setExpenses] = useState([])
  const [onetime, setOnetime] = useState([])
  const [subs, setSubs] = useState([])
  const [err, setErr] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const [notSame, setNotSame] = useState(readNotSame)
  const [joining, setJoining] = useState(null) // { id, keep }
  const [busy, setBusy] = useState(false)

  const setMonth = (m) => setParams(m === current ? {} : { m }, { replace: true })

  async function load() {
    setErr('')
    const from = `${shiftMonth(month, -(TREND_MONTHS - 1))}-01`
    const start = `${month}-01`
    const { end } = monthRange(month)
    const [cs, tk, ex, ot, sb] = await Promise.all([
      supabase.from('cars').select('id, name, driver_name, seats').order('name'),
      fetchAll(() =>
        supabase
          .from('takings')
          .select('id, name, amount, method, car_id, taken_on, created_at, subscription_id')
          .gte('taken_on', from)
          .lte('taken_on', end)
          .order('taken_on')
          .order('id'),
      ),
      supabase.from('expenses').select('*').gte('date', start).lte('date', end),
      supabase.from('onetime_rides').select('*').gte('date', start).lte('date', end),
      supabase
        .from('subscriptions')
        .select('id, amount, paid_via, created_at')
        .gte('created_at', start)
        .lte('created_at', `${end}T23:59:59`),
    ])
    if (tk.error) setErr(tk.error.message)
    // Lines still on this phone count too — they are money already in the bag.
    const pending = readOutbox()
      .filter((p) => p.taken_on >= from && p.taken_on <= end)
      .map((p) => ({ ...p, _pending: true }))
    const ids = new Set(pending.map((p) => p.id))
    setCars(cs.data || [])
    setLines([...pending, ...(tk.data || []).filter((t) => !ids.has(t.id))])
    setExpenses(ex.data || [])
    setOnetime(ot.data || [])
    setSubs(sb.data || [])
  }

  useEffect(() => {
    setLines(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const a = useMemo(
    () => (lines ? monthAnalysis({ lines, cars, month, today, months: TREND_MONTHS }) : null),
    [lines, cars, month, today],
  )

  // ---- money -------------------------------------------------------------
  const money = useMemo(() => {
    if (!lines) return null
    const start = `${month}-01`
    const { end } = monthRange(month)
    const reg = splitByMethod(lines.filter((l) => monthOf(l.taken_on) === month))
    // A payment typed on Collect that was made from a register line exists
    // twice; the register line is the one counted.
    const copies = new Set(lines.map((l) => l.subscription_id).filter(Boolean))
    const col = splitByMethod(
      subs.filter((s) => !copies.has(s.id)).map((s) => ({ amount: s.amount, method: s.paid_via })),
    )
    const rides = onetime.reduce((t, o) => t + Number(o.amount || 0), 0)
    const spent = expenses.reduce((t, e) => t + Number(e.amount || 0), 0)
    const inHand = cashboxRange({
      from: start,
      to: end < today ? end : today,
      takings: lines.filter((l) => !l._pending),
      pending: lines.filter((l) => l._pending),
      subs,
      onetime,
      expenses,
    }).expected
    const cash = reg.cash + col.cash + rides
    const collected = reg.total + col.total + rides
    return { cash, card: reg.card + col.card, transfer: reg.transfer + col.transfer, collected, spent, inHand, rides, col }
  }, [lines, subs, onetime, expenses, month, today])

  // ---- maybe the same person ---------------------------------------------
  const pairs = useMemo(() => (a ? a.similar.filter((p) => !notSame.includes(p.id)) : []), [a, notSame])

  function dismiss(pair) {
    const next = [...notSame, pair.id]
    setNotSame(next)
    try {
      localStorage.setItem(NOT_SAME_KEY, JSON.stringify(next))
    } catch {
      /* the pair simply comes back next time */
    }
  }

  // One spelling for one rider, on every line the page can see — server and
  // phone alike — so both lists above correct themselves.
  async function join(pair, keep) {
    const target = keep === 'a' ? pair.a.name : pair.b.name
    const fromKey = keep === 'a' ? pair.b.key : pair.a.key
    const ids = lines.filter((l) => riderKey(l.name) === fromKey).map((l) => l.id)
    if (!ids.length) return setJoining(null)
    setBusy(true)
    const outbox = readOutbox()
    const onPhone = new Set(outbox.map((o) => o.id))
    writeOutbox(outbox.map((o) => (ids.includes(o.id) ? { ...o, name: target } : o)))
    const serverIds = ids.filter((id) => !onPhone.has(id))
    if (serverIds.length) {
      const { error } = await supabase.from('takings').update({ name: target }).in('id', serverIds)
      if (error) {
        setBusy(false)
        setErr(`${error.message} — nothing was renamed on the server.`)
        return
      }
    }
    setLines((ls) => ls.map((l) => (ids.includes(l.id) ? { ...l, name: target } : l)))
    setBusy(false)
    setJoining(null)
    toast(`Joined — ${ids.length} line${ids.length === 1 ? '' : 's'} now read “${target}”`)
  }

  async function copyMissing(carId) {
    const text = missingText(a, { carId, today: shortDate(today) })
    if (!text) return
    const ok = await copyText(text)
    toast(ok ? 'Copied — paste it in WhatsApp' : 'Could not copy on this phone', ok ? 'good' : 'warn')
  }

  // ---- render ------------------------------------------------------------
  const head = (
    <PageHead
      title={monthName(month)}
      subtitle={`Who paid, who stopped, and in which vehicle — against ${monthName(shiftMonth(month, -1))}.`}
      below={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="icon-btn"
            aria-label="Month before"
          >
            <ChevronLeft className="w-[18px] h-[18px]" />
          </button>
          <div className="flex-1 rounded-[13px] bg-sunk h-11 flex items-center justify-center gap-2 text-[13px] font-extrabold">
            {monthName(month, true)}
            {month === current && <span className="chip chip-info">this month</span>}
          </div>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="icon-btn disabled:opacity-30"
            disabled={month >= current}
            aria-label="Month after"
          >
            <ChevronRight className="w-[18px] h-[18px]" />
          </button>
        </div>
      }
    />
  )

  if (!a)
    return (
      <div className="space-y-4">
        {head}
        <Spinner label="Reading the register…" />
      </div>
    )

  const prevName = monthName(a.prev)
  const nowName = monthName(a.month)
  const missingGroups = a.byCar.filter((r) => r.missing.length)
  const newcomers = a.fresh.filter((p) => !p.returning)
  const carLabel = (id) => {
    const c = cars.find((x) => x.id === id)
    return c ? `${c.name} · ${c.driver_name}` : 'No vehicle written'
  }
  const writeIn = (name) => navigate(`/fast?name=${encodeURIComponent(name)}`)

  return (
    <div className="space-y-4">
      {head}

      {err && <Banner tone="bad">{err}</Banner>}

      {a.roundOpen && (
        <Banner tone="blue">
          The collection round runs <b>5–10 {nowName}</b>. Until the 10th a name below may simply not have come yet.
        </Banner>
      )}

      {/* ---- the two numbers ------------------------------------------------ */}
      <section className="card rise">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="label">Riders paid</p>
            <p className="text-[44px] font-extrabold tracking-display leading-none">{a.now.riders}</p>
            <div className="mt-2">
              <Delta value={a.now.riders - a.before.riders} />
            </div>
            <p className="text-[11.5px] muted mt-1">
              {prevName}: <b className="text-ink">{a.before.riders}</b>
            </p>
          </div>
          <div>
            <p className="label">Register total</p>
            <Money value={a.now.total} className="text-[26px]" />
            <div className="mt-2.5">
              <Delta value={a.now.total - a.before.total} />
            </div>
            <p className="text-[11.5px] muted mt-1">
              {prevName}: <b className="text-ink">AED {aed(a.before.total)}</b>
            </p>
          </div>
        </div>
        <div className="h-px bg-sunk my-4" />
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Paid both months', a.continuing.length, ''],
            [a.roundOpen ? 'Not paid yet' : 'Stopped', a.missing.length, a.missing.length ? 'text-bad' : ''],
            ['New', a.fresh.length, a.fresh.length ? 'text-good' : ''],
          ].map(([k, v, tone]) => (
            <div key={k} className="rounded-xl bg-sunk px-2.5 py-2">
              <p className={`text-[22px] font-extrabold tracking-display leading-none ${tone}`}>{v}</p>
              <p className="text-[11px] font-bold muted mt-1 leading-tight">{k}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- the leak --------------------------------------------------------- */}
      <section className="card p-0 overflow-hidden rise">
        <div className="p-4 pb-3">
          <p className="label">{a.roundOpen ? 'Still to come' : 'Stopped paying'}</p>
          <h2 className="text-[17px] font-extrabold tracking-display leading-snug">
            Paid in {prevName}, {a.roundOpen ? 'not yet' : 'not'} in {nowName}
          </h2>
          {a.missing.length > 0 ? (
            <>
              <p className="mt-2 flex items-baseline gap-2 flex-wrap">
                <span className="text-[32px] font-extrabold tracking-display leading-none text-bad">
                  {a.missing.length}
                </span>
                <span className="text-[12.5px] muted">
                  rider{a.missing.length === 1 ? '' : 's'} · they paid <b className="text-ink">AED {aed(a.atStake)}</b> in{' '}
                  {prevName}
                </span>
              </p>
              {a.worst && (
                <p className="text-[12.5px] mt-2.5 leading-relaxed">
                  Most are from <b>{a.worst.name}</b>
                  {a.worst.driver && (
                    <>
                      {' '}
                      — <b>{a.worst.driver}</b>
                    </>
                  )}
                  : {a.worst.missing.length} of the {a.worst.before.riders} who paid in {prevName}.{' '}
                  {a.roundOpen ? 'Watch this one after the 10th.' : 'Ask who is still riding.'}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[13px] font-bold text-good">
              Everyone who paid in {prevName} has paid in {nowName}.
            </p>
          )}
        </div>

        {missingGroups.map((g) => (
          <div key={g.car_id || 'none'} className="border-t border-hair">
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-sunk/70">
              <VanIcon className="w-[18px] h-[18px] text-muted shrink-0" />
              {/* The driver's name is the point of the group: it never gets cut. */}
              <p className="flex-1 min-w-0 leading-tight">
                <span className="block text-[13.5px] font-extrabold">
                  {g.name}
                  {g.driver && <span className="font-semibold muted"> · {g.driver}</span>}
                </span>
                <span className="block text-[11.5px] font-bold muted mt-0.5">
                  {g.missing.length} rider{g.missing.length === 1 ? '' : 's'} · AED {aed(g.missingAed)} in {prevName}
                </span>
              </p>
              <button
                onClick={() => copyMissing(g.car_id)}
                className="icon-btn w-9 h-9 rounded-xl"
                aria-label={`Copy the ${g.name} list`}
                title="Copy this list"
              >
                <CopyIcon className="w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-hair">
              {g.missing.map((p) => (
                <PersonRow
                  key={p.key}
                  p={p}
                  onOpen={setOpenKey}
                  sub={`last paid ${shortDate(p.last)} · ${
                    p.months > 1 ? `paid ${p.months} of the last ${TREND_MONTHS} months` : `first and only month`
                  }`}
                />
              ))}
            </ul>
          </div>
        ))}

        {a.missing.length > 0 && (
          <div className="p-3 border-t border-hair">
            <button onClick={() => copyMissing(undefined)} className="btn-soft w-full py-3 text-[14px]">
              <WhatsAppIcon className="w-[18px] h-[18px] shrink-0" />
              Copy the list for WhatsApp
            </button>
          </div>
        )}
      </section>

      {/* ---- maybe the same person -------------------------------------------- */}
      {pairs.length > 0 && (
        <Section label="Check the spelling" title="Maybe the same person">
          <p className="text-[12.5px] muted leading-relaxed -mt-1 mb-3">
            Written one way in {prevName} and another in {nowName}, one rider counts once as stopped and once as new.
            Join them and both lists correct themselves.
          </p>
          <div className="space-y-2.5">
            {pairs.map((p) => {
              const asking = joining?.id === p.id
              const keepName = asking ? (joining.keep === 'a' ? p.a.name : p.b.name) : ''
              const fromName = asking ? (joining.keep === 'a' ? p.b.name : p.a.name) : ''
              return (
                <div key={p.id} className="rounded-xl bg-sunk p-3 space-y-2.5">
                  <div className="text-[13px] leading-snug">
                    <b>{p.a.name}</b> <span className="muted">· {shortMonth(a.prev)} · {aed(p.a.total)}</span>
                    <span className="muted"> ⇄ </span>
                    <b>{p.b.name}</b> <span className="muted">· {shortMonth(a.month)} · {aed(p.b.total)}</span>
                    <span className="block text-[11.5px] muted mt-0.5">
                      {p.why} · {carLabel(p.a.car_id)}
                      {p.b.car_id !== p.a.car_id ? ` → ${carLabel(p.b.car_id)}` : ''}
                    </span>
                  </div>
                  {asking ? (
                    <div className="space-y-2">
                      <p className="text-[12.5px]">
                        Every “{fromName}” line becomes <b>“{keepName}”</b>. Sure?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => join(p, joining.keep)}
                          disabled={busy}
                          className="btn-primary px-4 py-2 text-[13px]"
                        >
                          {busy ? 'Joining…' : 'Yes, join them'}
                        </button>
                        <button onClick={() => setJoining(null)} className="btn-ghost px-4 py-2 text-[13px]">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setJoining({ id: p.id, keep: 'a' })}
                        className="btn-primary px-3 py-2 text-[12.5px]"
                      >
                        Same — keep “{p.a.name}”
                      </button>
                      <button
                        onClick={() => setJoining({ id: p.id, keep: 'b' })}
                        className="btn-ghost px-3 py-2 text-[12.5px]"
                      >
                        Keep “{p.b.name}”
                      </button>
                      <button onClick={() => dismiss(p)} className="px-2 py-2 text-[12.5px] font-bold muted">
                        Not the same
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* ---- per driver --------------------------------------------------------- */}
      <section className="card p-0 overflow-hidden rise">
        <div className="p-4 pb-2">
          <p className="label">Per driver</p>
          <h2 className="text-[17px] font-extrabold tracking-display leading-snug">
            Riders by vehicle, {shortMonth(a.prev)} → {shortMonth(a.month)}
          </h2>
        </div>
        <ul className="divide-y divide-hair">
          {a.byCar.map((r) => {
            const change = r.now.riders - r.before.riders
            return (
              <li key={r.car_id || 'none'} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-extrabold truncate">
                      {r.name}
                      {r.driver && <span className="font-semibold muted"> · {r.driver}</span>}
                    </span>
                    <span className="block text-[11.5px] muted">
                      {r.seats ? `${r.seats} seats · ` : ''}AED {aed(r.before.total)} → {aed(r.now.total)}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[17px] font-extrabold tracking-display leading-none">
                      <span className="muted font-bold">{r.before.riders} →</span> {r.now.riders}
                    </span>
                    <span className="block mt-1">
                      <Delta value={change} />
                    </span>
                  </span>
                </div>
                {r.missing.length > 0 && (
                  <p className={`text-[11.5px] font-bold mt-1.5 ${a.roundOpen ? 'text-warn' : 'text-bad'}`}>
                    {r.missing.length} from {prevName} {a.roundOpen ? 'not paid yet' : 'stopped paying'}
                    {r.fresh ? ` · ${r.fresh} new` : ''}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        <div className="px-4 pb-4 pt-1">
          <Note>
            A rider counts for the vehicle written on their newest line. Lines with no vehicle cannot point at a driver
            — pick the vehicle on the Register before the queue starts.
          </Note>
        </div>
      </section>

      {/* ---- everyone else ------------------------------------------------------- */}
      <section className="card p-0 overflow-hidden rise">
        <Fold
          title={`Back after missing a month`}
          count={a.returning.length}
          tone="warn"
          hint="Paid before, skipped a month, paid again now. Where did their money go in the month they missed?"
          defaultOpen
        >
          <ul className="divide-y divide-hair">
            {a.returning.map((p) => (
              <PersonRow
                key={p.key}
                p={p}
                onOpen={setOpenKey}
                sub={`last paid before: ${monthName(p.lastSeen)} · ${carLabel(p.car_id)}`}
              />
            ))}
          </ul>
        </Fold>
        <Fold title={`New in ${nowName}`} count={newcomers.length} tone="good" hint="First time in the register.">
          <ul className="divide-y divide-hair">
            {newcomers.map((p) => (
              <PersonRow key={p.key} p={p} onOpen={setOpenKey} sub={`${shortDate(p.last)} · ${carLabel(p.car_id)}`} />
            ))}
          </ul>
        </Fold>
        <Fold title={`Paid in both ${prevName} and ${nowName}`} count={a.continuing.length}>
          <ul className="divide-y divide-hair">
            {a.continuing.map((p) => (
              <PersonRow key={p.key} p={p} onOpen={setOpenKey} sub={`${shortDate(p.last)} · ${carLabel(p.car_id)}`} />
            ))}
          </ul>
        </Fold>
        {!a.returning.length && !newcomers.length && !a.continuing.length && (
          <p className="p-4 text-[13px] muted">Nobody has been written in {nowName} yet.</p>
        )}
      </section>

      {/* ---- money ----------------------------------------------------------- */}
      {money && (
        <Section label={`Money in ${nowName}`} title="Where it is">
          <Row label="Cash" value={money.cash} />
          <Row label="Card" value={money.card} note={money.card ? 'in the bank account, not in the bag' : ''} />
          <Row label="Bank transfer" value={money.transfer} />
          <Row label="Collected" value={money.collected} strong />
          <Row label="Paid out" value={money.spent} sign="-" />
          <Row label="Net" value={money.collected - money.spent} strong />
          <Row label="Cash that should be in hand" value={money.inHand} note="cash collected − paid out" />
          {(money.rides > 0 || money.col.total > 0) && (
            <p className="text-[11.5px] muted mt-2 leading-relaxed">
              Includes {money.col.total > 0 ? `AED ${aed(money.col.total)} typed on Collect` : ''}
              {money.col.total > 0 && money.rides > 0 ? ' and ' : ''}
              {money.rides > 0 ? `AED ${aed(money.rides)} of one-time rides` : ''} — the rider counts above are the
              register only.
            </p>
          )}
        </Section>
      )}

      <Trend trend={a.trend} month={month} />

      <div className="grid grid-cols-2 gap-2">
        <Link to={`/sheet?month=${month}`} className="card flex items-center gap-2.5 py-3 press">
          <DocIcon className="w-5 h-5 text-blue shrink-0" />
          <span className="text-[13px] font-extrabold leading-tight">Statement for {nowName}</span>
        </Link>
        <Link to="/fast" className="card flex items-center gap-2.5 py-3 press">
          <BookIcon className="w-5 h-5 text-blue shrink-0" />
          <span className="text-[13px] font-extrabold leading-tight">Open the register</span>
        </Link>
      </div>

      <RiderSheet
        open={!!openKey}
        onClose={() => setOpenKey(null)}
        lines={lines}
        riderKey={openKey}
        cars={cars}
        onWrite={month === current ? writeIn : undefined}
      />
    </div>
  )
}
