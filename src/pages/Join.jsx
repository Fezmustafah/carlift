import { useEffect, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'
import { normalizePhone, waLink } from '../lib/wa'

const SHIFTS = [
  { v: 'morning', en: 'Morning', ur: 'Subah' },
  { v: 'night', en: 'Evening / Night', ur: 'Shaam / Raat' },
  { v: 'both', en: 'Both', ur: 'Dono' },
]
const PLANS = [
  { v: '30d', en: '30 days', ur: 'Poora mahina' },
  { v: '15d', en: '15 days', ur: '15 din' },
  { v: 'onetime', en: 'Sometimes only', ur: 'Kabhi kabhi' },
]
const AREAS = ['Sobha Hartland', 'Meydan', 'Other']

function Choice({ options, value, onChange, render }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.v
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-xl border-2 px-3 py-3 text-left ${
              active ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 bg-white'
            }`}
          >
            {render(o)}
          </button>
        )
      })}
    </div>
  )
}

export default function Join() {
  const [cars, setCars] = useState([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [area, setArea] = useState('')
  const [pickup, setPickup] = useState('')
  const [carId, setCarId] = useState('')
  const [shift, setShift] = useState('')
  const [plan, setPlan] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const office = import.meta.env.VITE_OFFICE_WHATSAPP

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('cars')
      .select('id, name, driver_name')
      .order('name')
      .then(({ data }) => setCars(data || []))
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!hasSupabase) return
    if (!shift || !plan) {
      setErr('Please select shift and plan / Shift aur plan chunein')
      return
    }
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('members').insert({
      name: name.trim(),
      phone: normalizePhone(phone),
      area: area || null,
      pickup_point: pickup.trim() || null,
      car_id: carId || null,
      shift,
      plan_pref: plan,
      status: 'pending',
      source: 'qr',
    })
    if (error) {
      setErr('Could not submit. Try again / Dobara koshish karein')
    } else {
      setDone(true)
    }
    setBusy(false)
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="card max-w-md w-full text-center space-y-3 p-8">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold">Registered!</h1>
          <p className="text-stone-600">
            The office will confirm your seat on WhatsApp.
            <br />
            <span className="text-stone-500">Office aapko WhatsApp par confirm karega. Shukriya!</span>
          </p>
          {office && (
            <a
              href={waLink(office, 'Salam, I just registered for car lift. / Maine abhi car lift ke liye register kiya hai.')}
              className="btn-primary inline-block"
            >
              WhatsApp Office
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4">
      <form onSubmit={submit} className="max-w-md mx-auto space-y-5 pb-16">
        <div className="pt-4">
          <h1 className="text-2xl font-bold text-emerald-700">Car Lift Registration</h1>
          <p className="text-stone-500">30 seconds. / Sirf 30 second lagenge.</p>
        </div>

        {!hasSupabase && (
          <div className="rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-sm p-3">
            Form not connected yet (Supabase setup pending — see README).
          </div>
        )}

        <div>
          <label className="label">Your name / Aapka naam</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </div>

        <div>
          <label className="label">WhatsApp number (05…)</label>
          <input
            className="input"
            required
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05x xxx xxxx"
          />
        </div>

        <div>
          <label className="label">Area / Ilaaqa</label>
          <Choice options={AREAS} value={area} onChange={setArea} render={(o) => <span className="font-medium">{o}</span>} />
        </div>

        <div>
          <label className="label">Pickup point / Kahan se lete hain</label>
          <input
            className="input"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="Building / landmark"
          />
        </div>

        {cars.length > 0 && (
          <div>
            <label className="label">Which car / Kis gaadi mein</label>
            <Choice
              options={cars.map((c) => ({ v: c.id, en: c.name, ur: c.driver_name }))}
              value={carId}
              onChange={setCarId}
              render={(o) => (
                <>
                  <div className="font-medium">{o.en}</div>
                  <div className="text-sm text-stone-500">Driver: {o.ur}</div>
                </>
              )}
            />
          </div>
        )}

        <div>
          <label className="label">Shift / Waqt</label>
          <Choice
            options={SHIFTS}
            value={shift}
            onChange={setShift}
            render={(o) => (
              <>
                <div className="font-medium">{o.en}</div>
                <div className="text-sm text-stone-500">{o.ur}</div>
              </>
            )}
          />
        </div>

        <div>
          <label className="label">Plan</label>
          <Choice
            options={PLANS}
            value={plan}
            onChange={setPlan}
            render={(o) => (
              <>
                <div className="font-medium">{o.en}</div>
                <div className="text-sm text-stone-500">{o.ur}</div>
              </>
            )}
          />
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <button disabled={busy || !hasSupabase} className="btn-primary w-full text-lg py-3">
          {busy ? 'Submitting…' : 'Register / Register karein'}
        </button>

        <p className="text-xs text-stone-400 text-center">
          Payment only to office number. Payment to driver is not valid.
          <br />
          Paisa sirf office number par. Driver ko payment dena valid nahi hai.
        </p>
      </form>
    </div>
  )
}
