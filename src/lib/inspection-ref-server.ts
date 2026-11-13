import "server-only";

import { cache } from "react";
import prisma from "@/lib/prisma";
import { parseInspectionRefParam } from "@/lib/inspection-ref";

/**
 * Resolve an inspection route param (INS-XXXXXXXX, bare 8-char ref, or a
 * legacy full UUID) to the delivery UUID. Returns null when the param is
 * malformed or matches more than one delivery.
 *
 * Memoized per request so the detail, history, and IAR readers share one
 * lookup.
 */
export const resolveInspectionDeliveryId = cache(
  async (param: string): Promise<string | null> => {
    const parsed = parseInspectionRefParam(param);
    if (parsed.id) return parsed.id;
    if (!parsed.prefix) return null;

    try {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM deliveries
        WHERE id::text LIKE ${`${parsed.prefix}%`}
        LIMIT 2
      `;
      // Ambiguous prefix (extremely unlikely for 8 hex chars) fails closed.
      return rows.length === 1 ? rows[0].id : null;
    } catch {
      return null;
    }
  }
);
