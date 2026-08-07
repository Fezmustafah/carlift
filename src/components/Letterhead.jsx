// The letterhead of every printed page.
//
// It exists for one reader: the owner, on paper or in a WhatsApp PDF, deciding
// in two seconds whether this is a real document from his own company. So the
// mark is the same bus that is already the WhatsApp community photo, the name
// is set in points (never in vw — printing computes vw against the paper box
// and shrinks the company name to nothing on the one medium it is for), and
// the document type sits opposite the name where an invoice would carry it.

const office = import.meta.env.VITE_OFFICE_WHATSAPP

export const COMPANY = 'Adnan Car Lift'
export const COMPANY_SUB = 'Staff Transport Services · Dubai, U.A.E.'

// Flat shapes, no thin lines: this is printed at about 15 mm and sometimes on a
// black-and-white office printer.
export function Mark({ className = 'lh-mark' }) {
  return (
    <svg className={className} viewBox="0 0 1000 1000" role="img" aria-label={COMPANY}>
      <rect width="1000" height="1000" rx="220" fill="var(--lh-mark-bg)" />
      <rect x="392" y="180" width="216" height="56" rx="28" fill="#ffffff" />
      <rect x="250" y="235" width="500" height="470" rx="70" fill="#ffffff" />
      <rect x="315" y="300" width="370" height="170" rx="42" fill="var(--lh-mark-bg)" />
      <rect x="315" y="530" width="105" height="62" rx="31" fill="#ffd166" />
      <rect x="580" y="530" width="105" height="62" rx="31" fill="#ffd166" />
      <rect x="315" y="628" width="370" height="42" rx="21" fill="#cfd8d3" />
      <rect x="212" y="620" width="96" height="150" rx="48" fill="#0d2b22" />
      <rect x="692" y="620" width="96" height="150" rx="48" fill="#0d2b22" />
    </svg>
  )
}

// `meta` is a list of [label, value] — period, days, issued. Anything false is
// dropped, so a one-day sheet does not print an empty "Days" line.
export default function Letterhead({ doctype, meta = [] }) {
  return (
    <header className="lh">
      <div className="lh-id">
        <Mark />
        <div>
          <div className="lh-name">{COMPANY}</div>
          <div className="lh-sub">{COMPANY_SUB}</div>
          {office && <div className="lh-contact">WhatsApp / Office · +{office}</div>}
        </div>
      </div>
      <div className="lh-meta">
        <span className="lh-doc">{doctype}</span>
        {meta.filter(Boolean).map(([label, value]) => (
          <div key={label}>
            <span className="lbl">{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
    </header>
  )
}
