-- Master data: units + linked account catalog (code + title + asset type)
-- Applied via `prisma db push` on dev; IF NOT EXISTS keeps `migrate deploy` idempotent.

CREATE TABLE IF NOT EXISTS "units" (
    "id" UUID NOT NULL,
    "name" VARCHAR NOT NULL,
    "abbreviation" VARCHAR,
    "status" VARCHAR NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "units_name_key" ON "units"("name");

CREATE TABLE IF NOT EXISTS "account_catalog" (
    "id" UUID NOT NULL,
    "account_code" VARCHAR NOT NULL,
    "account_title" VARCHAR NOT NULL,
    "asset_type" VARCHAR NOT NULL,
    "description" TEXT,
    "status" VARCHAR NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT "account_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_catalog_account_code_key" ON "account_catalog"("account_code");
CREATE INDEX IF NOT EXISTS "account_catalog_asset_type_idx" ON "account_catalog"("asset_type");
CREATE INDEX IF NOT EXISTS "account_catalog_status_idx" ON "account_catalog"("status");
