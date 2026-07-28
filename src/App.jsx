import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, hasSupabase } from './lib/supabase'
import Shell from './components/Shell'
import Join from './pages/Join'
import Checkin from './pages/Checkin'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Members from './pages/Members'
import Verify from './pages/Verify'
import Expiring from './pages/Expiring'
import Logs from './pages/Logs'
import Cards from './pages/Cards'
import Rules from './pages/Rules'

function SetupNotice() {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="card max-w-md w-full space-y-3">
        <h1 className="text-lg font-bold brand-text">Car Lift — setup needed</h1>
        <ol className="list-decimal list-inside text-sm muted space-y-1.5">
          <li>Create a Supabase project</li>
          <li>Run <code className="sunken px-1">supabase/schema.sql</code> in the SQL editor</li>
          <li>Add a login user (Authentication → Users)</li>
          <li>Copy <code className="sunken px-1">.env.example</code> to <code className="sunken px-1">.env</code> and fill URL + anon key</li>
          <li>Restart <code className="sunken px-1">npm run dev</code></li>
        </ol>
        <p className="text-sm dim">Full steps in README.md</p>
      </div>
    </div>
  )
}

function Protected({ session, children }) {
  if (!hasSupabase) return <SetupNotice />
  if (session === undefined) return <div className="p-10 text-center dim">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <Routes>
      <Route path="/join" element={<Join />} />
      <Route path="/checkin" element={<Checkin />} />
      <Route path="/rules" element={<Rules />} />
      <Route path="/login" element={<Login session={session} />} />
      <Route
        element={
          <Protected session={session}>
            <Shell />
          </Protected>
        }
      >
        <Route index path="/" element={<Dashboard />} />
        <Route path="/members" element={<Members />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/expiring" element={<Expiring />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/cards" element={<Cards />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
