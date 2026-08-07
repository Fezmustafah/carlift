import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayISO, addDays, fmt } from '../lib/dates'
import { Link } from 'react-router-dom'
import { monthKey, monthLabel, lastMonths } from '../lib/month'
import { cashbox, difference, daysOfMonth } from '../lib/cashbox'

// End of a collection day: count the bag, compare it with the books, write the
// answer down before the memory of the day is gone.
//
// The difference is the whole point of the screen. A day that balances proves
// the round is clean; a day that does not is a question asked while it can
// still be answered, instead of a hole found at the end of the month.

const OUTBOX_KEY = 'carlift.fast.outbox'

const readOutbox = () => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')
  } catch {
    return []
  }
}

function Line({ label, value, sign, dim }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1.5 divide-row">
      <span className={dim ? 'dim' : 'muted'}>{label}</span>
      <span className="shrink-0 font-medium">
        {sign === '-' ? '− ' : ''}
        {Number(value).toLocaleString()}
      </span>
    </div>
  )
}

export default function Day() {
  const [day, setDay] = useState(todayISO())
  const [month, setMonth] = useState(monthKey())
  const [takings, setTakings] = useState([])
  const [subs, setSubs] = useState([])
  const [onetime, setOnetime] = useState([])
  const [expenses, setExpenses] = useState([])
  const [closes, setCloses] = useState([])
  const [cars, setCars] = useState([])
  const [debts, setDebts] = useState([])
  const [pending] = useState(readOutbox())
  const [loading, setLoading] = useState(true)

  // Money handed out on the day it is handed out: fuel money, a driver's
  // receipts from last month, a repair. Written here so the bag is counted
  // against what actually happened, not against what came in.
  const [payOut, setPayOut] = useState({ amount: '', note: '', category: 'driver', car_id: '' })
  const [paying, setPaying] = useState(false)

  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true)
    const from = `${month}-01`
    const to = `${month}-31`
    const [t, s, o, e, c, cr, db] = await Promise.all([
      supabase.from('takings').select('*').gte('taken_on', from).lte('taken_on', to),
      supabase.from('subscriptions').select('id, amount, paid_via, created_at').gte('created_at', from),
      supabase.from('onetime_rides').select('*').gte('date', from).lte('date', to),
      supabase.from('expenses').select('*').gte('date', from).lte('date', to),
      supabase.from('day_closes').select('*').gte('day', from).lte('day', to),
      supabase.from('cars').select('id, name, driver_name').order('name'),
      // Every open balance, any month — a debt does not end with the month.
      supabase.from('takings').select('*').gt('owed', 0).order('taken_on'),
    ])
    setCars(cr.data || [])
    // Unsent lines carry their promises too — a debt does not begin at the
    // moment the server hears about it.
    setDebts([...readOutbox().filter((p) => Number(p.owed) > 0), ...(db.data || [])])
    setTakings(t.data || [])
    setSubs(s.data || [])
    setOnetime(o.data || [])
    setExpenses(e.data || [])
    setCloses(c.data || [])
    setErr(t.error && t.error.code !== 'PGRST205' ? t.error.message : '')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const box = useMemo(
    () => cashbox({ day, takings, subs, onetime, expenses, pending }),
    [day, takings, subs, onetime, expenses, pending],
  )

  const dayExpenses = useMemo(() => expenses.filter((e) => e.date === day), [expenses, day])

  async function addPayOut() {
    const amt = Number(payOut.amount)
    if (!amt || amt <= 0) return setErr('Write how much you gave')
    setPaying(true)
    setErr('')
    const row = {
      date: day,
      amount: amt,
      category: payOut.category,
      car_id: payOut.car_id || null,
      note: payOut.note || null,
    }
    const { data, error } = await supabase.from('expenses').insert(row).select('*').single()
    setPaying(false)
    if (error) return setErr(error.message)
    setExpenses((es) => [...es, data])
    setPayOut({ amount: '', note: '', category: payOut.category, car_id: payOut.car_id })
  }

  // A promise kept. The recovered money is written as a new line on the day it
  // actually arrived — not backdated to the day it was promised — and the old
  // balance is closed so it stops appearing on the list.
  async function recover(row) {
    setErr('')
    const line = {
      id: crypto.randomUUID(),
      name: row.name,
      phone: row.phone || null,
      amount: Number(row.owed),
      owed: 0,
      car_id: row.car_id || null,
      method: 'cash',
      for_month: monthKey(),
      taken_on: todayISO(),
      note: `Balance from ${row.taken_on}`,
    }
    const { error } = await supabase.from('takings').insert(line)
    if (error) return setErr(error.message)
    const { error: e2 } = await supabase.from('takings').update({ owed: 0 }).eq('id', row.id)
    if (e2) return setErr(e2.message)
    setDebts((ds) => ds.filter((d) => d.id !== row.id))
    setTakings((ts) => [...ts.map((t) => (t.id === row.id ? { ...t, owed: 0 } : t)), line])
  }

  async function removePayOut(row) {
    setExpenses((es) => es.filter((e) => e.id !== row.id))
    await supabase.from('expenses').delete().eq('id', row.id)
  }

  const saved = closes.find((c) => c.day === day)

  // Show what was written down last time, not a stale value from another day.
  useEffect(() => {
    setCounted(saved ? String(saved.counted) : '')
    setNote(saved?.note || '')
  }, [day, saved?.counted, saved?.note])

  const diff = difference(box.expected, counted)

  async function close() {
    if (counted === '') return setErr('Count the bag first')
    setBusy(true)
    setErr('')
    const row = {
      day,
      counted: Number(counted),
      expected: box.expected,
      fast: box.fast + box.unsentCash,
      payments: box.payments,
      rides: box.rides,
      spent: box.spent,
      not_in_hand: box.notInHand,
      riders: box.riders,
      note: note || null,
    }
    const { error } = await supabase.from('day_closes').upsert(row, { onConflict: 'day' })
    setBusy(false)
    if (error) return setErr(error.message)
    setCloses((cs) => [...cs.filter((c) => c.day !== day), row])
  }

  // ---- the whole round, day by day -------------------------------------
  const round = useMemo(() => {
    const today = todayISO()
    return daysOfMonth(month, month === monthKey() ? today : null)
      .map((d) => {
        const b = cashbox({ day: d, takings, subs, onetime, expenses, pending })
        const c = closes.find((x) => x.day === d)
        return { day: d, ...b, counted: c ? Number(c.counted) : null, diff: c ? Number(c.counted) - b.expected : null }
      })
      .filter((r) => r.riders > 0 || r.spent > 0 || r.counted !== null)
  }, [month, takings, subs, onetime, expenses, pending, closes])

  const roundTotals = round.reduce(
    (t, r) => ({
      expected: t.expected + r.expected,
      counted: t.counted + (r.counted ?? 0),
      notInHand: t.notInHand + r.notInHand,
      riders: t.riders + r.riders,
      uncounted: t.uncounted + (r.counted === null ? 1 : 0),
    }),
    { expected: 0, counted: 0, notInHand: 0, riders: 0, uncounted: 0 },
  )

  const diffColor = diff === null ? 'var(--muted)' : diff === 0 ? 'var(--ok)' : 'var(--bad)'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h1">End of day</h1>
        <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
          {lastMonths(6).map((k) => (
            <option key={k} value={k}>
              {monthLabel(k)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setDay((d) => addDays(d, -1))} className="btn-ghost px-3">
          ‹
        </button>
        <input className="input flex-1 text-center" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <button
          onClick={() => setDay((d) => (d >= todayISO() ? d : addDays(d, 1)))}
          className="btn-ghost px-3"
          disabled={day >= todayISO()}
        >
          ›
        </button>
      </div>

      {box.unsent > 0 && (
        <div className="card flex items-center gap-3" style={{ borderColor: 'var(--warn)' }}>
          <span className="text-xl">📶</span>
          <div className="flex-1 text-sm">
            <b>{box.unsent}</b> rider{box.unsent === 1 ? '' : 's'} still unsent on this phone — their cash{' '}
            <b>is</b> counted below. Send them before you close, on the Register screen.
          </div>
        </div>
      )}

      {loading ? (
        <div className="skeleton h-64" />
      ) : (
        <>
          <div className="card space-y-1">
            <div className="text-sm muted">Should be left in your hand</div>
            <div className="text-4xl font-bold" style={{ color: box.expected < 0 ? 'var(--bad)' : 'var(--ok)' }}>
              AED {box.expected.toLocaleString()}
            </div>
            <div className="pt-2">
              <Line label={`Register, cash${box.unsent ? ' (with unsent)' : ''}`} value={box.fast + box.unsentCash} />
              {box.payments > 0 && <Line label="Payments taken on Collect" value={box.payments} />}
              {box.rides > 0 && <Line label="One-time riders" value={box.rides} />}
              <Line label="Paid out" value={box.spent} sign="-" />
            </div>
            {box.notInHand > 0 && (
              <p className="text-xs dim pt-2">
                Card and transfer that day: <b>AED {box.notInHand.toLocaleString()}</b>. That money is real but it is
                in the bank, not in your hand — it is not part of the number above.
              </p>
            )}
          </div>

          {/* Money out, on the day it left the bag. */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">What you paid out</h2>
              {box.spent > 0 && (
                <span className="font-bold" style={{ color: 'var(--bad)' }}>
                  AED {box.spent.toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {['driver', 'fuel', 'salik', 'maintenance', 'fine', 'other'].map((c) => (
                <button
                  key={c}
                  onClick={() => setPayOut((p) => ({ ...p, category: c }))}
                  className={`pill ${payOut.category === c ? 'pill-on' : ''}`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                className="input flex-1 text-lg"
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="Amount"
                value={payOut.amount}
                onChange={(e) => setPayOut((p) => ({ ...p, amount: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && addPayOut()}
              />
              <button onClick={addPayOut} disabled={paying} className="btn-primary px-5">
                {paying ? '…' : 'Add'}
              </button>
            </div>

            <input
              className="input"
              placeholder="What for — e.g. Kashif, last month fuel receipts"
              value={payOut.note}
              onChange={(e) => setPayOut((p) => ({ ...p, note: e.target.value }))}
            />

            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <button
                onClick={() => setPayOut((p) => ({ ...p, car_id: '' }))}
                className={`pill ${payOut.car_id === '' ? 'pill-on' : ''}`}
              >
                No car
              </button>
              {cars.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPayOut((p) => ({ ...p, car_id: c.id }))}
                  className={`pill ${payOut.car_id === c.id ? 'pill-on' : ''}`}
                >
                  {c.name} · {c.driver_name}
                </button>
              ))}
            </div>

            {dayExpenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-sm py-1.5 divide-row">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{e.category}</div>
                  <div className="text-xs dim truncate">
                    {e.note || '—'}
                    {e.car_id ? ` · ${cars.find((c) => c.id === e.car_id)?.name || ''}` : ''}
                  </div>
                </div>
                <span className="font-semibold shrink-0" style={{ color: 'var(--bad)' }}>
                  − {Number(e.amount).toLocaleString()}
                </span>
                <button onClick={() => removePayOut(e)} className="dim shrink-0 px-1" title="Remove">
                  ✕
                </button>
              </div>
            ))}
            {dayExpenses.length === 0 && <p className="text-xs dim">Nothing paid out on this day yet.</p>}
          </div>

          <div className="card space-y-3">
            <div>
              <label className="label">Cash you counted</label>
              <input
                className="input text-2xl"
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </div>

            <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--surface-2, transparent)', border: `2px solid ${diffColor}` }}>
              {diff === null ? (
                <span className="muted text-sm">Type what you counted.</span>
              ) : diff === 0 ? (
                <span className="font-bold" style={{ color: 'var(--ok)' }}>
                  ✅ Balanced — {box.riders} rider{box.riders === 1 ? '' : 's'}
                </span>
              ) : (
                <div style={{ color: 'var(--bad)' }}>
                  <div className="font-bold text-lg">
                    {diff < 0 ? 'Short by' : 'Over by'} AED {Math.abs(diff).toLocaleString()}
                  </div>
                  <div className="text-xs">
                    {diff < 0
                      ? 'A rider was not entered, or the money is not all here.'
                      : 'Somebody paid who was not entered — add them on Fast lane.'}
                  </div>
                </div>
              )}
            </div>

            <input
              className="input"
              placeholder="Note (optional) — e.g. gave 50 change to Ramil"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            {err && (
              <p className="text-sm" style={{ color: 'var(--bad)' }}>
                {err}
              </p>
            )}

            <button onClick={close} disabled={busy} className="btn-primary w-full">
              {busy ? 'Saving…' : saved ? `Update the count for ${fmt(day)}` : `Close ${fmt(day)}`}
            </button>
            {saved && (
              <p className="text-xs dim text-center">
                Counted AED {Number(saved.counted).toLocaleString()} against AED{' '}
                {Number(saved.expected).toLocaleString()} expected.
              </p>
            )}
          </div>

          {debts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="h2">Still to recover</h2>
                <span className="font-bold" style={{ color: 'var(--warn)' }}>
                  AED {debts.reduce((t, d) => t + Number(d.owed), 0).toLocaleString()}
                </span>
              </div>
              <div className="card space-y-1">
                {debts.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 py-1.5 divide-row">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{d.name}</div>
                      <div className="text-xs dim truncate">
                        paid {Number(d.amount).toLocaleString()} on {fmt(d.taken_on)}
                        {d.car_id ? ` · ${cars.find((c) => c.id === d.car_id)?.name || ''}` : ''}
                        {d.phone ? ` · ${d.phone}` : ''}
                      </div>
                    </div>
                    <span className="chip chip-warn shrink-0">owes {Number(d.owed).toLocaleString()}</span>
                    {/* A line the server has not seen cannot be closed on the
                        server either — send it first. */}
                    {pending.some((p) => p.id === d.id) ? (
                      <span className="chip chip-warn shrink-0">unsent</span>
                    ) : (
                      <button onClick={() => recover(d)} className="btn-primary px-3 py-1.5 text-sm shrink-0">
                        Took it
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs dim">
                "Took it" writes the balance as a new line today and closes it here. This money is not part of the
                bag until you tap it.
              </p>
            </div>
          )}

          <Link to={`/sheet?month=${month}`} className="card flex items-center gap-3 no-print">
            <span className="text-2xl">🖨</span>
            <div className="flex-1">
              <div className="font-semibold">Statement for {monthLabel(month)}</div>
              <div className="text-sm muted">Cash, card, expenses, every rider — on the letterhead, save as PDF.</div>
            </div>
            <span className="dim">›</span>
          </Link>

          {round.length > 0 && (
            <div className="space-y-2">
              <h2 className="h2">{monthLabel(month)} so far</h2>
              <div className="card">
                <div className="grid grid-cols-4 gap-2 text-xs dim pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span>Day</span>
                  <span className="text-right">Expected</span>
                  <span className="text-right">Counted</span>
                  <span className="text-right">Diff</span>
                </div>
                {round.map((r) => (
                  <button
                    key={r.day}
                    onClick={() => setDay(r.day)}
                    className="grid grid-cols-4 gap-2 text-sm py-2 divide-row w-full text-left"
                  >
                    <span className={r.day === day ? 'font-bold' : ''}>{fmt(r.day)}</span>
                    <span className="text-right">{r.expected.toLocaleString()}</span>
                    <span className="text-right">{r.counted === null ? '—' : r.counted.toLocaleString()}</span>
                    <span
                      className="text-right font-semibold"
                      style={{ color: r.diff === null ? 'var(--muted)' : r.diff === 0 ? 'var(--ok)' : 'var(--bad)' }}
                    >
                      {r.diff === null ? 'not counted' : r.diff === 0 ? '✓' : (r.diff > 0 ? '+' : '') + r.diff.toLocaleString()}
                    </span>
                  </button>
                ))}
                <div className="grid grid-cols-4 gap-2 text-sm pt-2 font-bold" style={{ borderTop: '1px solid var(--border)' }}>
                  <span>Total</span>
                  <span className="text-right">{roundTotals.expected.toLocaleString()}</span>
                  <span className="text-right">{roundTotals.counted.toLocaleString()}</span>
                  <span className="text-right" style={{ color: 'var(--muted)' }}>
                    {roundTotals.uncounted > 0 ? `${roundTotals.uncounted} open` : '✓'}
                  </span>
                </div>
              </div>
              <p className="text-xs dim">
                {roundTotals.riders} payment{roundTotals.riders === 1 ? '' : 's'} this month
                {roundTotals.notInHand > 0
                  ? ` · plus AED ${roundTotals.notInHand.toLocaleString()} by card or transfer, straight to the bank`
                  : ''}
                . Totals only add up the days that were counted.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
