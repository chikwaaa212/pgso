-- Stock types master data + stock-type on deliveries.
-- Idempotent so `prisma migrate deploy` is safe on databases already pushed.

CREATE TABLE IF NOT EXISTS "stock_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" VARCHAR,
    "status" VARCHAR NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT "stock_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stock_types_name_key" ON "stock_types"("name");
CREATE INDEX IF NOT EXISTS "stock_types_status_idx" ON "stock_types"("status");

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "stock_type" VARCHAR;

CREATE INDEX IF NOT EXISTS "deliveries_stock_type_idx" ON "deliveries"("stock_type");
