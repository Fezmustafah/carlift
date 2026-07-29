// Finding the same rider twice: once typed from the paper register, once from
// their own check-in, with the name spelled differently.

export function nameKey(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort() // "Dela Cruz Juan" and "Juan Dela Cruz" are one person
    .join(' ')
}

// Levenshtein, bailing out early when the lengths are too far apart.
export function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

export function findPairs(members) {
  const live = members.filter((m) => m.status !== 'left')
  const pairs = []
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j]
      const ka = nameKey(a.name), kb = nameKey(b.name)
      let why = null
      if (a.phone && a.phone === b.phone) why = 'same phone number'
      else if (ka && ka === kb) why = 'same name'
      else if (ka && kb && editDistance(ka, kb) <= 2) why = 'name spelled slightly differently'
      if (why) pairs.push({ a, b, why })
    }
  }
  return pairs
}
