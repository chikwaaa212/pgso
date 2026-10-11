-- Record Keeper + Registrar: indexes on every filter/sort/join column + composite
-- indexes for default sorts and common filter combos. IF NOT EXISTS keeps
-- `migrate deploy` idempotent. Apply with `prisma migrate dev` / `db push`.

-- assets (Registrar registry)
CREATE INDEX IF NOT EXISTS "assets_status_idx" ON "assets"("status");
CREATE INDEX IF NOT EXISTS "assets_category_idx" ON "assets"("category");
CREATE INDEX IF NOT EXISTS "assets_account_code_idx" ON "assets"("account_code");
CREATE INDEX IF NOT EXISTS "assets_assigned_to_idx" ON "assets"("assigned_to");
CREATE INDEX IF NOT EXISTS "assets_created_at_idx" ON "assets"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "assets_status_created_at_idx" ON "assets"("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "assets_account_code_status_idx" ON "assets"("account_code", "status");

-- inventory (Registrar stock half)
CREATE INDEX IF NOT EXISTS "inventory_item_name_idx" ON "inventory"("item_name");
CREATE INDEX IF NOT EXISTS "inventory_account_code_idx" ON "inventory"("account_code");
CREATE INDEX IF NOT EXISTS "inventory_category_idx" ON "inventory"("category");
CREATE INDEX IF NOT EXISTS "inventory_delivery_kind_idx" ON "inventory"("delivery_kind");
CREATE INDEX IF NOT EXISTS "inventory_quantity_idx" ON "inventory"("quantity");

-- deliveries (Record Keeper)
CREATE INDEX IF NOT EXISTS "deliveries_received_by_idx" ON "deliveries"("received_by");
CREATE INDEX IF NOT EXISTS "deliveries_supplier_idx" ON "deliveries"("supplier");
CREATE INDEX IF NOT EXISTS "deliveries_po_reference_idx" ON "deliveries"("po_reference");
CREATE INDEX IF NOT EXISTS "deliveries_delivery_status_idx" ON "deliveries"("delivery_status");
CREATE INDEX IF NOT EXISTS "deliveries_inspection_status_idx" ON "deliveries"("inspection_status");
CREATE INDEX IF NOT EXISTS "deliveries_created_at_idx" ON "deliveries"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "deliveries_received_by_created_at_idx" ON "deliveries"("received_by", "created_at" DESC);

-- inspections (Record Keeper)
CREATE INDEX IF NOT EXISTS "inspections_delivery_id_idx" ON "inspections"("delivery_id");
CREATE INDEX IF NOT EXISTS "inspections_inspector_id_idx" ON "inspections"("inspector_id");
CREATE INDEX IF NOT EXISTS "inspections_result_idx" ON "inspections"("result");
CREATE INDEX IF NOT EXISTS "inspections_inspection_date_idx" ON "inspections"("inspection_date" DESC);
CREATE INDEX IF NOT EXISTS "inspections_created_at_idx" ON "inspections"("created_at" DESC);

-- iar_records (Record Keeper)
CREATE INDEX IF NOT EXISTS "iar_records_kind_idx" ON "iar_records"("kind");
CREATE INDEX IF NOT EXISTS "iar_records_iar_no_idx" ON "iar_records"("iar_no");
CREATE INDEX IF NOT EXISTS "iar_records_created_at_idx" ON "iar_records"("created_at" DESC);

-- issuance_records (Record Keeper PAR/ICS)
CREATE INDEX IF NOT EXISTS "issuance_records_created_by_idx" ON "issuance_records"("created_by");
CREATE INDEX IF NOT EXISTS "issuance_records_created_at_idx" ON "issuance_records"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "issuance_records_doc_type_created_at_idx" ON "issuance_records"("doc_type", "created_at" DESC);

-- repairs (Record Keeper)
CREATE INDEX IF NOT EXISTS "repairs_asset_id_idx" ON "repairs"("asset_id");
CREATE INDEX IF NOT EXISTS "repairs_status_idx" ON "repairs"("status");
CREATE INDEX IF NOT EXISTS "repairs_created_by_idx" ON "repairs"("created_by");
CREATE INDEX IF NOT EXISTS "repairs_created_at_idx" ON "repairs"("created_at" DESC);

-- requests (employee queue scoping)
CREATE INDEX IF NOT EXISTS "requests_employee_id_idx" ON "requests"("employee_id");
CREATE INDEX IF NOT EXISTS "requests_status_idx" ON "requests"("status");
CREATE INDEX IF NOT EXISTS "requests_request_type_idx" ON "requests"("request_type");
CREATE INDEX IF NOT EXISTS "requests_date_requested_idx" ON "requests"("date_requested" DESC);

-- audit_logs (official-record audit trail)
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX IF NOT EXISTS "audit_logs_module_idx" ON "audit_logs"("module");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);
