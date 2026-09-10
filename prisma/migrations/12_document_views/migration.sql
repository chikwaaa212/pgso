-- Track which document receipts have been viewed so sidebar badges
-- count only unviewed documents. Run with: prisma migrate deploy

CREATE TABLE IF NOT EXISTS "document_views" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "doc_type" VARCHAR NOT NULL,
  "doc_id" UUID NOT NULL,
  "viewed_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "document_views_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "document_views"
    ADD CONSTRAINT "document_views_doc_type_doc_id_key"
    UNIQUE ("doc_type", "doc_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "document_views_doc_type_idx" ON "document_views"("doc_type");
