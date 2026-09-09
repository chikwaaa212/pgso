-- Add inspector_name, supplier_checks, and item_checks to inspections table
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "inspections"
  ADD COLUMN IF NOT EXISTS "inspector_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "supplier_checks" JSONB,
  ADD COLUMN IF NOT EXISTS "item_checks"     JSONB;
