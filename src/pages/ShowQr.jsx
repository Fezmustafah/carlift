import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'

// For collection days: hold the phone up, the rider scans, and types their own
// name and number while the money is being counted. Beats spelling names out
// loud with a queue waiting.
export default function ShowQr() {
  const [cars, setCars] = useState([])
  const [carId, setCarId] = useState('')
  // The monthly round is the normal use, and it adds unknown riders to the
  // roster by itself, so it is the default.
  const [target, setTarget] = useState('/checkin')

  useEffect(() => {
    supabase
      .from('cars')
      .select('id, name, driver_name')
      .order('name')
      .then(({ data }) => setCars(data || []))
  }, [])

  const url = `${window.location.origin}${target}${carId ? `?car=${carId}` : ''}`

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between gap-2 flex-wrap">
        <h1 className="h1">Show QR</h1>
        <select className="input w-auto" value={carId} onChange={(e) => setCarId(e.target.value)}>
          <option value="">Any car</option>
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.driver_name}
            </option>
          ))}
        </select>
      </div>

      <div className="no-print flex gap-2 flex-wrap">
        <button onClick={() => setTarget('/checkin')} className={`pill ${target === '/checkin' ? 'pill-on' : ''}`}>
          Monthly check-in
        </button>
        <button onClick={() => setTarget('/register')} className={`pill ${target === '/register' ? 'pill-on' : ''}`}>
          New rider
        </button>
        <button onClick={() => setTarget('/join')} className={`pill ${target === '/join' ? 'pill-on' : ''}`}>
          Let them choose
        </button>
      </div>

      <p className="no-print text-sm muted">
        Hold this up for the rider to scan. Pick the car first and it is already chosen for them.
        {target === '/checkin' && ' Four questions: name, number, last month, this month.'}
      </p>

      <div className="card text-center space-y-4 py-6">
        <div>
          <div className="text-2xl font-extrabold tracking-tight">SCAN ME</div>
          <div className="muted">I-scan po ninyo</div>
        </div>

        <div className="grid place-items-center">
          <div className="rounded-2xl p-4" style={{ background: '#fff', border: '4px solid #111' }}>
            <QRCodeSVG value={url} size={260} level="M" marginSize={1} />
          </div>
        </div>

        <div>
          <div className="text-lg font-bold">Put your name and number</div>
          <div className="muted">Ilagay po ang pangalan at number niyo</div>
        </div>

        {carId && (
          <div className="text-sm muted">
            {cars.find((c) => c.id === carId)?.name} · {cars.find((c) => c.id === carId)?.driver_name}
          </div>
        )}

        <div className="text-xs dim break-all">{url}</div>
      </div>
    </div>
  )
}
