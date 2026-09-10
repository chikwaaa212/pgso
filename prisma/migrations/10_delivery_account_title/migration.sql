-- Rename deliveries.account_type to account_title (it stores the asset's
-- account title, e.g. OFFICE EQUIPMENT, not a type classification).
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "deliveries"
  RENAME COLUMN "account_type" TO "account_title";
