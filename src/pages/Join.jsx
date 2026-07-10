import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'
import { normalizePhone, waLink } from '../lib/wa'

const AREAS = [
  { v: 'Sobha Hartland', en: 'Sobha Hartland', ur: 'Sobha Hartland' },
  { v: 'Meydan', en: 'Meydan', ur: 'Meydan' },
  { v: 'Other', en: 'Other', ur: 'Doosra' },
]
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

// Valid once it normalizes to a full UAE-length number (971 + 9 digits).
const phoneOk = (p) => normalizePhone(p).length >= 11

function Choice({ options, value, onPick }) {
  return (
    <div className="space-y-2.5">
      {options.map((o) => {
        const active = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onPick(o.v)}
            className={`w-full rounded-2xl border-2 px-4 py-4 text-left transition ${
              active ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div className="text-lg font-semibold text-stone-900">{o.en}</div>
            {o.ur && <div className="text-sm text-stone-500">{o.ur}</div>}
          </button>
        )
      })}
    </div>
  )
}

export default function Join() {
  const [cars, setCars] = useState([])
  const preCarId = useMemo(() => new URLSearchParams(window.location.search).get('car') || '', [])
  const [a, setA] = useState({ name: '', phone: '', area: '', pickup: '', car_id: preCarId, shift: '', plan: '' })
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const office = import.meta.env.VITE_OFFICE_WHATSAPP

  useEffect(() => {
    if (!supabase) return
    supabase.from('cars').select('id, name, driver_name').order('name').then(({ data }) => setCars(data || []))
  }, [])

  const set = (k, v) => setA((s) => ({ ...s, [k]: v }))

  const steps = useMemo(() => {
    const s = [
      { key: 'name', type: 'text', q: 'What is your name?', ur: 'Aapka naam kya hai?', ph: 'Full name', required: true },
      {
        key: 'phone',
        type: 'tel',
        q: 'Your WhatsApp number',
        ur: 'WhatsApp number (05…)',
        ph: '05x xxx xxxx',
        required: true,
        valid: phoneOk,
        hint: 'The office confirms your seat here. / Office isi number par confirm karega.',
      },
      { key: 'area', type: 'choice', q: 'Which area?', ur: 'Kaunsa ilaaqa?', options: AREAS },
      { key: 'pickup', type: 'text', q: 'Your pickup point', ur: 'Kahan se lete hain?', ph: 'Building / landmark' },
      { key: 'shift', type: 'choice', q: 'Which time?', ur: 'Kaunsa waqt?', options: SHIFTS },
      { key: 'plan', type: 'choice', q: 'How long?', ur: 'Kitne din ka plan?', options: PLANS },
    ]
    if (cars.length && !preCarId) {
      s.splice(4, 0, {
        key: 'car_id',
        type: 'choice',
        q: 'Which car?',
        ur: 'Kaunsi gaadi?',
        options: cars.map((c) => ({ v: c.id, en: c.name, ur: `Driver: ${c.driver_name}` })),
      })
    }
    return s
  }, [cars, preCarId])

  const total = steps.length
  const cur = steps[Math.min(step, total - 1)]
  const isLast = step === total - 1

  async function submit(ans) {
    if (!hasSupabase) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('members').insert({
      name: ans.name.trim(),
      phone: normalizePhone(ans.phone),
      area: ans.area || null,
      pickup_point: ans.pickup.trim() || null,
      car_id: ans.car_id || null,
      shift: ans.shift,
      plan_pref: ans.plan,
      status: 'pending',
      source: 'qr',
    })
    if (error) setErr('Could not submit. Try again / Dobara koshish karein')
    else setDone(true)
    setBusy(false)
  }

  function advance(next) {
    if (isLast) submit(next)
    else setStep((s) => s + 1)
  }

  function onNext() {
    const val = a[cur.key]
    if (cur.required && !String(val || '').trim()) return setErr('Please fill this / Yeh bharein')
    if (cur.valid && !cur.valid(val)) return setErr('Enter a valid number / Sahi number likhein')
    setErr('')
    advance(a)
  }

  function onPick(v) {
    const next = { ...a, [cur.key]: v }
    setA(next)
    setErr('')
    setTimeout(() => advance(next), 130)
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="card max-w-md w-full text-center space-y-3 p-8">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold">Registered!</h1>
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
          <p className="text-xs text-stone-400 pt-2">
            Payment only to office number — paying the driver is not valid.
            <br />
            Paisa sirf office number par. Driver ko dena valid nahi.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-4">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
        {/* progress */}
        <div className="pt-3">
          <div className="flex items-center justify-between text-xs text-stone-400 mb-2">
            <span className="font-semibold text-emerald-700">Car Lift</span>
            <span>Step {step + 1} of {total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${((step + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        {!hasSupabase && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-sm p-3">
            Form not connected yet (Supabase setup pending — see README).
          </div>
        )}

        {/* step */}
        <div key={step} className="step-in flex-1 flex flex-col justify-center py-8">
          <h1 className="text-3xl font-bold text-stone-900">{cur.q}</h1>
          <p className="text-stone-500 mt-1 mb-6 text-lg" dir="auto">{cur.ur}</p>

          {cur.type === 'choice' ? (
            <Choice options={cur.options} value={a[cur.key]} onPick={onPick} />
          ) : (
            <input
              className="w-full rounded-2xl border-2 border-stone-200 bg-white px-4 py-4 text-xl outline-none focus:border-emerald-500"
              type={cur.type === 'tel' ? 'tel' : 'text'}
              inputMode={cur.type === 'tel' ? 'tel' : 'text'}
              placeholder={cur.ph}
              value={a[cur.key]}
              autoFocus
              onChange={(e) => set(cur.key, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onNext()}
            />
          )}

          {cur.hint && <p className="text-sm text-stone-400 mt-3">{cur.hint}</p>}
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
        </div>

        {/* nav */}
        <div className="flex gap-3 pb-4">
          {step > 0 && (
            <button type="button" onClick={() => { setErr(''); setStep((s) => s - 1) }} className="btn-ghost px-5">
              ← Back
            </button>
          )}
          {cur.type !== 'choice' && (
            <button type="button" onClick={onNext} disabled={busy} className="btn-primary flex-1 text-lg py-3.5">
              {busy ? 'Submitting…' : isLast ? 'Register / Register karein' : 'Next / Aage'}
            </button>
          )}
        </div>

        <p className="text-xs text-stone-400 text-center pb-4">
          Payment only to office number. Payment to driver is not valid.
        </p>
      </div>
    </div>
  )
}
