import 'server-only'

import { randomUUID } from 'crypto'
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export interface AuditDetails {
  purpose?: string
  summary?: string
  reference_id?: string
  [key: string]: unknown
}

interface WriteAuditParams {
  userId: string
  action: string
  module: string
  details?: AuditDetails | Prisma.InputJsonValue
}

/**
 * Best-effort audit writer. Never throws — logging must not break
 * the primary mutation.
 */
export async function writeAuditLog({
  userId,
  action,
  module,
  details,
}: WriteAuditParams): Promise<void> {
  if (!userId || !action || !module) return
  try {
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        action,
        module,
        details: (details ?? {}) as Prisma.InputJsonValue,
      },
    })
  } catch (e) {
    console.error('[auditLog]', e)
  }
}
