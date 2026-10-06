import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AlertIcon, CheckIcon, InfoIcon } from './icons'

// The pieces every screen is built from, in Falco's shapes.

export const aed = (n) => Number(n || 0).toLocaleString('en-US')

/* ------------------------------------------------------------- the mark --- */
// The company bus — the same shape as the WhatsApp community photo — in the
// app's blue, with Falco's gold for the lights.
export function AppMark({ className = 'w-10 h-10' }) {
  // Its own gradient id per copy: the side bar's copy is display:none on a
  // phone, and a gradient defined inside a hidden SVG paints nothing anywhere.
  const id = `cl-mark-${useId().replace(/:/g, '')}`
  return (
    <svg className={className} viewBox="0 0 1000 1000" role="img" aria-label="Car Lift">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#3d5df7" />
          <stop offset="0.6" stopColor="#2347ed" />
          <stop offset="1" stopColor="#1a36cc" />
        </linearGradient>
      </defs>
      <rect width="1000" height="1000" rx="240" fill={`url(#${id})`} />
      <rect x="392" y="180" width="216" height="56" rx="28" fill="#ffffff" />
      <rect x="250" y="235" width="500" height="470" rx="70" fill="#ffffff" />
      <rect x="315" y="300" width="370" height="170" rx="42" fill="#2347ed" />
      <rect x="315" y="530" width="105" height="62" rx="31" fill="#f0b429" />
      <rect x="580" y="530" width="105" height="62" rx="31" fill="#f0b429" />
      <rect x="315" y="628" width="370" height="42" rx="21" fill="#d4d5c8" />
      <rect x="212" y="620" width="96" height="150" rx="48" fill="#20231e" />
      <rect x="692" y="620" width="96" height="150" rx="48" fill="#20231e" />
    </svg>
  )
}

/* ----------------------------------------------------------- page head --- */
// Falco's screen header: the mark where a back button would sit on a phone,
// the title tight and heavy, one muted line under it, actions on the right.
export function PageHead({ title, subtitle, action, mark = true, below }) {
  return (
    <header className="space-y-3">
      <div className="flex items-center gap-3">
        {mark && <AppMark className="lg:hidden w-10 h-10 shrink-0 drop-shadow-[0_3px_6px_rgba(35,71,237,0.18)]" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-extrabold leading-none tracking-display truncate">{title}</h1>
          {subtitle && <p className="text-[12.5px] muted mt-1.5 leading-snug line-clamp-2">{subtitle}</p>}
        </div>
        {action}
      </div>
      {below}
    </header>
  )
}

/* --------------------------------------------------------------- sheet --- */
// A bottom sheet on a phone, a dialog on a laptop. It stays mounted for the
// slide-down so it never blinks out.
export function Sheet({ open, title, onClose, children, footer }) {
  const [mounted, setMounted] = useState(open)
  const last = useRef({ title, children, footer })
  if (open) last.current = { title, children, footer }

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), 230)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open && !mounted) return null
  const view = last.current

  return createPortal(
    <div
      className={`no-print fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center md:p-6 ${
        open ? '' : 'pointer-events-none'
      }`}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        tabIndex={-1}
        className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] ${open ? 'fade-in' : 'fade-out'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={view.title}
        className={`relative bg-page rounded-t-3xl border-t border-soft max-h-[88dvh] flex flex-col
                    md:w-full md:max-w-[560px] md:max-h-[86vh] md:rounded-3xl md:border
                    shadow-[0_-12px_40px_rgba(32,35,30,0.18)] ${open ? 'sheet-up' : 'sheet-down'}`}
      >
        <div className="shrink-0 px-[18px] pt-3 pb-2">
          <div className="mx-auto w-10 h-1 rounded-full bg-soft/60 mb-3 md:hidden" />
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-[17px] font-extrabold tracking-display truncate">{view.title}</h2>
            <button onClick={onClose} aria-label="Close" className="icon-btn w-9 h-9 rounded-xl text-[15px]">
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-[18px] pb-3">{view.children}</div>
        {view.footer && (
          <div className="shrink-0 px-[18px] pt-2 pb-[calc(16px+env(safe-area-inset-bottom))] border-t border-hair">
            {view.footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* --------------------------------------------------------------- toast --- */
let toastMsg = null
const subs = new Set()
export function toast(text, tone = 'good') {
  toastMsg = { id: Date.now() + Math.random(), text, tone }
  subs.forEach((l) => l())
}

export function Toaster() {
  const msg = useSyncExternalStore(
    (l) => {
      subs.add(l)
      return () => subs.delete(l)
    },
    () => toastMsg,
  )
  const [shown, setShown] = useState(null)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (!msg) return
    setShown(msg)
    setLeaving(false)
    const a = setTimeout(() => setLeaving(true), 2400)
    const b = setTimeout(() => setShown(null), 2700)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [msg])
  if (!shown) return null
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-h)+6px+env(safe-area-inset-bottom))] lg:bottom-8 lg:left-[232px] z-[60] flex justify-center px-6">
      <div
        role="status"
        className={`rounded-2xl bg-ink text-white text-[13px] font-semibold px-4 py-3 shadow-lg flex items-center gap-2 ${
          leaving ? 'toast-out' : 'toast-in'
        }`}
      >
        {shown.tone === 'warn' ? (
          <AlertIcon className="w-4 h-4 text-[#F5C26B]" strokeWidth={2.4} />
        ) : (
          <CheckIcon className="w-4 h-4 text-[#9BE3B8]" strokeWidth={2.6} />
        )}
        {shown.text}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- pieces --- */
export function Note({ children, className = '' }) {
  return (
    <div className={`flex gap-2.5 items-start px-0.5 ${className}`}>
      <InfoIcon className="w-[15px] h-[15px] mt-0.5 shrink-0 text-muted" />
      <p className="text-[12px] leading-relaxed muted">{children}</p>
    </div>
  )
}

export function Banner({ tone = 'warn', children, action }) {
  const cls =
    tone === 'bad'
      ? 'bg-[#FBEDEA] border-bad'
      : tone === 'blue'
        ? 'bg-[color-mix(in_srgb,#2347ed_8%,#f5f3e9)] border-blue/50'
        : 'bg-card border-warn'
  const icon = tone === 'bad' ? 'text-bad' : tone === 'blue' ? 'text-blue' : 'text-warn'
  const Icon = tone === 'blue' ? InfoIcon : AlertIcon
  return (
    <div className={`border rounded-2xl p-3.5 flex gap-2.5 items-start ${cls}`}>
      <Icon className={`w-[17px] h-[17px] mt-px shrink-0 ${icon}`} />
      <div className="flex-1 text-[12.5px] leading-relaxed">{children}</div>
      {action}
    </div>
  )
}

export function Empty({ title, hint }) {
  return (
    <div className="card p-6 text-center">
      <p className="text-[18px] font-extrabold tracking-display">{title}</p>
      {hint && <p className="text-[12.5px] muted mt-2 leading-relaxed">{hint}</p>}
    </div>
  )
}

export function Spinner({ label = 'Working…' }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto w-6 h-6 rounded-full border-2 border-soft border-t-blue animate-spin" />
      <p className="text-[12px] muted mt-3">{label}</p>
    </div>
  )
}

// "AED 1,250" with the currency small and quiet, the figure in Falco's mono.
export function Money({ value, className = 'text-[32px]', tone, sign }) {
  return (
    <span className={`num font-medium leading-none ${className}`} style={tone ? { color: tone } : undefined}>
      <span className="text-[0.42em] font-bold tracking-wide muted align-middle font-sans">AED </span>
      {sign}
      {aed(value)}
    </span>
  )
}

// +3 / −7 against last month, coloured by whether it is good news.
export function Delta({ value, unit = '', goodWhenUp = true }) {
  if (!value) return <span className="text-[11.5px] font-bold muted">same as before</span>
  const up = value > 0
  const good = up === goodWhenUp
  return (
    <span className={`text-[11.5px] font-extrabold ${good ? 'text-good' : 'text-bad'}`}>
      {up ? '▲' : '▼'} {up ? '+' : '−'}
      {aed(Math.abs(value))}
      {unit}
    </span>
  )
}
