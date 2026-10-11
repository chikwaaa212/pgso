-- P1 vault fix: extend ppmp_files with content hash, fiscal-year hint,
-- parse summary and lifecycle status. All additive + idempotent so legacy
-- metadata-only rows stay valid. Applied via
-- scripts/apply-migration-26-ppmp-vault-fix.ts through the pooler;
-- blank lines delimit statements for that runner (none inside statements).
ALTER TABLE "ppmp_files" ADD COLUMN IF NOT EXISTS "file_hash" TEXT;

ALTER TABLE "ppmp_files" ADD COLUMN IF NOT EXISTS "fiscal_year" INTEGER;

ALTER TABLE "ppmp_files" ADD COLUMN IF NOT EXISTS "fiscal_year_source" VARCHAR(20);

ALTER TABLE "ppmp_files" ADD COLUMN IF NOT EXISTS "row_count" INTEGER;

ALTER TABLE "ppmp_files" ADD COLUMN IF NOT EXISTS "sheet_meta" JSONB;

ALTER TABLE "ppmp_files" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) DEFAULT 'ready';

ALTER TABLE "ppmp_files" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "ppmp_files_file_hash_idx" ON "ppmp_files"("file_hash");

UPDATE "ppmp_files" SET "status" = 'ready' WHERE "status" IS NULL;
