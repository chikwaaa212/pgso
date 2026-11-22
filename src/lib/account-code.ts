/**
 * System-owned account code format shared by deliveries and the asset
 * registry: `AST-xxx-xx-xx` for assets and `STK-xxx-xx-xx` for stocks.
 *
 * Pure helpers only (safe to import from client or server). Allocation takes
 * the codes that already exist in the caller's table(s), so each feature
 * decides which records participate in the sequence.
 */
export const ACCOUNT_CODE_PREFIX = { asset: 'AST', stock: 'STK' } as const

export type AccountCodeKind = keyof typeof ACCOUNT_CODE_PREFIX

export function formatAccountCode(prefix: string, sequence: number): string {
  const block1 = String(Math.floor(sequence / 10000) % 1000).padStart(3, '0')
  const block2 = String(Math.floor(sequence / 100) % 100).padStart(2, '0')
  const block3 = String(sequence % 100).padStart(2, '0')
  return `${prefix}-${block1}-${block2}-${block3}`
}

/**
 * Allocate the next code for `kind` from the existing codes. Codes that do
 * not follow the system template (legacy catalog-style codes) are ignored.
 */
export function nextAccountCode(
  kind: AccountCodeKind,
  existingCodes: Iterable<string | null | undefined>
): string {
  const prefix = ACCOUNT_CODE_PREFIX[kind]
  const pattern = new RegExp(`^${prefix}-(\\d{3})-(\\d{2})-(\\d{2})$`, 'i')
  let max = 0
  for (const code of existingCodes) {
    const match = pattern.exec((code ?? '').trim())
    if (!match) continue
    const n = Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3])
    if (n > max) max = n
  }
  return formatAccountCode(prefix, max + 1)
}
