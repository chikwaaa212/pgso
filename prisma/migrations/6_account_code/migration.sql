-- Track account code per stock item (replaces category in the UI)
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "inventory"
  ADD COLUMN IF NOT EXISTS "account_code" VARCHAR(255);

-- carry any existing category values over so nothing is lost
UPDATE "inventory"
  SET "account_code" = "category"
  WHERE "account_code" IS NULL AND "category" IS NOT NULL;