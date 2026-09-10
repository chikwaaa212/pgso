import "server-only";

import prisma from "@/lib/prisma";

interface ItemCheck {
  itemId: string;
  actualQty: number;
}

const STOCKABLE_RESULTS = ["passed", "partial"] as const;

/**
 * Moves an inspection's received items into inventory — for passed AND
 * partial inspections — provided an AIR (generated or attached) backs it.
 *
 * Only the not-yet-stocked remainder moves per item: each delivery item
 * carries a `stocked_qty` high-water mark, so a partial (actual 6 of 10)
 * stocks 6, and a later update to passed (actual 10) stocks just the
 * remaining 4. Reprocessing the same inspection adds nothing.
 */
export async function stockInspectionItems(
  inspectionId: string
): Promise<{ stocked: boolean; reason?: string; added?: number; costsFixed?: number }> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      result: true,
      stocked_at: true,
      item_checks: true,
      delivery: {
        select: {
          account_code: true,
        items: {
            select: {
              id: true,
              item_name: true,
              unit: true,
              quantity: true,
              unit_cost: true,
              stocked_qty: true,
            },
          },
        },
      },
      iar_records: { select: { id: true }, take: 1 },
    },
  });

  if (!inspection) return { stocked: false, reason: "not-found" };
  if (
    (STOCKABLE_RESULTS as readonly string[]).includes(inspection.result) ===
    false
  ) {
    return { stocked: false, reason: "not-stockable" };
  }
  if (inspection.iar_records.length === 0)
    return { stocked: false, reason: "no-air" };

  const rawChecks = inspection.item_checks as unknown;
  const checks: ItemCheck[] = Array.isArray(rawChecks)
    ? (rawChecks as ItemCheck[])
    : [];
  const receivedQty = (itemId: string, fallback: number) => {
    const hit = checks.find((c) => c.itemId === itemId);
    const n = hit ? Number(hit.actualQty) : fallback;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };

  let added = 0;
  let costsFixed = 0;
  const accountCode = inspection.delivery.account_code?.trim() || null;

  await prisma.$transaction(async (tx) => {
    for (const item of inspection.delivery.items) {
      const actual = receivedQty(item.id, item.quantity);
      const addable = Math.max(0, actual - item.stocked_qty);
      const watermark = Math.max(item.stocked_qty, actual);

      const name = item.item_name.trim();
      if (name) {
        const existing = await tx.inventoryItem.findFirst({
          where: {
            item_name: { equals: name, mode: "insensitive" },
            unit: item.unit,
          },
          select: { id: true, account_code: true, unit_cost: true },
        });

        if (existing) {
          const patch: Record<string, unknown> = {};
          if (addable > 0) {
            patch.quantity = { increment: addable };
            added += addable;
          }
          // fill the delivery account code when the row has none yet
          if (!existing.account_code && accountCode) {
            patch.account_code = accountCode;
          }
          // Backfill (or refresh to the latest delivery) cost even when
          // nothing new is added — otherwise rows stocked before the
          // cost-copy existed keep unit_cost NULL forever and issuance
          // evaluation shows ₱0.00 for them.
          if (
            item.unit_cost != null &&
            (existing.unit_cost == null ||
              Number(existing.unit_cost) !== Number(item.unit_cost))
          ) {
            patch.unit_cost = item.unit_cost;
            if (existing.unit_cost == null) costsFixed += 1;
          }
          if (Object.keys(patch).length > 0) {
            await tx.inventoryItem.update({
              where: { id: existing.id },
              data: patch,
            });
          }
        } else if (addable > 0) {
          await tx.inventoryItem.create({
            data: {
              item_name: name,
              unit: item.unit,
              quantity: addable,
              account_code: accountCode,
              ...(item.unit_cost != null
                ? { unit_cost: item.unit_cost }
                : {}),
            },
          });
          added += addable;
        }
      }

      if (watermark !== item.stocked_qty) {
        await tx.deliveryItem.update({
          where: { id: item.id },
          data: { stocked_qty: watermark },
        });
      }
    }

    await tx.inspection.update({
      where: { id: inspection.id },
      data: { stocked_at: new Date() },
    });
  });

  return { stocked: added > 0, added, costsFixed };
}

/** Backwards-compatible alias. */
export const stockPassedInspection = stockInspectionItems;
