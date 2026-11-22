import "server-only";

import prisma from "@/lib/prisma";

interface ItemCheck {
  itemId: string;
  actualQty: number;
}

/**
 * Only a passed inspection may feed stocks. Partial deliveries are held
 * until the balance arrives and the inspection can pass in full.
 */
const STOCKABLE_RESULTS = ["passed"] as const;

/**
 * Moves a passed inspection's received items into inventory. Stocking is
 * automatic once the verdict is `passed` — an AIR/IAR is generated from the
 * inspection afterwards and never gates the ledger.
 *
 * Only the not-yet-stocked remainder moves per item: each delivery item
 * carries a `stocked_qty` high-water mark, so re-processing the same
 * inspection — or a later re-inspection — adds nothing twice.
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
          account_title: true,
          delivery_kind: true,
          asset_type: true,
          stock_type: true,
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
    },
  });

  if (!inspection) return { stocked: false, reason: "not-found" };
  if (
    (STOCKABLE_RESULTS as readonly string[]).includes(inspection.result) ===
    false
  ) {
    return { stocked: false, reason: "not-stockable" };
  }

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
  const accountTitle = inspection.delivery.account_title?.trim() || null;
  const deliveryKind = inspection.delivery.delivery_kind?.trim() || null;
  // Stock deliveries carry a Stock Type; assets carry the catalog-derived
  // asset type. Either one seeds the inventory category so new rows keep
  // their type even before (or without) a catalog title lookup.
  const assetType =
    inspection.delivery.stock_type?.trim() ||
    inspection.delivery.asset_type?.trim() ||
    null;

  // One loop pass per delivery item, each with its own find/update round-trip;
  // on a remote database this easily outruns Prisma's 5s default budget.
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
          select: {
            id: true,
            account_code: true,
            delivery_kind: true,
            category: true,
            unit_cost: true,
            custom_fields: true,
          },
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
          // fill the delivery kind (stocks/assets) when the row has none yet
          if (!existing.delivery_kind && deliveryKind) {
            patch.delivery_kind = deliveryKind;
          }
          // fill the custom asset type as category when the row has none yet
          if (!existing.category && assetType) {
            patch.category = assetType;
          }
          // Carry the catalog Account Title chosen on the delivery log into
          // the stock row so ICS issuances can display it (inventory has no
          // dedicated title column).
          if (accountTitle) {
            const cf =
              existing.custom_fields && typeof existing.custom_fields === 'object'
                ? (existing.custom_fields as Record<string, unknown>)
                : {};
            const storedTitle =
              typeof cf.account_title === 'string' ? cf.account_title.trim() : '';
            if (!storedTitle) {
              patch.custom_fields = { ...cf, account_title: accountTitle };
            }
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
              delivery_kind: deliveryKind,
              category: assetType,
              ...(accountTitle ? { custom_fields: { account_title: accountTitle } } : {}),
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
  }, { maxWait: 15_000, timeout: 60_000 });

  return { stocked: added > 0, added, costsFixed };
}

/** Backwards-compatible alias. */
export const stockPassedInspection = stockInspectionItems;
