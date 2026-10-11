-- Quarterly calendar: persists the delivery-quarter scheduling block
-- alongside the yearly analytics. Applied via
-- scripts/apply-migration-29-ppmp-quarterly.ts through the pooler;
-- blank lines delimit statements for that runner (none inside statements).

ALTER TABLE "ppmp_analysis_results" ADD COLUMN IF NOT EXISTS "quarterly" JSONB;
