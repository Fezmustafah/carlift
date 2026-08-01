import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizePhone } from '../lib/wa'

const AREAS = ['Sobha Hartland', 'Meydan', 'Other']

export default function MemberModal({ member, cars, onClose, onSaved }) {
  const isNew = !member?.id
  // A member's payments are ON DELETE CASCADE, so deleting a rider who has paid
  // silently takes that money out of /report. The count and the total are put in
  // front of whoever is about to do it.
  const paid = member?.subscriptions || []
  const paidTotal = paid.reduce((s, p) => s + Number(p.amount || 0), 0)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [form, setForm] = useState({
    name: member?.name || '',
    phone: member?.phone || '',
    gender: member?.gender || '',
    area: member?.area || '',
    pickup_point: member?.pickup_point || '',
    car_id: member?.car_id || '',
    shift: member?.shift || 'morning',
    status: member?.status || 'pending',
    notes: member?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    // The database refuses a member without a real number — say so in words
    // rather than letting a constraint error through.
    const phone = normalizePhone(form.phone)
    if (phone.length < 9) {
      setErr('A WhatsApp number is required — 05x xxx xxxx. No number, no member.')
      setBusy(false)
      return
    }
    const row = {
      ...form,
      phone,
      area: form.area || null,
      pickup_point: form.pickup_point || null,
      car_id: form.car_id || null,
      notes: form.notes || null,
    }
    const q = isNew
      ? supabase.from('members').insert({ ...row, source: 'manual' })
      : supabase.from('members').update(row).eq('id', member.id)
    const { error } = await q
    if (error) {
      // 23505 = unique violation on phone: this rider is already on the list.
      setErr(
        error.code === '23505'
          ? 'This WhatsApp number is already on the members list. Search for it instead of adding again.'
          : error.message
      )
      setBusy(false)
      return
    }
    onSaved?.()
    onClose()
  }

  // The usual reason a rider leaves the list is that they stopped riding, and
  // that must not cost the office its record of what they paid. Marking them
  // 'left' takes them off the roster and keeps every payment in /report.
  async function markLeft() {
    if (busy) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('members').update({ status: 'left' }).eq('id', member.id)
    if (error) {
      setErr(error.message)
      setBusy(false)
      return
    }
    onSaved?.()
    onClose()
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('members').delete().eq('id', member.id)
    if (error) {
      setErr(error.message)
      setBusy(false)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/50 grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={save} className="card w-full max-w-md p-5 space-y-3 my-8 pop-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{isNew ? 'Add member' : `Edit — ${member.name}`}</h2>
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">WhatsApp number</label>
          <input
            className="input"
            required
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Gender</label>
            <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className="label">Area</label>
            <select className="input" value={form.area} onChange={(e) => set('area', e.target.value)}>
              <option value="">—</option>
              {AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Pickup point</label>
          <input className="input" value={form.pickup_point} onChange={(e) => set('pickup_point', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Car</label>
            <select className="input" value={form.car_id} onChange={(e) => set('car_id', e.target.value)}>
              <option value="">Not assigned</option>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Shift</label>
            <select className="input" value={form.shift} onChange={(e) => set('shift', e.target.value)}>
              <option value="morning">Morning</option>
              <option value="night">Night</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="left">Left</option>
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        {err && (
          <p className="text-sm" style={{ color: 'var(--bad)' }}>
            {err}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button disabled={busy} className="btn-primary flex-1">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Removing a member is for test rows and mistakes. A rider who stopped
            riding should be marked 'left' instead, which is why that way out is
            offered here rather than only in the status dropdown above. */}
        {!isNew && (
          <div className="pt-2" style={{ borderTop: '1px solid var(--line, rgba(128,128,128,0.25))' }}>
            {!confirming ? (
              <button
                type="button"
                onClick={() => {
                  setConfirming(true)
                  setTyped('')
                  setErr('')
                }}
                className="btn-ghost w-full text-sm"
                style={{ color: 'var(--bad)' }}
              >
                Delete this member
              </button>
            ) : (
              <div
                className="rounded-2xl p-3 space-y-2.5 text-sm"
                style={{ border: '2px solid var(--bad)', background: 'var(--bad-soft)' }}
              >
                <div className="font-bold" style={{ color: 'var(--bad)' }}>
                  Delete {member.name} for good?
                </div>

                {paid.length > 0 ? (
                  <>
                    <p style={{ color: 'var(--bad)' }}>
                      This also deletes <b>{paid.length} payment{paid.length === 1 ? '' : 's'}</b>, and{' '}
                      <b>AED {paidTotal.toLocaleString()}</b> disappears from the month report. It cannot be undone.
                    </p>
                    <p className="dim">
                      If this is a real rider who simply stopped riding, mark them <b>Left</b> instead — they come off
                      the roster and the money stays counted.
                    </p>
                    <div>
                      <label className="label">Type DELETE to confirm</label>
                      <input
                        className="input"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder="DELETE"
                        autoComplete="off"
                      />
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--bad)' }}>
                    No payments are recorded against them, so nothing else goes with them. Their check-in answers stay
                    on the Verify page.
                  </p>
                )}

                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="btn-ghost flex-1 py-1.5 text-sm"
                  >
                    Keep
                  </button>
                  {paid.length > 0 && (
                    <button
                      type="button"
                      onClick={markLeft}
                      disabled={busy}
                      className="btn-primary flex-1 py-1.5 text-sm"
                    >
                      Mark as Left
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={remove}
                    disabled={busy || (paid.length > 0 && typed.trim().toUpperCase() !== 'DELETE')}
                    className="btn-danger flex-1 py-1.5 text-sm"
                  >
                    {busy ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
