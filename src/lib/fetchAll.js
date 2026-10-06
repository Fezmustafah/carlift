// Every row, not the first thousand.
//
// Supabase hands back at most 1,000 rows per request and says nothing when it
// stops there. Three vehicles on two shifts write around 140 lines a month, so
// half a year of register is already past that — and a month comparison built
// on a silently cut list would invent riders who "stopped paying".
//
// `build` must return a fresh, ordered query each time (a query can only run
// once), e.g. () => supabase.from('takings').select('*').order('taken_on').order('id').
export async function fetchAll(build, page = 1000, max = 50000) {
  const out = []
  for (let from = 0; from < max; from += page) {
    const { data, error } = await build().range(from, from + page - 1)
    if (error) return { data: out, error }
    out.push(...(data || []))
    if (!data || data.length < page) break
  }
  return { data: out, error: null }
}
