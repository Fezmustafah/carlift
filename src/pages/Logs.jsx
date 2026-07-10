import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isActivePaid, ridesShift } from '../lib/status'
import { todayISO, monthStartISO, fmt } from '../lib/dates'

const TABS = ['One-time rides', 'Expenses', 'Spot checks']
const CATEGORIES = ['fuel', 'salik', 'maintenance', 'fine', 'other']

export default function Logs() {
  const [tab, setTab] = useState(TABS[0])
  const [cars, setCars] = useState([])
  const [members, setMembers] = useState([])
  const [onetime, setOnetime] = useState([])
  const [expenses, setExpenses] = useState([])
  const [checks, setChecks] = useState([])

  async function load() {
    const ms = monthStartISO()
    const [c, m, o, e, s] = await Promise.all([
      supabase.from('cars').select('*').order('name'),
      supabase.from('members').select('*, subscriptions(*)'),
      supabase.from('onetime_rides').select('*').gte('date', ms).order('date', { ascending: false }),
      supabase.from('expenses').select('*').gte('date', ms).order('date', { ascending: false }),
      supabase.from('spot_checks').select('*').order('date', { ascending: false }).limit(20),
    ])
    setCars(c.data || [])
    setMembers(m.data || [])
    setOnetime(o.data || [])
    setExpenses(e.data || [])
    setChecks(s.data || [])
  }

  useEffect(() => {
    load()
  }, [])

  const carName = (id) => cars.find((c) => c.id === id)?.name || '—'
  const paidCountFor = (carId, shift) =>
    members.filter((m) => m.car_id === carId && isActivePaid(m) && ridesShift(m, shift)).length

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Logs</h1>
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`chip ${tab === t ? 'bg-emerald-600 text-white' : 'bg-white border border-stone-300 text-stone-600'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'One-time rides' && <Onetime cars={cars} rows={onetime} carName={carName} onSaved={load} />}
      {tab === 'Expenses' && <Expenses cars={cars} rows={expenses} carName={carName} onSaved={load} />}
      {tab === 'Spot checks' && (
        <SpotChecks cars={cars} rows={checks} carName={carName} paidCountFor={paidCountFor} onSaved={load} />
      )}
    </div>
  )
}

function Onetime({ cars, rows, carName, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [carId, setCarId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const total = rows.reduce((t, r) => t + Number(r.amount), 0)

  async function add(e) {
    e.preventDefault()
    setBusy(true)
    await supabase.from('onetime_rides').insert({ date, car_id: carId || null, amount: Number(amount), note: note || null })
    setAmount('')
    setNote('')
    setBusy(false)
    onSaved()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Car</label>
          <select className="input" value={carId} onChange={(e) => setCarId(e.target.value)}>
            <option value="">—</option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">AED</label>
          <input className="input" type="number" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="from voice note" />
        </div>
        <button disabled={busy} className="btn-primary">
          Add
        </button>
      </form>
      <div className="card">
        <div className="flex justify-between font-semibold mb-2">
          <span>This month</span>
          <span className="text-emerald-700">AED {total.toLocaleString()}</span>
        </div>
        {rows.length === 0 && <p className="text-stone-400 text-sm">No one-time rides logged this month.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex justify-between text-sm py-1.5 border-t border-stone-100">
            <span className="text-stone-500">
              {fmt(r.date)} · {carName(r.car_id)}
              {r.note ? ` · ${r.note}` : ''}
            </span>
            <span className="font-medium">AED {Number(r.amount).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Expenses({ cars, rows, carName, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [carId, setCarId] = useState('')
  const [category, setCategory] = useState('fuel')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const total = rows.reduce((t, r) => t + Number(r.amount), 0)

  async function add(e) {
    e.preventDefault()
    setBusy(true)
    await supabase
      .from('expenses')
      .insert({ date, car_id: carId || null, category, amount: Number(amount), note: note || null })
    setAmount('')
    setNote('')
    setBusy(false)
    onSaved()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Car</label>
          <select className="input" value={carId} onChange={(e) => setCarId(e.target.value)}>
            <option value="">—</option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">AED</label>
          <input className="input" type="number" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="label">Note</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button disabled={busy} className="btn-primary">
          Add
        </button>
      </form>
      <div className="card">
        <div className="flex justify-between font-semibold mb-2">
          <span>This month</span>
          <span className="text-red-600">AED {total.toLocaleString()}</span>
        </div>
        {rows.length === 0 && <p className="text-stone-400 text-sm">No expenses logged this month.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex justify-between text-sm py-1.5 border-t border-stone-100">
            <span className="text-stone-500">
              {fmt(r.date)} · {carName(r.car_id)} · {r.category}
              {r.note ? ` · ${r.note}` : ''}
            </span>
            <span className="font-medium">AED {Number(r.amount).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpotChecks({ cars, rows, carName, paidCountFor, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [carId, setCarId] = useState('')
  const [shift, setShift] = useState('morning')
  const [heads, setHeads] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const paid = carId ? paidCountFor(carId, shift) : null

  async function add(e) {
    e.preventDefault()
    setBusy(true)
    await supabase.from('spot_checks').insert({
      date,
      car_id: carId,
      shift,
      heads_counted: Number(heads),
      paid_count: paid ?? 0,
      note: note || null,
    })
    setHeads('')
    setNote('')
    setBusy(false)
    onSaved()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Car</label>
          <select className="input" required value={carId} onChange={(e) => setCarId(e.target.value)}>
            <option value="">Select…</option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Shift</label>
          <select className="input" value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="morning">Morning</option>
            <option value="night">Night</option>
          </select>
        </div>
        <div>
          <label className="label">Heads counted</label>
          <input className="input" type="number" min="0" required value={heads} onChange={(e) => setHeads(e.target.value)} />
        </div>
        <div>
          <label className="label">Paid (auto)</label>
          <div className="input bg-stone-100 text-stone-600">{paid ?? '—'}</div>
        </div>
        <button disabled={busy} className="btn-primary">
          Log
        </button>
      </form>
      <div className="card">
        <div className="font-semibold mb-2">Recent checks</div>
        {rows.length === 0 && <p className="text-stone-400 text-sm">No spot checks yet. Do 1–2 per month per car.</p>}
        {rows.map((r) => {
          const diff = r.heads_counted - r.paid_count
          return (
            <div key={r.id} className="flex justify-between text-sm py-1.5 border-t border-stone-100">
              <span className="text-stone-500">
                {fmt(r.date)} · {carName(r.car_id)} · {r.shift}
                {r.note ? ` · ${r.note}` : ''}
              </span>
              <span className={diff > 0 ? 'font-bold text-red-600' : 'font-medium text-emerald-700'}>
                {r.heads_counted} heads / {r.paid_count} paid{diff > 0 ? ` · +${diff} unpaid!` : ' · OK'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
