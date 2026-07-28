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

// Message for the drivers group, in Urdu — drivers read no English.
// Urdu script first, Roman Urdu under it, because reading ability varies from
// driver to driver. Firm but not an accusation: the money may simply still be
// in his pocket.
export function driverClaimMessage({ driverName, items, dateLabel }) {
  const total = items.reduce((t, i) => t + Number(i.amount || 0), 0)
  const name = driverName || 'بھائی'
  const lines = items.map((i, n) => `${n + 1}. ${i.name} — ${i.amount ? `${Number(i.amount)} درہم` : 'رقم نامعلوم'} — ${i.when || '—'}`)
  const roman = items.map((i, n) => `${n + 1}. ${i.name} — ${i.amount ? `${Number(i.amount)} dirham` : 'amount not given'} — ${i.when || '—'}`)

  return [
    `السلام علیکم ${name}`,
    '',
    'درج ذیل سواریوں کا کہنا ہے کہ انہوں نے کرایہ آپ کو دیا ہے:',
    ...lines,
    '',
    `کل رقم: ${total} درہم`,
    '',
    'یہ رقم ابھی آفس میں جمع نہیں ہوئی۔',
    `براہ کرم یہ رقم ${dateLabel || '10 اگست'} تک آفس میں جمع کروا دیں۔`,
    'اگر کوئی نام یا رقم غلط ہے تو مجھے فوراً بتائیں۔',
    '',
    'آئندہ کسی سواری سے پیسے نہ لیں۔ ہر ادائیگی صرف آفس میں ہوگی۔',
    'شکریہ۔',
    '',
    '---',
    '',
    `Assalam o alaikum ${driverName || 'bhai'}`,
    '',
    'Neeche di gayi sawariyon ka kehna hai ke unhon ne kiraya aap ko diya hai:',
    ...roman,
    '',
    `Kul raqam: ${total} dirham`,
    '',
    'Ye paise abhi office mein jama nahin hue.',
    `Meherbani kar ke ye raqam ${dateLabel || '10 August'} tak office mein jama karwa dein.`,
    'Agar koi naam ya raqam ghalat hai to mujhe foran batayen.',
    '',
    'Aainda kisi sawari se paise na lein. Har payment sirf office mein hogi.',
    'Shukriya.',
  ].join('\n')
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
