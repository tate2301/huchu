const AUTO_PAYOUT_NOTE_PREFIX = "AUTO_PAYOUT_FROM_SHIFT_ALLOCATION:"
const AUTO_BATCH_NOTE_PREFIX = "AUTO_BATCH_FROM_SHIFT_ALLOCATION:"

export { AUTO_BATCH_NOTE_PREFIX, AUTO_PAYOUT_NOTE_PREFIX }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function extractAllocationIdFromPayoutNotes(notes: string | null | undefined) {
  if (!notes || !notes.startsWith(AUTO_PAYOUT_NOTE_PREFIX)) return null

  const remainder = notes.slice(AUTO_PAYOUT_NOTE_PREFIX.length).trim()
  const [candidate] = remainder.split(/\s+/)
  if (!candidate) return null
  return UUID_PATTERN.test(candidate) ? candidate : null
}

export function stripAllocationPrefixFromPayoutNotes(notes: string | null | undefined) {
  if (!notes) return ""
  if (!notes.startsWith(AUTO_PAYOUT_NOTE_PREFIX)) return notes.trim()

  const allocationId = extractAllocationIdFromPayoutNotes(notes)
  if (!allocationId) return notes.slice(AUTO_PAYOUT_NOTE_PREFIX.length).trim()

  return notes
    .slice(AUTO_PAYOUT_NOTE_PREFIX.length + allocationId.length)
    .trim()
}

export function buildGoldPayoutNotes(
  allocationId: string,
  notes: string | null | undefined,
) {
  const clean = stripAllocationPrefixFromPayoutNotes(notes)
  return clean
    ? `${AUTO_PAYOUT_NOTE_PREFIX}${allocationId} ${clean}`
    : `${AUTO_PAYOUT_NOTE_PREFIX}${allocationId}`
}
