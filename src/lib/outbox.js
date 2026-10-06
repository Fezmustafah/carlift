// Register lines written on this phone that the server has not confirmed yet.
//
// Every line goes here BEFORE it is sent, with an id made on the phone, so a
// dead network delays the money and never loses it, and a retry cannot enter
// the same rider twice. Shared by every screen that reads or changes the
// register, so they all see the same unsent lines.

export const OUTBOX_KEY = 'carlift.fast.outbox'

// If the phone refuses to write to storage — private window, storage full — the
// queue lives in memory instead. Worse than the disk, far better than dropping
// a rider who has already handed over the money.
let memQueue = null

export function readOutbox() {
  if (memQueue) return memQueue
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Returns false when the phone would not keep it (memory only).
export function writeOutbox(rows) {
  let onDisk = true
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows))
    memQueue = null
  } catch {
    memQueue = rows
    onDisk = false
  }
  // The Register tab's red count listens for this.
  try {
    window.dispatchEvent(new Event('carlift-outbox'))
  } catch {
    /* no window in tests */
  }
  return onDisk
}

export const newId = () =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  )
