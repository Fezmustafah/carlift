import { waLink } from '../lib/wa'

const office = import.meta.env.VITE_OFFICE_WHATSAPP

function Rule({ n, en, tl }) {
  return (
    <li className="card flex gap-3 items-start">
      <span
        className="shrink-0 w-8 h-8 rounded-full font-bold grid place-items-center"
        style={{ background: 'var(--brand)', color: 'var(--brand-fg)' }}
      >
        {n}
      </span>
      <div>
        <p className="font-semibold">{en}</p>
        <p className="text-sm muted">{tl}</p>
      </div>
    </li>
  )
}

export default function Rules() {
  return (
    <div className="min-h-screen p-4">
      <div className="max-w-md mx-auto space-y-5 pb-16">
        <div className="pt-4 text-center space-y-1">
          <div className="text-3xl">🚐</div>
          <h1 className="text-2xl font-extrabold tracking-tight brand-text">Car Lift — Rules</h1>
          <p className="muted">Mga patakaran ng car lift</p>
        </div>

        <ol className="space-y-2.5">
          <Rule
            n="1"
            en="Register once — scan the QR code in the car or use the link from the group."
            tl="Mag-register nang isang beses — i-scan ang QR sa sasakyan o gamitin ang link sa group."
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
            className="btn-primary btn-lg block text-center"
          >
            💬 WhatsApp Office
          </a>
        )}

        <a href="/join" className="btn-ghost block text-center">
          Register my seat / Mag-register
        </a>

        <p className="text-xs dim text-center">
          Not registered yet? Scan the QR in your car or ask the office for the link.
          <br />
          Hindi ka pa naka-register? I-scan ang QR sa sasakyan mo.
        </p>
      </div>
    </div>
  )
}
