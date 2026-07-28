import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'
import { normalizePhone, waLink } from '../lib/wa'
import { todayISO, addDays, fmt } from '../lib/dates'
import Choice from '../components/Choice'

// Existing riders only. Newcomers use /join.
// The point of this form is one question: did the money reach the office,
// and if not, who is holding it.

const SHIFTS = [
  { v: 'morning', en: 'Morning', tl: 'Umaga' },
  { v: 'night', en: 'Evening / Night', tl: 'Gabi' },
  { v: 'both', en: 'Both', tl: 'Pareho' },
]
const PLANS = [
  { v: '30d', en: 'Monthly (30 days)', tl: 'Buwanan' },
  { v: '15d', en: '15 days', tl: '15 araw' },
  { v: 'onetime', en: 'Sometimes only', tl: 'Paminsan-minsan lang' },
]
const PAID = [
  { v: 'yes', en: 'Yes, I paid', tl: 'Oo, nakabayad na ako' },
  { v: 'no', en: 'Not yet', tl: 'Hindi pa' },
  { v: 'unsure', en: "I'm not sure", tl: 'Hindi ako sigurado' },
]

const phoneOk = (p) => normalizePhone(p).length >= 11

const DRAFT_KEY = 'carlift.checkin.draft'
const DRAFT_TTL = 6 * 60 * 60 * 1000

function loadDraft() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (!raw || Date.now() - raw.t > DRAFT_TTL) return null
    return raw
  } catch {
    return null
  }
}

export default function Checkin() {
  const [cars, setCars] = useState([])
  const preCarId = useMemo(() => new URLSearchParams(window.location.search).get('car') || '', [])
  const draft = useMemo(loadDraft, [])

  const [a, setA] = useState(() => ({
    name: '',
    phone: '',
    car_id: preCarId,
    shift: '',
    plan: '',
    paid: '',
    paid_to: '',
    paid_when: todayISO(),
    amount: '',
    ...(draft?.a || {}),
    ...(preCarId ? { car_id: preCarId } : {}),
  }))
  const [step, setStep] = useState(draft?.step || 0)
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
      .then(({ data }) => {
        const list = data || []
        setCars(list)
        setA((s) => (s.car_id && !list.some((c) => c.id === s.car_id) ? { ...s, car_id: '' } : s))
      })
  }, [])

  useEffect(() => {
    if (done) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ a, step, t: Date.now() }))
    } catch {
      /* private mode */
    }
  }, [a, step, done])

  const set = (k, v) => setA((s) => ({ ...s, [k]: v }))
  const car = cars.find((c) => c.id === a.car_id)
  const driver = car?.driver_name

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
        hint: 'We match your payment record with this number. / Dito namin ihahanap ang record mo.',
      },
    ]
    if (cars.length) {
      s.push({
        key: 'car_id',
        type: 'choice',
        q: 'Which car do you ride?',
        tl: 'Aling sasakyan ang sinasakyan mo?',
        options: cars.map((c) => ({ v: c.id, en: c.name, tl: `Driver: ${c.driver_name}` })),
      })
    }
    s.push({ key: 'shift', type: 'choice', q: 'Which time?', tl: 'Anong oras?', options: SHIFTS })
    s.push({ key: 'plan', type: 'choice', q: 'Which plan are you on?', tl: 'Anong plano mo?', options: PLANS })
    s.push({
      key: 'paid',
      type: 'choice',
      q: 'Have you paid for your current period?',
      tl: 'Nakabayad ka na ba para sa kasalukuyang plano mo?',
      options: PAID,
    })
    if (a.paid === 'yes') {
      s.push({
        key: 'paid_to',
        type: 'choice',
        q: 'Who did you give the money to?',
        tl: 'Kanino mo ibinigay ang bayad?',
        options: [
          { v: 'driver', en: driver ? `The driver (${driver})` : 'The driver', tl: 'Sa driver' },
          { v: 'office', en: 'The office — cash', tl: 'Sa opisina — cash' },
          { v: 'transfer', en: 'Bank transfer to the office', tl: 'Bank transfer sa opisina' },
          { v: 'unsure', en: "I don't remember", tl: 'Hindi ko na maalala' },
        ],
      })
      s.push({ key: 'paid_when', type: 'when', q: 'When did you pay?', tl: 'Kailan ka nagbayad?' })
      s.push({
        key: 'amount',
        type: 'number',
        q: 'How much did you pay? (AED)',
        tl: 'Magkano ang binayad mo? (AED)',
        ph: 'e.g. 400',
      })
    }
    s.push({ key: 'confirm', type: 'confirm', q: 'Please confirm', tl: 'Pakikumpirma' })
    return s
  }, [cars, a.paid, driver])

  const total = steps.length
  const idx = Math.min(step, total - 1)
  const cur = steps[idx]

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
    const phone = normalizePhone(a.phone)

    const { error } = await supabase.from('declarations').insert({
      name: a.name.trim(),
      phone,
      car_id: a.car_id || null,
      shift: a.shift || null,
      plan_pref: a.plan || null,
      paid: a.paid,
      paid_to: a.paid === 'yes' ? a.paid_to || 'unsure' : null,
      paid_when: a.paid === 'yes' ? a.paid_when : null,
      amount: a.paid === 'yes' && a.amount ? Number(a.amount) : null,
    })

    if (error) {
      setBusy(false)
      setErr(
        /fetch|network/i.test(error.message || '')
          ? 'No internet. Check your connection and press Confirm again. / Walang internet. Subukan muli.'
          : 'Could not send. Please try again. / Hindi naipadala. Subukan muli.'
      )
      return
    }

    // Riders who were never on the roster get added, so the check-in also
    // builds the list. A duplicate phone (23505) just means we already knew them.
    await supabase.from('members').insert({
      name: a.name.trim(),
      phone,
      car_id: a.car_id || null,
      shift: a.shift || 'morning',
      plan_pref: a.plan || null,
      status: 'pending',
      source: 'checkin',
      notes: 'From payment check-in',
    })

    clearDraft()
    setBusy(false)
    setDone(true)
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
        <div className="card max-w-md w-full text-center space-y-3 p-8 pop-in">
          <div className="text-5xl">🙏</div>
          <h1 className="text-2xl font-bold">Thank you!</h1>
          <p className="muted">
            Your details are with the office now. We will check our records and message you on WhatsApp.
            <br />
            <span className="dim">
              Nasa opisina na ang detalye mo. Titingnan namin ang record at ime-message ka namin sa WhatsApp.
            </span>
          </p>
          <div
            className="rounded-2xl p-3 text-sm"
            style={{ border: '2px solid var(--brand)', background: 'var(--brand-soft)', color: 'var(--brand-soft-fg)' }}
          >
            Payments from 5–10 August go to the office only. Payment to a driver is not counted.
            <br />
            Mula 5–10 Agosto, sa opisina lamang ang bayad. Hindi bibilangin ang bayad sa driver.
          </div>
          {office && (
            <a href={waLink(office, 'Hi, I just sent my car lift payment details.')} className="btn-primary block">
              💬 WhatsApp Office
            </a>
          )}
          <a href="/rules" className="btn-ghost block">
            📋 Read the rules / Basahin ang patakaran
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-4">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
        <div className="pt-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-extrabold tracking-tight brand-text">Car Lift · Payment check-in</span>
            <span className="dim">
              {idx + 1}/{total}
            </span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${((idx + 1) / total) * 100}%` }} />
          </div>
        </div>

        {!hasSupabase && (
          <div className="mt-4 rounded-xl text-sm p-3" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
            Form not connected yet (Supabase setup pending — see README).
          </div>
        )}

        <div key={idx} className="step-in flex-1 flex flex-col justify-center py-8">
          <h1 className="text-3xl font-bold">{cur.q}</h1>
          <p className="muted mt-1 mb-6 text-lg">{cur.tl}</p>

          {cur.type === 'choice' && <Choice options={cur.options} value={a[cur.key]} onPick={onPick} />}

          {(cur.type === 'text' || cur.type === 'tel' || cur.type === 'number') && (
            <input
              className="input input-lg"
              type={cur.type === 'text' ? 'text' : cur.type === 'tel' ? 'tel' : 'number'}
              inputMode={cur.type === 'text' ? 'text' : cur.type === 'tel' ? 'tel' : 'decimal'}
              autoComplete={cur.type === 'tel' ? 'tel' : cur.key === 'name' ? 'name' : 'off'}
              autoCapitalize={cur.key === 'name' ? 'words' : 'sentences'}
              placeholder={cur.ph}
              value={a[cur.key]}
              autoFocus
              onChange={(e) => set(cur.key, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onNext()}
            />
          )}

          {cur.type === 'when' && (
            <div className="space-y-2.5">
              <Choice
                options={[
                  { v: todayISO(), en: `Today · ${fmt(todayISO())}`, tl: 'Ngayon' },
                  { v: addDays(todayISO(), -7), en: 'About a week ago', tl: 'Mga isang linggo na' },
                  { v: addDays(todayISO(), -30), en: 'About a month ago', tl: 'Mga isang buwan na' },
                ]}
                value={a.paid_when}
                onPick={onPick}
              />
              <div className="pt-1">
                <label className="label">Or pick the date / O pumili ng petsa</label>
                <input
                  className="input"
                  type="date"
                  max={todayISO()}
                  value={a.paid_when}
                  onChange={(e) => set('paid_when', e.target.value)}
                />
              </div>
            </div>
          )}

          {cur.type === 'confirm' && (
            <div className="space-y-3">
              <div className="card text-sm space-y-1.5">
                <div className="flex justify-between gap-3">
                  <span className="muted">Name</span>
                  <b className="truncate">{a.name}</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="muted">WhatsApp</span>
                  <b>{a.phone}</b>
                </div>
                {car && (
                  <div className="flex justify-between gap-3">
                    <span className="muted">Car</span>
                    <b className="truncate">{car.name}</b>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="muted">Time</span>
                  <b>{SHIFTS.find((x) => x.v === a.shift)?.en || '—'}</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="muted">Plan</span>
                  <b>{PLANS.find((x) => x.v === a.plan)?.en || '—'}</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="muted">Paid?</span>
                  <b>{PAID.find((x) => x.v === a.paid)?.en || '—'}</b>
                </div>
                {a.paid === 'yes' && (
                  <>
                    <div className="flex justify-between gap-3">
                      <span className="muted">Paid to</span>
                      <b className="truncate">
                        {a.paid_to === 'driver'
                          ? driver
                            ? `Driver (${driver})`
                            : 'Driver'
                          : a.paid_to === 'office'
                            ? 'Office — cash'
                            : a.paid_to === 'transfer'
                              ? 'Bank transfer'
                              : "Don't remember"}
                      </b>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="muted">When</span>
                      <b>{fmt(a.paid_when)}</b>
                    </div>
                    {a.amount && (
                      <div className="flex justify-between gap-3">
                        <span className="muted">Amount</span>
                        <b>AED {a.amount}</b>
                      </div>
                    )}
                  </>
                )}
              </div>
              <p className="text-sm muted text-center">
                Please answer honestly — the office is checking every record.
                <br />
                <span className="dim">Sabihin po ang totoo — sinusuri ng opisina ang lahat ng record.</span>
              </p>
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
          {(cur.type === 'text' || cur.type === 'tel' || cur.type === 'number') && (
            <button type="button" onClick={onNext} className="btn-primary btn-lg flex-1">
              Next / Susunod
            </button>
          )}
          {cur.type === 'when' && (
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
              {busy ? 'Sending…' : '✓ Send / Ipadala'}
            </button>
          )}
        </div>

        <p className="text-xs dim text-center pb-4">
          New rider? Use the registration link instead. / Bago? Gamitin ang registration link.
        </p>
      </div>
    </div>
  )
}
