-- Stock headers carry the same identifying fields as asset headers
-- (account code / asset type / account title / account name).
-- Idempotent so `prisma migrate deploy` is safe on databases already pushed.

ALTER TABLE "stock_types"
  ADD COLUMN IF NOT EXISTS "account_code" VARCHAR,
  ADD COLUMN IF NOT EXISTS "asset_type" VARCHAR,
  ADD COLUMN IF NOT EXISTS "account_title" VARCHAR,
  ADD COLUMN IF NOT EXISTS "account_name" VARCHAR;

CREATE UNIQUE INDEX IF NOT EXISTS "stock_types_account_code_key" ON "stock_types"("account_code");
CREATE INDEX IF NOT EXISTS "stock_types_asset_type_idx" ON "stock_types"("asset_type");
