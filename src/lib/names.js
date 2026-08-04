// Name suggestions for the register.
//
// Two sources, one list: the names already written in the register, and the
// names on the members list. The register wins on a tie, because a spelling he
// has already used is the one he will use again — but a rider who has never
// been written yet must still come up, which is the whole reason the members
// list is read at all.
//
// Kept out of the page so the matching can be checked without a browser.

export function mergeNames(registerNames = [], memberNames = []) {
  const seen = new Set()
  const out = []
  for (const raw of [...registerNames, ...memberNames]) {
    const name = String(raw || '').trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

export function matchNames(names = [], query = '', limit = 5) {
  const q = String(query).trim().toLowerCase()
  if (q.length < 2) return []
  const hits = names.filter((n) => {
    const l = n.toLowerCase()
    return l.includes(q) && l !== q
  })
  // A name that starts with what was typed is the likelier one.
  hits.sort((a, b) => {
    const as = a.toLowerCase().startsWith(q) ? 0 : 1
    const bs = b.toLowerCase().startsWith(q) ? 0 : 1
    return as - bs
  })
  return hits.slice(0, limit)
}
