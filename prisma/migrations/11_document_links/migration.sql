-- Link documents to deliveries, inspections, inventory, assets, and IAR records
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "related_delivery_id" UUID;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "related_inspection_id" UUID;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "related_iar_record_id" UUID;

-- Null out dangling references so the FK constraints can be created safely.
UPDATE "documents" d SET "related_asset_id" = NULL
  WHERE "related_asset_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "assets" a WHERE a."id" = d."related_asset_id");
UPDATE "documents" d SET "related_inventory_id" = NULL
  WHERE "related_inventory_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "inventory" i WHERE i."id" = d."related_inventory_id");
UPDATE "documents" d SET "related_delivery_id" = NULL
  WHERE "related_delivery_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "deliveries" del WHERE del."id" = d."related_delivery_id");
UPDATE "documents" d SET "related_inspection_id" = NULL
  WHERE "related_inspection_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "inspections" ins WHERE ins."id" = d."related_inspection_id");
UPDATE "documents" d SET "related_iar_record_id" = NULL
  WHERE "related_iar_record_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "iar_records" iar WHERE iar."id" = d."related_iar_record_id");

CREATE INDEX IF NOT EXISTS "documents_related_asset_id_idx" ON "documents"("related_asset_id");
CREATE INDEX IF NOT EXISTS "documents_related_inventory_id_idx" ON "documents"("related_inventory_id");
CREATE INDEX IF NOT EXISTS "documents_related_delivery_id_idx" ON "documents"("related_delivery_id");
CREATE INDEX IF NOT EXISTS "documents_related_inspection_id_idx" ON "documents"("related_inspection_id");
CREATE INDEX IF NOT EXISTS "documents_related_iar_record_id_idx" ON "documents"("related_iar_record_id");

DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_related_asset_id_fkey"
    FOREIGN KEY ("related_asset_id") REFERENCES "assets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_related_inventory_id_fkey"
    FOREIGN KEY ("related_inventory_id") REFERENCES "inventory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_related_delivery_id_fkey"
    FOREIGN KEY ("related_delivery_id") REFERENCES "deliveries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_related_inspection_id_fkey"
    FOREIGN KEY ("related_inspection_id") REFERENCES "inspections"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_related_iar_record_id_fkey"
    FOREIGN KEY ("related_iar_record_id") REFERENCES "iar_records"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
