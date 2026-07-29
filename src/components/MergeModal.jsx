import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/dates'
import { findPairs } from '../lib/dupes'

// The same rider reaches the list twice: once typed from the paper register,
// once from their own check-in, with the name spelled differently. Merging
// moves the payments onto one record — nothing is ever deleted.

function subsOf(m) {
  return m.subscriptions || []
}

export default function MergeModal({ members, cars, onClose, onSaved }) {
  const pairs = useMemo(() => findPairs(members), [members])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [merged, setMerged] = useState([])

  const carName = (id) => cars.find((c) => c.id === id)?.name || 'no car'

  // Keep the record with more history; move everything onto it.
  async function merge(pair) {
    const [keep, drop] =
      subsOf(pair.a).length >= subsOf(pair.b).length ? [pair.a, pair.b] : [pair.b, pair.a]
    setBusy(pair.a.id + pair.b.id)
    setErr('')

    const { error: e1 } = await supabase
      .from('subscriptions')
      .update({ member_id: keep.id })
      .eq('member_id', drop.id)
    if (e1) {
      setErr(e1.message)
      setBusy('')
      return
    }

    // Fill anything the kept record is missing from the one being retired.
    const patch = {}
    for (const f of ['phone', 'car_id', 'gender', 'area', 'pickup_point', 'plan_pref']) {
      if (!keep[f] && drop[f]) patch[f] = drop[f]
    }
    if (Object.keys(patch).length) await supabase.from('members').update(patch).eq('id', keep.id)

    const { error: e2 } = await supabase
      .from('members')
      .update({
        status: 'left',
        notes: `${drop.notes ? drop.notes + ' | ' : ''}merged into ${keep.name} on ${fmt(new Date().toLocaleDateString('en-CA'))}`,
      })
      .eq('id', drop.id)
    if (e2) {
      setErr(e2.message)
      setBusy('')
      return
    }

    setMerged((m) => [...m, pair.a.id + pair.b.id])
    setBusy('')
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/50 grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-2xl p-5 space-y-4 my-8 pop-in" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold">Same rider twice?</h2>
          <p className="text-sm muted">
            Merging keeps one record and moves all payments onto it. The other is marked "left", never deleted.
          </p>
        </div>

        {pairs.length === 0 && <p className="muted py-6 text-center">No duplicates found. The list is clean.</p>}

        <div className="space-y-2">
          {pairs.map((p) => {
            const id = p.a.id + p.b.id
            const done = merged.includes(id)
            const [keep, drop] = subsOf(p.a).length >= subsOf(p.b).length ? [p.a, p.b] : [p.b, p.a]
            return (
              <div key={id} className={`sunken p-3 space-y-2 ${done ? 'opacity-60' : ''}`}>
                <div className="text-xs" style={{ color: 'var(--warn)' }}>
                  {p.why}
                </div>
                <div className="grid sm:grid-cols-2 gap-2 text-sm">
                  {[keep, drop].map((m, i) => (
                    <div key={m.id}>
                      <div className="font-semibold truncate">
                        {m.name} {i === 0 ? <span className="chip chip-ok">keep</span> : <span className="chip chip-mute">retire</span>}
                      </div>
                      <div className="muted truncate">
                        {m.phone || 'no phone'} · {carName(m.car_id)}
                      </div>
                      <div className="dim text-xs">
                        {subsOf(m).length} payment{subsOf(m).length === 1 ? '' : 's'}
                      </div>
                    </div>
                  ))}
                </div>
                {done ? (
                  <p className="text-sm" style={{ color: 'var(--ok)' }}>
                    ✓ Merged
                  </p>
                ) : (
                  <button onClick={() => merge(p)} disabled={busy === id} className="btn-primary px-3 py-1.5 text-sm">
                    {busy === id ? 'Merging…' : `Merge into ${keep.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {err && (
          <p className="text-sm" style={{ color: 'var(--bad)' }}>
            {err}
          </p>
        )}

        <button onClick={onClose} className="btn-ghost w-full">
          Close
        </button>
      </div>
    </div>
  )
}
