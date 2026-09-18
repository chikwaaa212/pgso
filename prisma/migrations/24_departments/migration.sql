-- Departments master data (admin-managed, personnel assignable)
-- Applied via `prisma db push` on dev; IF NOT EXISTS keeps `migrate deploy` idempotent.

CREATE TABLE IF NOT EXISTS "departments" (
    "id" UUID NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" TEXT,
    "status" VARCHAR NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "departments_name_key" ON "departments"("name");
CREATE INDEX IF NOT EXISTS "departments_status_idx" ON "departments"("status");
