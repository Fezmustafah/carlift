import { useMemo } from 'react'
import { Sheet, Note, aed } from './ui'
import { riderHistory, monthName } from '../lib/analysis'

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const METHOD = { cash: 'Cash', card: 'Card', transfer: 'Bank' }

// One rider, every payment the register remembers — the answer to "I paid
// already" and to "where has this one gone?", in one sheet.
export default function RiderSheet({ open, onClose, lines = [], riderKey, cars = [], onWrite }) {
  const h = useMemo(() => (riderKey ? riderHistory(lines, riderKey) : null), [lines, riderKey])
  const car = (id) => cars.find((c) => c.id === id)

  return (
    <Sheet
      open={open && !!h}
      title={h?.name || 'Rider'}
      onClose={onClose}
      footer={
        onWrite && h ? (
          <button onClick={() => onWrite(h.name)} className="btn-primary w-full py-3.5 rounded-2xl">
            Write {h.name.split(' ')[0]} in the register
          </button>
        ) : null
      }
    >
      {h && (
        <div className="space-y-4 pb-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-sunk px-3 py-2.5">
              <p className="label mb-1">Paid in total</p>
              <p className="num text-[20px] font-medium">{aed(h.total)}</p>
            </div>
            <div className="rounded-xl bg-sunk px-3 py-2.5">
              <p className="label mb-1">Months paid</p>
              <p className="num text-[20px] font-medium">{h.months.length}</p>
            </div>
          </div>

          {h.spellings.length > 1 && <Note>Written as: {h.spellings.join(' · ')}</Note>}

          {h.months.map((m) => (
            <div key={m.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <p className="label mb-0">{monthName(m.key, true)}</p>
                <p className="num text-[12.5px] font-bold">AED {aed(m.total)}</p>
              </div>
              <ul className="card p-0 overflow-hidden divide-y divide-hair">
                {m.lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="num text-[11px] muted w-[46px] shrink-0">{shortDate(l.taken_on)}</span>
                    <span className="flex-1 min-w-0 text-[12.5px] truncate">
                      {car(l.car_id) ? `${car(l.car_id).name} · ${car(l.car_id).driver_name}` : 'No vehicle written'}
                    </span>
                    {l.method && l.method !== 'cash' && <span className="chip chip-info">{METHOD[l.method]}</span>}
                    {l._pending && <span className="chip chip-warn">unsent</span>}
                    <span className="num text-[13px] font-bold shrink-0">{aed(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {h.months.length === 0 && <p className="text-[13px] muted">Nothing in the register for this name.</p>}
        </div>
      )}
    </Sheet>
  )
}
