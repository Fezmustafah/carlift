import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'
import { normalizePhone, waLink } from '../lib/wa'
import { todayISO, addDays, planEnd, fmt } from '../lib/dates'
import Choice from '../components/Choice'

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

const DRAFT_KEY = 'carlift.join.draft'
const DRAFT_TTL = 6 * 60 * 60 * 1000 // 6h — long enough for one commute, short enough to stay fresh

function loadDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (!raw || Date.now() - raw.t > DRAFT_TTL) return null
    return raw
  } catch {
    return null
  }
}

export default function Join() {
  const [cars, setCars] = useState([])
  const preCarId = useMemo(() => new URLSearchParams(window.location.search).get('car') || '', [])
  const draft = useMemo(loadDraft, [])

  const [a, setA] = useState(() => ({
    name: '',
    phone: '',
    area: '',
    pickup: '',
    car_id: preCarId,
    shift: '',
    plan: '',
    start: todayISO(),
    ...(draft?.a || {}),
    // A car link always wins over whatever the draft remembered.
    ...(preCarId ? { car_id: preCarId } : {}),
  }))
  const [step, setStep] = useState(draft?.step || 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [already, setAlready] = useState(false)
  const office = import.meta.env.VITE_OFFICE_WHATSAPP

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('cars')
      .select('id, name, driver_name')
      .order('name')
      .then(({ data }) => {
        const list = data || []
        setCars(list)
        // A stale/mistyped ?car= would fail the foreign key on submit — drop it
        // and let the rider pick instead.
        setA((s) => (s.car_id && !list.some((c) => c.id === s.car_id) ? { ...s, car_id: '' } : s))
      })
  }, [])

  // Keep a short-lived draft so a rider who closes the tab mid-form doesn't start over.
  useEffect(() => {
    if (done || already) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ a, step, t: Date.now() }))
    } catch {
      /* private mode — drafts are a nicety, not a requirement */
    }
  }, [a, step, done, already])

  const set = (k, v) => setA((s) => ({ ...s, [k]: v }))
  const hasCarLink = Boolean(preCarId && cars.some((c) => c.id === preCarId))

  const steps = useMemo(() => {
    const s = [
      {
        key: 'name',
        type: 'text',
        q: 'What is your name?',
        tl: 'Ano ang pangalan mo?',
        ph: 'Full name',
        required: true,
      },
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
      {
        key: 'pickup',
        type: 'text',
        q: 'Your pickup point',
        tl: 'Saan ka sumasakay?',
        ph: 'Building / landmark',
      },
      { key: 'shift', type: 'choice', q: 'Which time?', tl: 'Anong oras?', options: SHIFTS },
      { key: 'plan', type: 'choice', q: 'How long?', tl: 'Gaano katagal?', options: PLANS },
    ]
    if (cars.length && !hasCarLink) {
      s.splice(4, 0, {
        key: 'car_id',
        type: 'choice',
        q: 'Which car?',
        tl: 'Aling sasakyan?',
        options: cars.map((c) => ({ v: c.id, en: c.name, tl: `Driver: ${c.driver_name}` })),
      })
    }
    if (a.plan && a.plan !== 'onetime') {
      s.push({ key: 'start', type: 'start', q: 'When do you start?', tl: 'Kailan ka magsisimula?' })
    }
    s.push({ key: 'confirm', type: 'confirm', q: 'Please confirm', tl: 'Pakikumpirma' })
    return s
  }, [cars, hasCarLink, a.plan])

  const total = steps.length
  const idx = Math.min(step, total - 1)
  const cur = steps[idx]
  const hasPeriod = a.plan && a.plan !== 'onetime'
  const end = hasPeriod ? planEnd(a.start, a.plan) : null
  const carName = cars.find((c) => c.id === a.car_id)?.name

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }

  async function submit() {
    if (!hasSupabase || busy) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('members').insert({
      name: a.name.trim(),
      phone: normalizePhone(a.phone),
      area: a.area || null,
      pickup_point: a.pickup.trim() || null,
      car_id: a.car_id || null,
      shift: a.shift || 'morning',
      plan_pref: a.plan,
      status: 'pending',
      source: 'qr',
      notes: hasPeriod ? `Requested ${a.plan}: ${a.start} → ${end}` : null,
    })
    setBusy(false)
    if (!error) {
      clearDraft()
      setDone(true)
      return
    }
    // 23505 = the unique index on phone: this number registered already.
    if (error.code === '23505' || /duplicate key/i.test(error.message || '')) {
      clearDraft()
      setAlready(true)
      return
    }
    setErr(
      /fetch|network/i.test(error.message || '')
        ? 'No internet. Check your connection and press Confirm again. / Walang internet. Subukan muli.'
        : 'Could not submit. Please try again. / Hindi naipadala. Subukan muli.'
    )
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

  function restart() {
    clearDraft()
    setA({
      name: '',
      phone: '',
      area: '',
      pickup: '',
      car_id: preCarId,
      shift: '',
      plan: '',
      start: todayISO(),
    })
    setStep(0)
    setDone(false)
    setAlready(false)
    setErr('')
  }

  // --- end screens -------------------------------------------------
  if (done || already) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="card max-w-md w-full text-center space-y-3 p-8 pop-in">
          <div className="text-5xl">{already ? '👍' : '✅'}</div>
          <h1 className="text-2xl font-bold">{already ? 'Already registered' : 'Registered!'}</h1>
          <p className="muted">
            {already ? (
              <>
                This number is already on our list — you don't need to register again.
                <br />
                <span className="dim">Nakalista na ang number na ito. Hindi na kailangang mag-register ulit.</span>
              </>
            ) : (
              <>
                The office will confirm your seat on WhatsApp.
                <br />
                <span className="dim">Kokompirmahin ng opisina ang seat mo sa WhatsApp. Salamat!</span>
              </>
            )}
          </p>

          {done && (
            <div className="sunken p-3 text-left text-sm space-y-1">
              <div className="flex justify-between gap-3">
                <span className="muted">Name</span>
                <b className="truncate">{a.name}</b>
              </div>
              <div className="flex justify-between gap-3">
                <span className="muted">WhatsApp</span>
                <b>{a.phone}</b>
              </div>
              {carName && (
                <div className="flex justify-between gap-3">
                  <span className="muted">Car</span>
                  <b className="truncate">{carName}</b>
                </div>
              )}
              {hasPeriod && (
                <div className="flex justify-between gap-3">
                  <span className="muted">Period</span>
                  <b>
                    {fmt(a.start)} → {fmt(end)}
                  </b>
                </div>
              )}
            </div>
          )}

          {office && (
            <a href={waLink(office, 'Hi, I just registered for car lift.')} className="btn-primary block">
              💬 WhatsApp Office
            </a>
          )}
          <a href="/rules" className="btn-ghost block">
            📋 Read the rules / Basahin ang patakaran
          </a>
          <button onClick={restart} className="text-sm dim underline pt-1">
            Register another person / Mag-register ng iba
          </button>

          <p className="text-xs dim pt-2">
            Payment only to the office — paying the driver is not valid.
            <br />
            Magbayad sa opisina lamang. Hindi valid ang bayad sa driver.
          </p>
        </div>
      </div>
    )
  }

  // --- wizard ------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col p-4">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
        <div className="pt-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-extrabold tracking-tight brand-text">Car Lift</span>
            <span className="dim">
              Step {idx + 1} of {total}
            </span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${((idx + 1) / total) * 100}%` }} />
          </div>
          {hasCarLink && carName && (
            <p className="text-xs dim mt-2">
              Registering for <b>{carName}</b>
            </p>
          )}
        </div>

        {!hasSupabase && (
          <div
            className="mt-4 rounded-xl text-sm p-3"
            style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
          >
            Form not connected yet (Supabase setup pending — see README).
          </div>
        )}

        <div key={idx} className="step-in flex-1 flex flex-col justify-center py-8">
          <h1 className="text-3xl font-bold">{cur.q}</h1>
          <p className="muted mt-1 mb-6 text-lg">{cur.tl}</p>

          {cur.type === 'choice' && <Choice options={cur.options} value={a[cur.key]} onPick={onPick} />}

          {(cur.type === 'text' || cur.type === 'tel') && (
            <input
              className="input input-lg"
              type={cur.type === 'tel' ? 'tel' : 'text'}
              inputMode={cur.type === 'tel' ? 'tel' : 'text'}
              autoComplete={cur.type === 'tel' ? 'tel' : cur.key === 'name' ? 'name' : 'off'}
              autoCapitalize={cur.key === 'name' ? 'words' : 'sentences'}
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
                <div
                  className="rounded-2xl p-4 text-center"
                  style={{ border: '2px solid var(--brand)', background: 'var(--brand-soft)' }}
                >
                  <div className="text-sm font-medium" style={{ color: 'var(--brand-soft-fg)' }}>
                    Your car lift / Ang car lift mo
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {fmt(a.start)} → {fmt(end)}
                  </div>
                  <div className="text-sm muted mt-0.5">
                    {a.plan === '15d' ? '15 days · 15 araw' : '30 days · 30 araw'}
                  </div>
                </div>
              )}
              <div className="card text-sm space-y-1.5">
                <div className="flex justify-between gap-3">
                  <span className="muted">Name</span>
                  <b className="truncate">{a.name}</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="muted">WhatsApp</span>
                  <b>{a.phone}</b>
                </div>
                {carName && (
                  <div className="flex justify-between gap-3">
                    <span className="muted">Car</span>
                    <b className="truncate">{carName}</b>
                  </div>
                )}
                {a.pickup && (
                  <div className="flex justify-between gap-3">
                    <span className="muted">Pickup</span>
                    <b className="truncate">{a.pickup}</b>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="muted">Time</span>
                  <b>{SHIFTS.find((x) => x.v === a.shift)?.en || '—'}</b>
                </div>
                {!hasPeriod && (
                  <div className="flex justify-between gap-3">
                    <span className="muted">Plan</span>
                    <b>Sometimes only</b>
                  </div>
                )}
              </div>
              <p className="text-sm muted text-center">Is this correct? / Tama ba ito?</p>
            </div>
          )}

          {cur.hint && <p className="text-sm dim mt-3">{cur.hint}</p>}
          {err && (
            <p className="text-sm mt-3" style={{ color: 'var(--bad)' }}>
              {err}
            </p>
          )}
        </div>

        <div className="flex gap-3 pb-4 safe-b">
          {idx > 0 && (
            <button
              type="button"
              onClick={() => {
                setErr('')
                setStep((s) => Math.max(0, s - 1))
              }}
              className="btn-ghost px-5"
            >
              ← Back
            </button>
          )}
          {(cur.type === 'text' || cur.type === 'tel') && (
            <button type="button" onClick={onNext} className="btn-primary btn-lg flex-1">
              Next / Susunod
            </button>
          )}
          {cur.type === 'start' && (
            <button
              type="button"
              onClick={() => {
                setErr('')
                setStep((s) => s + 1)
              }}
              className="btn-primary btn-lg flex-1"
            >
              Next / Susunod
            </button>
          )}
          {cur.type === 'confirm' && (
            <button type="button" onClick={submit} disabled={busy} className="btn-primary btn-lg flex-1">
              {busy ? 'Submitting…' : '✓ Confirm / Kumpirmahin'}
            </button>
          )}
        </div>

        <p className="text-xs dim text-center pb-4">Payment only to office. Payment to driver is not valid.</p>
      </div>
    </div>
  )
}
