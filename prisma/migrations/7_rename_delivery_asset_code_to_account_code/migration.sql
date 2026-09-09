-- Consolidate the delivery log code under account_code (formerly asset_code).
-- Copies any existing asset_code values over, then drops the old column.
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "account_code" VARCHAR(255);

UPDATE "deliveries"
  SET "account_code" = "asset_code"
  WHERE ("account_code" IS NULL OR "account_code" = '')
    AND "asset_code" IS NOT NULL;

ALTER TABLE "deliveries"
  DROP COLUMN IF EXISTS "asset_code";