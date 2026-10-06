import { useEffect, useRef, useState } from 'react'
import { Sheet, aed } from './ui'
import { todayISO } from '../lib/dates'

// Fix a line instead of deleting it and writing it again: a wrong name, a
// wrong amount, the wrong vehicle, the wrong day. Deleting is here too, behind
// a second tap — one mis-tap must never erase a rider who paid.
export default function LineSheet({ line: open, cars = [], onClose, onSave, onDelete }) {
  const [f, setF] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  // The sheet slides away after `line` is cleared, still drawing what it showed —
  // so the last line is kept here rather than read from a prop that is now null.
  const last = useRef(open)
  if (open) last.current = open
  const line = open || last.current

  useEffect(() => {
    if (!open) return
    const line = open
    setF({
      name: line.name || '',
      amount: String(line.amount ?? ''),
      method: line.method || 'cash',
      car_id: line.car_id || '',
      taken_on: line.taken_on || todayISO(),
    })
    setErr('')
    setSure(false)
    setBusy(false)
  }, [open])

  const set = (k) => (v) => {
    setErr('')
    setF((x) => ({ ...x, [k]: v }))
  }

  async function save() {
    const name = f.name.trim()
    const amount = Number(f.amount)
    if (!name) return setErr('Write the name')
    if (!(amount > 0)) return setErr('Write the amount')
    if (!f.taken_on || f.taken_on > todayISO()) return setErr('The day cannot be after today')
    setBusy(true)
    const e = await onSave({ name, amount, method: f.method, car_id: f.car_id || null, taken_on: f.taken_on })
    setBusy(false)
    if (e) setErr(e)
  }

  async function remove() {
    if (!sure) return setSure(true)
    setBusy(true)
    const e = await onDelete()
    setBusy(false)
    if (e) setErr(e)
  }

  return (
    <Sheet
      open={!!open}
      title="Change this line"
      onClose={onClose}
      footer={
        f && (
          <div className="flex gap-2">
            <button
              onClick={remove}
              disabled={busy}
              className={sure ? 'btn-danger flex-1 py-3.5 rounded-2xl' : 'btn-ghost py-3.5 rounded-2xl px-4'}
            >
              {sure ? 'Yes, delete it' : 'Delete'}
            </button>
            {sure ? (
              <button onClick={() => setSure(false)} className="btn-ghost flex-1 py-3.5 rounded-2xl">
                Keep it
              </button>
            ) : (
              <button onClick={save} disabled={busy} className="btn-primary flex-1 py-3.5 rounded-2xl">
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        )
      }
    >
      {f && line && (
        <div className="space-y-4 pb-2">
          {line._pending && (
            <p className="text-[12px] text-warn font-bold">Not sent yet — the change goes up with it.</p>
          )}
          <label className="block">
            <span className="label">Name</span>
            <input className="input text-lg" value={f.name} onChange={(e) => set('name')(e.target.value)} />
          </label>

          <label className="block">
            <span className="label">Amount (AED)</span>
            <input
              className="input text-lg num"
              type="number"
              inputMode="numeric"
              min="1"
              value={f.amount}
              onChange={(e) => set('amount')(e.target.value)}
            />
            {Number(line.amount) !== Number(f.amount) && f.amount !== '' && (
              <span className="block text-[11.5px] muted mt-1">
                Was {aed(line.amount)}
              </span>
            )}
          </label>

          <div>
            <span className="label">Paid by</span>
            <div className="seg">
              {[
                ['cash', 'Cash'],
                ['card', 'Card'],
                ['transfer', 'Bank'],
              ].map(([m, l]) => (
                <button key={m} type="button" aria-pressed={f.method === m} onClick={() => set('method')(m)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label">Vehicle</span>
            <div className="flex flex-wrap gap-2">
              {cars.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set('car_id')(c.id)}
                  className={`pill ${f.car_id === c.id ? 'pill-on' : ''}`}
                >
                  {c.name} · {c.driver_name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => set('car_id')('')}
                className={`pill ${f.car_id === '' ? 'pill-on' : ''}`}
              >
                No vehicle
              </button>
            </div>
          </div>

          <label className="block">
            <span className="label">Day it was paid</span>
            <input
              className="input"
              type="date"
              max={todayISO()}
              value={f.taken_on}
              onChange={(e) => set('taken_on')(e.target.value)}
            />
          </label>

          {err && <p className="text-[13px] font-bold text-bad">{err}</p>}
        </div>
      )}
    </Sheet>
  )
}
