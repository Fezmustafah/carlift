import { waLink } from '../lib/wa'

const office = import.meta.env.VITE_OFFICE_WHATSAPP

function Rule({ n, en, tl }) {
  return (
    <li className="card flex gap-3 items-start">
      <span className="shrink-0 w-8 h-8 rounded-full bg-emerald-600 text-white font-bold grid place-items-center">
        {n}
      </span>
      <div>
        <p className="font-semibold text-stone-900">{en}</p>
        <p className="text-sm text-stone-500">{tl}</p>
      </div>
    </li>
  )
}

export default function Rules() {
  return (
    <div className="min-h-screen p-4">
      <div className="max-w-md mx-auto space-y-5 pb-16">
        <div className="pt-4 text-center">
          <h1 className="text-2xl font-bold text-emerald-700">Car Lift — Rules</h1>
          <p className="text-stone-500">Mga patakaran ng car lift</p>
        </div>

        <ol className="space-y-2.5">
          <Rule
            n="1"
            en="Register once by scanning the QR code in the car."
            tl="Mag-register nang isang beses sa pag-scan ng QR code sa sasakyan."
          />
          <Rule
            n="2"
            en="Pay the OFFICE only — never the driver. Payment to the driver is not valid."
            tl="Magbayad sa OPISINA lamang — huwag sa driver. Hindi valid ang bayad sa driver."
          />
          <Rule
            n="3"
            en="Pay BEFORE your period starts. The office will send you the payment details on WhatsApp."
            tl="Magbayad BAGO magsimula ang plan mo. Ipapadala ng opisina ang payment details sa WhatsApp."
          />
          <Rule
            n="4"
            en="After paying, send the screenshot to the office WhatsApp. You will get a receipt — that receipt is your seat."
            tl="Pagkatapos magbayad, ipadala ang screenshot sa WhatsApp ng opisina. Makakatanggap ka ng resibo — iyon ang seat mo."
          />
          <Rule
            n="5"
            en="Renew before your end date. We remind you 3 days before it ends."
            tl="Mag-renew bago matapos ang plan mo. Magpapaalala kami 3 araw bago ito matapos."
          />
          <Rule
            n="6"
            en="No receipt = seat not confirmed. If you have any problem, message the office."
            tl="Walang resibo = hindi kumpirmado ang seat. Kung may problema, i-message ang opisina."
          />
        </ol>

        {office && (
          <a
            href={waLink(office, 'Hi, I have a question about the car lift.')}
            className="btn-primary block text-center text-lg py-3.5"
          >
            💬 WhatsApp Office
          </a>
        )}

        <p className="text-xs text-stone-400 text-center">
          Not registered yet? Scan the QR in your car or ask the office for the link.
          <br />
          Hindi ka pa naka-register? I-scan ang QR sa sasakyan mo.
        </p>
      </div>
    </div>
  )
}
