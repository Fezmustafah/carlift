import { useState } from 'react'
import { bank, hasBank, ibanPretty, ibanValid } from '../lib/bank'
import { copyText } from '../lib/clipboard'

function CopyLine({ label, value, display }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs dim">{label}</div>
        <div className="font-mono font-semibold break-all">{display || value}</div>
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

      <CopyLine label="IBAN" value={bank.iban} display={ibanPretty()} />
      {!compact && bank.accountNumber && <CopyLine label="Account number" value={bank.accountNumber} />}
      {!compact && bank.swift && <CopyLine label="SWIFT (from outside UAE)" value={bank.swift} />}

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
