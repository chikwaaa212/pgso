-- Account code on delivery logs (schema already expects it; backfill the column)
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "account_code" VARCHAR(255);