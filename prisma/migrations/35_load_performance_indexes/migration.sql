-- Load-performance indexes (APP-LOAD-PERFORMANCE-AUDIT Phase 0 / §6).
-- Idempotent so re-running on a partially migrated database is safe.
--
-- Correctness: document_views kept a legacy global unique on
-- (doc_type, doc_id) from migration 12, which blocks a second viewer from
-- recording the same document. The per-viewer unique already exists
-- (migration 23); drop the legacy constraint and index viewer_id, which is
-- filtered on every dashboard/document badge.
ALTER TABLE "document_views"
  DROP CONSTRAINT IF EXISTS "document_views_doc_type_doc_id_key";
CREATE INDEX IF NOT EXISTS "document_views_viewer_id_idx"
  ON "document_views" ("viewer_id");

-- Ownership + recency lists (WHERE owner = ? ORDER BY created_at DESC).
CREATE INDEX IF NOT EXISTS "requests_employee_date_requested_idx"
  ON "requests" ("employee_id", "date_requested" DESC);
CREATE INDEX IF NOT EXISTS "requests_recipient_status_date_idx"
  ON "requests" ("recipient_id", "status", "date_requested" DESC);
CREATE INDEX IF NOT EXISTS "repairs_created_by_created_at_idx"
  ON "repairs" ("created_by", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "repairs_created_by_status_created_idx"
  ON "repairs" ("created_by", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "repairs_status_created_at_idx"
  ON "repairs" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "issuance_records_employee_created_idx"
  ON "issuance_records" ("employee_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "issuance_records_created_by_created_idx"
  ON "issuance_records" ("created_by", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_user_created_at_idx"
  ON "audit_logs" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "assets_assigned_to_created_at_idx"
  ON "assets" ("assigned_to", "created_at" DESC);

-- Queue / report filters. Partial indexes stay small and are chosen by the
-- planner for the exact pending/open predicates the dashboards use.
CREATE INDEX IF NOT EXISTS "deliveries_pending_created_idx"
  ON "deliveries" ("created_at" DESC)
  WHERE "inspection_status" = 'pending';
CREATE INDEX IF NOT EXISTS "requests_pending_date_idx"
  ON "requests" ("date_requested" DESC)
  WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "repairs_open_created_idx"
  ON "repairs" ("created_at" DESC)
  WHERE "status" IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS "inspections_delivery_created_idx"
  ON "inspections" ("delivery_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "inventory_low_stock_idx"
  ON "inventory" ("quantity")
  WHERE "reorder_threshold" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idempotency_keys_status_updated_idx"
  ON "idempotency_keys" ("status", "updated_at");
