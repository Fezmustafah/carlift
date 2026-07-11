import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'
import { normalizePhone, waLink } from '../lib/wa'
import { todayISO, addDays, planEnd, fmt } from '../lib/dates'

const AREAS = [
  { v: 'Sobha Hartland', en: 'Sobha Hartland' },
  { v: 'Meydan', en: 'Meydan' },
  { v: 'Other', en: 'Other', tl: 'Iba pa' },
]
const SHIFTS = [
  { v: 'morning', en: 'Morning', tl: 'Umaga' },
  { v: 'night', en: 'Evening / Night', tl: 'Gabi' },
  { v: 'both', en: 'Both', tl: 'Pareho' },
]
const PLANS = [
  { v: '30d', en: '30 days', tl: 'Buong buwan' },
  { v: '15d', en: '15 days', tl: '15 araw' },
  { v: 'onetime', en: 'Sometimes only', tl: 'Paminsan-minsan lang' },
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
            {o.tl && <div className="text-sm text-stone-500">{o.tl}</div>}
          </button>
        )
      })}
    </div>
  )
}

export default function Join() {
  const [cars, setCars] = useState([])
  const preCarId = useMemo(() => new URLSearchParams(window.location.search).get('car') || '', [])
  const [a, setA] = useState({
    name: '',
    phone: '',
    area: '',
    pickup: '',
    car_id: preCarId,
    shift: '',
    plan: '',
    start: todayISO(),
  })
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
      { key: 'name', type: 'text', q: 'What is your name?', tl: 'Ano ang pangalan mo?', ph: 'Full name', required: true },
      {
        key: 'phone',
        type: 'tel',
        q: 'Your WhatsApp number',
        tl: 'Ang WhatsApp number mo (05…)',
        ph: '05x xxx xxxx',
        required: true,
        valid: phoneOk,
        hint: 'The office confirms your seat here. / Dito kokompirmahin ng opisina ang seat mo.',
      },
      { key: 'area', type: 'choice', q: 'Which area?', tl: 'Aling lugar?', options: AREAS },
      { key: 'pickup', type: 'text', q: 'Your pickup point', tl: 'Saan ka sumasakay?', ph: 'Building / landmark' },
      { key: 'shift', type: 'choice', q: 'Which time?', tl: 'Anong oras?', options: SHIFTS },
      { key: 'plan', type: 'choice', q: 'How long?', tl: 'Gaano katagal?', options: PLANS },
    ]
    if (cars.length && !preCarId) {
      s.splice(4, 0, {
        key: 'car_id',
        type: 'choice',
        q: 'Which car?',
        tl: 'Aling sasakyan?',
        options: cars.map((c) => ({ v: c.id, en: c.name, tl: `Driver: ${c.driver_name}` })),
      })
    }
    if (a.plan && a.plan !== 'onetime') {
      s.push({
        key: 'start',
        type: 'start',
        q: 'When do you start?',
        tl: 'Kailan ka magsisimula?',
      })
    }
    s.push({ key: 'confirm', type: 'confirm', q: 'Please confirm', tl: 'Pakikumpirma' })
    return s
  }, [cars, preCarId, a.plan])

  const total = steps.length
  const cur = steps[Math.min(step, total - 1)]
  const hasPeriod = a.plan && a.plan !== 'onetime'
  const end = hasPeriod ? planEnd(a.start, a.plan) : null
  const carName = cars.find((c) => c.id === a.car_id)?.name

  async function submit() {
    if (!hasSupabase) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('members').insert({
      name: a.name.trim(),
      phone: normalizePhone(a.phone),
      area: a.area || null,
      pickup_point: a.pickup.trim() || null,
      car_id: a.car_id || null,
      shift: a.shift,
      plan_pref: a.plan,
      status: 'pending',
      source: 'qr',
      notes: hasPeriod ? `Requested ${a.plan}: ${a.start} → ${end}` : null,
    })
    if (error) setErr('Could not submit. Try again / Subukan muli')
    else setDone(true)
    setBusy(false)
  }

  function onNext() {
    const val = a[cur.key]
    if (cur.required && !String(val || '').trim()) return setErr('Please fill this / Pakisagot ito')
    if (cur.valid && !cur.valid(val)) return setErr('Enter a valid number / Ilagay ang tamang number')
    setErr('')
    setStep((s) => s + 1)
  }

  function onPick(v) {
    setA((s) => ({ ...s, [cur.key]: v }))
    setErr('')
    setTimeout(() => setStep((s) => s + 1), 130)
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
            <span className="text-stone-500">Kokompirmahin ng opisina ang seat mo sa WhatsApp. Salamat!</span>
          </p>
          {office && (
            <a
              href={waLink(office, 'Hi, I just registered for car lift.')}
              className="btn-primary inline-block"
            >
              WhatsApp Office
            </a>
          )}
          <a href="/rules" className="btn-ghost block">
            📋 Read the rules / Basahin ang patakaran
          </a>
          <p className="text-xs text-stone-400 pt-2">
            Payment only to office — paying the driver is not valid.
            <br />
            Magbayad sa opisina lamang. Hindi valid ang bayad sa driver.
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
          <p className="text-stone-500 mt-1 mb-6 text-lg">{cur.tl}</p>

          {cur.type === 'choice' && <Choice options={cur.options} value={a[cur.key]} onPick={onPick} />}

          {(cur.type === 'text' || cur.type === 'tel') && (
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

          {cur.type === 'start' && (
            <div className="space-y-2.5">
              <Choice
                options={[
                  { v: todayISO(), en: `Today · ${fmt(todayISO())}`, tl: 'Ngayon' },
                  { v: addDays(todayISO(), 1), en: `Tomorrow · ${fmt(addDays(todayISO(), 1))}`, tl: 'Bukas' },
                ]}
                value={a.start}
                onPick={onPick}
              />
              <div className="pt-1">
                <label className="label">Or pick a date / O pumili ng petsa</label>
                <input
                  className="input"
                  type="date"
                  min={todayISO()}
                  value={a.start}
                  onChange={(e) => set('start', e.target.value)}
                />
              </div>
            </div>
          )}

          {cur.type === 'confirm' && (
            <div className="space-y-3">
              {hasPeriod && (
                <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-4 text-center">
                  <div className="text-sm text-emerald-800 font-medium">
                    Your car lift / Ang car lift mo
                  </div>
                  <div className="text-2xl font-bold text-stone-900 mt-1">
                    {fmt(a.start)} → {fmt(end)}
                  </div>
                  <div className="text-sm text-stone-500 mt-0.5">
                    {a.plan === '15d' ? '15 days · 15 araw' : '30 days · 30 araw'}
                  </div>
                </div>
              )}
              <div className="card text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-stone-500">Name</span><b>{a.name}</b></div>
                <div className="flex justify-between"><span className="text-stone-500">WhatsApp</span><b>{a.phone}</b></div>
                {carName && <div className="flex justify-between"><span className="text-stone-500">Car</span><b>{carName}</b></div>}
                <div className="flex justify-between">
                  <span className="text-stone-500">Time</span>
                  <b>{SHIFTS.find((x) => x.v === a.shift)?.en}</b>
                </div>
                {!hasPeriod && <div className="flex justify-between"><span className="text-stone-500">Plan</span><b>Sometimes only</b></div>}
              </div>
              <p className="text-sm text-stone-500 text-center">Is this correct? / Tama ba ito?</p>
            </div>
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
          {(cur.type === 'text' || cur.type === 'tel') && (
            <button type="button" onClick={onNext} className="btn-primary flex-1 text-lg py-3.5">
              Next / Susunod
            </button>
          )}
          {cur.type === 'start' && (
            <button type="button" onClick={() => { setErr(''); setStep((s) => s + 1) }} className="btn-primary flex-1 text-lg py-3.5">
              Next / Susunod
            </button>
          )}
          {cur.type === 'confirm' && (
            <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1 text-lg py-3.5">
              {busy ? 'Submitting…' : '✓ Confirm / Kumpirmahin'}
            </button>
          )}
        </div>

        <p className="text-xs text-stone-400 text-center pb-4">
          Payment only to office. Payment to driver is not valid.
        </p>
      </div>
    </div>
  )
}
