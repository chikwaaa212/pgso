-- Account catalog: add ACCOUNT NAME (matches Sample Header Sheet1 col 4)
-- Applied via `prisma db push` on dev; IF NOT EXISTS keeps `migrate deploy` idempotent.

ALTER TABLE "account_catalog" ADD COLUMN IF NOT EXISTS "account_name" VARCHAR;
