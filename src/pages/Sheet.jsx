import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayISO, fmt } from '../lib/dates'
import { monthStartISO } from '../lib/dates'
import { monthKey, monthRange, monthLabel } from '../lib/month'
import { cashboxRange } from '../lib/cashbox'
import { registerLines, splitByMethod, byCar } from '../lib/register'
import Letterhead, { COMPANY } from '../components/Letterhead'

// The statement. One day, one round, or one month of the register, printed
// under the company letterhead for the owner.
//
// It answers, in this order and in these words: what came in, what is in the
// hand right now, what is in the bank, what went out, what is left, and who
// paid. The browser's own print dialog turns it into a PDF, which is why there
// is no PDF library here — one less thing to break on a phone at six in the
// morning.

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
const CAR_COLS = '1.6fr 0.7fr 0.9fr 0.9fr 0.9fr'
const DAY_COLS = '1.2fr 0.7fr 0.9fr 0.9fr 0.9fr'
const MONEY_COLS = '2fr 1fr'
const METHOD_LABEL = { cash: 'Cash', card: 'CARD', transfer: 'BANK' }
const aed = (n) => Number(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 0 })

export default function Sheet() {
  const [params, setParams] = useSearchParams()
  const month = params.get('month') || monthKey()
  const day = params.get('day') || ''
  // The collection round runs across days — 5 to 10 — and the report that goes
  // to the owner is for the round, not for a calendar month.
  const fromP = params.get('from') || ''
  const toP = params.get('to') || ''
  const scope = fromP && toP ? 'range' : day ? 'day' : 'month'

  const [takings, setTakings] = useState([])
  const [subs, setSubs] = useState([])
  const [onetime, setOnetime] = useState([])
  const [expenses, setExpenses] = useState([])
  const [cars, setCars] = useState([])
  const [openDebts, setOpen] = useState([])
  const [loading, setLoading] = useState(true)

  const { start, end } = useMemo(() => {
    if (scope === 'range') return fromP <= toP ? { start: fromP, end: toP } : { start: toP, end: fromP }
    if (scope === 'day') return { start: day, end: day }
    return monthRange(month)
  }, [scope, fromP, toP, day, month])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('takings').select('*').gte('taken_on', start).lte('taken_on', end).order('taken_on'),
      supabase
        .from('subscriptions')
        .select('id, amount, paid_via, created_at')
        .gte('created_at', start)
        .lte('created_at', `${end}T23:59:59`),
      supabase.from('onetime_rides').select('*').gte('date', start).lte('date', end),
      supabase.from('expenses').select('*').gte('date', start).lte('date', end).order('date'),
      supabase.from('cars').select('id, name, driver_name').order('name'),
      // Debts do not expire at the end of a month: anything still open belongs
      // on the sheet whichever day it was promised. Missing column (the owed
      // migration not run yet) simply means there is nothing to show.
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
    () => registerLines({ takings, pending, from: start, to: end }),
    [takings, pending, start, end],
  )

  const totals = useMemo(() => {
    const money = splitByMethod(lines)
    const rides = onetime.reduce((t, o) => t + Number(o.amount), 0)
    const spent = expenses.reduce((t, e) => t + Number(e.amount), 0)

    // A taking that was put on a rider's record exists twice — as the taking
    // and as the subscription it created. The subscription is the copy.
    const copies = new Set(takings.map((t) => t.subscription_id).filter(Boolean))
    const subMoney = splitByMethod(
      subs.filter((s) => !copies.has(s.id)).map((s) => ({ amount: s.amount, method: s.paid_via })),
    )

    // Cash is what passed through his hands; card and bank went to the account
    // without ever being in the bag, and a sheet that does not say so reads as
    // if he is holding the lot.
    const cash = money.cash + rides + subMoney.cash
    const card = money.card + subMoney.card
    const transfer = money.transfer + subMoney.transfer
    const collected = cash + card + transfer

    const box = cashboxRange({ from: start, to: end, takings, subs, onetime, expenses, pending })

    return {
      collected,
      cash,
      card,
      transfer,
      notCash: card + transfer,
      rides,
      onCollect: subMoney.total,
      spent,
      inHand: box.expected,
      toRecover: debts.reduce((t, l) => t + Number(l.owed), 0),
      net: collected - spent,
      cars: byCar(lines, cars),
    }
  }, [lines, takings, subs, onetime, expenses, pending, debts, cars, start, end])

  // Day by day, for a round that ran across several mornings.
  const days = useMemo(() => {
    const keys = [...new Set(lines.map((l) => l.taken_on))].sort()
    return keys.map((d) => {
      const rows = lines.filter((l) => l.taken_on === d)
      return { day: d, riders: rows.length, ...splitByMethod(rows) }
    })
  }, [lines])

  const carName = (id) => cars.find((c) => c.id === id)?.name || ''
  const title =
    scope === 'day' ? fmt(day) : scope === 'range' ? `${fmt(start)} — ${fmt(end)}` : monthLabel(month)
  const periodText = scope === 'day' ? fmt(day) : `${fmt(start)} — ${fmt(end)}`
  const dayCount = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
  const meta = [
    ['Period', periodText],
    dayCount > 1 && ['Days', String(dayCount)],
    ['Issued', fmt(todayISO())],
  ]

  return (
    <div className="space-y-5">
      <div className="no-print space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="h1">Statement</h1>
          <button onClick={() => window.print()} className="btn-primary px-4">
            🖨 Save as PDF
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setParams({ day: todayISO() })} className={`pill ${scope === 'day' ? 'pill-on' : ''}`}>
            Today
          </button>
          <button
            onClick={() => setParams({ month: monthKey() })}
            className={`pill ${scope === 'month' ? 'pill-on' : ''}`}
          >
            This month
          </button>
          <button
            onClick={() => setParams({ from: monthStartISO().slice(0, 8) + '05', to: monthStartISO().slice(0, 8) + '10' })}
            className={`pill ${scope === 'range' ? 'pill-on' : ''}`}
          >
            Collection round 5–10
          </button>
        </div>

        {/* Any two dates, because a round can slip and the report still has to
            cover exactly the days it happened on. */}
        <div className="card flex items-end gap-2 flex-wrap">
          <div>
            <label className="label">From</label>
            <input
              className="input w-auto"
              type="date"
              value={start}
              onChange={(e) => setParams({ from: e.target.value, to: end })}
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              className="input w-auto"
              type="date"
              value={end}
              onChange={(e) => setParams({ from: start, to: e.target.value })}
            />
          </div>
        </div>

        <p className="text-xs dim">
          Print opens your phone's own dialog — choose <b>Save as PDF</b> as the printer. Page 1 is the summary for
          the boss, page 2 is the list of who paid.
        </p>
      </div>

      {loading ? (
        <div className="skeleton h-64" />
      ) : (
        <div className="stmt">
          <Letterhead doctype="Collection Statement" meta={meta} />

          <h2 className="stmt-title">Summary — {title}</h2>

          {/* Three numbers, in the order the question is actually asked:
              what came in, what went out, what is left. */}
          <div className="stmt-hero">
            <div>
              <div className="k">Total collected</div>
              <div className="v">{aed(totals.collected)}</div>
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

          {/* The distinction the whole sheet exists for. */}
          <div className="stmt-split">
            <div>
              <div className="k">Cash in hand</div>
              <div className="v">AED {aed(totals.inHand)}</div>
              <div className="s">
                Cash collected AED {aed(totals.cash)} less AED {aed(totals.spent)} paid out. This is the money that
                should be counted and handed over.
              </div>
            </div>
            <div>
              <div className="k">Received in the bank</div>
              <div className="v">AED {aed(totals.notCash)}</div>
              <div className="s">
                {totals.notCash > 0
                  ? 'Card and bank transfers went straight into the company account. Do not look for this money in the cash.'
                  : 'No card or bank payments in this period. Everything came in as cash.'}
              </div>
            </div>
          </div>

          <section className="stmt-sec">
            <h3>How the money came in</h3>
            <Row cells={['Cash collected from riders', aed(totals.cash)]} cols={MONEY_COLS} rightFrom={1} />
            {totals.card > 0 && (
              <Row cells={['Card payments', aed(totals.card)]} cols={MONEY_COLS} rightFrom={1} />
            )}
            {totals.transfer > 0 && (
              <Row cells={['Bank transfers', aed(totals.transfer)]} cols={MONEY_COLS} rightFrom={1} />
            )}
            <Row cells={['TOTAL COLLECTED', aed(totals.collected)]} cols={MONEY_COLS} rightFrom={1} kind="sum" />
            <p className="stmt-note">
              {lines.length} rider{lines.length === 1 ? '' : 's'} written in the register
              {totals.rides > 0 ? `, including AED ${aed(totals.rides)} from one-time riders` : ''}
              {totals.onCollect > 0 ? `, plus AED ${aed(totals.onCollect)} recorded on the Collect screen` : ''}.
            </p>
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
            <Row cells={['Total collected', aed(totals.collected)]} cols={MONEY_COLS} rightFrom={1} />
            <Row cells={['Less expenses paid out', `− ${aed(totals.spent)}`]} cols={MONEY_COLS} rightFrom={1} />
            <Row cells={['NET EARNINGS', aed(totals.net)]} cols={MONEY_COLS} rightFrom={1} kind="sum" />
          </section>

          {totals.cars.length > 0 && (
            <section className="stmt-sec">
              <h3>Collected by vehicle</h3>
              <Row
                cells={['Vehicle', 'Riders', 'Cash', 'Card / bank', 'Total']}
                cols={CAR_COLS}
                rightFrom={1}
                kind="head"
              />
              {totals.cars.map((c) => (
                <Row
                  key={c.car_id || 'none'}
                  cols={CAR_COLS}
                  rightFrom={1}
                  cells={[c.name, String(c.riders), aed(c.cash), aed(c.notCash), aed(c.total)]}
                />
              ))}
            </section>
          )}

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

          {/* Signed on the summary page — that is the page that goes with the
              money, and the one the owner keeps. */}
          <div className="stmt-sign">
            <div>Prepared by — Faiz</div>
            <div>Received by</div>
          </div>

          <div className="stmt-foot">
            <span>
              {COMPANY} · Collection statement · {periodText}
            </span>
            <span>Summary</span>
          </div>

          <section className="stmt-sec stmt-page2">
            <Letterhead doctype="Rider Detail" meta={[['Period', periodText]]} />

            {days.length > 1 && (
              <>
                <h3>Day by day</h3>
                <Row
                  cells={['Date', 'Riders', 'Cash', 'Card / bank', 'Total']}
                  cols={DAY_COLS}
                  rightFrom={1}
                  kind="head"
                />
                {days.map((d) => (
                  <Row
                    key={d.day}
                    cols={DAY_COLS}
                    rightFrom={1}
                    cells={[fmt(d.day), String(d.riders), aed(d.cash), aed(d.notCash), aed(d.total)]}
                  />
                ))}
                <Row
                  cells={[
                    'TOTAL',
                    String(lines.length),
                    aed(days.reduce((t, d) => t + d.cash, 0)),
                    aed(days.reduce((t, d) => t + d.notCash, 0)),
                    aed(days.reduce((t, d) => t + d.total, 0)),
                  ]}
                  cols={DAY_COLS}
                  rightFrom={1}
                  kind="sum"
                />
              </>
            )}

            <h3 style={{ marginTop: '1.25rem' }}>Who paid ({lines.length})</h3>
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
            <Row
              cells={['TOTAL FROM THE REGISTER', '', '', aed(splitByMethod(lines).total), '']}
              cols={RIDER_COLS}
              rightFrom={3}
              kind="sum"
            />

            <div className="stmt-foot">
              <span>
                {COMPANY} · Rider detail · {periodText}
              </span>
              <span>Page 2</span>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
