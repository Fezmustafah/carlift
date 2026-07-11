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

function MiniCard({ car }) {
  const url = car ? `${joinUrl}?car=${car.id}` : joinUrl
  return (
    <div className="flex flex-col items-center justify-between border-2 border-dashed border-stone-300 rounded-lg p-3 text-center bg-white">
      <div className="font-extrabold text-emerald-700 leading-tight">CAR LIFT</div>
      <div className="text-xs font-semibold text-stone-700 leading-tight">{car ? car.name : 'Any car'}</div>
      <QRCodeSVG value={url} size={116} level="M" marginSize={1} className="my-1.5" />
      <div className="text-[11px] font-bold text-stone-900 leading-tight">
        SCAN TO REGISTER
        <br />
        <span className="font-normal text-stone-500">I-scan para magparehistro</span>
      </div>
      <div className="text-[10px] font-semibold text-amber-700 leading-tight mt-1">
        Pay OFFICE only · Sa opisina lamang
        {office && <><br />{office}</>}
      </div>
    </div>
  )
}

// One A4 sheet = 9 mini cards. Sheets per car = enough for every seat pouch.
function seatSheets(car) {
  return Math.max(1, Math.ceil((car.seats || 9) / 9))
}

export default function Cards() {
  const [cars, setCars] = useState([])
  const [mode, setMode] = useState('seat')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('cars')
      .select('id, name, driver_name, seats')
      .order('name')
      .then(({ data }) => {
        setCars(data || [])
        setLoading(false)
      })
  }, [])

  const totalSheets = cars.reduce((t, c) => t + seatSheets(c), 0)

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">QR Cards</h1>
        <div className="flex rounded-xl border border-stone-300 overflow-hidden text-sm font-medium">
          {[
            ['seat', 'Seat cards (9/page)'],
            ['big', 'Big cards'],
          ].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={`px-3 py-2 ${mode === v ? 'bg-emerald-600 text-white' : 'bg-white text-stone-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => window.print()} className="btn-primary ml-auto">
          🖨 Print
        </button>
      </div>

      {mode === 'seat' ? (
        <p className="no-print text-sm text-stone-500">
          One card per seat pouch. Prints {totalSheets} A4 page{totalSheets === 1 ? '' : 's'} — enough cards for every
          seat of every car (9 per page, sheet count follows each car's seat count). Cut along the dashed lines. Plain
          paper dies fast in pouches — use thick paper (card stock) or cover each card with clear packing tape.
        </p>
      ) : (
        <p className="no-print text-sm text-stone-500">
          One big card per car (plus one “Any car” card) — for the dashboard, door, or WhatsApp broadcast image. Each
          car card deep-links so the rider’s car is pre-selected.
        </p>
      )}

      {loading ? (
        <p className="text-stone-400 text-center py-8">Loading…</p>
      ) : mode === 'seat' ? (
        <div className="space-y-6">
          {cars.map((car) =>
            Array.from({ length: seatSheets(car) }, (_, i) => (
              <div key={car.id + i} className="seat-sheet">
                <div className="no-print text-xs text-stone-400 mb-1">
                  {car.name} — sheet {i + 1} of {seatSheets(car)}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 9 }, (_, j) => (
                    <MiniCard key={j} car={car} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
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
