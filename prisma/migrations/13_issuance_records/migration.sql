-- PAR / ICS accountability records for asset & stock issuance.
-- Mirrors iar_records: every preparation + signed scan is kept as its own
-- timestamped row. One table serves both templates; doc_type ('PAR' | 'ICS')
-- decides which Appendix sheet renders (71 for PAR, 59 for ICS).
-- request_id is set for the employee-initiated path and NULL for the
-- personnel-initiated direct assignment path.

CREATE TABLE IF NOT EXISTS "issuance_records" (
  "id"            UUID NOT NULL,
  "doc_type"      VARCHAR(255) NOT NULL,
  "doc_no"        VARCHAR(255),
  "doc_date"      DATE,
  "asset_id"      UUID,
  "inventory_id"  UUID,
  "employee_id"   UUID NOT NULL,
  "request_id"    UUID,
  "quantity"      INTEGER NOT NULL DEFAULT 1,
  "unit_cost"     DECIMAL(12,2),
  "total_amount"  DECIMAL(12,2),
  "issuance_data" JSONB,
  "image_url"     TEXT,
  "created_by"    UUID,
  "created_at"    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT "issuance_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "issuance_records_doc_type_idx" ON "issuance_records"("doc_type");
CREATE INDEX IF NOT EXISTS "issuance_records_employee_id_idx" ON "issuance_records"("employee_id");
CREATE INDEX IF NOT EXISTS "issuance_records_asset_id_idx" ON "issuance_records"("asset_id");
CREATE INDEX IF NOT EXISTS "issuance_records_inventory_id_idx" ON "issuance_records"("inventory_id");
CREATE INDEX IF NOT EXISTS "issuance_records_request_id_idx" ON "issuance_records"("request_id");
