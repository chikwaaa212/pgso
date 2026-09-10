-- Requests: personnel recipient (employee picks who to send the request to).
-- Personnel only see requests sent to them (plus legacy rows with no recipient).
-- Applied via `prisma db push` on dev; IF NOT EXISTS keeps `migrate deploy` idempotent.

ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "recipient_id" UUID;
CREATE INDEX IF NOT EXISTS "requests_recipient_id_idx" ON "requests"("recipient_id");
