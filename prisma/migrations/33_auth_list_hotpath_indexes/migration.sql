-- Auth + list hot-path indexes (Part A.6 / Part B.2, B.5).
-- profiles.role/status are read on EVERY request (middleware + guards) but had
-- zero indexes; documents had zero indexes. IF NOT EXISTS keeps deploy idempotent.

-- profiles (per-request auth: findUnique by id is PK, but role/status filters
-- in pick-lists and dashboard counts scan without these)
CREATE INDEX IF NOT EXISTS "profiles_role_idx" ON "profiles"("role");
CREATE INDEX IF NOT EXISTS "profiles_status_idx" ON "profiles"("status");
CREATE INDEX IF NOT EXISTS "profiles_role_status_idx" ON "profiles"("role", "status");

-- documents (admin/personnel document-center joins + filters)
CREATE INDEX IF NOT EXISTS "documents_related_asset_id_idx" ON "documents"("related_asset_id");
CREATE INDEX IF NOT EXISTS "documents_related_inventory_id_idx" ON "documents"("related_inventory_id");
CREATE INDEX IF NOT EXISTS "documents_related_delivery_id_idx" ON "documents"("related_delivery_id");
CREATE INDEX IF NOT EXISTS "documents_related_inspection_id_idx" ON "documents"("related_inspection_id");
CREATE INDEX IF NOT EXISTS "documents_related_iar_record_id_idx" ON "documents"("related_iar_record_id");
CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents"("status");
CREATE INDEX IF NOT EXISTS "documents_document_type_idx" ON "documents"("document_type");
CREATE INDEX IF NOT EXISTS "documents_prepared_by_idx" ON "documents"("prepared_by");
CREATE INDEX IF NOT EXISTS "documents_created_at_idx" ON "documents"("created_at" DESC);

-- audit_logs composite for browseRequests filer scan (action + recency)
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- requests composites for inbox + queue filters
CREATE INDEX IF NOT EXISTS "requests_status_date_requested_idx" ON "requests"("status", "date_requested" DESC);
CREATE INDEX IF NOT EXISTS "requests_recipient_status_idx" ON "requests"("recipient_id", "status");
