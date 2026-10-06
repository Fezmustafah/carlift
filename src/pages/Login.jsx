import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, hasSupabase } from '../lib/supabase'
import { AppMark } from '../components/ui'

export default function Login({ session }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function submit(e) {
    e.preventDefault()
    if (!hasSupabase) {
      setErr('Supabase not configured yet — see README.md')
      return
    }
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="min-h-screen grid place-items-center p-[18px]">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rise">
        <div className="flex items-center gap-3">
          <AppMark className="w-12 h-12 drop-shadow-[0_4px_10px_rgba(35,71,237,0.22)]" />
          <div>
            <h1 className="text-[28px] font-extrabold tracking-display leading-none">Car Lift</h1>
            <p className="text-[12.5px] muted mt-1.5">Office login — the register, the month, the bag.</p>
          </div>
        </div>
        <div className="card p-4 space-y-3.5">
          <label className="block">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {err && <p className="text-[13px] font-bold text-bad">{err}</p>}
          <button disabled={busy} className="btn-primary w-full py-3.5 rounded-2xl text-[15px]">
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </div>
        <p className="text-[12px] muted text-center">Riders don't log in — they use the QR link.</p>
      </form>
    </div>
  )
}
