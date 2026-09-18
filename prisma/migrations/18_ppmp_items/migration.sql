-- Personnel PPMP (Project Procurement Management Plan) line items.
-- One row per imported Excel line; owned per personnel user via created_by.
-- Applied via `prisma db push` on dev; IF NOT EXISTS keeps `migrate deploy` idempotent.

CREATE TABLE IF NOT EXISTS "ppmp_items" (
    "id" UUID NOT NULL,
    "general_description" TEXT NOT NULL,
    "project_type" VARCHAR,
    "quantity_size" VARCHAR,
    "procurement_mode" VARCHAR,
    "pre_proc_conference" VARCHAR,
    "procurement_start" VARCHAR,
    "procurement_end" VARCHAR,
    "delivery_period" VARCHAR,
    "source_of_funds" VARCHAR,
    "estimated_budget" DECIMAL(14,2),
    "supporting_docs" TEXT,
    "remarks" TEXT,
    "source_filename" VARCHAR,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "ppmp_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ppmp_items_created_by_idx" ON "ppmp_items"("created_by");
