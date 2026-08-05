// Office bank details, shown to riders who want to transfer instead of paying cash.
// Kept in environment variables, never in the repository — this is a live account.
export const bank = {
  name: import.meta.env.VITE_BANK_NAME || '',
  accountName: import.meta.env.VITE_BANK_ACCOUNT_NAME || '',
  iban: (import.meta.env.VITE_BANK_IBAN || '').replace(/\s+/g, '').toUpperCase(),
  accountNumber: import.meta.env.VITE_BANK_ACCOUNT_NUMBER || '',
  swift: import.meta.env.VITE_BANK_SWIFT || '',
}

export const hasBank = Boolean(bank.iban)

// Never group the IBAN with spaces. Beneficiary forms accept exactly 23
// characters for a UAE IBAN and count spaces, so a "nicely" spaced version
// gets rejected or silently truncated when a rider pastes it in.

// ISO 13616 mod-97. A mistyped IBAN in an env var would send riders' money nowhere.
export function ibanValid(iban = bank.iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) || iban.length < 15 || iban.length > 34) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55)
  let rem = 0
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97
  return rem === 1
}

// Lines for a WhatsApp message. The account number is deliberately left out:
// riders were pasting it into their banking app instead of the IBAN, where it
// finds nothing at all. One number to copy means one number to get right.
export function bankLines() {
  if (!hasBank) return []
  return [
    '🏦 Bank transfer details:',
    bank.name ? `Bank: ${bank.name}` : null,
    bank.accountName ? `Account name: ${bank.accountName}` : null,
    `IBAN: ${bank.iban}`,
    bank.accountName
      ? `Paste the IBAN only. Your app must show ${bank.accountName} — no name means the wrong number.`
      : 'Paste the IBAN only.',
    'After transfer, send the screenshot to this number.',
  ].filter(Boolean)
}
