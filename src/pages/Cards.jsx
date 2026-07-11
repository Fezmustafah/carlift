import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'

const joinUrl = `${window.location.origin}/join`
const office = import.meta.env.VITE_OFFICE_WHATSAPP

function Card({ car }) {
  // If a car row is selected on the form, deep-link so the rider lands pre-tagged.
  const url = car ? `${joinUrl}?car=${car.id}` : joinUrl
  return (
    <div className="qr-card bg-white rounded-2xl border border-stone-300 overflow-hidden flex flex-col">
      <div className="bg-emerald-600 text-white text-center py-4 px-3">
        <div className="text-2xl font-extrabold tracking-tight">CAR LIFT</div>
        <div className="text-emerald-50 text-sm">Sobha Hartland · Meydan</div>
      </div>

      <div className="px-5 pt-4 text-center">
        <div className="text-lg font-bold text-stone-900">{car ? car.name : 'Any car'}</div>
        {car?.driver_name && <div className="text-sm text-stone-500 -mt-0.5">Driver: {car.driver_name}</div>}
      </div>

      <div className="grid place-items-center px-5 py-4">
        <div className="rounded-2xl border-4 border-stone-900 p-3 bg-white">
          <QRCodeSVG value={url} size={220} level="M" marginSize={1} />
        </div>
      </div>

      <div className="text-center px-5">
        <div className="text-xl font-extrabold text-stone-900">SCAN TO REGISTER</div>
        <div className="text-base text-stone-600" dir="auto">
          I-scan para magparehistro
        </div>
        <div className="mt-1 text-xs text-stone-400 break-all">{url}</div>
      </div>

      <div className="mt-4 bg-amber-50 border-t-2 border-amber-300 text-amber-900 text-center px-4 py-3">
        <div className="font-bold text-sm">✅ Pay OFFICE only — paying the driver is NOT valid</div>
        <div className="text-sm" dir="auto">Magbayad sa OPISINA lamang. Hindi valid ang bayad sa driver.</div>
        {office && <div className="mt-1 text-sm font-semibold text-stone-700">Office WhatsApp: {office}</div>}
      </div>
    </div>
  )
}

export default function Cards() {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('cars')
      .select('id, name, driver_name')
      .order('name')
      .then(({ data }) => {
        setCars(data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">QR Cards</h1>
        <button onClick={() => window.print()} className="btn-primary ml-auto">
          🖨 Print cards
        </button>
      </div>

      <p className="no-print text-sm text-stone-500">
        One card per car (plus one “Any car” card). Print → laminate → hang in each vehicle. Riders scan → land on the
        registration form. Each car card deep-links so the rider’s car is pre-selected. Print at A5/A6 for the glovebox
        or the seat-back.
      </p>

      {loading ? (
        <p className="text-stone-400 text-center py-8">Loading…</p>
      ) : (
        <div className="print-cards grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card car={null} />
          {cars.map((c) => (
            <Card key={c.id} car={c} />
          ))}
        </div>
      )}
    </div>
  )
}
