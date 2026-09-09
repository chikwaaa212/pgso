-- History of every generated / attached AIR per inspection
-- Run with: prisma migrate deploy  OR  apply manually via psql / Supabase SQL editor

CREATE TABLE IF NOT EXISTS "iar_records" (
  "id"               UUID NOT NULL,
  "inspection_id"    UUID NOT NULL,
  "delivery_id"      UUID NOT NULL,
  "kind"             VARCHAR(255) NOT NULL,
  "iar_no"           VARCHAR(255),
  "iar_date"         DATE,
  "iar_invoice_no"   VARCHAR(255),
  "iar_invoice_date" DATE,
  "iar_data"         JSONB,
  "iar_image_url"    TEXT,
  "created_at"       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT "iar_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "iar_records_delivery_id_idx" ON "iar_records"("delivery_id");
CREATE INDEX IF NOT EXISTS "iar_records_inspection_id_idx" ON "iar_records"("inspection_id");

DO $$ BEGIN
  ALTER TABLE "iar_records"
    ADD CONSTRAINT "iar_records_inspection_id_fkey"
    FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "iar_records"
    ADD CONSTRAINT "iar_records_delivery_id_fkey"
    FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;