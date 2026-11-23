import "server-only";

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Per-piece asset tracking.
 *
 * A lot (`assets.quantity` / `inventory.quantity`) is the count of physical
 * pieces on hand. Every piece also has an `asset_units` row with its own
 * unique `AST_ITM_CODE_xxxx` code and QR tag, so an assignment, transfer,
 * repair, or scan can point at one piece rather than the whole lot.
 *
 * Rules that keep units and quantities in agreement:
 * - `ensure*Units` only ever ADDS missing pieces. It never deletes a unit —
 *   assigned/maintenance/retired units are history and must survive.
 * - The desired total is `on-hand quantity + currently assigned units`,
 *   because assignment decrements the lot quantity.
 * - `claim*Units` runs inside the same transaction as the quantity decrement,
 *   so an issuance can never commit with a phantom or double-claimed unit.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export interface UnitRecordRef {
  assetId?: string | null;
  inventoryId?: string | null;
}

function refWhere(ref: UnitRecordRef): Prisma.AssetUnitWhereInput {
  return ref.assetId
    ? { asset_id: ref.assetId }
    : { inventory_id: ref.inventoryId ?? "" };
}

/**
 * Inspected lots usually share their id with a linked `assets` row. When the
 * two records still describe the same physical stock (same quantity), the
 * asset record is the canonical owner of the piece tags — otherwise a single
 * piece would end up with two codes (one per table). Once the quantities
 * diverge the rows are tracked independently, so the inventory lot keeps its
 * own tags.
 */
async function normalizeRef(db: Db, ref: UnitRecordRef): Promise<UnitRecordRef> {
  if (!ref.inventoryId) return ref;
  const [asset, stock] = await Promise.all([
    db.asset
      .findUnique({
        where: { id: ref.inventoryId },
        select: { id: true, quantity: true },
      })
      .catch(() => null),
    db.inventoryItem
      .findUnique({
        where: { id: ref.inventoryId },
        select: { quantity: true },
      })
      .catch(() => null),
  ]);
  if (
    !asset ||
    asset.quantity === null ||
    stock?.quantity === null ||
    stock?.quantity === undefined ||
    asset.quantity !== stock.quantity
  ) {
    return ref;
  }
  return { assetId: asset.id };
}

/** Pieces a record should have: on-hand quantity plus already-assigned ones. */
function desiredUnitCount(quantity: number | null, assigned: number): number {
  if (quantity === null) return Math.max(1, assigned);
  return Math.max(0, Math.trunc(quantity)) + assigned;
}

async function ensureUnits(
  db: Db,
  ref: UnitRecordRef,
  quantity: number | null,
  condition: string | null
): Promise<{ existing: number; created: number }> {
  if (!ref.assetId && !ref.inventoryId) return { existing: 0, created: 0 };
  ref = await normalizeRef(db, ref);
  const where = refWhere(ref);
  const units = await db.assetUnit.findMany({
    where,
    select: { id: true, status: true },
  });
  const assigned = units.filter((u) => u.status === "assigned").length;
  const missing = Math.max(0, desiredUnitCount(quantity, assigned) - units.length);
  if (missing === 0) return { existing: units.length, created: 0 };

  await db.assetUnit.createMany({
    data: Array.from({ length: missing }, () => ({
      asset_id: ref.assetId ?? null,
      inventory_id: ref.inventoryId ?? null,
      status: "available",
      condition,
    })),
  });
  return { existing: units.length, created: missing };
}

/** Create any missing piece records for a registry asset lot. */
export function ensureAssetUnits(
  assetId: string,
  quantity: number | null,
  condition: string | null,
  db: Db = prisma
) {
  return ensureUnits(db, { assetId }, quantity, condition);
}

/** Create any missing piece records for an inspected (inventory) lot. */
export function ensureInventoryUnits(
  inventoryId: string,
  quantity: number | null,
  condition: string | null,
  db: Db = prisma
) {
  return ensureUnits(db, { inventoryId }, quantity, condition);
}

export interface ClaimedUnit {
  id: string;
  item_code: string;
}

/**
 * Claim `count` available pieces for `employeeId` and stamp the issuance on
 * them. Legacy rows with no piece record yet get one minted on the spot so an
 * old asset can still be assigned after the migration.
 */
export async function claimUnits(
  tx: Prisma.TransactionClient,
  ref: UnitRecordRef,
  input: {
    count: number;
    employeeId: string;
    issuanceId: string | null;
    condition?: string | null;
  }
): Promise<ClaimedUnit[]> {
  const count = Math.max(1, Math.trunc(input.count));
  const origin = ref;
  ref = await normalizeRef(tx, ref);
  // The ref was redirected to the linked asset because both records still
  // describe the same stock. Mirror the inventory decrement the caller already
  // made so the pair stays in sync and the desired-unit math stays correct.
  if (ref.assetId && origin.inventoryId && ref.assetId === origin.inventoryId) {
    await tx.asset.updateMany({
      where: { id: ref.assetId, quantity: { gte: count } },
      data: { quantity: { decrement: count } },
    });
  }
  const where = refWhere(ref);
  const claimed: ClaimedUnit[] = [];
  const stamp = {
    status: "assigned",
    assigned_to: input.employeeId,
    assigned_at: new Date(),
    issuance_id: input.issuanceId,
    ...(input.condition ? { condition: input.condition } : {}),
  };

  for (let i = 0; i < count; i++) {
    let picked = false;
    for (let attempt = 0; attempt < 5 && !picked; attempt++) {
      const unit = await tx.assetUnit.findFirst({
        where: { ...where, status: "available" },
        orderBy: { created_at: "asc" },
        select: { id: true, item_code: true },
      });
      if (!unit) break;
      const res = await tx.assetUnit.updateMany({
        where: { id: unit.id, status: "available" },
        data: stamp,
      });
      if (res.count === 1) {
        claimed.push({ id: unit.id, item_code: unit.item_code });
        picked = true;
      }
    }
    if (picked) continue;
    // No pre-created piece (pre-migration asset): mint the claimed piece so
    // the assignment still carries a scannable unit code.
    const minted = await tx.assetUnit.create({
      data: {
        asset_id: ref.assetId ?? null,
        inventory_id: ref.inventoryId ?? null,
        ...stamp,
      },
      select: { id: true, item_code: true },
    });
    claimed.push(minted);
  }

  return claimed;
}
