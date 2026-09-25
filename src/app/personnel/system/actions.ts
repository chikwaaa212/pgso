'use server'

import prisma from '@/lib/prisma'

/**
 * Lightweight database reachability probe for the offline/DB-down banner.
 * Runs `SELECT 1` with its own short budget — never the shared retry helper
 * (which would stall the banner for seconds). Never throws: unreachable,
 * timed-out, or misconfigured all report `{ ok: false }` so the client can
 * show the friendly top-center reminder instead of silent empty tables.
 */
export async function checkDatabaseStatus(): Promise<{ ok: boolean }> {
  const DB_PROBE_TIMEOUT_MS = 6000
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1 AS ok`,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('db probe timed out')),
            DB_PROBE_TIMEOUT_MS
          )
        }),
      ])
      return { ok: true }
    } finally {
      if (timer) clearTimeout(timer)
    }
  } catch (e) {
    console.error('[checkDatabaseStatus] database unreachable', e)
    return { ok: false }
  }
}
