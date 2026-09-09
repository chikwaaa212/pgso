-- Track whether a passed + AIR-backed inspection was stocked into inventory
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "inspections"
  ADD COLUMN IF NOT EXISTS "stocked_at" TIMESTAMPTZ;