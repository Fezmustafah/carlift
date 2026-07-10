import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, hasSupabase } from '../lib/supabase'

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
    <div className="min-h-screen grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-emerald-700">Carlift Ops</h1>
          <p className="text-sm text-stone-500">Owner login</p>
        </div>
        <input
          className="input"
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy} className="btn-primary w-full">
          {busy ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  )
}
