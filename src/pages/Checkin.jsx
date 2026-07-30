import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'
import { normalizePhone, waLink } from '../lib/wa'
import { currentMonth, prevMonth } from '../lib/dates'
import Choice from '../components/Choice'
import BankDetails from '../components/BankDetails'

// The 5th-of-the-month collection round. Four questions, nothing else:
// name, number, did you pay last month, did you pay this month.
// Every extra question costs seconds per rider with a queue waiting and a
// driver ready to leave, so car comes from the ?car= in the QR link and the
// office fills in the rest from its own records.

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

const BLANK = { name: '', phone: '', paid_prev: '', paid: '' }

export default function Checkin() {
  const month = useMemo(currentMonth, [])
  const last = useMemo(prevMonth, [])
  const preCarId = useMemo(() => new URLSearchParams(window.location.search).get('car') || '', [])
  const draft = useMemo(loadDraft, [])

  const [carId, setCarId] = useState(preCarId)
  const [a, setA] = useState(() => ({ ...BLANK, ...(draft?.a || {}) }))
  const [step, setStep] = useState(draft?.step || 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const office = import.meta.env.VITE_OFFICE_WHATSAPP
  const community = import.meta.env.VITE_COMMUNITY_LINK

  // A stale ?car= (a card printed before a car was replaced) must not go into
  // the row, so the id is only kept if it still exists.
  useEffect(() => {
    if (!supabase || !preCarId) return
    supabase
      .from('cars')
      .select('id')
      .eq('id', preCarId)
      .then(({ data }) => setCarId(data?.length ? preCarId : ''))
  }, [preCarId])

  useEffect(() => {
    if (done) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ a, step, t: Date.now() }))
    } catch {
      /* private mode */
    }
  }, [a, step, done])

  const set = (k, v) => setA((s) => ({ ...s, [k]: v }))

  const steps = useMemo(
    () => [
      {
        key: 'name',
        type: 'text',
        q: 'What is your full name?',
        tl: 'Ano po ang buong pangalan niyo?',
        ph: 'Full name',
        required: true,
      },
      {
        key: 'phone',
        type: 'tel',
        q: 'Your WhatsApp number',
        tl: 'Ang WhatsApp number niyo (05…)',
        ph: '05x xxx xxxx',
        required: true,
        valid: phoneOk,
        hint: 'Your record and your receipt go to this number. / Dito ipapadala ang resibo niyo.',
      },
      {
        key: 'paid_prev',
        type: 'choice',
        q: `Did you pay for ${last.en}?`,
        tl: `Nakabayad na po ba kayo para sa ${last.tl}?`,
        options: [
          { v: 'yes', en: `Yes, I paid for ${last.en}`, tl: `Oo, bayad na po` },
          { v: 'no', en: `No, still not paid`, tl: `Hindi pa po` },
          { v: 'na', en: `I was not riding in ${last.en}`, tl: `Hindi pa po ako sumasakay noon` },
        ],
      },
      {
        key: 'paid',
        type: 'choice',
        q: `And for ${month.en}?`,
        tl: `At para sa ${month.tl}?`,
        options: [
          { v: 'yes', en: `Yes, paid for ${month.en}`, tl: `Oo, bayad na po` },
          { v: 'no', en: `Not yet`, tl: `Hindi pa po` },
        ],
      },
      { key: 'confirm', type: 'confirm', q: 'Please confirm', tl: 'Pakikumpirma po' },
    ],
    [month.en, month.tl, last.en, last.tl]
  )

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

  // Handing the phone to the next rider must never show the last one's answers.
  function nextRider() {
    clearDraft()
    setA({ ...BLANK })
    setStep(0)
    setErr('')
    setDone(false)
  }

  async function submit() {
    if (!hasSupabase || busy) return
    setBusy(true)
    setErr('')
    const phone = normalizePhone(a.phone)
    const name = a.name.trim()

    const { error } = await supabase.from('declarations').insert({
      name,
      phone,
      car_id: carId || null,
      paid: a.paid || 'unsure',
      for_month: month.key,
      paid_prev: a.paid_prev || 'unsure',
      prev_month: last.key,
    })

    if (error) {
      setBusy(false)
      setErr(
        /fetch|network/i.test(error.message || '')
          ? 'No internet. Check your connection and press Send again. / Walang internet. Subukan muli.'
          : 'Could not send. Please try again. / Hindi naipadala. Subukan muli.'
      )
      return
    }

    // Riders who were never on the roster get added, so the round also builds
    // the list. A duplicate phone (23505) just means we already knew them.
    await supabase.from('members').insert({
      name,
      phone,
      car_id: carId || null,
      status: 'pending',
      source: 'checkin',
      notes: `Collection round ${month.key}`,
    })

    clearDraft()
    setBusy(false)
    setDone(true)
  }

  function onNext() {
    const val = a[cur.key]
    if (cur.required && !String(val || '').trim()) return setErr('Please fill this / Pakisagot po ito')
    if (cur.valid && !cur.valid(val)) return setErr('Enter a valid number / Ilagay po ang tamang number')
    setErr('')
    setStep((s) => s + 1)
  }

  function onPick(v) {
    setA((s) => ({ ...s, [cur.key]: v }))
    setErr('')
    setTimeout(() => setStep((s) => s + 1), 130)
  }

  if (done) {
    const owes = a.paid !== 'yes' || a.paid_prev === 'no'
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="card max-w-md w-full text-center space-y-3 p-6 pop-in">
          <div className="text-5xl">🙏</div>
          <h1 className="text-2xl font-bold">Thank you!</h1>
          <p className="muted">
            Your answer is with the office. We will check our records and message you on WhatsApp.
            <br />
            <span className="dim">Nasa opisina na po ang sagot niyo. Ime-message po namin kayo sa WhatsApp.</span>
          </p>

          <div
            className="rounded-2xl p-3 text-sm"
            style={{ border: '2px solid var(--brand)', background: 'var(--brand-soft)', color: 'var(--brand-soft-fg)' }}
          >
            Payment goes to the office only. Payment to a driver is not counted.
            <br />
            Sa opisina lamang po ang bayad. Hindi bibilangin ang bayad sa driver.
          </div>

          {owes && <BankDetails />}

          <button type="button" onClick={nextRider} className="btn-primary btn-lg block w-full">
            ➕ Next rider / Susunod na pasahero
          </button>

          {community && (
            <a href={community} target="_blank" rel="noreferrer" className="btn-ghost block">
              💬 Join the Car Lift group
            </a>
          )}
          {office && (
            <a href={waLink(office, 'Hi, I just did my car lift check-in.')} className="btn-ghost block">
              Message the office / I-message ang opisina
            </a>
          )}
          <a href="/rules" className="btn-ghost block">
            📋 Read the rules / Basahin ang patakaran
          </a>
        </div>
      </div>
    )
  }

  const answerLabel = (v, m) => (v === 'yes' ? 'Paid' : v === 'no' ? 'Not paid' : `Not riding in ${m}`)

  return (
    <div className="min-h-screen flex flex-col p-4">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
        <div className="pt-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-extrabold tracking-tight brand-text">Car Lift · {month.en} check-in</span>
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

          {(cur.type === 'text' || cur.type === 'tel') && (
            <input
              className="input input-lg"
              type={cur.type === 'text' ? 'text' : 'tel'}
              inputMode={cur.type === 'text' ? 'text' : 'tel'}
              autoComplete={cur.type === 'tel' ? 'tel' : 'name'}
              autoCapitalize={cur.key === 'name' ? 'words' : 'sentences'}
              placeholder={cur.ph}
              value={a[cur.key]}
              autoFocus
              onChange={(e) => set(cur.key, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onNext()}
            />
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
                <div className="flex justify-between gap-3">
                  <span className="muted">{last.en}</span>
                  <b>{answerLabel(a.paid_prev, last.en)}</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="muted">{month.en}</span>
                  <b>{answerLabel(a.paid, month.en)}</b>
                </div>
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
          {(cur.type === 'text' || cur.type === 'tel') && (
            <button type="button" onClick={onNext} className="btn-primary btn-lg flex-1">
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
          Not riding with us yet?{' '}
          <a href="/register" className="underline">
            Register here
          </a>{' '}
          / Bago pa lang po?
        </p>
      </div>
    </div>
  )
}
