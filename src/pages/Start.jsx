import { Link, useLocation } from 'react-router-dom'
import { waLink } from '../lib/wa'

const office = import.meta.env.VITE_OFFICE_WHATSAPP

// One link goes to the groups and onto the seat QR cards. This page is the fork:
// riders who already ride with us declare their payment, new ones register.
export default function Start() {
  const { search } = useLocation() // keep ?car= so the car stays pre-selected

  return (
    <div className="min-h-screen flex flex-col p-4">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center py-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="text-5xl">🚐</div>
          <h1 className="text-3xl font-extrabold tracking-tight brand-text">Car Lift</h1>
          <p className="muted">Sobha Hartland · Meydan</p>
        </div>

        <div className="text-center">
          <p className="text-xl font-bold">Please choose one</p>
          <p className="muted">Pumili po ng isa</p>
        </div>

        <div className="space-y-3">
          <Link
            to={{ pathname: '/checkin', search }}
            className="block rounded-2xl p-5 transition active:scale-[0.99]"
            style={{ border: '2px solid var(--brand)', background: 'var(--brand-soft)' }}
          >
            <div className="text-xl font-bold" style={{ color: 'var(--brand-soft-fg)' }}>
              I already ride with Car Lift
            </div>
            <div className="muted">Sumasakay na po ako</div>
            <div className="text-sm mt-2" style={{ color: 'var(--brand-soft-fg)' }}>
              Tell us about your payment →
            </div>
          </Link>

          <Link
            to={{ pathname: '/register', search }}
            className="block rounded-2xl p-5 transition active:scale-[0.99]"
            style={{ border: '2px solid var(--border-strong)', background: 'var(--surface)' }}
          >
            <div className="text-xl font-bold">I am new — I want a seat</div>
            <div className="muted">Bago po ako — gusto ko ng upuan</div>
            <div className="text-sm muted mt-2">Register here →</div>
          </Link>
        </div>

        <a href="/rules" className="btn-ghost block text-center">
          📋 Rules / Mga patakaran
        </a>

        <p className="text-xs dim text-center">
          Pay the office only. Payment to a driver is not valid.
          <br />
          Sa opisina lamang ang bayad. Hindi valid ang bayad sa driver.
        </p>

        {office && (
          <p className="text-xs text-center">
            <a
              href={waLink(
                office,
                'Car Lift — I want to report a problem.\n\nWhat happened:\nWho:\nWhen:\n\n(Car Lift — gusto ko pong mag-report ng problema.)'
              )}
              className="underline"
              style={{ color: 'var(--bad)' }}
            >
              Somebody bothering you? Tell the office privately / May nanggugulo? Sabihin sa opisina
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
