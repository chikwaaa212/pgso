-- Log delivery: target date of arrival + stocks/assets classification.
-- "Waiting for arrival" status needs no enum change (delivery_status is VARCHAR).
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "expected_arrival_date" DATE;

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "delivery_kind" VARCHAR;
