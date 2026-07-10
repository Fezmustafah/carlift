import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizePhone } from '../lib/wa'

const AREAS = ['Sobha Hartland', 'Meydan', 'Other']

export default function MemberModal({ member, cars, onClose, onSaved }) {
  const isNew = !member?.id
  const [form, setForm] = useState({
    name: member?.name || '',
    phone: member?.phone || '',
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
    setBusy(true)
    setErr('')
    const row = {
      ...form,
      phone: normalizePhone(form.phone),
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
      setErr(error.message)
      setBusy(false)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 bg-black/40 grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={save} className="card w-full max-w-md p-5 space-y-3 my-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{isNew ? 'Add member' : `Edit — ${member.name}`}</h2>
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">WhatsApp number</label>
          <input className="input" required type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Area</label>
            <select className="input" value={form.area} onChange={(e) => set('area', e.target.value)}>
              <option value="">—</option>
              {AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Pickup point</label>
            <input className="input" value={form.pickup_point} onChange={(e) => set('pickup_point', e.target.value)} />
          </div>
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
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancel
          </button>
          <button disabled={busy} className="btn-primary flex-1">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
