import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO, fmt } from '../lib/dates'
import { monthKey, monthRange, monthLabel } from '../lib/month'
import { cashbox } from '../lib/cashbox'

// A sheet of paper. One day or one month: every rider, every rupee out, what is
// left and what is still owed. The browser's own print dialog turns it into a
// PDF, which is why there is no PDF library here — one less thing to break on a
// phone at six in the morning.

const OUTBOX_KEY = 'carlift.fast.outbox'

const readOutbox = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function Row({ cells, bold, cols = '1.6fr 1fr 0.8fr 0.8fr', rightFrom = 2 }) {
  return (
    <div
      className="grid gap-2 py-1.5 text-sm divide-row"
      style={{ gridTemplateColumns: cols, fontWeight: bold ? 700 : 400 }}
    >
      {cells.map((c, i) => (
        <span key={i} className={i >= rightFrom ? 'text-right' : 'truncate'}>
          {c}
        </span>
      ))}
    </div>
  )
}

const RIDER_COLS = '1.5fr 0.9fr 0.7fr 0.7fr 0.7fr'
const METHOD_LABEL = { cash: 'Cash', card: 'CARD', transfer: 'BANK' }

export default function Sheet() {
  const [params, setParams] = useSearchParams()
  const month = params.get('month') || monthKey()
  const day = params.get('day') || ''
  const scope = day ? 'day' : 'month'

  const [takings, setTakings] = useState([])
  const [subs, setSubs] = useState([])
  const [onetime, setOnetime] = useState([])
  const [expenses, setExpenses] = useState([])
  const [cars, setCars] = useState([])
  const [openDebts, setOpen] = useState([])
  const [loading, setLoading] = useState(true)

  const { start, end } = useMemo(
    () => (day ? { start: day, end: day } : monthRange(month)),
    [day, month],
  )

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('takings').select('*').gte('taken_on', start).lte('taken_on', end).order('taken_on'),
      supabase.from('subscriptions').select('id, amount, paid_via, created_at').gte('created_at', start),
      supabase.from('onetime_rides').select('*').gte('date', start).lte('date', end),
      supabase.from('expenses').select('*').gte('date', start).lte('date', end).order('date'),
      supabase.from('cars').select('id, name, driver_name').order('name'),
      // Debts do not expire at the end of a month: anything still open belongs
      // on the sheet whichever day it was promised.
      supabase.from('takings').select('*').gt('owed', 0).order('taken_on'),
    ]).then(([t, s, o, e, c, owed]) => {
      setTakings(t.data || [])
      setSubs(s.data || [])
      setOnetime(o.data || [])
      setExpenses(e.data || [])
      setCars(c.data || [])
      setOpen(owed.data || [])
      setLoading(false)
    })
  }, [start, end])

  const outbox = useMemo(() => readOutbox(), [])
  const pending = useMemo(
    () => outbox.filter((p) => p.taken_on >= start && p.taken_on <= end),
    [outbox, start, end],
  )

  // A balance promised five minutes ago is owed just as much as one the server
  // already knows about, so the unsent lines are on this list too.
  const debts = useMemo(
    () => [...outbox.filter((p) => Number(p.owed) > 0), ...openDebts],
    [outbox, openDebts],
  )

  const lines = useMemo(
    () =>
      [...pending.map((p) => ({ ...p, _pending: true })), ...takings].sort((a, b) =>
        String(a.taken_on).localeCompare(String(b.taken_on)),
      ),
    [pending, takings],
  )

  const totals = useMemo(() => {
    const days = [...new Set(lines.map((l) => l.taken_on))]
    if (!days.length) days.push(day || start)
    let inHand = 0
    for (const d of days) inHand += cashbox({ day: d, takings, subs, onetime, expenses, pending }).expected
    const collected = lines.reduce((t, l) => t + Number(l.amount), 0)
    const spent = expenses.reduce((t, e) => t + Number(e.amount), 0)
    const toRecover = debts.reduce((t, l) => t + Number(l.owed), 0)
    const rides = onetime.reduce((t, o) => t + Number(o.amount), 0)

    // Split by how it was paid. Cash is what passed through his hands; card and
    // bank went to the account without ever being in the bag, and a sheet that
    // does not say so reads as if he is holding all of it.
    const by = (m) =>
      lines.filter((l) => (l.method || 'cash') === m).reduce((t, l) => t + Number(l.amount), 0)
    const cash = by('cash')
    const card = by('card')
    const transfer = by('transfer')

    return {
      collected,
      spent,
      inHand,
      toRecover,
      rides,
      cash,
      card,
      transfer,
      notCash: card + transfer,
      net: collected + rides - spent,
    }
  }, [lines, takings, subs, onetime, expenses, pending, debts, day, start])

  const carName = (id) => cars.find((c) => c.id === id)?.name || ''
  const title = scope === 'day' ? fmt(day) : monthLabel(month)

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h1">Sheet</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setParams({ day: todayISO() })}
            className={`pill ${scope === 'day' ? 'pill-on' : ''}`}
          >
            Today
          </button>
          <button onClick={() => setParams({ month: monthKey() })} className={`pill ${scope === 'month' ? 'pill-on' : ''}`}>
            This month
          </button>
          <button onClick={() => window.print()} className="btn-primary px-4">
            🖨 Save as PDF
          </button>
        </div>
      </div>

      <p className="no-print text-xs dim">
        Print opens your phone's own dialog — choose <b>Save as PDF</b> as the printer to keep a copy.
      </p>

      {loading ? (
        <div className="skeleton h-64" />
      ) : (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold">Car Lift — {title}</h2>
            <p className="text-sm muted">
              {scope === 'day' ? fmt(day) : `${fmt(start)} → ${fmt(end)}`} · printed {fmt(todayISO())}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card">
              <div className="text-sm muted">Collected</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--ok)' }}>
                {totals.collected.toLocaleString()}
              </div>
              <div className="text-xs dim">
                {lines.length} riders
                {totals.notCash > 0 ? ` · ${totals.cash.toLocaleString()} cash + ${totals.notCash.toLocaleString()} card/bank` : ''}
              </div>
            </div>
            <div className="card">
              <div className="text-sm muted">Spent</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--bad)' }}>
                {totals.spent.toLocaleString()}
              </div>
              <div className="text-xs dim">{expenses.length} payments out</div>
            </div>
            <div className="card">
              <div className="text-sm muted">Net</div>
              <div className="text-2xl font-bold">{totals.net.toLocaleString()}</div>
              {totals.rides > 0 && <div className="text-xs dim">incl. {totals.rides.toLocaleString()} one-time</div>}
            </div>
            <div className="card">
              <div className="text-sm muted">Still to recover</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--warn)' }}>
                {totals.toRecover.toLocaleString()}
              </div>
              <div className="text-xs dim">
                {debts.length} rider{debts.length === 1 ? '' : 's'} owe{debts.length === 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div>
            <h3 className="h2 mb-1">Riders</h3>
            <div className="card">
              <Row cells={['Name', 'Car', 'How', 'Paid', 'Owes']} bold cols={RIDER_COLS} rightFrom={3} />
              {lines.map((l) => (
                <Row
                  key={l.id}
                  cols={RIDER_COLS}
                  rightFrom={3}
                  cells={[
                    l.name + (l._pending ? ' (not sent)' : ''),
                    scope === 'day' ? carName(l.car_id) : `${fmt(l.taken_on)} ${carName(l.car_id)}`,
                    METHOD_LABEL[l.method || 'cash'] || l.method,
                    Number(l.amount).toLocaleString(),
                    Number(l.owed) > 0 ? Number(l.owed).toLocaleString() : '',
                  ]}
                />
              ))}
              {lines.length === 0 && <p className="muted text-sm py-3">Nobody written in this period.</p>}
              <Row
                cells={['Total', '', '', totals.collected.toLocaleString(), '']}
                bold
                cols={RIDER_COLS}
                rightFrom={3}
              />
            </div>
          </div>

          <div>
            <h3 className="h2 mb-1">Paid out</h3>
            <div className="card">
              <Row cells={['What', 'Car', 'Amount', '']} bold />
              {expenses.map((e) => (
                <Row
                  key={e.id}
                  cells={[
                    `${e.category}${e.note ? ` — ${e.note}` : ''}`,
                    `${fmt(e.date)} ${carName(e.car_id)}`,
                    Number(e.amount).toLocaleString(),
                    '',
                  ]}
                />
              ))}
              {expenses.length === 0 && <p className="muted text-sm py-3">Nothing paid out in this period.</p>}
              <Row cells={['Total', '', totals.spent.toLocaleString(), '']} bold />
            </div>
          </div>

          {debts.length > 0 && (
            <div>
              <h3 className="h2 mb-1">Still to recover</h3>
              <div className="card">
                <Row cells={['Name', 'Since', 'Paid', 'Owes']} bold />
                {debts.map((l) => (
                  <Row
                    key={l.id}
                    cells={[
                      l.name + (l.phone ? ` · ${l.phone}` : ''),
                      `${fmt(l.taken_on)} ${carName(l.car_id)}`,
                      Number(l.amount).toLocaleString(),
                      Number(l.owed).toLocaleString(),
                    ]}
                  />
                ))}
                <Row cells={['Total', '', '', totals.toRecover.toLocaleString()]} bold />
              </div>
              <p className="text-xs dim mt-1">
                This list is every open balance, not only this period — a promise made in July is still a promise.
              </p>
            </div>
          )}

          {/* The closing statement. Cash and card are both collected money and
              only one of them was ever in his hand — the sheet has to say which
              is which, or it reads as a claim to be holding all of it. */}
          <div>
            <h3 className="h2 mb-1">How the money came in</h3>
            <div className="card">
              <Row cells={['Cash collected', '', totals.cash.toLocaleString(), '']} />
              {totals.card > 0 && <Row cells={['Card', '', totals.card.toLocaleString(), '']} />}
              {totals.transfer > 0 && <Row cells={['Bank transfer', '', totals.transfer.toLocaleString(), '']} />}
              {totals.rides > 0 && <Row cells={['One-time riders (cash)', '', totals.rides.toLocaleString(), '']} />}
              <Row cells={['Total collected', '', (totals.collected + totals.rides).toLocaleString(), '']} bold />
              <Row cells={['Paid out', '', `− ${totals.spent.toLocaleString()}`, '']} />
              <Row cells={['Net', '', totals.net.toLocaleString(), '']} bold />
            </div>
            <div className="text-xs dim mt-1 space-y-0.5">
              {totals.notCash > 0 && (
                <p>
                  <b>AED {totals.notCash.toLocaleString()}</b> of this was card or bank transfer. That money went
                  straight to the account — it was never cash in hand and must not be looked for in the bag.
                </p>
              )}
              <p>Cash that should have been in hand across these days: AED {totals.inHand.toLocaleString()}.</p>
              {totals.toRecover > 0 && (
                <p>Still owed by riders and not counted above: AED {totals.toRecover.toLocaleString()}.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
