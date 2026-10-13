'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'
import { requireCurrentUserId } from '@/lib/personnel-scope'

// Display names: letters (incl. Filipino diacritics), spaces, and . ' -
// (covers suffixes like "Jr." and "Dela Cruz"). Case is kept as typed.
const NAME_RE = /^[A-Za-zÑñÁáÉéÍíÓóÚúÜü'’.\- ]+$/

/**
 * Self-service display name: any signed-in personnel can change the name
 * shown in the navbar, greetings, and filed-by labels. Updates
 * `profiles.full_name` only (name parts from onboarding stay as-is).
 */
export async function updateMyDisplayName(
  name: string
): Promise<{ ok: boolean; error?: string; name?: string }> {
  let userId = ''
  try {
    userId = await requireCurrentUserId()
  } catch {
    return { ok: false, error: 'Not authenticated.' }
  }
  const clean = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (clean.length < 2) {
    return { ok: false, error: 'Name must be 2–80 characters.' }
  }
  if (!NAME_RE.test(clean)) {
    return { ok: false, error: 'Letters, spaces, and . \' - only.' }
  }
  try {
    await prisma.profile.update({
      where: { id: userId },
      data: { full_name: clean },
    })
    void writeAuditLog({
      userId,
      action: 'personnel:update_name',
      module: 'personnel',
      details: {
        purpose: 'Update display name',
        summary: `Set display name to "${clean}"`,
      },
    }).catch(() => {})
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update name.' }
  }
  revalidatePath('/personnel', 'layout')
  // Narrow bust: name paints in the sidebar/user chip + dashboard greeting.
  void import('@/lib/personnel-cache')
    .then((m) => m.bustCachePrefixes(['personnel:sidebar-user', 'personnel:dashboard']))
    .catch(() => {})
  return { ok: true, name: clean }
}
