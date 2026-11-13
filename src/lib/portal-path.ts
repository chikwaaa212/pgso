/**
 * Which portal the current route belongs to. Client components use this to
 * build links that stay inside the user's portal when the same UI is shared
 * by `/personnel/*` and `/super-admin/*`.
 */
export type Portal = "personnel" | "super-admin"

export function portalFromPathname(
  pathname: string | null | undefined
): Portal {
  return pathname?.startsWith("/super-admin") ? "super-admin" : "personnel"
}
