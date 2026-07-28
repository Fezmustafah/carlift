import { waLink } from '../lib/wa'

const office = import.meta.env.VITE_OFFICE_WHATSAPP
const community = import.meta.env.VITE_COMMUNITY_LINK

function Rule({ n, en, tl, tone }) {
  return (
    <li className="card flex gap-3 items-start">
      <span
        className="shrink-0 w-8 h-8 rounded-full font-bold grid place-items-center"
        style={{
          background: tone === 'alert' ? 'var(--bad)' : 'var(--brand)',
          color: tone === 'alert' ? '#fff' : 'var(--brand-fg)',
        }}
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
            en="Register once, using the link in the WhatsApp group."
            tl="Mag-register nang isang beses gamit ang link sa WhatsApp group."
          />
          <Rule
            n="2"
            en="Pay the OFFICE only — never the driver. Payment to the driver is not valid."
            tl="Magbayad sa OPISINA lamang — huwag sa driver. Hindi valid ang bayad sa driver."
          />
          <Rule
            n="3"
            en="Pay BEFORE your period starts. The office sends you the payment details on WhatsApp."
            tl="Magbayad BAGO magsimula ang plano mo. Ipapadala ng opisina ang payment details sa WhatsApp."
          />
          <Rule
            n="4"
            en="After paying, send the screenshot to the office. You get a receipt — that receipt is your seat."
            tl="Pagkatapos magbayad, ipadala ang screenshot sa opisina. Makakatanggap ka ng resibo — iyon ang seat mo."
          />
          <Rule
            n="5"
            en="Renew before your end date. We remind you 3 days before it ends."
            tl="Mag-renew bago matapos ang plano mo. Magpapaalala kami 3 araw bago ito matapos."
          />
          <Rule
            n="6"
            en="Do not message another rider privately without a reason. Their number is for the car lift only."
            tl="Huwag pong i-message nang private ang ibang sakay kung walang dahilan. Ang numero nila ay para lang sa car lift."
            tone="alert"
          />
          <Rule
            n="7"
            en="If anybody troubles you — a rider, a driver, or a stranger from the group — tell the office at once. Your message stays private, and we act on it."
            tl="Kung may manggulo sa inyo — sakay, driver, o kahit sino sa group — sabihin agad sa opisina. Lihim po ang mensahe niyo, at aaksyunan namin ito."
            tone="alert"
          />
          <Rule
            n="8"
            en="No receipt = seat not confirmed. If you have any problem, message the office."
            tl="Walang resibo = hindi kumpirmado ang seat. Kung may problema, i-message ang opisina."
          />
        </ol>

        {office && (
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ border: '2px solid var(--bad)', background: 'var(--bad-soft)' }}
          >
            <div>
              <p className="font-bold" style={{ color: 'var(--bad)' }}>
                Someone is bothering you?
              </p>
              <p className="text-sm muted">May nanggugulo po ba sa inyo?</p>
              <p className="text-sm muted mt-1">
                Write to the office directly. Nobody in the group sees it.
                <br />
                Direkta pong sumulat sa opisina. Walang makakakita nito sa group.
              </p>
            </div>
            <a
              href={waLink(
                office,
                'Car Lift — I want to report a problem.\n\nWhat happened:\nWho:\nWhen:\n\n(Car Lift — gusto ko pong mag-report ng problema.)'
              )}
              className="btn-primary block text-center"
              style={{ background: 'var(--bad)' }}
            >
              🚨 Report to the office / Mag-report
            </a>
          </div>
        )}

        {community && (
          <a href={community} target="_blank" rel="noreferrer" className="btn-primary btn-lg block text-center">
            💬 Join the Car Lift group
          </a>
        )}

        {office && (
          <a href={waLink(office, 'Hi, I have a question about the car lift.')} className="btn-ghost block text-center">
            Ask the office a question / Magtanong sa opisina
          </a>
        )}

        <a href="/join" className="btn-ghost block text-center">
          Register or check in / Mag-register o mag-check in
        </a>
      </div>
    </div>
  )
}
