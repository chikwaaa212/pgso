-- Per-piece asset tracking.
--
-- Each physical piece of an asset lot (assets.quantity) or an asset-kind
-- inspected lot (inventory.quantity where delivery_kind = 'asset') gets one
-- row here with a globally unique item code (AST_ITM_CODE_0001) and its own
-- scannable QR tag (the tag encodes /assets/unit/{id}). Assigning a lot
-- claims a unit and stamps the holder + issuance record on it.
--
-- Idempotent: safe to re-run.

CREATE SEQUENCE IF NOT EXISTS "asset_unit_item_code_seq";

CREATE TABLE IF NOT EXISTS "asset_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID,
    "inventory_id" UUID,
    "item_code" VARCHAR NOT NULL DEFAULT ('AST_ITM_CODE_' || lpad(nextval('asset_unit_item_code_seq')::text, 4, '0')),
    "status" VARCHAR NOT NULL DEFAULT 'available',
    "condition" VARCHAR,
    "assigned_to" UUID,
    "assigned_at" TIMESTAMPTZ,
    "issuance_id" UUID,
    "created_at" TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT "asset_units_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_units_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "asset_units_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "asset_units_one_owner" CHECK (num_nonnulls("asset_id", "inventory_id") = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "asset_units_item_code_key" ON "asset_units"("item_code");
CREATE INDEX IF NOT EXISTS "asset_units_asset_id_idx" ON "asset_units"("asset_id");
CREATE INDEX IF NOT EXISTS "asset_units_inventory_id_idx" ON "asset_units"("inventory_id");
CREATE INDEX IF NOT EXISTS "asset_units_assigned_to_idx" ON "asset_units"("assigned_to");
CREATE INDEX IF NOT EXISTS "asset_units_status_idx" ON "asset_units"("status");
CREATE INDEX IF NOT EXISTS "asset_units_assigned_to_created_at_idx" ON "asset_units"("assigned_to", "created_at" DESC);

-- ── Backfill existing registry assets ────────────────────────────────────────
-- On-hand pieces become available units.
INSERT INTO "asset_units" ("asset_id", "status", "condition")
SELECT a."id", 'available', a."condition"
FROM "assets" a
CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(a."quantity", 0), 0)) AS g
WHERE NOT EXISTS (
    SELECT 1 FROM "asset_units" u WHERE u."asset_id" = a."id"
);

-- A current holder is one extra, already-assigned piece (assignment decrements
-- the lot quantity, so it is not part of the on-hand range above).
INSERT INTO "asset_units" ("asset_id", "status", "condition", "assigned_to", "assigned_at", "created_at")
SELECT a."id", 'assigned', a."condition", a."assigned_to", COALESCE(a."created_at", now()), COALESCE(a."created_at", now())
FROM "assets" a
WHERE a."assigned_to" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "asset_units" u
      WHERE u."asset_id" = a."id" AND u."status" = 'assigned' AND u."assigned_to" = a."assigned_to"
  );

-- A unique asset (quantity NULL) with no holder is still one piece.
INSERT INTO "asset_units" ("asset_id", "status", "condition")
SELECT a."id", 'available', a."condition"
FROM "assets" a
WHERE a."quantity" IS NULL
  AND a."assigned_to" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "asset_units" u WHERE u."asset_id" = a."id");

-- ── Backfill asset-kind inspected lots (inventory rows) ─────────────────────
INSERT INTO "asset_units" ("inventory_id", "status", "condition")
SELECT s."id", 'available', (SELECT a2."condition" FROM "assets" a2 WHERE a2."id" = s."id" LIMIT 1)
FROM "inventory" s
CROSS JOIN LATERAL generate_series(1, GREATEST(s."quantity", 0)) AS g
WHERE s."delivery_kind" = 'asset'
  AND NOT EXISTS (SELECT 1 FROM "asset_units" u WHERE u."inventory_id" = s."id");

-- Inspected lots can share their id with a linked assets row. While both
-- describe the same quantity the asset record owns the tags, so drop the
-- inventory copies created by the range above. Diverged lots keep their own.
DELETE FROM "asset_units" u
USING "assets" a, "inventory" s
WHERE u."inventory_id" = a."id"
  AND s."id" = a."id"
  AND a."quantity" IS NOT NULL
  AND s."quantity" = a."quantity"
  AND EXISTS (SELECT 1 FROM "asset_units" au WHERE au."asset_id" = a."id");
