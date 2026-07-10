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
