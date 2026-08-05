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

// One ruled line of the statement. `kind` is head / normal / sum, which is the
// whole visual vocabulary of the page — a reader should never have to work out
// what a line is.
function Row({ cells, cols, kind = '', rightFrom = 2 }) {
  return (
    <div className={`stmt-row ${kind}`} style={{ gridTemplateColumns: cols }}>
      {cells.map((c, i) => (
        <span key={i} className={i >= rightFrom ? 'r' : ''}>
          {c}
        </span>
      ))}
    </div>
  )
}

const RIDER_COLS = '1.6fr 1fr 0.7fr 0.8fr 0.8fr'
const RIDER_COLS_DEBT = '1.8fr 1.2fr 0.8fr 0.9fr'
const MONEY_COLS = '2fr 1fr'
const METHOD_LABEL = { cash: 'Cash', card: 'CARD', transfer: 'BANK' }
const aed = (n) => Number(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 0 })

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
        <div className="stmt">
          <header className="stmt-head">
            <div>
              <div className="stmt-brand">ADNAN CAR LIFT</div>
              <div className="stmt-sub">Staff Transport · Dubai</div>
            </div>
            <div className="stmt-meta">
              <div>
                <span>Statement</span>
                <b>{scope === 'day' ? 'One day' : 'Full month'}</b>
              </div>
              <div>
                <span>Period</span>
                <b>{scope === 'day' ? fmt(day) : `${fmt(start)} — ${fmt(end)}`}</b>
              </div>
              <div>
                <span>Printed</span>
                <b>{fmt(todayISO())}</b>
              </div>
            </div>
          </header>

          <h2 className="stmt-title">Earnings — {title}</h2>

          {/* Three numbers, in the order the question is actually asked:
              what came in, what went out, what is left. */}
          <div className="stmt-hero">
            <div>
              <div className="k">Total collected</div>
              <div className="v">{aed(totals.collected + totals.rides)}</div>
            </div>
            <div>
              <div className="k">Total expenses</div>
              <div className="v">{aed(totals.spent)}</div>
            </div>
            <div className="net">
              <div className="k">Net earnings</div>
              <div className="v">{aed(totals.net)}</div>
            </div>
          </div>

          <section className="stmt-sec">
            <h3>Money collected</h3>
            <Row cells={['Cash collected from riders', aed(totals.cash)]} cols={MONEY_COLS} rightFrom={1} />
            {totals.card > 0 && (
              <Row cells={['Card payments', aed(totals.card)]} cols={MONEY_COLS} rightFrom={1} />
            )}
            {totals.transfer > 0 && (
              <Row cells={['Bank transfers', aed(totals.transfer)]} cols={MONEY_COLS} rightFrom={1} />
            )}
            {totals.rides > 0 && (
              <Row cells={['One-time riders (cash)', aed(totals.rides)]} cols={MONEY_COLS} rightFrom={1} />
            )}
            <Row
              cells={['TOTAL COLLECTED', aed(totals.collected + totals.rides)]}
              cols={MONEY_COLS}
              rightFrom={1}
              kind="sum"
            />
            {totals.notCash > 0 && (
              <p className="stmt-note">
                Of this, <b>AED {aed(totals.notCash)}</b> was paid by card or bank transfer. That money went straight
                into the bank account. It was never cash in hand, so it is not in the money counted at the end of the
                day.
              </p>
            )}
          </section>

          <section className="stmt-sec">
            <h3>Expenses paid out</h3>
            <Row cells={['What it was for', 'Date', 'Amount']} cols="2fr 1fr 1fr" rightFrom={2} kind="head" />
            {expenses.map((e) => (
              <Row
                key={e.id}
                cols="2fr 1fr 1fr"
                rightFrom={2}
                cells={[
                  `${e.category}${e.note ? ` — ${e.note}` : ''}${carName(e.car_id) ? ` (${carName(e.car_id)})` : ''}`,
                  fmt(e.date),
                  aed(e.amount),
                ]}
              />
            ))}
            {expenses.length === 0 && <p className="stmt-note">Nothing was paid out in this period.</p>}
            <Row cells={['TOTAL EXPENSES', '', aed(totals.spent)]} cols="2fr 1fr 1fr" rightFrom={2} kind="sum" />
          </section>

          <section className="stmt-sec">
            <h3>Net earnings</h3>
            <Row cells={['Total collected', aed(totals.collected + totals.rides)]} cols={MONEY_COLS} rightFrom={1} />
            <Row cells={['Less expenses paid out', `− ${aed(totals.spent)}`]} cols={MONEY_COLS} rightFrom={1} />
            <Row cells={['NET EARNINGS', aed(totals.net)]} cols={MONEY_COLS} rightFrom={1} kind="sum" />
            <p className="stmt-note">
              Cash that should have been in hand across these days: <b>AED {aed(totals.inHand)}</b>.
            </p>
          </section>

          {debts.length > 0 && (
            <section className="stmt-sec">
              <h3>Still to be recovered</h3>
              <Row cells={['Rider', 'Since', 'Paid', 'Still owes']} cols={RIDER_COLS_DEBT} rightFrom={2} kind="head" />
              {debts.map((l) => (
                <Row
                  key={l.id}
                  cols={RIDER_COLS_DEBT}
                  rightFrom={2}
                  cells={[
                    l.name + (l.phone ? ` · ${l.phone}` : ''),
                    `${fmt(l.taken_on)}${carName(l.car_id) ? ` · ${carName(l.car_id)}` : ''}`,
                    aed(l.amount),
                    aed(l.owed),
                  ]}
                />
              ))}
              <Row cells={['TOTAL TO RECOVER', '', '', aed(totals.toRecover)]} cols={RIDER_COLS_DEBT} rightFrom={2} kind="sum" />
              <p className="stmt-note">
                This money has not been received and is <b>not</b> included in the totals above. It is every unpaid
                balance to date, not only this period.
              </p>
            </section>
          )}

          <section className="stmt-sec">
            <h3>Riders — full list ({lines.length})</h3>
            <Row cells={['Name', scope === 'day' ? 'Car' : 'Date · Car', 'Paid by', 'Paid', 'Owes']} cols={RIDER_COLS} rightFrom={3} kind="head" />
            {lines.map((l) => (
              <Row
                key={l.id}
                cols={RIDER_COLS}
                rightFrom={3}
                cells={[
                  l.name + (l._pending ? ' (not sent)' : ''),
                  scope === 'day' ? carName(l.car_id) : `${fmt(l.taken_on)}${carName(l.car_id) ? ` · ${carName(l.car_id)}` : ''}`,
                  METHOD_LABEL[l.method || 'cash'] || l.method,
                  aed(l.amount),
                  Number(l.owed) > 0 ? aed(l.owed) : '—',
                ]}
              />
            ))}
            {lines.length === 0 && <p className="stmt-note">No riders were written in this period.</p>}
            <Row cells={['TOTAL', '', '', aed(totals.collected), '']} cols={RIDER_COLS} rightFrom={3} kind="sum" />
          </section>

          <div className="stmt-sign">
            <div>Prepared by</div>
            <div>Received by</div>
          </div>
        </div>
      )}
    </div>
  )
}
