-- High-water mark of received quantity already moved to stocks per delivery item
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "delivery_items"
  ADD COLUMN IF NOT EXISTS "stocked_qty" INTEGER NOT NULL DEFAULT 0;