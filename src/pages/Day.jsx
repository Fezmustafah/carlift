import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { todayISO, addDays, fmt } from '../lib/dates'
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
  const [pending] = useState(readOutbox())
  const [loading, setLoading] = useState(true)

  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true)
    const from = `${month}-01`
    const to = `${month}-31`
    const [t, s, o, e, c] = await Promise.all([
      supabase.from('takings').select('*').gte('taken_on', from).lte('taken_on', to),
      supabase.from('subscriptions').select('id, amount, paid_via, created_at').gte('created_at', from),
      supabase.from('onetime_rides').select('*').gte('date', from).lte('date', to),
      supabase.from('expenses').select('*').gte('date', from).lte('date', to),
      supabase.from('day_closes').select('*').gte('day', from).lte('day', to),
    ])
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
        <h1 className="h1">Day close</h1>
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
            <b>is</b> counted below. Send them before you close, on the Fast lane screen.
          </div>
        </div>
      )}

      {loading ? (
        <div className="skeleton h-64" />
      ) : (
        <>
          <div className="card space-y-1">
            <div className="text-sm muted">Should be in the bag</div>
            <div className="text-4xl font-bold" style={{ color: 'var(--ok)' }}>
              AED {box.expected.toLocaleString()}
            </div>
            <div className="pt-2">
              <Line label={`Fast lane cash${box.unsent ? ' (with unsent)' : ''}`} value={box.fast + box.unsentCash} />
              <Line label="Payments taken on Collect" value={box.payments} />
              <Line label="One-time riders" value={box.rides} />
              <Line label="Spent from the bag" value={box.spent} sign="-" />
            </div>
            {box.notInHand > 0 && (
              <p className="text-xs dim pt-2">
                Card and transfer that day: <b>AED {box.notInHand.toLocaleString()}</b>. That money is real but it is
                in the bank, not in your hand — it is not part of the number above.
              </p>
            )}
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
