-- File insights: persists the within-file interpretation block (needs no
-- history) alongside the yearly analytics. Applied via
-- scripts/apply-migration-30-ppmp-file-insights.ts through the pooler;
-- blank lines delimit statements for that runner (none inside statements).

ALTER TABLE "ppmp_analysis_results" ADD COLUMN IF NOT EXISTS "file_insights" JSONB;
