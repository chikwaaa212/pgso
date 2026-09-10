-- Own-data scope for personnel repairs.
-- Tracks which personnel user logged the ticket so each personnel only
-- sees their own tickets. Legacy rows keep NULL (visible to all personnel
-- until backfilled) so existing tickets don't vanish after deploy.

ALTER TABLE "repairs" ADD COLUMN IF NOT EXISTS "created_by" UUID;

CREATE INDEX IF NOT EXISTS "repairs_created_by_idx" ON "repairs"("created_by");
