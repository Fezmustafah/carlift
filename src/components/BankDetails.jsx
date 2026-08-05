import { useState } from 'react'
import { bank, hasBank, ibanValid } from '../lib/bank'
import { copyText } from '../lib/clipboard'

function CopyLine({ label, value }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs dim">{label}</div>
        <div className="font-mono font-semibold break-all">{value}</div>
      </div>
      <button
        onClick={async () => {
          const ok = await copyText(value)
          setCopied(ok)
          setTimeout(() => setCopied(false), 1800)
        }}
        className="btn-ghost px-3 py-1.5 text-sm shrink-0"
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  )
}

// Shown to riders who want to transfer instead of handing over cash, so nobody
// has to ask for the numbers and nobody retypes them wrong.
export default function BankDetails({ compact }) {
  if (!hasBank) return null

  // A bad IBAN in the environment must never reach a rider.
  if (!ibanValid()) {
    return (
      <div className="rounded-2xl p-3 text-sm" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
        Bank details are not set correctly. Please ask the office for them.
      </div>
    )
  }

  return (
    <div className="sunken p-4 space-y-3 text-left">
      <div>
        <div className="font-bold">Pay by bank transfer</div>
        <div className="text-sm muted">Bayad sa bangko</div>
      </div>

      {bank.name && (
        <div>
          <div className="text-xs dim">Bank</div>
          <div className="font-semibold">{bank.name}</div>
        </div>
      )}
      {bank.accountName && (
        <div>
          <div className="text-xs dim">Account name</div>
          <div className="font-semibold">{bank.accountName}</div>
        </div>
      )}

      {/* The IBAN is the only number a UAE banking app can look a beneficiary
          up with. Riders were copying the account number instead — it pastes
          fine and then simply never finds anybody — so it is no longer offered
          beside the IBAN as if the two were interchangeable. */}
      <div className="rounded-2xl p-3" style={{ border: '2px solid var(--brand)' }}>
        <CopyLine label={`IBAN — copy this one (${bank.iban.length} characters)`} value={bank.iban} />
      </div>

      <p className="text-sm">
        After pasting, your app must show the name{' '}
        <b>{bank.accountName || 'the office account'}</b>. No name means you pasted the wrong number — go back and
        copy the IBAN above.
        <br />
        <span className="muted">
          Pagkatapos i-paste, dapat lumabas ang pangalan. Kung walang pangalan, mali po ang na-copy niyo — ang IBAN po
          ang kopyahin.
        </span>
      </p>

      {!compact && (bank.accountNumber || bank.swift) && (
        <details>
          <summary className="text-xs dim cursor-pointer">Other numbers — not for transfers</summary>
          <div className="pt-2 space-y-2">
            {bank.accountNumber && <CopyLine label="Account number — for a cash deposit at ADCB only" value={bank.accountNumber} />}
            {bank.swift && <CopyLine label="SWIFT — only from outside the UAE" value={bank.swift} />}
            <p className="text-xs" style={{ color: 'var(--warn)' }}>
              Do not use these to send money from a UAE app. They will not find the account. Use the IBAN.
            </p>
          </div>
        </details>
      )}

      <p className="text-xs dim">
        Use the Copy button. Do not type spaces in the IBAN — the bank form counts them.
        <br />
        Gamitin po ang Copy. Huwag pong maglagay ng space sa IBAN.
      </p>

      <p className="text-sm" style={{ color: 'var(--warn)' }}>
        After you transfer, send the screenshot to the office. No screenshot, no receipt.
        <br />
        <span className="muted">
          Pagkatapos mag-transfer, ipadala ang screenshot sa opisina. Walang screenshot, walang resibo.
        </span>
      </p>
    </div>
  )
}
