-- Employee first-login profile completion (blocking overlay).
-- Applied via `prisma db push` on dev; IF NOT EXISTS keeps `migrate deploy` idempotent.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "prefix" VARCHAR(20);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(100);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "middle_name" VARCHAR(100);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "last_name" VARCHAR(100);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "suffix" VARCHAR(20);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "employee_no" VARCHAR(50);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "department" VARCHAR(255);

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "profile_completed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "profile_completed_at" TIMESTAMPTZ;

-- Required + unique government employee ID (nullable until first-login completion;
-- Postgres UNIQUE allows multiple NULLs, so pending rows are unaffected).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_employee_no_key'
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_employee_no_key" UNIQUE ("employee_no");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "profiles_profile_completed_idx" ON "profiles"("profile_completed");
