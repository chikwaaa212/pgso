-- Store unit cost and total cost on inventory items, sourced from delivery items during stocking.
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "inventory"
  ADD COLUMN IF NOT EXISTS "unit_cost" DECIMAL(12, 2);

ALTER TABLE "inventory"
  ADD COLUMN IF NOT EXISTS "total_cost" DECIMAL(12, 2);
