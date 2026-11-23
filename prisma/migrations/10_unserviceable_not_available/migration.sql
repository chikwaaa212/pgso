-- Unserviceable equipment can never be Available (and so can never be assigned).
-- Repair legacy rows that still carry status 'available' (or blank) despite an
-- unserviceable condition. Keep in step with classifyCondition() in
-- src/lib/reporting.ts — the runtime guard remains the source of truth.
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

UPDATE "assets"
SET "status" = 'maintenance'
WHERE ("status" IS NULL OR LOWER(TRIM("status")) IN ('', 'available'))
  AND "condition" IS NOT NULL
  AND (
    LOWER("condition") LIKE '%unservic%'
    OR LOWER("condition") LIKE '%not service%'
    OR LOWER("condition") LIKE '%non service%'
    OR LOWER("condition") LIKE '%non-service%'
    OR LOWER("condition") LIKE '%nonfunctional%'
    OR LOWER("condition") LIKE '%non functional%'
    OR LOWER("condition") LIKE '%non-functional%'
    OR LOWER("condition") LIKE '%damag%'
    OR LOWER("condition") LIKE '%broken%'
    OR LOWER("condition") LIKE '%defective%'
    OR LOWER("condition") LIKE '%condemned%'
    OR LOWER("condition") LIKE '%unusable%'
  );
