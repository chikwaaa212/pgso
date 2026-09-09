-- Add generated AIR/IAR record to inspections table
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "inspections"
  ADD COLUMN IF NOT EXISTS "iar_no"           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "iar_date"         DATE,
  ADD COLUMN IF NOT EXISTS "iar_invoice_no"   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "iar_invoice_date" DATE,
  ADD COLUMN IF NOT EXISTS "iar_data"         JSONB,
  ADD COLUMN IF NOT EXISTS "iar_generated_at" TIMESTAMPTZ;