export function normalizePhone(p) {
  let d = String(p || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '971' + d.slice(1)
  else if (d.length === 9 && d.startsWith('5')) d = '971' + d
  return d
}

export function waLink(phone, text) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`
}

export function receiptText(member, sub, carName) {
  return [
    '✅ Car Lift — Seat Confirmed',
    `Name: ${member.name}`,
    `Plan: ${sub.plan_type === '15d' ? '15 days' : '30 days'}`,
    `Paid: AED ${sub.amount}`,
    `Valid: ${sub.start_date} to ${sub.end_date}`,
    carName ? `Car: ${carName}` : null,
    '',
    'Seat pakki hai, shukriya! Agli payment expiry se pehle karein.',
  ]
    .filter(Boolean)
    .join('\n')
}

// Follow-up for what a rider declared on the check-in form. Neutral wording —
// a mismatch is usually a record gap, not a lie, and the driver may still be
// holding the cash.
export function declarationText(d, driverName) {
  const amount = d.amount ? `AED ${Number(d.amount)}` : 'your payment'
  if (d.paid === 'yes' && d.paid_to === 'driver') {
    return [
      '🚐 Car Lift — payment check',
      `${d.name}, thank you for answering.`,
      `You said you paid ${amount} to ${driverName || 'the driver'} on ${d.paid_when}.`,
      'We are checking this against our records. If you have a photo or any detail of that payment, please send it here.',
      '',
      'From 5–10 August, please pay the office only. Payment to a driver is not counted.',
    ].join('\n')
  }
  if (d.paid === 'yes') {
    return [
      '🚐 Car Lift — payment check',
      `${d.name}, you said you paid ${amount} on ${d.paid_when}, but we cannot find it in our records.`,
      'Please send the screenshot or tell us how you paid, so we can update your seat.',
    ].join('\n')
  }
  return [
    '🚐 Car Lift — payment',
    `${d.name}, thank you for answering.`,
    'Collection is 5–10 August, to the office only. Please pay in that period to keep your seat.',
    'Payment to a driver is not counted.',
  ].join('\n')
}

export function reminderText(member, endISO, days) {
  const when =
    days < 0
      ? `expired on ${endISO}`
      : days === 0
        ? 'expires TODAY'
        : `expires on ${endISO} (${days} day${days === 1 ? '' : 's'} left)`
  return [
    '🔔 Car Lift — Renewal',
    `${member.name}, your seat ${when}.`,
    'Please renew to keep your seat.',
    '',
    days < 0
      ? 'Aapki seat khatam ho chuki hai. Seat rakhne ke liye aaj hi renew karein. Shukriya!'
      : `Aapki seat ${endISO} ko khatam ho rahi hai. Seat rakhne ke liye renew karein. Shukriya!`,
  ].join('\n')
}
