-- Stocks: remember whether each lot came from a Stocks or Assets delivery
-- (powers the All / Stocks / Assets tabs on the inventory page).
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "inventory"
  ADD COLUMN IF NOT EXISTS "delivery_kind" VARCHAR;
