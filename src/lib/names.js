// Name suggestions for the register.
//
// Two sources, one list: the names already written in the register, and the
// names on the members list. The register wins, because a spelling he has
// already used is the one he will use again — but a rider who has never been
// written yet must still come up, which is the whole reason the members list is
// read at all.
//
// The register is read months back, not days: on the 5th of September the man
// in front of him paid in August, and the point of a suggestion is that the
// same rider is spelled the same way in both months. Each name therefore
// remembers when it was last written and what it paid, so an old rider can be
// recognised — and priced — at a glance.
//
// Kept out of the page so the matching can be checked without a browser.

const clean = (v) => String(v ?? '').trim()

// One entry per rider: the newest spelling of the name, the last amount, when
// it was last seen and how often it has been written.
export function nameIndex(takings = [], memberNames = []) {
  const map = new Map()

  for (const t of takings) {
    const name = clean(t.name)
    if (!name) continue
    const key = name.toLowerCase()
    const when = clean(t.taken_on)
    const entry = map.get(key)
    if (!entry) {
      map.set(key, { name, key, amount: Number(t.amount) || 0, last: when, count: 1 })
      continue
    }
    entry.count++
    // The most recent line decides both the spelling and the usual amount.
    if (when >= entry.last) {
      entry.last = when
      entry.name = name
      entry.amount = Number(t.amount) || entry.amount
    }
  }

  for (const raw of memberNames) {
    const name = clean(raw)
    if (!name) continue
    const key = name.toLowerCase()
    if (!map.has(key)) map.set(key, { name, key, amount: 0, last: '', count: 0 })
  }

  return [...map.values()]
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Ranked matches for what has been typed so far. A name that starts with it
// comes first, then one whose second word does — "cruz" should find "Juan
// Cruz" — then anything containing it. Ties go to whoever paid most recently:
// last month's riders are the ones standing in front of him.
export function suggest(index = [], query = '', limit = 6) {
  const q = clean(query).toLowerCase()
  if (q.length < 2) return []
  const hits = []
  for (const e of index) {
    if (e.key === q) continue // already typed in full
    let rank
    if (e.key.startsWith(q)) rank = 0
    else if (new RegExp(`\\b${escapeRe(q)}`).test(e.key)) rank = 1
    else if (e.key.includes(q)) rank = 2
    else continue
    hits.push({ e, rank })
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.e.last.localeCompare(a.e.last) ||
      b.e.count - a.e.count ||
      a.e.name.localeCompare(b.e.name),
  )
  return hits.slice(0, limit).map((h) => h.e)
}

// The rider whose name is already written in full — used to offer the amount
// he paid last time instead of making it be found among the presets.
export function knownRider(index = [], name = '') {
  const key = clean(name).toLowerCase()
  if (!key) return null
  return index.find((e) => e.key === key && e.amount > 0) || null
}
