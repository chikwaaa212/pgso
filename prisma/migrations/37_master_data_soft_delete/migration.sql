-- Soft delete for master data (departments, units, stock headers, asset
-- headers). Rows with `deleted_at` set are hidden from pick-lists and the
-- master-data cards, but kept so they can be restored (and so historical
-- records keep resolving). Idempotent for safe deploy.

ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "stock_types" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "account_catalog" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "units_deleted_at_idx" ON "units"("deleted_at");
CREATE INDEX IF NOT EXISTS "departments_deleted_at_idx" ON "departments"("deleted_at");
CREATE INDEX IF NOT EXISTS "stock_types_deleted_at_idx" ON "stock_types"("deleted_at");
CREATE INDEX IF NOT EXISTS "account_catalog_deleted_at_idx" ON "account_catalog"("deleted_at");
