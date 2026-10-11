/**
 * Transfer-target helpers shared by the employee scoped incoming reader.
 *
 * Transfer requests store a machine-readable first line:
 *   "Transfer to NAME [— LOCATION]"
 * Matching is exact (case-insensitive) on NAME so "Ann" never matches
 * "Annalise". Pure module — no server-only, no DB — so unit tests can
 * import it directly.
 */

/** First line is machine-readable: "Transfer to NAME [— LOCATION]". */
export function parseTransferTarget(description: string): string {
  const first = (description ?? '').split('\n')[0] ?? ''
  const m = first.match(/^Transfer to (.+?)(?: — (.+))?$/)
  return (m?.[1] ?? '').trim()
}

/** Exact (case-insensitive) address match. Empty names never match. */
export function isTransferTo(description: string, fullName: string): boolean {
  const want = (fullName ?? '').trim().toLowerCase()
  if (!want) return false
  const target = parseTransferTarget(description).toLowerCase()
  return target !== '' && target === want
}

export interface TransferCandidate {
  id: string
  description: string
}

/**
 * From minimal candidate rows ({id, description} only), return the IDs of
 * transfers addressed exactly to `fullName`, newest-first input order kept.
 * Bounded to `limit` so one employee can never pull the whole queue.
 */
export function selectIncomingIds(
  candidates: TransferCandidate[],
  fullName: string,
  limit = 20
): string[] {
  const want = (fullName ?? '').trim().toLowerCase()
  if (!want) return []
  const ids: string[] = []
  for (const c of candidates) {
    if (ids.length >= limit) break
    if (isTransferTo(c.description ?? '', want)) ids.push(c.id)
  }
  return ids
}
