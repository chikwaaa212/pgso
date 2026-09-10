-- Multi-item requests + employee position/office for issuance auto-fill.
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

-- 1) Employee posting (position/office) used to auto-fill the PAR/ICS
--    "End-user position/office" field in the issuance evaluation modal.
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "position" VARCHAR(255);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "office" VARCHAR(255);

-- 2) Line items for requests: one request can now carry several
--    asset/stock lines (used by new_assignment + issuance evaluation).
CREATE TABLE IF NOT EXISTS "request_items" (
  "id"          UUID NOT NULL,
  "request_id"  UUID NOT NULL,
  "asset_id"    UUID,
  "description" TEXT NOT NULL DEFAULT '',
  "quantity"    INTEGER NOT NULL DEFAULT 1,
  "unit_cost"   DECIMAL(12,2),
  "created_at"  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT "request_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "request_items_request_id_idx" ON "request_items"("request_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_items_request_id_fkey'
  ) THEN
    ALTER TABLE "request_items"
      ADD CONSTRAINT "request_items_request_id_fkey"
      FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE;
  END IF;
END
$$;
